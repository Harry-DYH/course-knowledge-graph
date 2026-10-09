#!/usr/bin/env python3
"""Deterministic, offline comparison with a frozen, unverified reference graph.

TP/FP/FN describe agreement with this reference, not factual correctness. No
network, LLM, database, third-party package or environment credential is used.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
import unicodedata
from typing import Any

EVALUATION_LABEL = "AI-assisted frozen reference, not human verified"
SCORER_VERSION = "1.0"
RELATION_TYPES = ("CONTAINS", "PREREQUISITE_OF", "RELATED_TO")


def normalize_label(value: str) -> str:
    """NFKC + Unicode casefold + whitespace removal; preserve punctuation."""
    return "".join(unicodedata.normalize("NFKC", value).casefold().split())


def _string(record: dict[str, Any], key: str, context: str, *, nonempty: bool = True) -> str:
    value = record.get(key)
    if not isinstance(value, str) or (nonempty and not value.strip()):
        raise ValueError(f"{context}.{key} must be a {'nonempty ' if nonempty else ''}string")
    return value


def _records(document: dict[str, Any], key: str, context: str) -> list[dict[str, Any]]:
    records = document.get(key)
    if not isinstance(records, list) or any(not isinstance(item, dict) for item in records):
        raise ValueError(f"{context}.{key} must be an array of objects")
    return records


def _edge_key(source: str, target: str, kind: str) -> tuple[str, str, str]:
    if kind == "RELATED_TO":
        source, target = sorted((source, target))
    return kind, source, target


def metric_counts(tp: int, predicted: int, reference: int) -> dict[str, int | float | None]:
    fp, fn = predicted - tp, reference - tp
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": tp / predicted if predicted else None,
        "recall": tp / reference if reference else None,
        "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
        "prediction_count": predicted,
        "reference_count": reference,
    }


def score_graph(gold: dict[str, Any], graph: dict[str, Any]) -> dict[str, Any]:
    """Score a graph with a one-to-one, exact reference mapping.

    Prediction order breaks ties between synonym duplicates: the first matching
    point is accepted. Only accepted point mappings can support matched edges.
    Duplicate reference IDs, ambiguous aliases or equivalent reference edges
    fail explicitly rather than silently changing reference denominators.
    """
    if not isinstance(gold, dict) or not isinstance(graph, dict):
        raise ValueError("gold and graph must each be a JSON object")
    if not isinstance(gold.get("metadata"), dict):
        raise ValueError("gold.metadata must be an object")
    gold_nodes = _records(gold, "nodes", "gold")
    gold_edges = _records(gold, "edges", "gold")
    predicted_nodes = _records(graph, "points", "graph")
    predicted_edges = _records(graph, "edges", "graph")

    gold_by_id: dict[str, dict[str, Any]] = {}
    name_to_gold: dict[str, str] = {}
    for index, node in enumerate(gold_nodes):
        context = f"gold.nodes[{index}]"
        node_id = _string(node, "id", context)
        label = _string(node, "label", context)
        if node_id in gold_by_id:
            raise ValueError(f"Duplicate reference node ID: {node_id!r}")
        aliases = node.get("aliases", [])
        if not isinstance(aliases, list) or any(not isinstance(alias, str) or not alias.strip() for alias in aliases):
            raise ValueError(f"{context}.aliases must be an array of nonempty strings")
        gold_by_id[node_id] = node
        for name in [label, *aliases]:
            normalized = normalize_label(name)
            other = name_to_gold.get(normalized)
            if other is not None and other != node_id:
                raise ValueError(f"Ambiguous normalized reference name {normalized!r}: {other!r}, {node_id!r}")
            name_to_gold[normalized] = node_id

    reference_edges: dict[tuple[str, str, str], int] = {}
    for index, edge in enumerate(gold_edges):
        context = f"gold.edges[{index}]"
        source = _string(edge, "source", context)
        target = _string(edge, "target", context)
        kind = _string(edge, "kind", context)
        if source not in gold_by_id or target not in gold_by_id:
            raise ValueError(f"{context} references an unknown reference node ID")
        if kind not in RELATION_TYPES:
            raise ValueError(f"{context}.kind must be one of {RELATION_TYPES!r}")
        key = _edge_key(source, target, kind)
        if key in reference_edges:
            raise ValueError(f"Duplicate equivalent reference edges at indices {reference_edges[key]} and {index}")
        reference_edges[key] = index

    predicted_by_uid: dict[str, dict[str, Any]] = {}
    accepted_node_map: dict[str, str] = {}
    accepted_gold_nodes: dict[str, int] = {}
    first_unmatched_label: dict[str, int] = {}
    node_review: list[dict[str, Any]] = []
    for index, node in enumerate(predicted_nodes):
        context = f"graph.points[{index}]"
        uid = _string(node, "uid", context)
        label = _string(node, "label", context, nonempty=False)
        if uid in predicted_by_uid:
            raise ValueError(f"Duplicate prediction UID makes edge endpoints ambiguous: {uid!r}")
        predicted_by_uid[uid] = node
        normalized = normalize_label(label)
        gold_id = name_to_gold.get(normalized)
        review: dict[str, Any] = {
            "prediction_index": index,
            "prediction": {"uid": uid, "label": label},
            "normalized_label": normalized,
            "status": "fp",
            "duplicate": False,
            "reference_node_id": gold_id,
        }
        if gold_id is None:
            review["reason"] = "label_not_in_reference" if normalized else "empty_label"
            if normalized in first_unmatched_label:
                review.update(duplicate=True, duplicate_of_prediction_index=first_unmatched_label[normalized])
                review["reason"] = "duplicate_unmatched_label"
            else:
                first_unmatched_label[normalized] = index
        else:
            review["reference_node"] = gold_by_id[gold_id]
            if gold_id in accepted_gold_nodes:
                review.update(
                    reason="duplicate_reference_node",
                    duplicate=True,
                    duplicate_of_prediction_index=accepted_gold_nodes[gold_id],
                )
            else:
                accepted_gold_nodes[gold_id] = index
                accepted_node_map[uid] = gold_id
                is_label = normalized == normalize_label(gold_by_id[gold_id]["label"])
                review.update(status="tp", reason="exact_label_match" if is_label else "exact_alias_match")
        node_review.append(review)

    accepted_gold_edges: dict[int, int] = {}
    first_unmatched_edge: dict[tuple[str, str, str], int] = {}
    edge_review: list[dict[str, Any]] = []
    for index, edge in enumerate(predicted_edges):
        context = f"graph.edges[{index}]"
        source = _string(edge, "source", context)
        target = _string(edge, "target", context)
        kind = _string(edge, "kind", context, nonempty=False)
        mapped_source = accepted_node_map.get(source)
        mapped_target = accepted_node_map.get(target)
        review = {
            "prediction_index": index,
            "prediction": edge,
            "status": "fp",
            "duplicate": False,
            "source_label": predicted_by_uid.get(source, {}).get("label"),
            "target_label": predicted_by_uid.get(target, {}).get("label"),
            "mapped_reference_source": mapped_source,
            "mapped_reference_target": mapped_target,
        }
        missing_uids = [uid for uid in dict.fromkeys((source, target)) if uid not in predicted_by_uid]
        unmatched_uids = [uid for uid in dict.fromkeys((source, target)) if uid in predicted_by_uid and uid not in accepted_node_map]
        if missing_uids:
            review.update(reason="unknown_prediction_endpoint", unknown_endpoint_uids=missing_uids)
        elif unmatched_uids:
            review.update(reason="endpoint_not_one_to_one_matched", unmatched_endpoint_uids=unmatched_uids)
        elif kind not in RELATION_TYPES:
            review["reason"] = "unsupported_relation_type"
        else:
            key = _edge_key(mapped_source, mapped_target, kind)
            reference_index = reference_edges.get(key)
            if reference_index is None:
                reverse = _edge_key(mapped_target, mapped_source, kind)
                review["reason"] = "direction_mismatch" if kind != "RELATED_TO" and reverse in reference_edges else "edge_not_in_reference"
            else:
                review.update(reference_edge_index=reference_index, reference_edge=gold_edges[reference_index])
                if reference_index in accepted_gold_edges:
                    review.update(
                        reason="duplicate_reference_edge",
                        duplicate=True,
                        duplicate_of_prediction_index=accepted_gold_edges[reference_index],
                    )
                else:
                    accepted_gold_edges[reference_index] = index
                    review.update(status="tp", reason="exact_edge_match")
        if review["status"] == "fp" and not review["duplicate"]:
            # Also identify identical unmatched predictions, without implying
            # either copy is a factual error or matching an unaccepted node.
            raw_key = _edge_key(source, target, kind)
            if raw_key in first_unmatched_edge:
                review.update(duplicate=True, duplicate_of_prediction_index=first_unmatched_edge[raw_key])
            else:
                first_unmatched_edge[raw_key] = index
        edge_review.append(review)

    missing_nodes = [
        {"reference_index": index, "reference_node": node, "status": "fn", "reason": "reference_node_not_matched"}
        for index, node in enumerate(gold_nodes) if node["id"] not in accepted_gold_nodes
    ]
    missing_edges = [
        {"reference_index": index, "reference_edge": edge, "status": "fn", "reason": "reference_edge_not_matched"}
        for index, edge in enumerate(gold_edges) if index not in accepted_gold_edges
    ]
    reference_type_counts = Counter(edge["kind"] for edge in gold_edges)
    prediction_type_counts = Counter(edge["kind"] for edge in predicted_edges)
    matched_type_counts = Counter(item["prediction"]["kind"] for item in edge_review if item["status"] == "tp")
    metadata = {
        "label": EVALUATION_LABEL,
        "human_verified": False,
        "scorer_version": SCORER_VERSION,
        "interpretation": "TP/FP/FN denote matches, unmatched predictions, and unmatched reference items. Unmatched does not mean factually incorrect.",
        "normalization": "Unicode NFKC, casefold, remove whitespace; preserve punctuation",
        "node_matching": "Exact normalized reference label or alias; first prediction in input order wins; one-to-one",
        "edge_matching": "Only accepted node mappings; exact relation type; CONTAINS and PREREQUISITE_OF directed; RELATED_TO undirected; one-to-one",
        "zero_denominator": "null; F1 = 2*TP / (2*TP + FP + FN)",
        "reference_metadata": gold["metadata"],
    }
    metrics = {
        "metadata": metadata,
        "raw_counts": {
            "reference_nodes": len(gold_nodes), "reference_edges": len(gold_edges),
            "prediction_nodes": len(predicted_nodes), "prediction_edges": len(predicted_edges),
        },
        "nodes": metric_counts(len(accepted_gold_nodes), len(predicted_nodes), len(gold_nodes)),
        "edges": metric_counts(len(accepted_gold_edges), len(predicted_edges), len(gold_edges)),
        "by_edge_type": {
            kind: metric_counts(matched_type_counts[kind], prediction_type_counts[kind], reference_type_counts[kind])
            for kind in sorted(set(RELATION_TYPES) | set(reference_type_counts) | set(prediction_type_counts))
        },
        "duplicate_predictions": {
            "nodes": sum(item["duplicate"] for item in node_review),
            "edges": sum(item["duplicate"] for item in edge_review),
        },
    }
    return {
        "metrics": metrics,
        "node_review": {"metadata": metadata, "items": node_review},
        "edge_review": {"metadata": metadata, "items": edge_review},
        "missing_nodes": {"metadata": metadata, "items": missing_nodes},
        "missing_edges": {"metadata": metadata, "items": missing_edges},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gold", required=True, type=Path, help="Frozen reference JSON")
    parser.add_argument("--graph", required=True, type=Path, help="API graph JSON with points and edges")
    parser.add_argument("--out", required=True, type=Path, help="Output directory for five JSON files")
    args = parser.parse_args(argv)
    try:
        gold_bytes = args.gold.read_bytes()
        graph_bytes = args.graph.read_bytes()
        report = score_graph(json.loads(gold_bytes), json.loads(graph_bytes))
        input_hashes = {
            "gold_sha256": hashlib.sha256(gold_bytes).hexdigest(),
            "graph_sha256": hashlib.sha256(graph_bytes).hexdigest(),
        }
        report["metrics"]["metadata"]["input_hashes"] = input_hashes
        args.out.mkdir(parents=True, exist_ok=True)
        for name, document in report.items():
            target = args.out / f"{name}.json"
            if target.resolve() in {args.gold.resolve(), args.graph.resolve()}:
                raise ValueError(f"Output would overwrite an input file: {target}")
        for name, document in report.items():
            target = args.out / f"{name}.json"
            temporary = target.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
            temporary.replace(target)
    except (OSError, ValueError, TypeError) as exc:
        print(f"Scoring failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({"label": EVALUATION_LABEL, "nodes": report["metrics"]["nodes"], "edges": report["metrics"]["edges"], "out": str(args.out)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
