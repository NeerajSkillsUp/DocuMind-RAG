import uuid
import os
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Conversation, Message, Document
from app.schemas.schemas import ConversationResponse, MessageResponse, MessageCreate
from app.services.retriever import get_relevant_chunks
from app.services.llm_engine import generate_answer
from app.services.vector_store import vector_store_manager

router = APIRouter(tags=["Conversational Intelligence"])

UPLOAD_DIR = "uploads"

@router.post("/chat/new/{doc_id}", response_model=ConversationResponse)
def create_conversation(doc_id: str, db: Session = Depends(get_db)):
    if doc_id == "global":
        pass
    elif "," in doc_id:
        target_ids = [d.strip() for d in doc_id.split(",") if d.strip()]
        existing_count = db.query(Document).filter(Document.id.in_(target_ids)).count()
        if existing_count == 0:
            raise HTTPException(status_code=404, detail="None of the selected documents were found.")
    else:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document asset not found.")
        
    conv_id = str(uuid.uuid4())
    new_conv = Conversation(id=conv_id, document_id=doc_id)
    db.add(new_conv)
    db.commit()
    db.refresh(new_conv)
    return new_conv

@router.post("/chat/message/{conversation_id}", response_model=MessageResponse)
async def send_message(conversation_id: str, payload: MessageCreate, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Active dialogue thread session mapping not found.")
        
    user_msg = Message(conversation_id=conversation_id, role="user", content=payload.content)
    db.add(user_msg)
    
    matched_fragments = get_relevant_chunks(doc_id=conv.document_id, question=payload.content)
    
    unique_doc_ids = list(set([ch["metadata"].get("doc_id") for ch in matched_fragments if ch["metadata"].get("doc_id")]))
    db_docs = db.query(Document).filter(Document.id.in_(unique_doc_ids)).all()
    
    doc_map = {}
    for d in db_docs:
        doc_map[str(d.id)] = getattr(d, "name", getattr(d, "filename", "Document"))
        
    for ch in matched_fragments:
        d_id = ch["metadata"].get("doc_id")
        ch["metadata"]["filename"] = doc_map.get(d_id, "Document")
    
    llm_payload = generate_answer(question=payload.content, retrieved_chunks=matched_fragments)
    
    citation_tags = []
    for ch in matched_fragments:
        meta = ch.get("metadata", {})
        p_num = meta.get("page_number", "Unknown")
        f_name = meta.get("filename", "Doc")
        citation_tags.append(f"{f_name} (P. {p_num})")
        
    distinct_citations = sorted(list(set(citation_tags)))
    citation_string = ", ".join(distinct_citations) if distinct_citations else "None"
    
    ai_msg = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=llm_payload["answer"],
        citations=citation_string
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)
    
    return ai_msg

@router.get("/history")
def get_all_logged_history(db: Session = Depends(get_db)):
    """
    Compiles an aggregated list of unique past conversations,
    explicitly limited to the top 20 most recent logs for performance.
    """
    user_messages = db.query(Message).filter(Message.role == "user").order_by(Message.id.desc()).all()
    
    seen_conversations = set()
    history_logs = []
    
    for u_msg in user_messages:
        if u_msg.conversation_id in seen_conversations:
            continue
            
        seen_conversations.add(u_msg.conversation_id)
        
        ai_msg = db.query(Message).filter(
            Message.conversation_id == u_msg.conversation_id,
            Message.role == "assistant",
            Message.id > u_msg.id
        ).order_by(Message.id.asc()).first()
        
        history_logs.append({
            "id": u_msg.id,
            "conversation_id": u_msg.conversation_id,
            "question": u_msg.content,
            "answer": ai_msg.content if ai_msg else "No response recorded."
        })
        
        # Performance optimization limit boundary check
        if len(history_logs) >= 20:
            break
        
    return history_logs

@router.get("/chat/history/{conversation_id}")
def get_conversation_history(conversation_id: str, db: Session = Depends(get_db)):
    messages = db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.id.asc()).all()
    formatted_messages = []
    for msg in messages:
        frontend_role = "bot" if msg.role == "assistant" else "user"
        msg_payload = {
            "role": frontend_role,
            "text": msg.content
        }
        if msg.role == "assistant" and getattr(msg, "citations", None) and msg.citations != "None":
            msg_payload["text"] += f"\n\n[Citations: {msg.citations}]"
        formatted_messages.append(msg_payload)
    return formatted_messages

@router.delete("/chat/conversation/{conversation_id}")
def delete_conversation_log(conversation_id: str, db: Session = Depends(get_db)):
    """
    Safely purges all associated text messages and the core session wrapper mapping.
    """
    db.query(Message).filter(Message.conversation_id == conversation_id).delete()
    db.query(Conversation).filter(Conversation.id == conversation_id).delete()
    db.commit()
    return {"status": "success", "detail": "Target conversation data completely dropped."}

@router.delete("/chat/document/{doc_id}")
def delete_document_asset(doc_id: str, db: Session = Depends(get_db)):
    """
    Safely purges vector records from ChromaDB, deletes the corresponding local file 
    assets from disk, and drops the metadata catalog mapping row.
    """
    # 1. Purge matched chunks from ChromaDB collections
    try:
        vector_store_manager.delete_document(doc_id=doc_id)
    except Exception as e:
        print(f"Warning: ChromaDB collection cleanup skipped or failed: {e}")

    # 2. Hard erase physical document elements out of the storage folder
    try:
        if os.path.exists(UPLOAD_DIR):
            for filename in os.listdir(UPLOAD_DIR):
                if filename.startswith(doc_id):
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    os.remove(file_path)
                    print(f"Successfully deleted local storage asset: {file_path}")
    except Exception as e:
        print(f"Warning: Could not clear physical disk asset for ID {doc_id}: {e}")

    # 3. Drop tracking log mapping metadata column out of SQLite
    db.query(Document).filter(Document.id == doc_id).delete()
    db.commit()
    
    return {"status": "success", "detail": "Target document tracking asset permanently removed."}