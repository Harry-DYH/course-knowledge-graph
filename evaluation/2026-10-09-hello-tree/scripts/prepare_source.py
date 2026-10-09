"""Prepare a deterministic prose-only input from the pinned open textbook sources."""
from pathlib import Path
import hashlib
import html
import json
import re

BASE = Path(__file__).resolve().parents[1]
SECTIONS = [
    ("binary_tree.md", "7.1 二叉树"),
    ("binary_tree_traversal.md", "7.2 二叉树遍历"),
    ("array_representation_of_tree.md", "7.3 二叉树数组表示"),
    ("binary_search_tree.md", "7.4 二叉搜索树"),
    ("avl_tree.md", "7.5 AVL 树"),
    ("summary.md", "7.6 小结"),
]


def clean(source):
    lines, in_code = [], False
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if stripped.startswith(("=== ", "{{", "![", "<div", "</div", "!!!", "???", "https://pythontutor.com/")):
            continue
        if re.match(r"^\|?[\s:|\-]+\|?$", stripped):
            continue
        if not lines and stripped.startswith("# "):
            continue
        line = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', line)
        line = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', line)
        # Remove known markup only, never math comparisons such as < -1 ... > 0.
        line = re.sub(r'</?(?:u|p|id|span|div|br|em|strong|sup|sub)(?:\s[^<>]*)?/?>', '', line)
        line = html.unescape(line)
        line = line.replace('**', '').replace('`', '')
        line = re.sub(r'^\s*#{1,6}\s+', '', line)
        # Keep formulas and prose tables; omit only Markdown delimiter markers.
        line = line.replace('$', '').strip()
        lines.append(line)
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()


def main():
    parts = ["第7章 树"]
    section_stats = []
    for filename, title in SECTIONS:
        body = clean((BASE / 'source/raw' / filename).read_text())
        parts.extend([title, body])
        section_stats.append({'file': filename, 'title': title, 'characters': len(body)})
    text = '\n\n'.join(parts) + '\n'
    path = BASE / 'inputs/Hello算法_第7章树_正文.txt'
    path.write_text(text)
    manifest_path = BASE / 'source/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['preprocessing'] = {
        'scope': '7.1–7.6 prose, including textual formulas and tables; excludes exercises, figures, all programming-language code blocks and code-loader macros',
        'changes': 'Removed Markdown/HTML formatting delimiters; preserved prose order and wording. No new teaching content or prerequisite statements added.',
        'sections': section_stats,
        'input_txt_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'characters': len(text),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(manifest['preprocessing'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
