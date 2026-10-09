"""Post-run, offline diagnosis of the actual application's default chunk cap.

Does not change frozen inputs, reference, protocol, predictions or configuration.
"""
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import sys

from dotenv import dotenv_values
from langchain_text_splitters import TokenTextSplitter
import tiktoken

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE.parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from src.document_sources.local_file import get_documents_from_file_by_path
from src.create_chunks import CreateChunksofDocument


def main():
    config = dotenv_values(ROOT / 'backend/.env')
    cap = int(config.get('MAX_TOKEN_CHUNK_SIZE', '10000'))
    os.environ['MAX_TOKEN_CHUNK_SIZE'] = str(cap)
    size, overlap = 1500, 100
    tokenizer = tiktoken.get_encoding('gpt2')
    rows = []
    for fmt in ('txt', 'docx'):
        path = BASE / f'inputs/Hello算法_第7章树_正文.{fmt}'
        _, pages, _ = get_documents_from_file_by_path(str(path), path.name)
        all_chunks = TokenTextSplitter(chunk_size=size, chunk_overlap=overlap).split_documents(pages)
        kept = CreateChunksofDocument(pages, None).split_file_into_chunks(size, overlap, '')
        assert len(pages) == 1, 'Token coverage formula assumes one parsed document page'
        tokens = tokenizer.encode(pages[0].page_content)
        covered_count = min(len(tokens), len(kept) * size - max(0, len(kept) - 1) * overlap)
        sections = []
        for match in re.finditer(r'(?m)^7\.[1-6] .+$', pages[0].page_content):
            token_offset = len(tokenizer.encode(pages[0].page_content[:match.start()]))
            sections.append({'heading': match.group(), 'token_start_approx': token_offset,
                             'heading_inside_retained_prefix': token_offset < covered_count})
        log = (BASE / f'runs/{fmt}/server.log').read_text()
        logged_total = int(re.search(r'Total chunks created: (\d+)', log).group(1))
        logged_kept = int(re.search(r'limiting chunks to (\d+)', log).group(1))
        assert (len(all_chunks), len(kept)) == (logged_total, logged_kept)
        row = {'format': fmt, 'input_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
               'parsed_pages': len(pages), 'full_chunks': len(all_chunks), 'retained_chunks': len(kept),
               'discarded_chunks': len(all_chunks) - len(kept), 'matches_original_run_log': True,
               'tokenizer': 'gpt2 (application TokenTextSplitter default)',
               'full_text_tokens': len(tokens), 'unique_prefix_tokens_retained': covered_count,
               'prefix_token_coverage': covered_count / len(tokens),
               'last_retained_chunk_tail': kept[-1].page_content[-350:], 'section_headings': sections}
        rows.append(row)
    result = {'kind': 'Post-run offline diagnostic; not a change to the frozen protocol',
              'MAX_TOKEN_CHUNK_SIZE': cap, 'token_chunk_size': size, 'chunk_overlap': overlap,
              'email': 'empty, normal course upload path',
              'limit_formula': 'int(MAX_TOKEN_CHUNK_SIZE / token_chunk_size)',
              'code': 'backend/src/create_chunks.py:43-44,78-80',
              'coverage_note': 'Token prefix coverage, not knowledge-point recall. Overlap is counted once. Section offsets are approximate because token boundaries can straddle prefixes.',
              'runs': rows}
    out = BASE / 'diagnostics'
    out.mkdir(exist_ok=True)
    (out / 'chunk_coverage.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    logging.getLogger().setLevel(logging.ERROR)
    main()
