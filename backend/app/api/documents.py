import uuid
import shutil
import os
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Document
from app.services.pdf_processor import extract_text_from_pdf
from app.services.chunker import create_chunks
from app.services.embedder import embed_texts
from app.services.vector_store import vector_store_manager
from app.schemas.schemas import DocumentResponse

router = APIRouter(prefix="/documents", tags=["Documents"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=DocumentResponse)
def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Receives a PDF, streams it to disk, runs the extraction/vector pipeline,
    and returns a unique document index identifier.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    # Generate a secure unique document tracking key identifier
    doc_id = str(uuid.uuid4())
    # Notice: Keeping consistency. If files saved previously missed the underscore, 
    # using doc_id + "_" + filename guarantees exact tracking.
    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{file.filename}")
    
    try:
        # Save uploaded bytes to local storage disk path
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Execute text extraction & pipeline formatting
        pages = extract_text_from_pdf(file_path)
        chunks = create_chunks(pages)
        
        if not chunks:
            raise HTTPException(status_code=400, detail="The uploaded PDF contains no extractable text.")
            
        # Call Gemini matrix vectorization
        chunk_texts = [c['text'] for c in chunks]
        embeddings = embed_texts(chunk_texts)
        
        # Write structures to local Chroma DB index database instance
        vector_store_manager.add_document(doc_id=doc_id, chunks=chunks, embeddings=embeddings)
        
        # Record tracking rows into your SQLite core database file
        new_doc = Document(id=doc_id, filename=file.filename)
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        
        return new_doc
        
    except Exception as e:
        db.rollback()
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Pipeline Processing Failure: {str(e)}")

@router.get("", response_model=list[DocumentResponse])
def list_documents(db: Session = Depends(get_db)):
    """
    Fetches a structural index listing of all successfully ingested system documents.
    """
    return db.query(Document).all()

@router.delete("/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    """
    Purges a document's vector representations and local physical storage completely.
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Target Document index ID not found.")
        
    # 1. Wipe matching collection fragments from ChromaDB vector space
    try:
        vector_store_manager.delete_document(doc_id=doc_id)
    except Exception as e:
        print(f"Warning: ChromaDB collection cleanup skipped or failed: {e}")
        
    # 2. Hard Clean Up: Scan the folder and delete any file starting with the target doc_id
    try:
        if os.path.exists(UPLOAD_DIR):
            for filename in os.listdir(UPLOAD_DIR):
                if filename.startswith(doc_id):
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    os.remove(file_path)
                    print(f"Successfully deleted asset: {file_path}")
    except Exception as e:
        print(f"Warning: Could not clear physical disk asset for ID {doc_id}: {e}")
    
    # 3. Wipe SQLite core Document row tracking (leaves your 20 Activity Logs untouched)
    db.delete(doc)
    db.commit()
    
    return {"message": "Document storage and vector index layers successfully purged."}