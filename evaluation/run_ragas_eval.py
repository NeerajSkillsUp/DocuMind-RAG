import os
import sys
import re
import time
from json import loads
from dotenv import load_dotenv
import pandas as pd
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

# Silent telemetry mismatch messages from local installations
os.environ["CHROMA_TELEMETRY_TRANSFORM"] = "NONE"

# =========================================================================
# WORKSPACE ROOT & ENVIRONMENT ALIGNMENT REGISTRY
# =========================================================================
current_dir = os.path.dirname(os.path.abspath(__file__))
workspace_root = os.path.abspath(os.path.join(current_dir, ".."))
backend_path = os.path.join(workspace_root, "backend")

# Insert both paths at the top of sys.path to avoid app.services resolution errors
for path in [workspace_root, backend_path]:
    if path not in sys.path:
        sys.path.insert(0, path)

env_file_path = os.path.join(backend_path, ".env")
load_dotenv(dotenv_path=env_file_path)

# Correctly scoped imports using the backend workspace prefix
from backend.app.config import settings
from backend.app.services.retriever import get_relevant_chunks
from backend.app.services.llm_engine import generate_answer
from backend.app.models.models import Document

# Initialize a direct read connection to discover real UUID keys
engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_real_doc_id_from_db(filename_keyword: str) -> str:
    """Queries SQLite to convert a human filename string into its active generated UUID tracking key."""
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.filename.like(f"%{filename_keyword}%")).first()
        if doc:
            return doc.id
    except Exception as e:
        print(f"    ⚠️ DB lookup warning: {e}")
    finally:
        db.close()
    return "global"

def judge_metric_with_retry(judge_llm: ChatGoogleGenerativeAI, metric_name: str, instructions: str, payload_data: str, max_retries: int = 5) -> float:
    """Prompts Gemini to act as an objective judge and extract metrics consistently."""
    system_prompt = (
        f"You are an expert RAG system evaluation judge specializing in measuring '{metric_name}'.\n"
        f"Instructions: {instructions}\n"
        "You MUST output exactly a single valid raw JSON object matching this structure: {\"score\": 1.00}.\n"
        "Do not output markdown wrapper blocks like ```json, headers, or any trailing textual justifications. Just the JSON."
    )
    
    for attempt in range(max_retries):
        try:
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=payload_data)
            ]
            response = judge_llm.invoke(messages)
            text_out = response.content.strip()
            
            # Remove markdown JSON blocks if present
            text_out = re.sub(r"^```json\s*", "", text_out, flags=re.IGNORECASE)
            text_out = re.sub(r"```$", "", text_out).strip()
            
            # Find the first occurrences of brackets if trailing letters exist
            start_idx = text_out.find("{")
            end_idx = text_out.rfind("}")
            if start_idx != -1 and end_idx != -1:
                text_out = text_out[start_idx:end_idx+1]
            
            data = loads(text_out)
            return float(data.get("score", 0.0))
        except Exception:
            time.sleep(1.5)
    return 0.0

