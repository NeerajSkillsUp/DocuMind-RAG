from typing import List, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.config import settings

def generate_answer(question: str, retrieved_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Assembles a grounded cross-reference document prompt and requests an answer from Gemini.
    """
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0.0
    )
    
    # System directive rules optimized for multi-file cross referencing
    system_prompt = (
        "You are an expert multi-document analyst for DocuMind.\n"
        "Your task is to answer the user's question using ONLY the provided text snippets below.\n"
        "If the answer cannot be found within the snippets, state exactly: "
        "'I cannot find this in the current document context.' Do not invent information.\n\n"
        "For every fact you state, you must append an inline bracket source citation referencing "
        "the specific file name and page number it came from (e.g., [Report.pdf - Page X])."
    )
    
    # Construct the clear multi-context block
    context_str = ""
    for idx, chunk in enumerate(retrieved_chunks):
        meta = chunk.get("metadata", {})
        page_num = meta.get("page_number", "Unknown")
        f_name = meta.get("filename", meta.get("source", "Document")).split("\\")[-1].split("/")[-1]
        
        context_str += f"--- Source Snippet {idx+1} (File: {f_name} | Page {page_num}) ---\n{chunk['text']}\n\n"
        
    user_content = f"Context Contextual Streams:\n{context_str}\nQuestion: {question}"
    
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content)
    ]
    
    response = llm.invoke(messages)
    
    source_citations = [
        {
            "page_number": c["metadata"].get("page_number", "Unknown"),
            "chunk_index": c["metadata"].get("chunk_index", 0),
            "filename": c["metadata"].get("filename", "Unknown"),
            "text": c["text"]
        }
        for c in retrieved_chunks
    ]
    
    return {
        "answer": response.content,
        "sources": source_citations
    }