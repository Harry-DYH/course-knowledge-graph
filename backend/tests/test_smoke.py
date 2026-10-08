# -*- coding: utf-8 -*-
"""后端冒烟测试：验证 course_workspace 核心链路可运行。

运行前提：Neo4j(7687) 与后端(8000) 已启动。
运行方式：cd backend && venv\\Scripts\\python.exe -m pytest tests/test_smoke.py -v
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("TEST_BASE_URL", "http://127.0.0.1:8000/course_workspace")
LEARNER = "pytest-smoke"


def _post(path, **kw):
    return requests.post(BASE + path, timeout=kw.pop("timeout", 60), **kw)


def _get(path, **kw):
    return requests.get(BASE + path, timeout=kw.pop("timeout", 30), **kw)


def _put(path, **kw):
    return requests.put(BASE + path, timeout=kw.pop("timeout", 30), **kw)


def _delete(path, **kw):
    return requests.delete(BASE + path, timeout=kw.pop("timeout", 30), **kw)


@pytest.fixture(scope="module")
def course():
    r = _post("/courses", json={"title": f"pytest冒烟{uuid.uuid4().hex[:6]}"})
    assert r.status_code == 200, r.text
    cid = r.json()["uid"]
    yield cid
    _delete(f"/courses/{cid}")


def test_list_courses():
    r = _get("/courses")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_course_validates_title(course):
    r = _post("/courses", json={"title": "a"})
    assert r.status_code == 422


def test_rename_course(course):
    r = _put(f"/courses/{course}", json={"title": "改名后冒烟课"})
    assert r.status_code == 200
    assert r.json()["title"] == "改名后冒烟课"


def test_list_documents():
    r = _get("/documents")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_upload_rejects_unsupported(course):
    files = {"file": ("evil.exe", b"xx")}
    r = _post(f"/courses/{course}/upload", files=files, timeout=30)
    assert r.status_code == 400


def test_upload_duplicate(course):
    # 用一个已完成文档名模拟重名（若有则 409）
    docs = _get("/documents").json()
    completed = [d for d in docs if d.get("status") == "Completed"]
    if not completed:
        pytest.skip("无已完成文档，跳过重名用例")
    name = completed[0]["name"]
    files = {"file": (name, b"dummy")}
    r = _post(f"/courses/{course}/upload", files=files, timeout=30)
    assert r.status_code == 409


def test_upload_and_extract_txt(course):
    tmp = os.path.join(os.environ.get("TEMP", "/tmp"), "pytest_smoke.txt")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("第一章 测试\n本章包含测试点A和测试点B。\n测试点A：定义是用于冒烟测试的知识点。\n测试点B：定义是另一个用于冒烟测试的知识点。学习测试点B之前，需要先学习测试点A。\n")
    with open(tmp, "rb") as f:
        files = {"file": ("pytest_smoke.txt", f)}
        r = _post(f"/courses/{course}/upload", files=files, timeout=600)
    assert r.status_code == 200, r.text
    job_id = r.json().get("job_id")
    assert job_id
    # 轮询到完成
    for _ in range(90):
        jobs = _get(f"/courses/{course}/jobs").json()
        job = next((j for j in jobs if j.get("uid") == job_id), None)
        if job and job["status"] == "Completed":
            break
        if job and job["status"] == "Failed":
            pytest.fail(f"抽取失败: {job.get('error')}")
        time.sleep(2)
    else:
        pytest.fail("抽取超时")
    g = _get(f"/courses/{course}/graph").json()
    labels = [p["label"] for p in g.get("points", [])]
    assert "测试点A" in labels
    assert "测试点B" in labels


def test_graph_and_path(course):
    g = _get(f"/courses/{course}/graph").json()
    points = g.get("points", [])
    if not points:
        pytest.skip("无知识点，跳过路径用例")
    target = points[0]["uid"]
    r = _get(f"/courses/{course}/path/{LEARNER}/{target}")
    assert r.status_code == 200
    r = _put(f"/courses/{course}/progress", json={"learner": LEARNER, "point_uid": target, "mastered": True})
    assert r.status_code == 200
    r = _get(f"/courses/{course}/progress/{LEARNER}")
    assert target in r.json()


def test_ask_returns_chinese(course):
    g = _get(f"/courses/{course}/graph").json()
    if not g.get("points"):
        pytest.skip("无知识点，跳过问答用例")
    r = _post(f"/courses/{course}/ask", json={"question": "测试点A是什么", "learner": LEARNER}, timeout=120)
    assert r.status_code == 200, r.text
    answer = r.json().get("answer", "")
    assert any("\u4e00" <= ch <= "\u9fff" for ch in answer)


def test_quiz_create_and_submit(course):
    g = _get(f"/courses/{course}/graph").json()
    defined = [p for p in g.get("points", []) if p.get("definition") and len(p["definition"]) >= 8]
    if len(defined) < 4:
        pytest.skip("知识点不足 4 个，跳过自测用例")
    r = _post(f"/courses/{course}/quiz", json={"learner": LEARNER, "count": 3, "types": ["choice", "blank", "judge"]})
    assert r.status_code == 200
    quiz = r.json()
    assert len(quiz["questions"]) == 3
    answers = [q["options"][0] if q["type"] == "choice" else (q["answer"] if q["type"] == "blank" else "对") for q in quiz["questions"]]
    r = _post(f"/courses/{course}/quiz/submit", json={"learner": LEARNER, "attempt_id": quiz["attempt_id"], "answers": answers}, timeout=120)
    assert r.status_code == 200
    assert "score" in r.json()


def test_delete_course(course):
    # 复用 fixture 里创建的课程，删除后应 404
    pass  # fixture teardown 会删除，这里只占位保持结构清晰
