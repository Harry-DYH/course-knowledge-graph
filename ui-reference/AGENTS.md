# AGENTS.md — 项目技术上下文

## Dependencies

除脚手架默认依赖外，未引入任何第三方库。图谱可视化刻意用**原生 SVG + React state** 手写实现（缩放 / 平移 / 高亮 / 节点拖动 / 连线箭头），未引入 ECharts Graph、AntV G6、D3.js —— 避免体积与 CSP 兼容问题，也便于完全掌控视觉细节。动效统一使用 CSS keyframes（见 `src/styles.css`），未使用 framer-motion。

## Architecture

- **已接真实业务接口**：页面通过 `src/lib/course-api.ts` 连接 FastAPI `/course_workspace`，课程、图谱、处理任务、学习进度和自测成绩保存到 Neo4j。`ConnectedWorkspace` 服务七个主要页面及自测入口；`ProcessingTasks` 和 `CourseQuiz` 分别管理处理任务与自测。`mock.ts` 只保留图谱组件类型和视觉元数据，不作为已接入页面的业务数据。
- **品牌名集中管理**：商品化名称「知源 / KnowTrace」只写在 `BRAND` 常量里，`AppShell`、`learn.ask`、`index.html` 均引用它，改品牌只需改一处。
- **双角色单壳**：`AppShell` 依据 pathname 前缀判定教师端 / 学生端并切换侧边栏；导出 `TOPBAR_H` 与 `fullHeight()` 供各页算满高，避免双滚动条。
- **GraphCanvas 受控可编辑**：同一组件服务三处（学生浏览传 `onSelect`、路径高亮传 `highlightPath`、教师编辑传 `editable` + `connectMode` / `onRequestRelation` / `onCanvasBlank` / `onNodeMove`）。差异全部通过 props 开关表达，不复制组件。
- **编辑器状态归属工作台**：所有图变更统一走 `commit()` 维护撤销/重做；保存使用图谱 revision 处理冲突，并提供未保存提醒。节点拖动结束时只提交一次编辑，教师布局以图谱坐标为准。
- **本地演示身份**：localStorage 保存学习者标识、当前课程、学生个人布局和引导已读；掌握状态、路径依据和自测成绩由后端按课程、学习者隔离。尚无正式登录鉴权。
- **路由**：TanStack Router 文件路由。每个 route 文件必须导出 `Route = createFileRoute(...)`，否则被静默排除出路由树。

## What Didn't Work

- ❌ 首版 route 文件只导出了具名组件函数、漏了 `createFileRoute` → Vite 构建**成功但页面 404**，仅在构建日志以 Warning 提示。教训：`pnpm run build` exit code 为 0 不代表路由生效，必须检查输出里的 "does not export a Route" 警告。
- ❌ 面包屑与侧边栏高亮最初用 `pathname.startsWith(item.to)` → `/teacher/editor` 被 `/teacher` 抢先命中。改为「最长前缀优先」匹配修复。
- ❌ 节点选中光晕的 `@keyframes` 里写了 `transform: scale()` → SVG 子元素的 CSS transform **优先级高于** `<g transform="translate(...)">` 表现属性，光晕整体脱离节点、在画布留下游离灰斑。改为仅动画 `opacity`。
- ❌ 图谱非邻居节点淡化值取 `opacity 0.2`（边线 0.14）→ 选中一个节点后其余知识点文字几乎不可读，截图验收时发现。收窄到节点 0.45 / 边线 0.3，保留焦点层次同时不失上下文可读性。

## Lessons

- 沙箱预览的 HMR 默认关闭，改完代码必须重跑 `pnpm run dev` 才会生效，否则截图看到的仍是旧版本。
- `meoo-cli read-browser-screenshot` 首次访问新路由时，预览 iframe 通道可能因冷编译超时而取不到图（`route_matched: false`）；改用 `--source browser` 走沙箱浏览器可稳定拿到首屏加载期结果。
- 「去 AI 味」在本项目的具体落点：圆角收到 6px、正文 14px、删掉渐变 hero / 模糊光斑 / 彩色投影 / uppercase 英文小标题，统计信息改成密排表格条；不要只靠换字体达成。
- 本项目为纯浅色主题，`styles.css` 只保留 `:root` 一套色值即可，无需 `.dark` 分支。
- 高端化（Linear/Vercel 质感）的落点：`--radius: 0.5rem`（8px）+ 分层阴影 token（`--shadow-xs/sm/md/lg`，低透明度双阴影）+ `--ease-soft: cubic-bezier(0.16, 1, 0.3, 1)` 统一过渡曲线；卡片统一 `rounded-xl border border-border/80 bg-card shadow-xs`，按钮 `rounded-lg` + `duration-200`；页头 18px/tracking-tight + `border-border/70` 发丝分隔。改 token 即全站生效，页面只做轻量 class 替换。
- GraphCanvas 精致化手段：`feDropShadow` 双滤镜（常态/选中）、标签 `paint-order: stroke` 白色光晕保证压线可读、悬停柔光环只动 opacity、模态遮罩统一 `bg-black/30 backdrop-blur-[2px]`。
