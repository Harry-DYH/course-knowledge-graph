"""Combine independent AI reviews without resolving disagreements as human gold."""
import json
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads((BASE / path).read_text())


def main():
    source = (BASE / 'inputs/Hello算法_第7章树_正文.txt').read_text()
    result = {'human_verified': False,
              'consensus_policy': 'Both supported => supported; both unsupported => unsupported; all other combinations => pending_human. Original judgments retained.',
              'interpretation': 'Source support for sampled predictions only. Does not measure missing knowledge, definition quality, or formal contest accuracy.',
              'runs': {}}
    lines = ['# 人工复核清单', '',
             '当前所有结论均为 AI 辅助，尚未由课程熟悉者确认。请在每项“人工判定”后填写：支持／不支持／待定、判定人和日期。不要直接覆盖冻结参考集或本轮评分；需要修订时另存新版本。', '',
             '材料：krahets 及 Hello Algo 贡献者，《Hello 算法》第 7 章，CC BY-NC-SA 4.0。[原文与许可](../README.md)。以下引用均来自固定 TXT，并已逐字核验。', '',
             '节点只复核术语身份与合理粒度，不评价补全定义。关系同时复核端点、类型和方向；“相关”不能只靠同章共现，“先修”不能仅依教学顺序推断。“包含”区分结构组成、分类成员与属性／工具。', '',
             '参考标注需另行复核：[70 节点与 101 条关系的可读清单](参考标注复核清单.md)。预测抽样为每格式20点、20边，种子20261009。', '']
    names = {'supported': '支持', 'unsupported': '不支持', 'uncertain': '待定', 'pending_human': '待人工确认'}
    for fmt in ('txt', 'docx'):
        sample = read(f'review/{fmt}_sample.json')
        reviews = [read(f'review/{fmt}_review_{r}.json') for r in ('A', 'B')]
        assert all(r['human_verified'] is False for r in reviews)
        maps = [{x['sample_id']: x for x in r['items']} for r in reviews]
        expected = {x['sample_id'] for x in sample['items']}
        assert all(set(m) == expected and len(m) == 40 for m in maps)
        summary = {'nodes': Counter(), 'edges': Counter(), 'exact_verdict_agreement': 0, 'sample_size': 40, 'items': []}
        lines.extend([f'## {fmt.upper()} 抽样', ''])
        for item in sample['items']:
            a, b = [m[item['sample_id']] for m in maps]
            for review in (a, b):
                assert review['verdict'] in {'supported', 'unsupported', 'uncertain'}
                assert not review['evidence'] or review['evidence'] in source
            va, vb = a['verdict'], b['verdict']
            final = va if va == vb and va in {'supported', 'unsupported'} else 'pending_human'
            kind = 'nodes' if item['item_type'] == 'node' else 'edges'
            summary[kind][final] += 1
            summary['exact_verdict_agreement'] += int(va == vb)
            summary['items'].append({'sample_id': item['sample_id'], 'item_type': item['item_type'],
                                     'review_A': va, 'review_B': vb, 'consensus': final})
            label = item.get('label') or f"{item['source']} → {item['kind']} → {item['target']}"
            lines.extend([f"### {item['sample_id']} · {label}", '',
                          f"AI A：{names[va]}；AI B：{names[vb]}；汇总：{names[final]}。", '',
                          f"A 依据：{a['reason']}", '', f"B 依据：{b['reason']}", ''])
            for n, evidence in enumerate(dict.fromkeys([a['evidence'], b['evidence']]), 1):
                lines.extend([f'原文依据 {n}：', '', '> ' + evidence.replace('\n', '\n> '), ''])
            lines.extend(['- [ ] 人工判定：______；判定人／日期：______；说明：______', ''])
        for kind in ('nodes', 'edges'):
            counts = {v: summary[kind][v] for v in ('supported', 'unsupported', 'pending_human')}
            counts['sample_size'] = sum(counts.values())
            counts['unanimous_support_fraction'] = counts['supported'] / counts['sample_size']
            summary[kind] = counts
        result['runs'][fmt] = summary
    (BASE / 'review/summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (BASE / 'review/人工复核清单.md').write_text('\n'.join(line.rstrip() for line in '\n'.join(lines).splitlines()).rstrip() + '\n')
    gold = read('gold/reference.json')
    labels = {n['id']: n['label'] for n in gold['nodes']}
    lines = ['# 参考标注复核清单', '',
             '这是预测生成前冻结的 AI 辅助参考标注，共70个知识点、101条关系，尚未人工确认。它不是完整本体，匹配政策与存在歧义的情况见 [annotation_notes.md](../gold/annotation_notes.md)。修订请另存版本并保留本轮原始分数。', '',
             '资料作者：krahets 及 Hello Algo 贡献者；Hello 算法，第7章。引用来源、固定版本与 CC BY-NC-SA 4.0 许可见 [资料说明](../README.md)。', '',
             '先确认合理的概念粒度、别名边界与关系语义，然后逐条核对。人工标注不是只点击接受 AI 建议；还需阅读完整输入，补查可能未被参考集覆盖的知识点与关系。', '', '## 知识点', '']
    for n in gold['nodes']:
        assert n['evidence'] in source
        lines.extend([f"### {n['id']} · {n['label']}", '',
                      f"章节：{n['section']}；显式别名：{'、'.join(n.get('aliases', [])) or '无'}。", '',
                      '> ' + n['evidence'].replace('\n', '\n> '), '',
                      '- [ ] 人工判定／别名修订／判定人／日期：______', ''])
    lines.extend(['## 关系', ''])
    for index, edge in enumerate(gold['edges'], 1):
        assert edge['evidence'] in source
        lines.extend([f"### R{index:03d} · {labels[edge['source']]} → {edge['kind']} → {labels[edge['target']]}", '',
                      f"章节：{edge['section']}；理由：{edge.get('reason', '')}", '',
                      '> ' + edge['evidence'].replace('\n', '\n> '), '',
                      '- [ ] 人工判定／关系修订／判定人／日期：______', ''])
    (BASE / 'review/参考标注复核清单.md').write_text('\n'.join(line.rstrip() for line in '\n'.join(lines).splitlines()).rstrip() + '\n')
    print(json.dumps({fmt: {k: v for k, v in run.items() if k != 'items'} for fmt, run in result['runs'].items()}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
