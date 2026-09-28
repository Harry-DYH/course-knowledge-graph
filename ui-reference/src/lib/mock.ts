// 静态演示数据层：所有页面共享，不含真实后端逻辑

/** 商品化品牌：全站唯一来源，替换旧称「金扬 · 知图」 */
export const BRAND = {
  name: "知源",
  en: "KnowTrace",
  slogan: "让每个知识点都有出处",
  desc: "课程知识图谱构建与学习导航",
  assistant: "知源助教",
};

export type RelationType = "prereq" | "contain" | "related";
export type Mastery = "mastered" | "learning" | "locked";
export type NodeKind = "概念" | "公式" | "定理" | "方法" | "应用" | "章节";

export interface KNode {
  id: string;
  label: string;
  kind: NodeKind;
  /** 画布坐标，0~100 百分比 */
  x: number;
  y: number;
  mastery: Mastery;
  chapter: string;
  definition: string;
  examples: string[];
  resources: { name: string; type: "课件" | "视频" | "习题" | "文献" }[];
  confidence: number; // AI 抽取置信度 0~1
}

export interface KEdge {
  from: string;
  to: string;
  type: RelationType;
}

export const RELATION_META: Record<RelationType, { label: string; color: string; desc: string }> = {
  prereq: { label: "前置知识", color: "var(--relation-prereq)", desc: "必须先掌握前者才能学习后者" },
  contain: { label: "包含关系", color: "var(--relation-contain)", desc: "前者是后者的组成部分" },
  related: { label: "相关概念", color: "var(--relation-related)", desc: "两者语义关联，可对照学习" },
};

export const MASTERY_META: Record<Mastery, { label: string; color: string }> = {
  mastered: { label: "已掌握", color: "var(--mastery-mastered)" },
  learning: { label: "学习中", color: "var(--mastery-learning)" },
  locked: { label: "未开始", color: "var(--mastery-locked)" },
};

export interface Course {
  id: string;
  name: string;
  code: string;
  teacher: string;
  chapters: number;
  nodes: number;
  edges: number;
  updatedAt: string;
  status: "已发布" | "构建中" | "草稿";
  accent: string;
  /** 当前聚焦章节，供侧边栏课程切换器展示 */
  currentChapter: string;
}

export const COURSES: Course[] = [
  { id: "iot", name: "智能物联系统开发", code: "CS-3120", teacher: "王立群", chapters: 8, nodes: 46, edges: 71, updatedAt: "2026-09-24", status: "已发布", accent: "oklch(0.55 0.13 250)", currentChapter: "第 3 章 · 感知层与数据采集" },
  { id: "dt", name: "数字孪生技术基础", code: "CS-4021", teacher: "陈嘉禾", chapters: 6, nodes: 32, edges: 48, updatedAt: "2026-09-21", status: "构建中", accent: "oklch(0.6 0.11 165)", currentChapter: "第 2 章 · 建模与映射" },
];

const P = (id: string, label: string, kind: NodeKind, x: number, y: number, mastery: Mastery, chapter: string, definition: string, examples: string[], resources: KNode["resources"], confidence: number): KNode => ({ id, label, kind, x, y, mastery, chapter, definition, examples, resources, confidence });

