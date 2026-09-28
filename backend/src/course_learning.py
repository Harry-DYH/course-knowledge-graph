"""Deterministic learning stages from course-scoped prerequisite relationships."""
from collections import deque


def phase_title(level):
    if level is None:
        return "关系待修正"
    return "基础起点" if level == 0 else "知识衔接" if level == 1 else "逐步进阶"


def structure(points, edges, mastered):
    by_id = {point["uid"]: point for point in points}
    known = set(mastered) & set(by_id)
    incoming = {uid: set() for uid in by_id}
    outgoing = {uid: set() for uid in by_id}
    for edge in edges:
        a, b = edge["source"], edge["target"]
        if edge["kind"] == "PREREQUISITE_OF" and a in by_id and b in by_id:
            incoming[b].add(a)
            outgoing[a].add(b)
    degrees = {uid: len(parents) for uid, parents in incoming.items()}
    queue = deque(uid for uid in by_id if degrees[uid] == 0)
    tentative = {uid: 0 for uid in by_id}
    levels = {}
    while queue:
        uid = queue.popleft()
        levels[uid] = tentative[uid]
        for child in outgoing[uid]:
            tentative[child] = max(tentative[child], levels[uid] + 1)
            degrees[child] -= 1
            if degrees[child] == 0:
                queue.append(child)
    return by_id, known, incoming, outgoing, levels


def next_points(points, edges, mastered):
    by_id, known, incoming, outgoing, levels = structure(points, edges, mastered)
    remaining = set(by_id) - known
    order = lambda uid: (by_id[uid]["label"], uid)
    def references(ids):
        return [{"uid": uid, "label": by_id[uid]["label"]} for uid in sorted(ids, key=order)]
    candidates = []
    for uid in remaining:
        if uid not in levels or not incoming[uid] <= known:
            continue
        unlock = {child for child in outgoing[uid] if child in remaining and child in levels and incoming[child] <= known | {uid}}
        descendants = set()
        pending = list(outgoing[uid])
        while pending:
            child = pending.pop()
            if child == uid or child in descendants:
                continue
            descendants.add(child)
            pending.extend(outgoing[child])
        coverage = len(descendants & remaining)
        candidates.append({"uid": uid, "label": by_id[uid]["label"], "kind": by_id[uid].get("kind", "概念"), "depth": levels[uid], "phase": phase_title(levels[uid]), "foundation_for": coverage, "unlocks": len(unlock), "unlock_points": references(unlock), "prerequisites": references(incoming[uid]), "reason": "没有先修要求，先从这里打基础" if not incoming[uid] else f"{len(incoming[uid])} 个直接先修已全部掌握，可进入第 {levels[uid]+1} 层"})
    candidates.sort(key=lambda item: (item["depth"], -item["foundation_for"], -item["unlocks"], item["label"], item["uid"]))
    for index, item in enumerate(candidates):
        item["priority"] = index + 1
    stage_points = {}
    for uid, point in by_id.items():
        level = levels.get(uid)
        missing = incoming[uid] - known
        status = "mastered" if uid in known else "ready" if level is not None and not missing else "blocked"
        stage_points.setdefault(level, []).append({"uid": uid, "label": point["label"], "kind": point.get("kind", "概念"), "status": status, "missing": references(missing)})
    stages = []
    for level in sorted(stage_points, key=lambda value: value if value is not None else float("inf")):
        items = sorted(stage_points[level], key=lambda item: (item["label"], item["uid"]))
        stages.append({"level": level, "title": phase_title(level), "points": items, "total": len(items), "completed": sum(item["status"] == "mastered" for item in items), "available": sum(item["status"] == "ready" for item in items)})
    state = "completed" if not remaining else "blocked" if not candidates else "ready"
    return {"state": state, "steps": candidates, "stages": stages, "remaining": len(remaining), "has_cycle": len(levels) != len(by_id), "has_prerequisites": any(incoming.values()), "ordering": "先满足全部先修，再优先基础层；同层优先支持更多后续知识的点"}


def target_path(points, edges, mastered, target):
    by_id, known, incoming, outgoing, levels = structure(points, edges, mastered)
    if target in known:
        return {"steps": [], "already_mastered": True}
    needed = set()
    pending = [target]
    while pending:
        uid = pending.pop()
        if uid in needed or uid in known:
            continue
        if uid not in levels:
            raise ValueError("目标先修结构存在循环，请教师修正关系")
        needed.add(uid)
        pending.extend(incoming[uid])
    ordered = sorted(needed, key=lambda uid: (levels[uid], by_id[uid]["label"], uid))
    steps = []
    for index, uid in enumerate(ordered):
        missing = sorted(incoming[uid] - known, key=lambda value: (by_id[value]["label"], value))
        steps.append({"uid": uid, "label": by_id[uid]["label"], "reason": "目标知识点" if uid == target else "先修基础知识" if levels[uid] == 0 else "目标的先修知识", "priority": index+1, "depth": levels[uid], "phase": phase_title(levels[uid]), "ready": not missing, "is_target": uid == target, "missing": [{"uid": value, "label": by_id[value]["label"]} for value in missing]})
    return {"steps": steps, "already_mastered": False}
