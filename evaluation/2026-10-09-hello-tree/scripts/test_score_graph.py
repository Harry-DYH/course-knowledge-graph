"""Offline scorer contracts; run with python -m unittest discover -s scripts."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from score_graph import EVALUATION_LABEL, normalize_label, score_graph


def reference():
    return {
        "metadata": {"title": "Synthetic scorer test; not a course accuracy run"},
        "nodes": [
            {"id": "a", "label": "根节点", "aliases": ["Root Node"], "section": "test", "evidence": "root"},
            {"id": "b", "label": "子节点", "aliases": ["Child"], "section": "test", "evidence": "child"},
        ],
        "edges": [{"source": "a", "target": "b", "kind": "CONTAINS", "section": "test", "evidence": "root contains child", "reason": "synthetic"}],
    }


def graph():
    return {
        "points": [{"uid": "p", "label": " ＲＯＯＴ\tＮｏｄｅ "}, {"uid": "q", "label": "子节点"}],
        "edges": [{"source": "p", "target": "q", "kind": "CONTAINS"}],
    }


class ScorerTests(unittest.TestCase):
    def test_exact_alias_and_unicode_without_fuzzy_or_punctuation_removal(self):
        result = score_graph(reference(), graph())
        self.assertEqual(result["metrics"]["nodes"]["tp"], 2)
        self.assertEqual(result["node_review"]["items"][0]["reason"], "exact_alias_match")
        self.assertEqual(normalize_label("Ａ+B  \n"), "a+b")
        self.assertNotEqual(normalize_label("A+B"), normalize_label("AB"))
        changed = graph()
        changed["points"][0]["label"] = "root-node"
        self.assertEqual(score_graph(reference(), changed)["metrics"]["nodes"]["fp"], 1)

    def test_directed_relations_reject_reverse(self):
        for kind in ("CONTAINS", "PREREQUISITE_OF"):
            with self.subTest(kind=kind):
                gold, predicted = reference(), graph()
                gold["edges"][0]["kind"] = kind
                predicted["edges"][0] = {"source": "q", "target": "p", "kind": kind}
                result = score_graph(gold, predicted)
                self.assertEqual((result["metrics"]["edges"]["tp"], result["metrics"]["edges"]["fp"], result["metrics"]["edges"]["fn"]), (0, 1, 1))
                self.assertEqual(result["edge_review"]["items"][0]["reason"], "direction_mismatch")

    def test_symmetric_relation_one_to_one_and_duplicate_edge(self):
        gold, predicted = reference(), graph()
        gold["edges"][0]["kind"] = "RELATED_TO"
        predicted["edges"] = [
            {"source": "q", "target": "p", "kind": "RELATED_TO"},
            {"source": "p", "target": "q", "kind": "RELATED_TO"},
        ]
        result = score_graph(gold, predicted)
        self.assertEqual(result["metrics"]["edges"]["tp"], 1)
        self.assertEqual(result["metrics"]["edges"]["fp"], 1)
        self.assertEqual(result["metrics"]["edges"]["precision"], .5)
        self.assertEqual(result["edge_review"]["items"][1]["reason"], "duplicate_reference_edge")

    def test_synonym_duplicate_is_fp_and_cannot_support_an_edge(self):
        gold, predicted = reference(), graph()
        predicted["points"].append({"uid": "r", "label": "根节点"})
        predicted["edges"].append({"source": "r", "target": "q", "kind": "CONTAINS"})
        result = score_graph(gold, predicted)
        self.assertEqual(result["metrics"]["nodes"]["tp"], 2)
        self.assertEqual(result["metrics"]["nodes"]["fp"], 1)
        self.assertEqual(result["node_review"]["items"][2]["reason"], "duplicate_reference_node")
        self.assertEqual(result["node_review"]["items"][2]["duplicate_of_prediction_index"], 0)
        self.assertEqual(result["edge_review"]["items"][1]["reason"], "endpoint_not_one_to_one_matched")
        self.assertEqual(result["metrics"]["edges"]["tp"], 1)

    def test_zero_denominators_and_missing_records(self):
        empty_gold = {"metadata": {}, "nodes": [], "edges": []}
        empty_graph = {"points": [], "edges": []}
        metrics = score_graph(empty_gold, empty_graph)["metrics"]["nodes"]
        self.assertEqual((metrics["tp"], metrics["fp"], metrics["fn"]), (0, 0, 0))
        self.assertTrue(all(metrics[key] is None for key in ("precision", "recall", "f1")))
        missing = score_graph(reference(), empty_graph)
        self.assertEqual(len(missing["missing_nodes"]["items"]), 2)
        self.assertEqual(len(missing["missing_edges"]["items"]), 1)
        self.assertIsNone(missing["metrics"]["nodes"]["precision"])
        self.assertEqual(missing["metrics"]["nodes"]["recall"], 0)
        self.assertEqual(missing["metrics"]["nodes"]["f1"], 0)
        extras = score_graph(empty_gold, graph())["metrics"]["nodes"]
        self.assertIsNone(extras["recall"])
        self.assertEqual(extras["precision"], 0)
        self.assertEqual(extras["f1"], 0)

    def test_relation_type_and_unknown_endpoint_count_as_unmatched(self):
        predicted = graph()
        predicted["edges"] = [
            {"source": "p", "target": "q", "kind": "PREREQUISITE_OF"},
            {"source": "p", "target": "unknown", "kind": "CONTAINS"},
            {"source": "p", "target": "q", "kind": "contains"},
        ]
        result = score_graph(reference(), predicted)
        self.assertEqual(result["metrics"]["edges"]["fp"], 3)
        self.assertEqual(result["metrics"]["edges"]["fn"], 1)
        self.assertEqual(result["edge_review"]["items"][1]["reason"], "unknown_prediction_endpoint")
        self.assertEqual(result["edge_review"]["items"][2]["reason"], "unsupported_relation_type")
        self.assertEqual(result["metrics"]["by_edge_type"]["CONTAINS"]["fp"], 1)
        self.assertEqual(result["metrics"]["by_edge_type"]["contains"]["fp"], 1)

    def test_ambiguous_reference_and_duplicate_ids_fail(self):
        gold = reference()
        gold["nodes"][1]["aliases"].append("rootnode")
        with self.assertRaisesRegex(ValueError, "Ambiguous"):
            score_graph(gold, graph())
        predicted = graph()
        predicted["points"][1]["uid"] = "p"
        with self.assertRaisesRegex(ValueError, "Duplicate prediction UID"):
            score_graph(reference(), predicted)
        gold = reference()
        gold["edges"].append(copy.deepcopy(gold["edges"][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate equivalent reference"):
            score_graph(gold, graph())

    def test_repeated_unmatched_items_are_identified_without_false_tp(self):
        predicted = graph()
        predicted["points"].extend([{"uid": "u", "label": "额外"}, {"uid": "v", "label": "额外"}])
        extra_edge = {"source": "p", "target": "u", "kind": "RELATED_TO"}
        predicted["edges"].extend([extra_edge, dict(extra_edge)])
        result = score_graph(reference(), predicted)
        self.assertEqual(result["metrics"]["duplicate_predictions"], {"nodes": 1, "edges": 1})
        self.assertEqual(result["metrics"]["nodes"]["fp"], 2)
        self.assertEqual(result["metrics"]["edges"]["fp"], 2)

    def test_cli_writes_five_deterministic_files_with_input_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            gold_path, graph_path = root / "reference.json", root / "graph.json"
            gold_path.write_text(json.dumps(reference()), encoding="utf-8")
            graph_path.write_text(json.dumps(graph()), encoding="utf-8")
            command = [sys.executable, str(Path(__file__).with_name("score_graph.py")), "--gold", str(gold_path), "--graph", str(graph_path), "--out", str(root / "scores")]
            subprocess.run(command, check=True, capture_output=True, text=True)
            files = sorted((root / "scores").glob("*.json"))
            self.assertEqual(len(files), 5)
            before = {path.name: path.read_bytes() for path in files}
            for path in files:
                metadata = json.loads(path.read_text())["metadata"]
                self.assertEqual(metadata["label"], EVALUATION_LABEL)
                self.assertFalse(metadata["human_verified"])
                self.assertEqual(len(metadata["input_hashes"]["gold_sha256"]), 64)
            subprocess.run(command, check=True, capture_output=True, text=True)
            self.assertEqual(before, {path.name: path.read_bytes() for path in files})


if __name__ == "__main__":
    unittest.main()
