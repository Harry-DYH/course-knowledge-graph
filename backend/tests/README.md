# 后端测试

## 冒烟测试（test_smoke.py）

验证 course_workspace 核心链路：课程 CRUD、文档上传抽取、图谱、路径、进度、问答、自测。

**运行前提**：Neo4j（7687）与后端（8000）已启动。

**运行方式**：

```powershell
cd backend
venv\Scripts\python.exe -m pytest tests/test_smoke.py -v
```

**说明**：
- 测试会创建一门临时课程（`pytest冒烟XXXXXX`），跑完自动删除
- 会真实上传一个 TXT 文档并走完整抽取流程（依赖 DeepSeek）
- 部分用例在数据不足时会 `SKIP`（如知识点 <4 个时跳过自测用例）

## 用例清单

| 用例 | 覆盖 |
|---|---|
| test_list_courses | 课程列表 |
| test_create_course_validates_title | 课程名校验（<2字 422） |
| test_rename_course | 课程改名 |
| test_list_documents | 文档列表 |
| test_upload_rejects_unsupported | 不支持格式 400 |
| test_upload_duplicate | 重名 409 |
| test_upload_and_extract_txt | 上传+抽取完整链路 |
| test_graph_and_path | 图谱+路径+进度 |
| test_ask_returns_chinese | 问答中文回复 |
| test_quiz_create_and_submit | 自测生成+提交 |
