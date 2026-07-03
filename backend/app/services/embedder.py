from typing import List
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from app.config import settings

def get_embeddings_transformer() -> GoogleGenerativeAIEmbeddings:
    """
    Initializes and returns the LangChain GoogleGenerativeAIEmbeddings instance.
    Uses 'models/gemini-embedding-001' for the stable Gemini Developer API tier.
    """
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",  
        request_options={"timeout": 120.0}
    )

def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Converts a list of text chunk strings into a list of vector arrays.
    Forces conversion to native Python lists to prevent ChromaDB validation errors.
    """
    transformer = get_embeddings_transformer()
    raw_embeddings = transformer.embed_documents(texts)
    # Convert Google's custom internal sequences explicitly to native Python lists
    return [list(emb) for emb in raw_embeddings]

def embed_query(text: str) -> List[float]:
    """
    Converts a single user question into a vector array.
    Forces conversion to a native Python list to satisfy ChromaDB strict typing.
    """
    transformer = get_embeddings_transformer()
    raw_query_embedding = transformer.embed_query(text)
    # Convert single sequence to a native Python list
    return list(raw_query_embedding)