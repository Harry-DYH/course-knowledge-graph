import { useEffect, useState } from "react";
import { api, type NextRecommendation } from "@/lib/course-api";
export function NextLearning({courseId,learner,mastered,onSelect,onMaster,busy=false,onRecommended}:{courseId:string;learner:string;mastered:string[];onSelect:(id:string)=>void;onMaster:(id:string)=>void;busy?:boolean;onRecommended?:(ids:string[])=>void}) {
 const [result,setResult]=useState<NextRecommendation|null>(null),[error,setError]=useState(""),[refreshing,setRefreshing]=useState(false);
 useEffect(()=>{let active=true;setRefreshing(true);setError("");api.next(courseId,learner).then(r=>{if(active){setResult(r);onRecommended?.(r.steps.map(s=>s.uid));}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setRefreshing(false)});return()=>{active=false}},[courseId,learner,mastered]);
 const disabled=busy||refreshing;
 const stages=result?.stages||[];
 const summary=[{title:"基础起点",subtitle:"先建立根基",select:(level:number|null)=>level===0},{title:"知识衔接",subtitle:"连接已有基础",select:(level:number|null)=>level===1},{title:"逐步进阶",subtitle:"先修掌握后再深入",select:(level:number|null)=>level!==null&&level>=2}];
 return <section className="mb-5 overflow-hidden rounded-xl border bg-card shadow-sm">
  <div className="border-b p-5"><h2 className="text-lg font-semibold">先打基础，再逐步进阶</h2><p className="mt-1 text-sm text-muted-foreground">学习顺序依据课程先修关系。先掌握基础，再进入已解锁的后续知识。</p>
   <div className="mt-4 grid grid-cols-3 gap-2">{summary.map((phase,index)=>{const rows=stages.filter(s=>phase.select(s.level)),total=rows.reduce((n,s)=>n+s.total,0),done=rows.reduce((n,s)=>n+s.completed,0);return <div key={phase.title} className="relative rounded-lg border bg-secondary/30 p-3"><span className="text-xs font-semibold text-primary">0{index+1}{index<2&&" →"}</span><h3 className="mt-1 text-sm font-semibold">{phase.title}</h3><p className="mt-1 hidden text-xs text-muted-foreground sm:block">{phase.subtitle}</p><p className="mt-2 text-xs">已掌握 {done} / {total}</p><div className="mt-2 h-1.5 rounded bg-secondary"><div className="h-full rounded bg-primary" style={{width:`${total?done/total*100:0}%`}}/></div></div>})}</div>
  </div>
  <div className="p-5">
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   {!result&&!error&&<p className="text-sm">正在分析基础与进阶关系…</p>}
   {result&&<>
    {!result.has_prerequisites&&result.remaining>0&&<p className="mb-4 rounded border p-3 text-sm">当前图谱尚未设置先修关系，以下仅为可选起点，暂不能可靠区分基础与进阶。</p>}
    {result.has_cycle&&<p className="mb-4 text-sm text-destructive">部分先修关系存在循环，相关知识点暂不纳入阶段推荐，请教师修正。</p>}
    {result.state==="completed"&&<p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">本课程已全部掌握，可以进入复习与自测。</p>}
    {result.state==="blocked"&&<p className="text-sm">当前没有可靠的可学习起点，请检查先修关系。</p>}
    {result.steps[0]&&<div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
     <p className="text-xs font-semibold text-primary">现在最推荐 · {result.has_prerequisites?result.steps[0].phase:"可选起点"}</p><h3 className="mt-2 text-xl font-semibold">{result.steps[0].label}</h3>
     <p className="mt-2 text-sm">{result.steps[0].reason}。</p><p className="mt-1 text-sm text-muted-foreground">{result.steps[0].foundation_for?`它是 ${result.steps[0].foundation_for} 个尚未掌握的后续知识点的先修基础。`:"该知识点没有尚未掌握的后续依赖。"}</p>
     <div className="mt-3 text-sm"><span className="font-medium">学会后立即解锁：</span>{result.steps[0].unlock_points.length?result.steps[0].unlock_points.map(p=><span key={p.uid} className="mr-1 inline-block rounded border bg-card px-2 py-1">{p.label}</span>):<span className="text-muted-foreground">暂无；后续点可能还需要其他先修。</span>}</div>
     <div className="mt-4 flex flex-wrap gap-2"><button disabled={disabled} onClick={()=>onSelect(result.steps[0].uid)} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40">查看学习路线</button><button disabled={disabled} onClick={()=>onMaster(result.steps[0].uid)} className="rounded-lg border bg-card px-3 py-2 text-sm disabled:opacity-40">我已掌握，推荐下一步</button></div>
    </div>}
    {result.steps.length>1&&<div className="mt-4"><h3 className="text-sm font-semibold">其他当前可学</h3><div className="mt-2 flex flex-wrap gap-2">{result.steps.slice(1).map(s=><button disabled={disabled} key={s.uid} title={`${s.reason}；第 ${s.depth+1} 层`} onClick={()=>onSelect(s.uid)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">{s.label}<span className="ml-2 text-xs text-muted-foreground">{s.phase}</span></button>)}</div></div>}
    <div className="mt-5 border-t pt-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">完整课程学习阶梯</h3><span className="text-xs text-muted-foreground">● 已掌握　● 可学　○ 待先修</span></div><p className="mt-1 text-xs text-muted-foreground">按依赖层级从基础走向进阶；点击任何知识点，可查看包含全部先修的路线。</p>
     <div className="mt-4 space-y-3">{stages.map(stage=><div key={String(stage.level)} className="grid gap-2 border-l-2 border-primary/25 pl-3 sm:grid-cols-[145px_minmax(0,1fr)]"><div><p className="text-sm font-semibold">{stage.level===null?"待修正":`第 ${stage.level+1} 层`} · {result.has_prerequisites?stage.title:"可选起点"}</p><p className="mt-1 text-xs text-muted-foreground">掌握 {stage.completed}/{stage.total} · 可学 {stage.available}</p></div><div className="flex flex-wrap gap-2">{stage.points.map(p=><button key={p.uid} disabled={disabled||stage.level===null} title={p.status==="blocked"?`还需掌握：${p.missing.map(x=>x.label).join('、')||'先修关系待修正'}`:p.status==="mastered"?"已掌握":"先修已满足，可以学习"} onClick={()=>onSelect(p.uid)} className={`rounded-lg border px-2.5 py-1.5 text-sm disabled:opacity-50 ${p.status==="mastered"?"border-emerald-200 bg-emerald-50 text-emerald-800":p.status==="ready"?"border-primary/30 bg-primary/5 text-primary":"bg-secondary/30 text-muted-foreground"}`}><span className="mr-1.5">{p.status==="blocked"?"○":"●"}</span>{p.label}</button>)}</div></div>)}</div>
    </div>
    <p className="mt-4 text-xs text-muted-foreground">{result.ordering}。{refreshing?"正在更新推荐…":`还剩 ${result.remaining} 个知识点。`}</p>
   </>}
  </div>
 </section>;
}
