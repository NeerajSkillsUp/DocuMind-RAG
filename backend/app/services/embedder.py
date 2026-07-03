from typing import List
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from app.config import settings

def get_embeddings_transformer() -> GoogleGenerativeAIEmbeddings:
    """
    Initializes and returns the LangChain GoogleGenerativeAIEmbeddings instance.
    Uses 'gemini-embedding-2-preview' for the free Gemini Developer API tier.
    """
    return GoogleGenerativeAIEmbeddings(
        model="gemini-embedding-2-preview",  # Updated model string name
        google_api_key=settings.GOOGLE_API_KEY
    )

def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Converts a list of text chunk strings into a list of vector arrays.
    """
    transformer = get_embeddings_transformer()
    return transformer.embed_documents(texts)

def embed_query(text: str) -> List[float]:
    """
    Converts a single user question into a vector array.
    """
    transformer = get_embeddings_transformer()
    return transformer.embed_query(text)