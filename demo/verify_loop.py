"""Contract checks against the running local demo; creates and removes one test course."""
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import json
import subprocess
import time
import requests

BASE = "http://127.0.0.1:8000/course_workspace"
DOCUMENT = "软件架构基础_DOCX闭环样例.docx"
checks = []


def request(method, path, body=None, expected=200):
    response = requests.request(method, BASE + path, json=body, timeout=120)
    assert response.status_code == expected, (path, response.status_code, response.text[:300])
    return response.json()


def record(name, **details):
    checks.append({"check": name, "passed": True, **details})


def main():
    available = request("GET", "/documents")
    assert any(d["name"] == DOCUMENT and d["status"] == "Completed" for d in available), "先上传 demo 中的 DOCX 样例"
    course = request("POST", "/courses", {"title": "闭环自动验收"})
    cid = course["uid"]
    prefix = f"/courses/{cid}"
    try:
        graph = request("POST", prefix + "/import", {"document": DOCUMENT})
        count = (len(graph["points"]), len(graph["edges"]))
        assert count[0] >= 20 and count[1] > 0
        again = request("POST", prefix + "/import", {"document": DOCUMENT})
        assert count == (len(again["points"]), len(again["edges"]))
        record("DOCX 课程导入与重复导入去重", points=count[0], edges=count[1])

        invalid = deepcopy(graph)
        invalid["edges"].append(deepcopy(invalid["edges"][0]))
        request("PUT", prefix + "/graph", {"revision": graph["course"]["revision"], "points": invalid["points"], "edges": invalid["edges"]}, 400)
        edge = next(e for e in graph["edges"] if e["kind"] == "PREREQUISITE_OF")
        invalid = deepcopy(graph)
        invalid["edges"].append({"source": edge["target"], "target": edge["source"], "kind": "PREREQUISITE_OF"})
        request("PUT", prefix + "/graph", {"revision": graph["course"]["revision"], "points": invalid["points"], "edges": invalid["edges"]}, 400)
        record("重复关系及先修环拒绝保存")

        target = next(p for p in graph["points"] if p["label"] == "可维护性")
        manual = {"uid": cid + ":manual:acceptance", "label": "验收先修概念", "kind": "概念", "definition": "验收先修概念是教师补充的测试知识，用于验证修订后的学习导航与问答保持一致。", "example": "", "resource": "", "x": 50, "y": 50}
        target["definition"] = "可维护性表示系统便于修改，当前课程采用教师保存后的修订定义。"
        edited = {"revision": graph["course"]["revision"], "points": graph["points"] + [manual], "edges": [e for e in graph["edges"] if not (e["kind"] == "PREREQUISITE_OF" and e["target"] == target["uid"])] + [{"source": manual["uid"], "target": target["uid"], "kind": "PREREQUISITE_OF"}]}
        saved = request("PUT", prefix + "/graph", edited)
        request("PUT", prefix + "/graph", edited, 409)
        refreshed = request("GET", prefix + "/graph")
        assert any(p["uid"] == manual["uid"] and p["teacher_edited"] for p in refreshed["points"])
        assert next(p for p in refreshed["points"] if p["uid"] == target["uid"])["definition"] == target["definition"]
        record("教师修订刷新持久化与版本冲突")

        path = request("GET", prefix + f"/path/test-learner-a/{target['uid']}")
        assert [s["uid"] for s in path["steps"]] == [manual["uid"], target["uid"]]
        request("PUT", prefix + "/progress", {"learner": "test-learner-a", "point_uid": manual["uid"], "mastered": True})
        assert request("GET", prefix + "/progress/test-learner-a") == [manual["uid"]]
        assert request("GET", prefix + "/progress/test-learner-b") == []
        assert len(request("GET", prefix + f"/path/test-learner-a/{target['uid']}")["steps"]) == 1
        assert len(request("GET", prefix + f"/path/test-learner-b/{target['uid']}")["steps"]) == 2
        request("PUT", prefix + "/progress", {"learner": "test-learner-a", "point_uid": target["uid"], "mastered": True})
        done = request("GET", prefix + f"/path/test-learner-a/{target['uid']}")
        assert done["already_mastered"] and not done["steps"]
        record("教师关系用于路径、进度持久化、学习者隔离与已掌握目标")

        snippets = request("GET", prefix + f"/points/{target['uid']}/sources")
        assert snippets and all(s["document"] == DOCUMENT for s in snippets)
        answer = request("POST", prefix + "/ask", {"learner": "test-learner-a", "question": "学习可维护性之前需要先学什么？"})
        assert "验收先修概念" in answer["answer"]
        assert "本课程教师修订图谱" in answer["sources"]
        assert answer["snippets"] and all(s["document"] == DOCUMENT for s in answer["snippets"])
        assert all(s in {DOCUMENT, "本课程教师修订图谱"} for s in answer["sources"])
        record("教师关系优先问答、资料片段和课程出处隔离", seconds=answer["seconds"])
        unknown = request("POST", prefix + "/ask", {"learner":"test-unknown","question":"Dijkstra 算法的时间复杂度是多少？"})
        assert any(word in unknown["answer"] for word in ["没有","未提供","未包含","无法","不知道","未涉及","不包含"])
        record("未提供的知识问题明确拒答", seconds=unknown["seconds"])

        quiz = request("POST", prefix + "/quiz", {"learner": "test-learner-a"})
        by_definition = {p["definition"][:1500]: p["label"] for p in refreshed["points"]}
        answers = [by_definition[q["definition"]] for q in quiz["questions"]]
        payload = {"learner": "test-learner-a", "attempt_id": quiz["attempt_id"], "answers": answers}
        result = request("POST", prefix + "/quiz/submit", payload)
        assert result["score"] == 100 and result["correct"] == result["total"]
        assert request("POST", prefix + "/quiz/submit", payload) == result
        request("POST", prefix + "/quiz/submit", {**payload, "learner": "test-learner-b"}, 404)
        assert len(request("GET", prefix + "/quiz/history/test-learner-a")) == 1
        assert request("GET", prefix + "/quiz/history/test-learner-b") == []
        record("自测正确评分、重复提交一致与学习者记录隔离", questions=result["total"])

        removed = next(p for p in refreshed["points"] if p["label"] == "高内聚")
        deleted = {"revision":refreshed["course"]["revision"],"points":[p for p in refreshed["points"] if p["uid"]!=removed["uid"]],"edges":[e for e in refreshed["edges"] if e["source"]!=removed["uid"] and e["target"]!=removed["uid"]]}
        request("PUT",prefix+"/graph",deleted)
        expanded=request("POST",prefix+"/import",{"document":"软件架构基础_闭环样例.txt"})
        assert all(p["uid"]!=removed["uid"] for p in expanded["points"])
        assert next(p for p in expanded["points"] if p["uid"]==target["uid"])["definition"]==target["definition"]
        assert [s["uid"] for s in request("GET",prefix+f"/path/test-learner-b/{target['uid']}")["steps"]]==[manual["uid"],target["uid"]]
        record("后续资料导入保留教师删除、定义和关系修订")
        renamed=request("PUT",prefix,{"title":"闭环自动验收已改名"})
        assert renamed["title"]=="闭环自动验收已改名" and renamed["uid"]==cid
        record("课程改名保留课程身份与资料")

        # Simulate interruption after original extraction completed, before course import finished.
        job_id = "acceptance-interrupted-job"
        code = "from src.course_workspace import _query; _query(\"CREATE (j:CourseProcessJob {uid:$uid,course_id:$cid,document:$name,status:'Failed',started_ms:timestamp(),attempts:1})\",uid=" + repr(job_id) + ",cid=" + repr(cid) + ",name=" + repr(DOCUMENT) + ")"
        subprocess.run((["python", "-c", code] if Path("/code").exists() else ["docker", "exec", "backend", "python", "-c", code]), check=True, capture_output=True)
        retry = request("POST", prefix + "/retry", {"job_id": job_id})["graph"]
        assert (len(retry["points"]), len(retry["edges"])) == (len(expanded["points"]), len(expanded["edges"]))
        assert next(p for p in retry["points"] if p["uid"] == target["uid"])["definition"] == target["definition"]
        request("POST", prefix + "/retry", {"job_id": job_id}, 409)
        jobs = request("GET", prefix + "/jobs")
        assert jobs[0]["status"] == "Completed" and jobs[0]["attempts"] == 2
        record("模拟中断恢复、重试去重且保留教师修订")
    finally:
        request("DELETE", prefix)
    report = {"time": datetime.now(timezone.utc).isoformat(), "scope": "自编 DOCX 样例的接口闭环；不代表真实课程准确率", "checks": checks}
    target_path = Path(__file__).parent / "闭环实测结果.json"
    target_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"passed": len(checks), "report": str(target_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
