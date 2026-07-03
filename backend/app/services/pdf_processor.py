import fitz  # PyMuPDF
from typing import List, Tuple

def extract_text_from_pdf(file_path: str) -> List[Tuple[int, str]]:
    """
    Opens a PDF and extracts raw text page by page.
    
    Returns:
        A list of tuples containing (page_number, text_content).
    """
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        raise ValueError(f"Failed to open PDF file at {file_path}. Error: {str(e)}")

    extracted_pages = []
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text()
        
        # 1-indexed page numbers are friendlier for user-facing citations
        extracted_pages.append((page_num + 1, text))
        
    doc.close()
    return extracted_pages