def run_evaluation_harness():
    print("🚀 Initializing Resilient Gemini Evaluation Matrix Harness...")
    print(f"    📂 Resolved DB Location:     {settings.DATABASE_URL}")
    print(f"    📂 Resolved Vector Location: {settings.CHROMA_PERSIST_DIR}\n")
    
    judge_llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0.0
    )
    
    eval_dataset = [
        {"question": "for which role is Tredence hiring interns?", "ground_truth": "AI Engineering Intern"},
        {"question": "What is the duration of the internship at Tredence?", "ground_truth": "6 months to 1 year"},
        {"question": "What are the three pricing models discussed in parking report?", "ground_truth": "Basic Linear Pricing, Demand-Based Pricing, and Competitive Pricing"},
        {"question": "What is the formula for Basic Linear Pricing model?", "ground_truth": "New Price = Previous Price + a * Occupancy Rate"},
        {"question": "What factors are considered in Demand-Based Pricing for parking?", "ground_truth": "Occupancy rate, queue length, traffic congestion, special events, and vehicle type"}
    ]
    
    evaluation_records = []
    faithfulness_scores = []
    relevance_scores = []
    recall_scores = []

    for idx, item in enumerate(eval_dataset):
        q = item["question"]
        print(f"[{idx+1}/{len(eval_dataset)}] Evaluating: '{q}'")
        
        keyword = "Tredence" if "Tredence" in q or "internship" in q.lower() else "Parking"
        active_doc_id = get_real_doc_id_from_db(keyword)
        print(f"    🔍 Resolved Scope target: '{keyword}' -> Database UUID: {active_doc_id}")
        
        matched_chunks = get_relevant_chunks(doc_id=active_doc_id, question=q, top_k=3)
        print(f"    🔍 Debug Log: Successfully extracted {len(matched_chunks)} chunks for context stream.")
        
        context_str = "\n".join([f"- {c['text']}" for c in matched_chunks])
        
        # Call generation engine
        llm_output = generate_answer(question=q, retrieved_chunks=matched_chunks)
        
        # Defensive parse block: support both string formats or dict formats gracefully
        if isinstance(llm_output, dict):
            generated_answer_text = llm_output.get("answer", "").strip()
        else:
            generated_answer_text = str(llm_output).strip()
            
        print(f"    🤖 Generated Output: \"{generated_answer_text[:75]}...\"")
        
        # 1. Evaluate Faithfulness
        f_payload = f"CONTEXT:\n{context_str}\n\nGENERATED ANSWER:\n{generated_answer_text}"
        f_score = judge_metric_with_retry(
            judge_llm, "Faithfulness",
            "Verify if the statements inside GENERATED ANSWER can be fully inferred using ONLY the given CONTEXT. Output a float score: 1.0 if accurate and clean, 0.0 if entirely unsupported.",
            f_payload
        )
        faithfulness_scores.append(f_score)
        
        # 2. Evaluate Answer Relevance
        r_payload = f"QUESTION:\n{q}\n\nGENERATED ANSWER:\n{generated_answer_text}"
        r_score = judge_metric_with_retry(
            judge_llm, "Answer Relevance",
            "Evaluate if the GENERATED ANSWER completely answers and addresses the initial QUESTION. Output 1.0 if highly descriptive and accurate, 0.0 if vague or avoiding the point.",
            r_payload
        )
        relevance_scores.append(r_score)
        
        # 3. Evaluate Context Recall
        rec_payload = f"CONTEXT RETRIEVED:\n{context_str}\n\nGROUND TRUTH EXPECTED:\n{item['ground_truth']}"
        rec_score = judge_metric_with_retry(
            judge_llm, "Context Recall",
            "Verify if the CONTEXT RETRIEVED contains the correct answers defined in GROUND TRUTH EXPECTED. Output 1.0 if the facts exist anywhere in the context, 0.0 if missing.",
            rec_payload
        )
        recall_scores.append(rec_score)
        
        print(f"    📊 Scores -> Faithfulness: {f_score:.2f} | Relevance: {r_score:.2f} | Recall: {rec_score:.2f}\n")
        
        evaluation_records.append({
            "Question": q,
            "Ground Truth": item["ground_truth"],
            "Generated Answer": generated_answer_text,
            "Faithfulness": f_score,
            "Answer Relevance": r_score,
            "Context Recall": rec_score
        })
        
        time.sleep(1)

    if not faithfulness_scores:
        print("❌ Evaluation failed to record any entries.")
        return

    avg_f = sum(faithfulness_scores) / len(faithfulness_scores)
    avg_r = sum(relevance_scores) / len(relevance_scores)
    avg_rec = sum(recall_scores) / len(recall_scores)
    
    print("\n=========================================================")
    print("                 METRIC EVALUATION SUMMARY               ")
    print("=========================================================")
    print(f" Faithfulness Score (No Hallucination):     {avg_f:.4f}")
    print(f" Answer Relevance Score (Directness):       {avg_r:.4f}")
    print(f" Context Recall Score (Retrieval Accuracy):  {avg_rec:.4f}")
    print("=========================================================")
    
    try:
        results_df = pd.DataFrame(evaluation_records)
        output_csv = os.path.join(current_dir, "ragas_metrics_report.csv")
        results_df.to_csv(output_csv, index=False)
        print(f"✅ Summary reports saved successfully: {output_csv}")
    except Exception as e:
        print(f"⚠️ Summary CSV compilation issue: {e}")

if __name__ == "__main__":
    run_evaluation_harness()