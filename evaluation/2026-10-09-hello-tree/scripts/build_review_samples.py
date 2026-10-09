"""Select deterministic source-review samples without showing strict scores to reviewers."""
from pathlib import Path
import json
import random

BASE = Path(__file__).resolve().parents[1]
SEED = 20261009


def main():
    for kind in ('txt', 'docx'):
        graph_path = BASE / 'runs' / kind / 'graph.json'
        if not graph_path.exists():
            continue
        graph = json.loads(graph_path.read_text())
        points = {p['uid']: p for p in graph['points']}
        nodes = sorted(graph['points'], key=lambda p: (p['label'], p['uid']))
        edges = sorted(graph['edges'], key=lambda e: (points[e['source']]['label'], e['kind'], points[e['target']]['label']))
        rng = random.Random(SEED)
        node_sample = rng.sample(nodes, min(20, len(nodes)))
        edge_sample = rng.sample(edges, min(20, len(edges)))
        samples = []
        for i, point in enumerate(node_sample, 1):
            samples.append({'sample_id': f'{kind}-N{i:02}', 'item_type': 'node', 'label': point['label'], 'prediction_uid': point['uid']})
        for i, edge in enumerate(edge_sample, 1):
            samples.append({'sample_id': f'{kind}-E{i:02}', 'item_type': 'edge', 'source': points[edge['source']]['label'], 'kind': edge['kind'], 'target': points[edge['target']]['label'], 'prediction_uid': edge.get('uid')})
        result = {
            'format': kind, 'seed': SEED, 'annotation_status': 'Awaiting independent AI source review, then human confirmation',
            'node_population': len(nodes), 'edge_population': len(edges),
            'selection': 'Stable label sorting, random.Random(seed); node sample then edge sample without replacement',
            'rules': 'Review entity identity only (not definition quality); relations require text support, correct type and direction. RELATED_TO is symmetric. Do not infer prerequisites merely from teaching order. Supported / unsupported / uncertain; provide verbatim evidence. Do not inspect strict-reference scores.',
            'items': samples,
        }
        (BASE / 'review' / f'{kind}_sample.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(kind, len(node_sample), len(edge_sample))


if __name__ == '__main__':
    main()
