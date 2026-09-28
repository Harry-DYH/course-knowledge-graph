import { useEffect, useState } from "react";
import { api, type CourseGraph, type ProcessJob } from "@/lib/course-api";

const labels:Record<string,string>={Uploading:"文件写入中",Parsing:"清理与章节识别",Enriching:"类别与原文内容补全",Extracting:"解析与知识抽取中",Importing:"写入课程图谱",Completed:"已完成",Failed:"处理失败"};
export function ProcessingTasks({courseId,onGraph}:{courseId:string;onGraph:(graph:CourseGraph)=>void}) {
  const [jobs,setJobs]=useState<ProcessJob[]>([]);
  const [error,setError]=useState("");
  const [retrying,setRetrying]=useState("");
  useEffect(()=>{
    let active=true;
    const refresh=()=>api.jobs(courseId).then((value)=>{if(active)setJobs(value);}).catch((e)=>{if(active)setError(e.message);});
    refresh();const timer=window.setInterval(refresh,3000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[courseId]);
  async function retry(job:ProcessJob) {
    setRetrying(job.uid);setError("");
    try {const result=await api.retry(courseId,job.uid);onGraph(result.graph);setJobs(await api.jobs(courseId));}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setRetrying("");}
  }
  return <section className="mt-4 rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">处理任务</h2>{error&&<p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}{jobs.length===0?<p className="text-sm text-muted-foreground">新上传的处理任务会记录在这里。</p>:<div className="divide-y">{jobs.map((j)=><div key={j.uid} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p>{j.document}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(j.started_ms).toLocaleString()} · 第 {j.attempts} 次处理{j.ended_ms?` · ${((j.ended_ms-j.started_ms)/1000).toFixed(1)} 秒`:""}</p>{j.error&&<p className="mt-1 text-xs text-destructive">{j.error}</p>}</div><div className="flex items-center gap-3"><span className={j.status==="Failed"?"text-destructive":j.status==="Completed"?"text-emerald-700":"text-primary"}>{labels[j.status]||j.status}</span>{j.status==="Failed"&&<button disabled={!!retrying} className="rounded border px-3 py-1 disabled:opacity-40" onClick={()=>retry(j)}>{retrying===j.uid?"重试中…":"重试"}</button>}</div></div>)}</div>}</section>;
}
