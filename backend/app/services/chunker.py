from typing import List, Tuple, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.config import settings

def create_chunks(extracted_pages: List[Tuple[int, str]]) -> List[Dict[str, Any]]:
    """
    Splits page-by-page text into overlapping chunks while maintaining 
    accurate page alignments for citations.
    
    Returns:
        A list of dictionaries containing text, page_number, and chunk_index.
    """
    # Pulling chunk configurations dynamically from our Pydantic Settings
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.MAX_CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )
    
    all_chunks = []
    global_chunk_index = 0
    
    for page_number, page_text in extracted_pages:
        # Check if text is completely empty (e.g., scanned image PDF check placeholder)
        if not page_text.strip():
            continue
            
        # Splitting text for each page individually preserves perfectly isolated page citations
        page_chunks = text_splitter.split_text(page_text)
        
        for chunk_text in page_chunks:
            cleaned_text = chunk_text.strip()
            if cleaned_text:
                all_chunks.append({
                    "text": cleaned_text,
                    "page_number": page_number,
                    "chunk_index": global_chunk_index
                })
                global_chunk_index += 1
                
    return all_chunks