export const NODES: KNode[] = [
  P("n0", "第3章 感知层与数据采集", "章节", 50, 8, "learning", "第3章", "本章围绕物联网感知层展开，覆盖传感器选型、信号采集、边缘预处理三条主线，是后续网络传输与数据处理的知识起点。", ["本章学习目标清单", "实验：温湿度采集节点搭建"], [{ name: "3.1 感知层概述.pptx", type: "课件" }, { name: "本章导学视频", type: "视频" }], 0.98),
  P("n1", "传感器原理", "概念", 22, 26, "mastered", "3.1", "将物理量（温度、光照、压力等）转换为可测量电信号的器件工作机制。核心指标包括量程、精度、响应时间与线性度。", ["DHT11 温湿度传感器输出数字信号", "光敏电阻阻值随照度变化"], [{ name: "常见传感器参数对照表", type: "文献" }, { name: "课后自测 12 题", type: "习题" }], 0.94),
  P("n2", "模拟/数字信号", "概念", 46, 27, "mastered", "3.1", "模拟信号在时间轴上连续取值，数字信号经采样与量化后离散化。二者的转换边界决定了采集链路的精度上限。", ["正弦波 vs PWM 方波", "ADC 采样后的阶梯波形"], [{ name: "3.2 信号类型课件", type: "课件" }], 0.91),
  P("n3", "采样定理（奈奎斯特）", "定理", 74, 25, "learning", "3.2", "为无失真还原原始信号，采样频率必须不低于信号最高频率的两倍；否则产生频谱混叠。", ["音频 44.1kHz 采样的由来", "示波器混叠现象演示"], [{ name: "混叠动画演示", type: "视频" }, { name: "证明过程笔记", type: "文献" }], 0.88),
  P("n4", "A/D 转换公式", "公式", 84, 44, "locked", "3.2", "量化码值 D = round(Vin / Vref × (2ⁿ − 1))，其中 n 为位数。分辨率 ΔV = Vref /(2ⁿ − 1)。", ["12位 ADC、3.3V 基准 → ΔV ≈ 0.806mV"], [{ name: "计算练习 8 题", type: "习题" }], 0.82),
  P("n5", "I2C/SPI 总线协议", "概念", 60, 45, "locked", "3.3", "两线/四线同步串行通信标准，用于连接传感器与主控。I2C 靠地址寻址、SPI 靠片选线，速率与引脚开销互为取舍。", ["OLED 屏使用 I2C 地址 0x3C", "SD 卡使用 SPI 模式"], [{ name: "总线时序图合集", type: "文献" }, { name: "驱动调试实操", type: "视频" }], 0.9),
  P("n6", "数据校准方法", "方法", 30, 47, "learning", "3.3", "通过两点标定或多点最小二乘拟合，把传感器原始读数映射到真值空间，消除零点漂移与增益误差。", ["pH 计两点标定流程"], [{ name: "校准代码模板", type: "课件" }], 0.76),
  P("n7", "噪声与滤波", "概念", 44, 63, "locked", "3.4", "采集链路中的随机扰动来源（电磁干扰、电源纹波、量化噪声），以及对应的抑制手段。", ["面包板长导线引入 50Hz 工频干扰"], [{ name: "3.4 噪声专题讲义", type: "课件" }], 0.85),
  P("n8", "滑动平均算法", "方法", 24, 78, "locked", "3.4", "取最近 N 个样本的算术均值作为当前输出，实现简单、延迟低，适合缓变量去噪。", ["N=8 的温漂曲线平滑"], [{ name: "算法对比实验数据", type: "文献" }, { name: "编程作业", type: "习题" }], 0.79),
  P("n9", "中值滤波", "方法", 46, 84, "locked", "3.4", "对窗口内样本排序取中位数，能有效剔除脉冲型离群值而不模糊边沿。", ["去除突发跳变的电流尖峰"], [{ name: "MATLAB 仿真脚本", type: "课件" }], 0.74),
  P("n10", "卡尔曼滤波", "方法", 70, 76, "locked", "3.5", "基于状态预测与量测更新两步迭代的最优估计方法，在噪声统计特性已知时兼顾平滑与响应速度。", ["无人机姿态角融合估计"], [{ name: "推导逐页讲解", type: "视频" }], 0.68),
  P("n11", "边缘数据预处理", "应用", 84, 62, "locked", "3.5", "在靠近数据源的侧端设备完成清洗、聚合与压缩后再上行，降低带宽占用与云端时延。", ["网关侧 1 分钟均值上报"], [{ name: "课程项目任务书", type: "文献" }], 0.71),
];

export const EDGES: KEdge[] = [
  { from: "n0", to: "n1", type: "contain" },
  { from: "n0", to: "n2", type: "contain" },
  { from: "n0", to: "n3", type: "contain" },
  { from: "n0", to: "n5", type: "contain" },
  { from: "n1", to: "n2", type: "related" },
  { from: "n2", to: "n3", type: "prereq" },
  { from: "n3", to: "n4", type: "prereq" },
  { from: "n1", to: "n6", type: "prereq" },
  { from: "n2", to: "n5", type: "prereq" },
  { from: "n5", to: "n7", type: "related" },
  { from: "n6", to: "n7", type: "prereq" },
  { from: "n7", to: "n8", type: "prereq" },
  { from: "n7", to: "n9", type: "prereq" },
  { from: "n8", to: "n9", type: "related" },
  { from: "n9", to: "n10", type: "prereq" },
  { from: "n8", to: "n10", type: "prereq" },
  { from: "n10", to: "n11", type: "prereq" },
  { from: "n4", to: "n11", type: "related" },
];

