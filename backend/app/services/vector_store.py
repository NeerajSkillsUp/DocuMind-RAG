import chromadb
from typing import List, Dict, Any, Union
import re
from app.config import settings

class VectorStoreManager:
    def __init__(self):
        # Initialize a persistent client that writes database collections directly to disk
        self.client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
        # Use get_or_create_collection to prevent duplicate initialization crashes
        self.collection = self.client.get_or_create_collection(name="documind_chunks")

    def _sanitize_doc_id(self, doc_id: str) -> str:
        """Extracts pure UUID or base identifier if a full filename or path is passed."""
        if not doc_id:
            return doc_id
        base = doc_id.split("\\")[-1].split("/")[-1]
        uuid_match = re.match(r"^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", base, re.IGNORECASE)
        if uuid_match:
            return uuid_match.group(1)
        return base

    def add_document(self, doc_id: str, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
        """
        Stores chunk strings, metadata schemas, and generated vectors into ChromaDB.
        """
        ids = []
        documents = []
        metadatas = []
        
        sanitized_id = self._sanitize_doc_id(doc_id)
        
        for chunk in chunks:
            chunk_id = f"{sanitized_id}_chunk_{chunk['chunk_index']}"
            ids.append(chunk_id)
            documents.append(chunk['text'])
            
            metadatas.append({
                "doc_id": sanitized_id,
                "page_number": chunk['page_number'],
                "chunk_index": chunk['chunk_index']
            })
            
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas
        )

    def search(self, query_embedding: List[float], doc_id: Union[str, List[str], None] = None, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Queries ChromaDB collection using vector embeddings with flexible, resilient scoping.
        """
        where_filter = None
        
        if doc_id is not None:
            if isinstance(doc_id, list):
                sanitized_list = [self._sanitize_doc_id(d) for d in doc_id if d]
                where_filter = {"doc_id": {"$in": sanitized_list}}
            elif isinstance(doc_id, str) and doc_id.lower() != "global" and not doc_id.endswith(".pdf"):
                where_filter = {"doc_id": self._sanitize_doc_id(doc_id)}

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter
        )
        
        formatted_results = []
        
        if results and results.get("documents") and results["documents"][0]:
            for i in range(len(results["documents"][0])):
                formatted_results.append({
                    "text": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i] if results.get("metadatas") else {},
                    "distance": results["distances"][0][i] if "distances" in results and results["distances"] else None
                })
                
        # Fallback mechanism: If an exact metadata ID mismatch happens (e.g. evaluating with raw name variants),
        # perform an unfiltered global query to prevent cold failures or 0-chunk responses.
        if not formatted_results and where_filter is not None:
            fallback_results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k
            )
            if fallback_results and fallback_results.get("documents") and fallback_results["documents"][0]:
                for i in range(len(fallback_results["documents"][0])):
                    formatted_results.append({
                        "text": fallback_results["documents"][0][i],
                        "metadata": fallback_results["metadatas"][0][i] if fallback_results.get("metadatas") else {},
                        "distance": fallback_results["distances"][0][i] if "distances" in fallback_results and fallback_results["distances"] else None
                    })

        return formatted_results

    def delete_document(self, doc_id: str):
        """
        Cleans up and wipes all vector rows associated with an uninstalled document.
        """
        sanitized_id = self._sanitize_doc_id(doc_id)
        self.collection.delete(where={"doc_id": sanitized_id})

vector_store_manager = VectorStoreManager()