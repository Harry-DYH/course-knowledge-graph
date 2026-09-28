# 协作开发指南

本项目基于 neo4j-labs/llm-graph-builder 开发，保留原项目许可证和提交历史。

## 核心目录

- `backend/`：FastAPI、资料解析、课程图谱、问答和学习路径接口。
- `ui-reference/`：当前课程产品界面（教师端、学生端），主要协作开发入口。
- `frontend/`：原项目图谱构建与调试界面。
- `desktop/`：Electron 桌面程序、启动与打包脚本。
- `demo/`：演示资料与现有验收脚本。
- `docs/`：设计与实现说明。

## 首次启动

安装 Git、Node.js/npm 和 Docker Desktop。复制 `backend/example.env` 为 `backend/.env`、`frontend/example.env` 为 `frontend/.env`，按实际环境填写数据库与模型配置。数据库连接参数应与 `compose.local.yml` 一致；其中的数据库密码仅为本机演示默认值。

Windows 在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

课程界面：http://127.0.0.1:3015/ 。原项目调试界面：http://127.0.0.1:8080/ 。详细使用步骤见 `本地启动说明.md`。

## macOS / Linux 或自定义后端端口

后端已启动时，可单独启动课程界面。在项目根目录执行：

```sh
git pull --ff-only origin main
cd ui-reference
npm ci
cp .env.example .env.local
```

如果后端运行在 `18000`，将 `ui-reference/.env.local` 中的配置改为 `VITE_BACKEND_API_URL=http://127.0.0.1:18000`。该地址不要带 `/docs` 或 `/course_workspace`。然后执行：

```sh
npm run typecheck
npm run build
npm run dev
```

打开 http://127.0.0.1:3015/。修改环境配置后需要重启前端；新数据库中课程列表为空是正常情况，可在教师端创建课程、上传资料。模型密钥只保存在后端环境配置中。

## 分工与提交

1. 从最新 `main` 创建功能分支，例如 `feature/course-editor` 或 `fix/learning-path`。
2. 每次提交围绕一个明确任务，注明变更和验证方式。
3. 推送功能分支并创建 Pull Request，由另一位成员审阅后合并。
4. 开始新任务前更新 `main`，避免多人同时修改同一大文件。

课程界面已有检查：在 `ui-reference/` 中执行 `npm ci`、`npm run typecheck`、`npm run build`。桌面程序已有检查：在 `desktop/` 中执行 `npm ci`、`npm test`。涉及后端的修改按功能运行 `demo/` 中对应验收脚本；部分脚本需要运行中的数据库和后端。

本次上传为现有源码快照，不代表所有功能已通过完整验收。真实登录鉴权尚未完成，教师/学生入口目前为演示视图。

## 配置与产物

不提交真实 `.env`、API Key、凭据、运行日志、`node_modules`、数据库卷或桌面安装包。团队成员各自配置本地环境，依赖通过锁文件安装。仓库管理员在 GitHub 的 Settings → Collaborators 中邀请成员。