export const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

/** 学习路径推荐结果：按前置依赖拓扑排序 */
export interface PathStep {
  node: KNode;
  reason: string;
  priority: 1 | 2 | 3;
  estMinutes: number;
}

export const RECOMMENDED_PATH: PathStep[] = [
  { node: nodeById("n4"), reason: "采样定理的直接延伸，且是当前唯一缺失的计算类知识点", priority: 1, estMinutes: 25 },
  { node: nodeById("n5"), reason: "已完成信号基础，可进入硬件接线环节", priority: 1, estMinutes: 40 },
  { node: nodeById("n7"), reason: "总线调试必然遇到噪声问题，建议紧随其后", priority: 2, estMinutes: 30 },
  { node: nodeById("n8"), reason: "最易上手的去噪手段，先建立信心", priority: 2, estMinutes: 35 },
  { node: nodeById("n9"), reason: "与滑动平均对照学习，理解各自适用场景", priority: 3, estMinutes: 30 },
  { node: nodeById("n10"), reason: "需要前面全部铺垫，建议放在本章末尾攻坚", priority: 3, estMinutes: 55 },
];

export const UPLOAD_TASKS = [
  { name: "第3章_感知层与数据采集.pdf", size: "4.2 MB", pages: 38, status: "已完成" as const, progress: 100, nodes: 12, time: "42s" },
  { name: "实验指导书_IoT采集节点.docx", size: "1.1 MB", pages: 16, status: "已完成" as const, progress: 100, nodes: 9, time: "27s" },
  { name: "3.4_噪声与滤波_课件.pptx", size: "8.7 MB", pages: 44, status: "解析中" as const, progress: 63, nodes: 0, time: "—" },
  { name: "课后习题集第三章.txt", size: "26 KB", pages: 6, status: "排队中" as const, progress: 0, nodes: 0, time: "—" },
];

export const PIPELINE_STAGES = [
  { key: "parse", name: "文档解析", desc: "PDF / DOCX 文本与版式还原", detail: "pdfplumber 提取正文 38 页，剔除页眉页脚 112 行", done: true },
  { key: "split", name: "文本预处理", desc: "章节分割、段落清洗", detail: "切分为 5 个语义块，合并跨页断句 23 处", done: true },
  { key: "entity", name: "实体抽取", desc: "大模型识别知识点实体", detail: "抽取 12 个候选实体，去重后保留 12 个", done: true },
  { key: "relation", name: "关系构建", desc: "识别前置/包含/相关关系", detail: "已识别 18 条关系，正在校验方向性", done: false },
  { key: "fuse", name: "融合消歧", desc: "同名异义与近义合并", detail: "等待上游完成", done: false },
  { key: "write", name: "图谱写入", desc: "写入 Neo4j 并生成可视化", detail: "等待上游完成", done: false },
];

export const EXTRACT_LOGS = [
  { t: "10:24:03", level: "info", msg: "载入文档 第3章_感知层与数据采集.pdf（38 页 / 4.2MB）" },
  { t: "10:24:07", level: "info", msg: "版面分析完成：正文 12,480 字，图表 14 处" },
  { t: "10:24:15", level: "info", msg: "章节分割：3.1 感知层 / 3.2 信号与采样 / 3.3 总线 / 3.4 噪声 / 3.5 边缘处理" },
  { t: "10:24:22", level: "warn", msg: "第 17 页存在扫描体公式图片，已转 OCR 复核" },
  { t: "10:24:31", level: "info", msg: "调用 qwen-max 抽取实体，批次 1/5 → 命中 4 个" },
  { t: "10:24:44", level: "info", msg: "实体归一化：'奈奎斯特定理' 与 '采样定理' 合并为同一节点" },
  { t: "10:24:52", level: "warn", msg: "'滤波' 出现 3 种语义，暂标记为待人工确认" },
  { t: "10:25:06", level: "info", msg: "关系抽取：前置 9 条 / 包含 4 条 / 相关 5 条" },
  { t: "10:25:14", level: "info", msg: "写入 Neo4j：CREATE 12 nodes, MERGE 18 relationships" },
];

