import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base
from app.config import settings, get_parsed_cors_origins

# Import API module path routers exactly matching your project routing layout
from app.api.documents import router as documents_router
from app.api.chat import router as chat_router

# Build baseline structural database tables automatically on microservice trigger hooks
Base.metadata.create_all(bind=engine)

# Standardize and build local asset directory paths inside cloud storage blocks
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="DocuMind API",
    description="Production Ready Multi-Document Contextual RAG Engine Platform Workspace",
    version="1.0.0"
)

# Connect cross-origin resource allocations to verified environment configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_parsed_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount local asset directories safely to serve uploaded reference fragments
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Core App Router Registrations
app.include_router(documents_router)
app.include_router(chat_router)

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": "DocuMind Engine",
        "documentation_playground": "/docs"
    }

@app.get("/health", tags=["Health Status System Checks"])
def health_check():
    return {
        "status": "active",
        "vector_store_path_configured": os.path.exists(settings.CHROMA_PERSIST_DIR),
        "database_url_active": settings.DATABASE_URL.startswith("sqlite:///")
    }