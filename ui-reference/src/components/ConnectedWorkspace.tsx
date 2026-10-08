import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Network, Upload, ListTree, GitBranch, BookOpen, MessagesSquare, Route as RouteIcon, Plus, Save, Trash2, Undo2, Redo2, Download } from "lucide-react";
import { GraphCanvas } from "@/components/GraphCanvas";
import { ProcessingTasks } from "@/components/ProcessingTasks";
import { KnowledgeBrowser } from "@/components/KnowledgeBrowser";
import { LearningRoute } from "@/components/LearningRoute";
import { NextLearning } from "@/components/NextLearning";
import { CourseQuiz } from "@/components/CourseQuiz";
import { isSeedGrid, relationLayout } from "@/lib/graph-layout";
import type { KNode, KEdge, Mastery } from "@/lib/mock";
import { api, type Course, type CourseGraph, type DocumentRow, type Edge, type Point, type PathStep, type SourceSnippet } from "@/lib/course-api";

type Page = "map" | "upload" | "pipeline" | "editor" | "courses" | "path" | "ask" | "quiz";
const links: {page: Page; href: string; label: string; icon: typeof Network}[] = [
  {page:"map",href:"/",label:"知识地图",icon:Network},
  {page:"path",href:"/learn/path",label:"学习路径",icon:RouteIcon},
  {page:"ask",href:"/learn/ask",label:"向助教提问",icon:MessagesSquare},
  {page:"quiz",href:"/learn/quiz",label:"知识自测",icon:BookOpen},
  {page:"upload",href:"/teacher",label:"资料上传与解析",icon:Upload},
  {page:"pipeline",href:"/teacher/pipeline",label:"图谱生成进度",icon:GitBranch},
  {page:"editor",href:"/teacher/editor",label:"图谱编辑修正",icon:ListTree},
  {page:"courses",href:"/teacher/courses",label:"多课程管理",icon:BookOpen},
];
const relationNames: Record<Edge["kind"],string> = {PREREQUISITE_OF:"前置知识",CONTAINS:"包含关系",RELATED_TO:"相关概念"};
const learnerKey = "knowtrace:learner:v2";
function getLearner() { let id = localStorage.getItem(learnerKey); if (!id) { id = crypto.randomUUID(); localStorage.setItem(learnerKey,id); } return id; }
function mapNodes(points: Point[], mastered: string[]): KNode[] {
  const known = new Set(mastered);
  return points.map((p) => ({id:p.uid,label:p.label,kind:(["概念","公式","定理","方法","应用","章节"].includes(p.kind) ? p.kind : "概念") as KNode["kind"],x:p.x ?? 50,y:p.y ?? 50,mastery:(known.has(p.uid)?"mastered":"locked") as Mastery,chapter:p.chapter||"未分章",definition:p.definition || "暂无定义",examples:p.example?[p.example]:[],resources:p.resource?[{name:p.resource,type:"文献" as const}]:[],confidence:1}));
}
function mapEdges(edges: Edge[]): KEdge[] { return edges.map((e) => ({from:e.source,to:e.target,type:e.kind==="PREREQUISITE_OF"?"prereq":e.kind==="CONTAINS"?"contain":"related"})); }
function graphFingerprint(value:CourseGraph) { return JSON.stringify({points:value.points,edges:value.edges}); }

