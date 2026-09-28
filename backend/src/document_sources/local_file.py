import logging
from pathlib import Path
import chardet
from langchain_community.document_loaders import PyMuPDFLoader, UnstructuredFileLoader
from langchain_core.documents import Document
from langchain_core.document_loaders import BaseLoader

class ListLoader(BaseLoader):
    """
    A wrapper to make a list of Documents compatible with BaseLoader.
    """
    def __init__(self, documents):
        self.documents = documents

    def load(self):
        """
        Returns the list of documents.
        """
        return self.documents

def detect_encoding(file_path):
    """
    Detects the file encoding to avoid UnicodeDecodeError.

    Args:
        file_path (str or Path): Path to the file.

    Returns:
        str: Detected encoding (default "utf-8" if not found).
    """
    with open(file_path, 'rb') as f:
        raw_data = f.read(4096)
        result = chardet.detect(raw_data)
        return result['encoding'] or "utf-8"

def load_document_content(file_path):
    """
    Loads document content from a file, handling PDFs and text encoding.

    Args:
        file_path (str or Path): Path to the file.

    Returns:
        tuple: (loader, encoding_flag)
            loader: Document loader instance.
            encoding_flag (bool): True if non-UTF-8 encoding was used for .txt files.
    """
    file_extension = Path(file_path).suffix.lower()
    encoding_flag = False
    if file_extension == '.pdf':
        loader = PyMuPDFLoader(file_path)
        return loader, encoding_flag
    if file_extension in {".txt", ".md"}:
        from src.course_content import read_text_file
        content, encoding = read_text_file(Path(file_path))
        logging.info("Text encoding: %s", encoding)
        loader = ListLoader([Document(page_content=content, metadata={"source": file_path})])
        encoding_flag = True
        return loader, encoding_flag
    loader = UnstructuredFileLoader(file_path, mode="elements", autodetect_encoding=True)
    return loader, encoding_flag

def get_documents_from_file_by_path(file_path, file_name):
    """
    Loads documents from a file by its path and returns file name, pages, and extension.

    Args:
        file_path (str or Path): Path to the file.
        file_name (str): Name of the file.

    Returns:
        tuple: (file_name, pages, file_extension)

    Raises:
        Exception: If file does not exist or reading fails.
    """
    file_path = Path(file_path)
    if not file_path.exists():
        logging.info('File %s does not exist', file_name)
        raise Exception(f'File {file_name} does not exist')
    logging.info('file %s processing', file_name)
    try:
        loader, encoding_flag = load_document_content(file_path)
        file_extension = file_path.suffix.lower()
        if file_extension in {".pdf", ".txt", ".md"}:
            pages = loader.load()
        else:
            unstructured_pages = loader.load()
            pages = get_pages_with_page_numbers(unstructured_pages)
    except Exception as exc:
        raise Exception(f'Error while reading the file content or metadata, {exc}')
    from src.course_content import clean_pages
    for page, cleaned in zip(pages, clean_pages([page.page_content for page in pages])):
        page.page_content = cleaned
    return file_name, pages, file_extension

def get_pages_with_page_numbers(unstructured_pages):
    """Keep every element and paragraph when grouping parsed document pages."""
    pages = []
    paragraphs = []
    metadata = {}
    current_number = 1

    def flush():
        if paragraphs:
            pages.append(Document(page_content="\n\n".join(paragraphs), metadata=dict(metadata)))
            paragraphs.clear()

    for element in unstructured_pages:
        number = element.metadata.get("page_number", current_number)
        if element.metadata.get("category") == "PageBreak":
            flush()
            current_number += 1
            metadata = {}
            continue
        if number != current_number:
            flush()
            current_number = number
            metadata = {}
        metadata.update(element.metadata)
        metadata["page_number"] = current_number
        if element.page_content.strip():
            paragraphs.append(element.page_content)
    flush()
    return pages