export interface ChatMsg {
  role: "user" | "ai";
  content: string;
  citations?: { nodeId: string; label: string; chapter: string }[];
  tokens?: number;
  latency?: string;
}

export const CHAT_SEED: ChatMsg[] = [
  {
    role: "user",
    content: "采样定理里的“两倍”到底指什么？为什么实际工程里往往要取 5～10 倍？",
  },
  {
    role: "ai",
    content:
      "这里的“两倍”指的是**信号最高频率分量 fmax 的两倍**，即奈奎斯特频率 fs ≥ 2·fmax。它是从理想冲激采样推导出的理论下限：低于该值时，频谱周期延拓会发生重叠，产生不可逆的混叠。\n\n工程上取 5～10 倍主要有三个原因：\n1. 抗混叠滤波器不是砖墙式的，过渡带需要额外采样余量；\n2. 真实信号含有带外噪声，需保证有效频段被充分覆盖；\n3. 便于用整数倍时钟分频实现，降低抖动。\n\n以本课程的 DHT11 为例，其温度变化属于缓变量（≤0.5Hz），按理论 1Hz 采样即可，但实验指导书要求 5Hz，正是出于第 1、2 点的考虑。",
    citations: [
      { nodeId: "n3", label: "采样定理（奈奎斯特）", chapter: "3.2" },
      { nodeId: "n7", label: "噪声与滤波", chapter: "3.4" },
    ],
    tokens: 412,
    latency: "3.4s",
  },
  {
    role: "user",
    content: "那滑动平均和中值滤波我该先用哪个？",
  },
  {
    role: "ai",
    content:
      "判断依据是**噪声的类型**：\n\n• 如果是连续的高斯白噪声（曲线毛刺密集但幅度小）→ 用滑动平均，计算量 O(N)、实现最简单；\n• 如果是偶发的脉冲跳变（个别点突然飞起）→ 用中值滤波，因为均值会被离群值拉偏，而中位数天然稳健。\n\n在本章实验里，面包板长导线引入的是工频干扰叠加偶发尖峰，所以推荐做法是中值滤波先行、再接长度为 8 的滑动平均，这也是后续卡尔曼滤波的简化前身。",
    citations: [
      { nodeId: "n8", label: "滑动平均算法", chapter: "3.4" },
      { nodeId: "n9", label: "中值滤波", chapter: "3.4" },
    ],
    tokens: 298,
    latency: "2.8s",
  },
];

export const SUGGESTED_QUESTIONS = [
  "I2C 和 SPI 分别什么时候用？",
  "卡尔曼滤波的两个步骤怎么理解？",
  "帮我出 3 道 A/D 转换计算题",
  "这一章哪些知识点是考试重点？",
];

export const QUIZ = [
  {
    q: "某信号最高频率 2kHz，若采用 3kHz 采样，会出现什么现象？",
    options: ["分辨率下降", "频谱混叠", "量化溢出", "无影响"],
    a: 1,
    explain: "奈奎斯特要求 fs ≥ 2·fmax = 4kHz，3kHz 低于该下限，频谱周期延拓相互重叠，产生不可逆的混叠。",
  },
  {
    q: "12 位 ADC、基准电压 3.3V，其分辨率约为？",
    options: ["0.806 mV", "1.65 mV", "3.3 mV", "0.406 mV"],
    a: 0,
    explain: "ΔV = Vref /(2ⁿ − 1) = 3.3 / 4095 ≈ 0.806mV。分母是 2ⁿ−1 而非 2ⁿ，这是常见失分点。",
  },
  {
    q: "对脉冲型离群噪声最有效的简单方法是？",
    options: ["滑动平均", "中值滤波", "放大增益", "提高采样率"],
    a: 1,
    explain: "均值会被离群值拉偏，中位数排序后取值天然稳健；滑动平均适合连续高斯白噪声，不适合脉冲干扰。",
  },
];
