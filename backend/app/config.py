import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str
    GOOGLE_API_KEY: str
    CHROMA_PERSIST_DIR: str
    MAX_CHUNK_SIZE: int
    CHUNK_OVERLAP: int
    TOP_K_RESULTS: int
    SECRET_KEY: str
    
    # Comma-separated domain matrix to regulate production cross-origin resource allocations
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()

# =========================================================================
# SYSTEMATIC WORKSPACE PRODUCTION ABSOLUTE PATH SAFEGUARD
# =========================================================================
backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 1. Standardize SQLite Local Absolute Mappings
if "sqlite:///" in settings.DATABASE_URL:
    relative_path = settings.DATABASE_URL.replace("sqlite:///", "")
    if relative_path.startswith("./"):
        relative_path = relative_path[2:]
    if not os.path.isabs(relative_path):
        absolute_db_path = os.path.abspath(os.path.join(backend_root, relative_path))
        settings.DATABASE_URL = f"sqlite:///{absolute_db_path}"

# 2. Standardize Vector Database Persistence Paths
if not os.path.isabs(settings.CHROMA_PERSIST_DIR):
    clean_chroma_path = settings.CHROMA_PERSIST_DIR
    if clean_chroma_path.startswith("./"):
        clean_chroma_path = clean_chroma_path[2:]
    settings.CHROMA_PERSIST_DIR = os.path.abspath(os.path.join(backend_root, clean_chroma_path))

# 3. Middleware Stream Sanitizer Utilities
def get_parsed_cors_origins() -> List[str]:
    """Splits comma-separated string records into valid arrays for FastAPI."""
    if not settings.CORS_ORIGINS:
        return ["*"]
    if settings.CORS_ORIGINS.strip() == "*":
        return ["*"]
    return [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]