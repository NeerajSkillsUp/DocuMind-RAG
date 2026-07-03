from typing import List, Dict, Any
from app.services.embedder import embed_query
from app.services.vector_store import vector_store_manager

def get_relevant_chunks(doc_id: str, question: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Embeds the user question, queries ChromaDB, and filters out noise.
    Supports single-document, multi-document (comma-separated), and global workspace scopes.
    """
    # 1. Convert question to vector
    query_vector = embed_query(question)
    
    # 2. Parse the doc_id to determine the query scope
    if not doc_id or doc_id == "global":
        search_scope = None  
    elif "," in doc_id:
        search_scope = [d.strip() for d in doc_id.split(",") if d.strip()]  
    else:
        search_scope = doc_id  
    
    # 3. Query ChromaDB with the parsed document scope separation
    raw_results = vector_store_manager.search(
        query_embedding=query_vector,
        doc_id=search_scope, 
        top_k=top_k
    )
    
    filtered_results = []
    
    for match in raw_results:
        distance = match.get("distance")
        
        # ChromaDB uses L2 (squared Euclidean) distance by default.
        # We increase the boundary threshold buffer up to 1.95 to account for diverse questions.
        if distance is None or distance <= 1.95:  
            filtered_results.append(match)
            
    # Universal backup safeguard: if threshold is too narrow, return raw hits rather than 0 context
    if not filtered_results and raw_results:
        return raw_results
            
    return filtered_results