export function ConnectedWorkspace({ page }: {page:Page}) {
  const navigate = useNavigate();
  const [courses,setCourses] = useState<Course[]>([]);
  const [courseId,setCourseId] = useState(localStorage.getItem("knowtrace:course:v2") || "");
  const [graph,setGraph] = useState<CourseGraph | null>(null);
  const [documents,setDocuments] = useState<DocumentRow[]>([]);
  const [mastered,setMastered] = useState<string[]>([]);
  const [selected,setSelected] = useState<string | null>(null);
  const [focusId,setFocusId] = useState<string | null>(null);
  const [pointSnippets,setPointSnippets] = useState<SourceSnippet[]>([]);
  const [target,setTarget] = useState("");
  const [steps,setSteps] = useState<PathStep[]>([]);
  const [recommended,setRecommended] = useState<string[]>([]);
  const [question,setQuestion] = useState("");
  const [chatHistory,setChatHistory] = useState<{q:string,a:{answer:string,sources:string[],snippets:{document:string,page:number|null,text:string}[],relevant_points?:{uid:string,label:string}[],seconds:number}}[]>([]);
  const [pathCalculated,setPathCalculated] = useState(false);
  const [title,setTitle] = useState("");
  const [importName,setImportName] = useState("");
  const [loading,setLoading] = useState(false);
  const [initializing,setInitializing] = useState(true);
  const [loadingGraph,setLoadingGraph] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [dirty,setDirty] = useState(false);
  const [undo,setUndo] = useState<CourseGraph[]>([]);
  const [redo,setRedo] = useState<CourseGraph[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName,setFileName] = useState("");
  const baselineRef = useRef("");
  const pathRef=useRef<HTMLDivElement>(null);
  const detailRef=useRef<HTMLElement>(null);
  const learner = useMemo(getLearner,[]);

  async function reloadCourses(selectId?: string) {
    const list = await api.courses(); setCourses(list);
    setCourseId((current)=>selectId|| (list.some((c)=>c.uid===current) ? current : (list[0]?.uid||"")));
  }
  useEffect(() => { Promise.all([reloadCourses(),api.documents().then(setDocuments)]).catch((e)=>setError(e.message)).finally(()=>setInitializing(false)); }, []);
  useEffect(() => {
    if (!courseId) { setGraph(null); return; }
    let active=true;
    localStorage.setItem("knowtrace:course:v2",courseId);
    setGraph(null);setLoadingGraph(true);setSelected(null); setChatHistory([]); setSteps([]);setTarget(""); setPathCalculated(false); setDirty(false);setUndo([]);setRedo([]);
    Promise.all([api.graph(courseId),api.progress(courseId,learner)]).then(([g,m])=>{if(active){baselineRef.current=graphFingerprint(g);setGraph(g);setMastered(m);}}).catch((e)=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoadingGraph(false);});
    return ()=>{active=false;};
  },[courseId,learner]);
  const course = courses.find((c)=>c.uid===courseId);
  const nodes=useMemo(()=>mapNodes(graph?.points||[],mastered),[graph,mastered]);
  const edges=useMemo(()=>mapEdges(graph?.edges||[]),[graph]);
  const activePoint=graph?.points.find((p)=>p.uid===selected);
  useEffect(()=>{
    if(page==="map"&&graph){const fid=localStorage.getItem("knowtrace:focus:v2");if(fid&&graph.points.some(p=>p.uid===fid)){setSelected(fid);setFocusId(fid);localStorage.removeItem("knowtrace:focus:v2");}}
  },[page,graph]);
  useEffect(()=>{
    if(page==="map"&&selected&&activePoint){requestAnimationFrame(()=>detailRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));}
  },[selected,page]);
  useEffect(()=>{
    setPointSnippets([]);if(!courseId||!selected||selected.includes(":manual:"))return;
    let active=true;api.pointSources(courseId,selected).then((items)=>{if(active)setPointSnippets(items);}).catch(()=>{});
    return ()=>{active=false;};
  },[courseId,selected]);
  useEffect(()=>{
    if (!dirty) return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return ()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  function commit(next:CourseGraph) { if (!graph) return; setUndo((items)=>[...items.slice(-49),graph]);setRedo([]);setGraph(next);setDirty(graphFingerprint(next)!==baselineRef.current); }
  function undoEdit() { if(!graph||undo.length===0)return;const next=undo[undo.length-1];setRedo((items)=>[...items,graph]);setGraph(next);setUndo((items)=>items.slice(0,-1));setDirty(graphFingerprint(next)!==baselineRef.current); }
  function redoEdit() { if(!graph||redo.length===0)return;const next=redo[redo.length-1];setUndo((items)=>[...items,graph]);setGraph(next);setRedo((items)=>items.slice(0,-1));setDirty(graphFingerprint(next)!==baselineRef.current); }
  function exportGraph() {
    if(!graph)return;
    const blob=new Blob([JSON.stringify({course:course?.title,documents:course?.documents,revision:graph.course.revision,chapters:graph.chapters,points:graph.points,edges:graph.edges},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${course?.title||"课程"}-知识图谱.json`;a.click();URL.revokeObjectURL(url);
  }

  async function run<T>(job:()=>Promise<T>, done:(value:T)=>void, message:string) {
    setLoading(true); setError(""); setNotice("");
    try { const result=await job(); done(result); setNotice(message); }
    catch(e){ setError(e instanceof Error?e.message:String(e)); }
    finally { setLoading(false); }
  }
  function updatePoint(uid:string, patch:Partial<Point>) {
    if (!graph) return;
    commit({...graph,points:graph.points.map((p)=>p.uid===uid?{...p,...patch}:p)});
  }
  function addPoint() {
    if (!graph) return;
    const uid=`${courseId}:manual:${crypto.randomUUID()}`;
    commit({...graph,points:[...graph.points,{uid,label:"新知识点",kind:"概念",definition:"",example:"",resource:"",x:50,y:50,sources:[]}]});setSelected(uid);
  }
  function removePoint() {
    if (!graph||!selected||!confirm("删除此知识点及其课程关系和学习进度？"))return;
    commit({...graph,points:graph.points.filter((p)=>p.uid!==selected),edges:graph.edges.filter((e)=>e.source!==selected&&e.target!==selected)});setSelected(null);
  }
  function addEdge(source:string,targetId:string,kind:Edge["kind"]) {
    if (!graph||!source||!targetId||source===targetId)return;
    if(graph.edges.some((e)=>e.source===source&&e.target===targetId&&e.kind===kind)){setError("该关系已经存在");return;}
    commit({...graph,edges:[...graph.edges,{uid:crypto.randomUUID(),source,target:targetId,kind}]});
  }
  function save() { if(graph) run(()=>api.saveGraph(courseId,graph),(saved)=>{baselineRef.current=graphFingerprint(saved);setGraph(saved);setDirty(false);setUndo([]);setRedo([]);reloadCourses();},"修改已保存到数据库"); }
  function chooseTarget(id:string) {
    if(loading)return;
    setTarget(id);setSelected(id);setSteps([]);setPathCalculated(false);
    run(()=>api.path(courseId,learner,id),result=>{setSteps(result.steps);setPathCalculated(true);requestAnimationFrame(()=>pathRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));},"已按基础到进阶排列目标路线");
  }
  function mark(uid:string) {
    if(loading)return;
    const next=!mastered.includes(uid);
    run(async()=>{await api.setProgress(courseId,learner,uid,next);return page==="path"&&target?api.path(courseId,learner,target):null;},(path)=>{setMastered((prev)=>next?[...prev,uid]:prev.filter((x)=>x!==uid));if(path){setSteps(path.steps);setPathCalculated(true);}},"学习进度已保存，路径已更新");
  }
  function placeGraph(id?:string,x?:number,y?:number,force=false){
    if(!graph)return;
    const layout=force||isSeedGrid(nodes)?relationLayout(nodes,edges):null;
    commit({...graph,points:graph.points.map(p=>({...p,...layout?.get(p.uid),...(p.uid===id?{x:x!,y:y!}:{})}))});
  }
  const graphView = <div className="h-[680px] min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm"><GraphCanvas nodes={nodes} edges={edges} courseId={courseId} selectedId={selected} onSelect={setSelected} editable={page==="editor"} highlightPath={steps.map((s)=>s.uid)} recommendedIds={page==="path"?recommended:[]} onNodeMove={page==="editor"?(id,x,y)=>placeGraph(id,x,y):undefined} onResetLayout={()=>{if(page==="editor")placeGraph(undefined,undefined,undefined,true);}}/></div>;
  const detail = activePoint && <section ref={detailRef} className="scroll-mt-4 rounded-xl border-2 border-primary bg-card p-4 shadow-sm">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-primary">{activePoint.label}</h3><span className="text-xs text-muted-foreground">{activePoint.kind}{activePoint.teacher_edited&&" · 教师已修订"}</span></div>
    {page==="editor" ? <div className="mt-3 space-y-2 text-sm">
      <label className="block">名称<input className="mt-1 w-full rounded border p-2" value={activePoint.label} onChange={(e)=>updatePoint(activePoint.uid,{label:e.target.value})}/></label>
      <label className="block">类别<select className="mt-1 w-full rounded border p-2" value={activePoint.kind} onChange={(e)=>updatePoint(activePoint.uid,{kind:e.target.value})}>{["概念","公式","定理","方法","应用","章节"].map((x)=><option key={x}>{x}</option>)}</select></label>
      <label className="block">所属章节<input className="mt-1 w-full rounded border p-2" value={activePoint.chapter||""} onChange={e=>updatePoint(activePoint.uid,{chapter:e.target.value,chapters:e.target.value?[e.target.value]:[]})}/></label>
      <label className="block">定义<textarea className="mt-1 w-full rounded border p-2" value={activePoint.definition} onChange={(e)=>updatePoint(activePoint.uid,{definition:e.target.value})}/></label>
      <label className="block">示例<textarea className="mt-1 w-full rounded border p-2" value={activePoint.example} onChange={(e)=>updatePoint(activePoint.uid,{example:e.target.value})}/></label>
      <label className="block">学习资源<input className="mt-1 w-full rounded border p-2" value={activePoint.resource} onChange={(e)=>updatePoint(activePoint.uid,{resource:e.target.value})}/></label>
      <button className="flex items-center gap-1 text-destructive" onClick={removePoint}><Trash2 size={14}/>删除知识点</button>
    </div> : <div className="mt-3 space-y-2 text-sm"><p className="font-medium leading-6">{activePoint.definition||"暂无定义"}</p>{activePoint.example&&<p className="leading-6"><span className="font-semibold">示例：</span>{activePoint.example}</p>}{activePoint.resource&&<p className="leading-6"><span className="font-semibold">资源：</span>{activePoint.resource}</p>}<p className="text-xs text-muted-foreground">资料：{activePoint.sources?.join("、")||"教师补充"}</p><button className="rounded-lg border px-3 py-1" onClick={()=>mark(activePoint.uid)}>{mastered.includes(activePoint.uid)?"取消已掌握":"标记已掌握"}</button></div>}
    {pointSnippets.length>0&&<div className="mt-4 space-y-2 border-t pt-3"><h4 className="text-xs font-medium">原资料片段</h4>{pointSnippets.map((s,index)=><details key={`${s.document}-${index}`} className="rounded border p-2 text-xs"><summary className="cursor-pointer">{s.document}{s.page?` · 第 ${s.page} 页`:""}</summary><p className="mt-2 whitespace-pre-wrap leading-6">{s.text}</p></details>)}</div>}
  </section>;

  return <div className="flex min-h-screen bg-background text-foreground">
    <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:flex">
      <div className="mb-5 text-lg font-semibold">知源 <span className="text-xs font-normal text-muted-foreground">KnowTrace</span></div>
      <label className="text-xs text-muted-foreground">当前课程<select disabled={loading} className="mt-1 w-full rounded-lg border border-border bg-card p-2 text-sm text-foreground" value={courseId} onChange={(e)=>{if(!dirty||confirm("当前图谱有未保存的修改，确定切换课程吗？"))setCourseId(e.target.value);}}><option value="">请选择课程</option>{courses.map((c)=><option value={c.uid} key={c.uid}>{c.title}</option>)}</select></label>
      <nav className="mt-5 space-y-1">{links.map(({page:key,href,label,icon:Icon})=><Link key={href} to={href} onClick={(event)=>{if(page!==key&&dirty&&!confirm("当前图谱有未保存的修改，确定离开吗？"))event.preventDefault();}} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${page===key?"bg-sidebar-accent font-semibold":"hover:bg-sidebar-accent/60"}`}><Icon size={15}/>{label}</Link>)}</nav>
      <p className="mt-auto text-xs text-muted-foreground">课程图谱与学习进度保存在 Neo4j</p>
    </aside>
    <main className="min-w-0 flex-1 p-4 md:p-6"><div className="mx-auto max-w-[1320px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4"><div><h1 className="text-xl font-semibold">{page==="courses"?"多课程管理":page==="upload"?"资料上传与解析":page==="pipeline"?"图谱生成进度":page==="editor"?"图谱编辑修正":page==="path"?"学习路径":page==="ask"?"课程问答":page==="quiz"?"知识自测":"知识地图"}</h1><p className="mt-1 text-sm text-muted-foreground">{course?.title||"先创建一门课程"} · {graph?.points.length||0} 个知识点 · {graph?.edges.length||0} 条关系 {dirty&&"· 有未保存的修改"}</p></div>{page==="editor"&&<div className="flex flex-wrap gap-2"><button disabled={!undo.length} title="撤销" className="rounded-lg border p-2 disabled:opacity-40" onClick={undoEdit}><Undo2 size={16}/></button><button disabled={!redo.length} title="重做" className="rounded-lg border p-2 disabled:opacity-40" onClick={redoEdit}><Redo2 size={16}/></button><button disabled={!graph} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40" onClick={exportGraph}><Download size={15}/>导出图谱</button><button disabled={!dirty||loading} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={save}><Save size={15}/>保存到图谱</button></div>}</div>
      {error&&<div role="alert" className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice&&<div role="status" className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {page==="pipeline"&&graph&&<div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[["知识点",graph.points.length],["先修关系",graph.edges.filter((e)=>e.kind==="PREREQUISITE_OF").length],["包含 / 相关关系",`${graph.edges.filter((e)=>e.kind==="CONTAINS").length} / ${graph.edges.filter((e)=>e.kind==="RELATED_TO").length}`],["待补定义",graph.points.filter((p)=>!p.definition.trim()).length]].map(([label,value])=><div key={String(label)} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div>}
      {page==="path"&&course&&<NextLearning key={courseId} courseId={courseId} learner={learner} mastered={mastered} onSelect={chooseTarget} onMaster={mark} busy={loading} onRecommended={setRecommended}/>}
      {page==="quiz"&&course&&<CourseQuiz key={courseId} courseId={courseId} learner={learner}/>}
      {loading&&<div className="mb-3 rounded-lg bg-secondary p-3 text-sm">正在处理，请稍候…</div>}
      {(page==="upload"||page==="pipeline")&&course&&<ProcessingTasks key={courseId} courseId={courseId} documents={course.documents} onGraph={(g)=>{setGraph((current)=>current?.course.uid===g.course.uid?g:current);reloadCourses();api.documents().then(setDocuments);}} onDeleteDocument={async (filename)=>{const g=await api.deleteDocument(courseId,filename);setGraph(g);reloadCourses();api.documents().then(setDocuments);}}/>}
      {initializing&&<p className="rounded-xl border bg-card p-8 text-sm">正在载入课程…</p>}
      {!initializing&&loadingGraph&&<p className="rounded-xl border bg-card p-8 text-sm">正在载入当前课程图谱…</p>}
      {!initializing&&!course&&page!=="courses"&&<p className="rounded-xl border bg-card p-8 text-sm">请先前往<Link to="/teacher/courses" className="ml-1 text-primary underline">多课程管理</Link>创建课程。</p>}
      {page==="courses"&&<div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">创建课程</h2><div className="flex gap-2"><input className="min-w-0 flex-1 rounded-lg border p-2" placeholder="例如：离散数学" value={title} onChange={(e)=>setTitle(e.target.value)}/><button disabled={title.trim().length<2||loading} className="rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-40" onClick={()=>run(()=>api.createCourse(title.trim()),(c)=>{setTitle("");reloadCourses(c.uid);},"课程已创建")}>创建</button></div></section><section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">已建课程</h2>{courses.length===0?<p className="text-sm text-muted-foreground">尚无课程</p>:courses.map((c)=><div key={c.uid} className="mb-2 flex items-center gap-2 rounded-lg border p-3 text-sm"><button onClick={()=>setCourseId(c.uid)} className="flex min-w-0 flex-1 items-center justify-between text-left"><span>{c.title}</span><span className="text-xs text-muted-foreground">{c.documents.length} 份资料 {c.uid===courseId&&"· 当前课程"}</span></button><button disabled={loading} className="text-xs text-primary disabled:opacity-40" onClick={()=>{const name=prompt("请输入新的课程名称",c.title);if(name&&name.trim().length>=2)run(()=>api.renameCourse(c.uid,name.trim()),()=>{reloadCourses();},"课程已改名");}}>改名</button><button aria-label={`删除课程 ${c.title}`} className="text-muted-foreground hover:text-destructive" onClick={()=>{if(confirm(`删除课程「${c.title}」及其图谱和学习进度？原始上传资料会保留。`))run(()=>api.deleteCourse(c.uid),()=>{if(courseId===c.uid){setCourseId("");localStorage.removeItem("knowtrace:course:v2");}reloadCourses();},"课程已删除");}}><Trash2 size={15}/></button></div>)}</section></div>}
      {page==="upload"&&course&&<div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border bg-card p-5"><h2 className="mb-2 font-semibold">上传并生成图谱</h2><p className="mb-3 text-sm text-muted-foreground">支持 PDF、DOCX、TXT、Markdown，单文件不超过 50MB。使用 DeepSeek 自动抽取，处理时间取决于资料长度。</p><input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];setFileName(f?f.name:"");}}/><button type="button" onClick={()=>fileRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/80 bg-secondary/30 px-4 py-8 text-sm transition-colors hover:border-primary/40 hover:bg-secondary/50"><Upload size={20} className="text-muted-foreground"/><span className="font-medium">{fileName||"选择文件"}</span><span className="text-xs text-muted-foreground">{fileName?"点击可重新选择":"点击选择 PDF、DOCX、TXT 或 Markdown"}</span></button><button disabled={loading||!fileName} className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={()=>{const file=fileRef.current?.files?.[0];if(file)run(()=>api.upload(courseId,file),(r)=>{setGraph(r.graph);setFileName("");reloadCourses();api.documents().then(setDocuments);},"已完成上传、抽取并加入课程");else setError("请先选择文件");}}>上传并抽取</button></section><section className="rounded-xl border bg-card p-5"><h2 className="mb-2 font-semibold">关联已抽取的资料</h2><select className="w-full rounded-lg border p-2 text-sm" value={importName} onChange={(e)=>setImportName(e.target.value)}><option value="">选择资料</option>{documents.filter((d)=>d.status==="Completed"&&!course.documents.includes(d.name)).map((d)=><option key={d.name} value={d.name}>{d.name}</option>)}</select><button disabled={!importName||loading} className="mt-3 rounded-lg border px-4 py-2 text-sm disabled:opacity-40" onClick={()=>run(()=>api.importDocument(courseId,importName),(g)=>{setGraph(g);setImportName("");reloadCourses();},"资料已关联到课程")}>关联资料</button><p className="mt-3 text-xs text-muted-foreground">同名资料请直接关联；不同课程拥有各自的可编辑图谱。</p></section></div>}
      {(page==="pipeline"||page==="upload")&&graph&&<section className="mb-4 rounded-xl border bg-card p-4"><h2 className="font-semibold">章节与内容完整度</h2><div className="mt-3 flex flex-wrap gap-3 text-sm">{["概念","公式","定理","方法","应用"].map(kind=><span key={kind}>{kind} {graph.points.filter(p=>p.kind===kind).length}</span>)}</div><p className="mt-2 text-xs text-muted-foreground">待核对内容：定义 {graph.points.filter(p=>!p.definition).length}，示例 {graph.points.filter(p=>!p.example).length}，资源 {graph.points.filter(p=>!p.resource).length}。留空可能表示资料未提供，不代表抽取失败。</p><button disabled={loading||dirty} className="my-3 rounded border px-3 py-2 text-sm disabled:opacity-40" onClick={()=>run(()=>api.completeContent(courseId),g=>{baselineRef.current=graphFingerprint(g);setGraph(g);setDirty(false);setUndo([]);setRedo([]);reloadCourses()},"内容补全完成；已保留教师修订")}>补全历史资料的类别、示例与资源</button><p className="text-xs text-muted-foreground">缺少原文依据的字段保持空白；无原始章节信息的历史资料标为未分章。</p><div className="mt-3 space-y-2 text-sm">{graph.chapters?.map(c=><p key={c.key}>{c.title} · {c.count} 个知识点 {c.recognized?(c.count>=20?"· 已达到每章 20 点":"· 尚未达到每章 20 点"):"· 未识别章节"}</p>)}{!graph.chapters?.length&&<p>历史资料未保存章节信息，可在教师编辑页手动补充。</p>}</div></section>}
      {page==="pipeline"&&course&&<section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">真实处理记录</h2><button className="mb-3 rounded-lg border px-3 py-1 text-sm" onClick={()=>api.documents().then(setDocuments).catch((e)=>setError(e.message))}>刷新状态</button><div className="divide-y">{documents.filter((d)=>course.documents.includes(d.name)).map((d)=><div className="flex justify-between py-3 text-sm" key={d.name}><span>{d.name}</span><span>{d.status} · {d.nodes??"—"} 节点</span></div>)}</div>{course.documents.length===0&&<p className="text-sm text-muted-foreground">本课程尚无资料。上传页会等待真实抽取结果，避免显示虚构进度。</p>}</section>}
      {(page==="map"||page==="editor")&&course&&graph&&<div className={page==="editor"?"grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]":"space-y-4"}>{page==="map"?<KnowledgeBrowser graph={graph} mastered={mastered} onSelect={(id)=>{setSelected(id);setFocusId(id);}} renderMap={ids=><div className="h-[680px] rounded-xl border bg-card"><GraphCanvas layoutNodes={nodes} layoutEdges={edges} nodes={nodes.filter(n=>ids.has(n.id))} edges={edges.filter(e=>ids.has(e.from)&&ids.has(e.to))} courseId={courseId} selectedId={selected} onSelect={(id)=>{setSelected(id);setFocusId(id);}} focusId={focusId}/></div>}/>:graphView}<div className="space-y-4">{page==="editor"&&<section className="rounded-xl border bg-card p-4 text-sm"><button className="flex items-center gap-2 rounded-lg border px-3 py-2" onClick={addPoint}><Plus size={14}/>添加知识点</button><h3 className="mt-4 font-medium">添加关系</h3><p className="mt-1 text-xs text-muted-foreground">箭头从先修点指向后续点，从整体指向部分。</p><EdgeCreator points={graph?.points||[]} onAdd={addEdge}/><h3 className="mt-4 font-medium">已有关系</h3><div className="max-h-48 space-y-1 overflow-auto">{graph?.edges.map((e)=><div className="flex items-center justify-between gap-2 text-xs" key={e.uid}><span className="truncate">{graph.points.find((p)=>p.uid===e.source)?.label} → {graph.points.find((p)=>p.uid===e.target)?.label} · {relationNames[e.kind]}</span><button aria-label="删除关系" onClick={()=>commit({...graph,edges:graph.edges.filter((x)=>x!==e)})}><Trash2 size={12}/></button></div>)}</div></section>}{detail||<section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">点击知识点可查看原文与详情；圆形节点可拖动调整，双击可放大查看。</section>}</div></div>}
      {page==="path"&&course&&<div ref={pathRef} className="scroll-mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]"><section className="rounded-xl border bg-card p-4"><div className="mb-3 flex flex-wrap gap-2"><select value={target} onChange={(e)=>{setTarget(e.target.value);setSteps([]);setPathCalculated(false);}} className="min-w-52 rounded-lg border p-2 text-sm"><option value="">选择学习目标</option>{graph?.points.map((p)=><option key={p.uid} value={p.uid}>{p.label}</option>)}</select><button disabled={!target||loading} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={()=>run(()=>api.path(courseId,learner,target),(r)=>{setSteps(r.steps);setPathCalculated(true);},"学习路径已计算")}>计算路径</button></div><LearningRoute steps={steps} targetLabel={graph?.points.find(p=>p.uid===target)?.label||""} calculated={pathCalculated} busy={loading} onMaster={mark}/>{detail&&<div className="mb-4">{detail}</div>}{graphView}</section><section className="rounded-xl border bg-card p-4 text-sm"><h3 className="font-semibold">学习进度</h3><p className="mt-2">已掌握 {mastered.length} / {graph?.points.length||0}</p><div className="mt-3 max-h-96 space-y-2 overflow-auto">{graph?.points.map((p)=><label key={p.uid} className="flex items-center gap-2"><input type="checkbox" checked={mastered.includes(p.uid)} onChange={()=>mark(p.uid)}/>{p.label}</label>)}</div></section></div>}
      {page==="ask"&&course&&<section className="mx-auto flex max-w-3xl flex-col rounded-xl border bg-card p-5" style={{height:"calc(100vh - 140px)"}}><h2 className="font-semibold">向知源助教提问</h2><p className="mt-1 text-xs text-muted-foreground">只检索本课程关联的资料：{course.documents.join("、")||"暂无资料"}</p><div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">{chatHistory.length===0&&<p className="text-sm text-muted-foreground">向助教提问，支持多轮追问。例如：「瀑布模型是什么？」然后继续追问「它和增量模型有什么区别？」</p>}{chatHistory.map((m,i)=><div key={i} className="space-y-2"><div className="flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">{m.q}</div></div><div className="flex justify-start"><div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-secondary px-4 py-2.5 text-sm leading-7"><p className="whitespace-pre-wrap">{m.a.answer}</p><p className="mt-2 text-xs text-muted-foreground">出处：{m.a.sources.join("、")||"无可引用来源"} · {m.a.seconds} 秒</p>{m.a.relevant_points&&m.a.relevant_points.length>0&&<div className="mt-2 flex flex-wrap gap-1.5"><span className="text-xs text-muted-foreground">相关知识点：</span>{m.a.relevant_points.map((rp)=><button key={rp.uid} onClick={()=>{localStorage.setItem("knowtrace:focus:v2",rp.uid);navigate({to:"/"});}} className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20">{rp.label} →</button>)}</div>}{m.a.snippets.length>0&&<div className="mt-2 space-y-2 border-t pt-2">{m.a.snippets.map((sn,j)=><details key={`${sn.document}-${i}-${j}`} className="rounded border bg-card p-2"><summary className="cursor-pointer text-xs">{sn.document}{sn.page?` · 第 ${sn.page} 页`:""}</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-6">{sn.text}</p></details>)}</div>}</div></div></div>)}</div><div className="mt-4 flex gap-2 border-t pt-4"><input className="min-w-0 flex-1 rounded-lg border p-3 text-sm" value={question} onChange={(e)=>setQuestion(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"&&question.trim().length>1&&!loading){const q=question.trim();setQuestion("");run(()=>api.ask(courseId,q,learner),(r)=>setChatHistory((old)=>[...old,{q,a:r}]),"回答完成");}}} placeholder="继续追问…"/><button disabled={question.trim().length<2||loading||course.documents.length===0} className="rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-40" onClick={()=>{const q=question.trim();setQuestion("");run(()=>api.ask(courseId,q,learner),(r)=>setChatHistory((old)=>[...old,{q,a:r}]),"回答完成");}}>发送</button></div></section>}
    </div></main>
  </div>;
}

function EdgeCreator({points,onAdd}:{points:Point[],onAdd:(source:string,target:string,kind:Edge["kind"])=>void}) {
  const [from,setFrom]=useState(""); const [to,setTo]=useState(""); const [kind,setKind]=useState<Edge["kind"]>("PREREQUISITE_OF");
  return <div className="mt-2 space-y-2"><select className="w-full rounded border p-2" value={from} onChange={(e)=>setFrom(e.target.value)}><option value="">起点</option>{points.map((p)=><option key={p.uid} value={p.uid}>{p.label}</option>)}</select><select className="w-full rounded border p-2" value={to} onChange={(e)=>setTo(e.target.value)}><option value="">终点</option>{points.map((p)=><option key={p.uid} value={p.uid}>{p.label}</option>)}</select><select className="w-full rounded border p-2" value={kind} onChange={(e)=>setKind(e.target.value as Edge["kind"])}>{Object.entries(relationNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button disabled={!from||!to} className="rounded-lg border px-3 py-2 disabled:opacity-40" onClick={()=>onAdd(from,to,kind)}>添加关系</button></div>;
}


