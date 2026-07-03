from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

# --- Document Schemas ---
class DocumentResponse(BaseModel):
    id: str
    filename: str
    upload_date: datetime

    class Config:
        from_attributes = True


# --- Message Schemas ---
class MessageCreate(BaseModel):
    content: str

class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    citations: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True


# --- Conversation Schemas ---
class ConversationResponse(BaseModel):
    id: str
    document_id: str
    created_at: datetime
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True