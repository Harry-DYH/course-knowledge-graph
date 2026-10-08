import { useEffect, useState } from "react";
import { api, type CourseGraph, type DocumentRow, type ProcessJob } from "@/lib/course-api";

const labels:Record<string,string>={Uploading:"文件写入中",Parsing:"清理与章节识别",Enriching:"类别与原文内容补全",Extracting:"解析与知识抽取中",Importing:"写入课程图谱",Completed:"已完成",Failed:"处理失败"};
const progress:Record<string,number>={Uploading:10,Parsing:30,Extracting:60,Importing:80,Enriching:95,Completed:100,Failed:0};
export function ProcessingTasks({courseId,onGraph,documents,onDeleteDocument}:{courseId:string;onGraph:(graph:CourseGraph)=>void;documents:string[];onDeleteDocument:(filename:string)=>void}) {
  const [jobs,setJobs]=useState<ProcessJob[]>([]);
  const [error,setError]=useState("");
  const [retrying,setRetrying]=useState("");
  const [deleting,setDeleting]=useState("");
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
  async function removeDocument(filename:string) {
    setDeleting(filename);setError("");
    try {await onDeleteDocument(filename);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setDeleting("");}
  }
  return <section className="mt-4 rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">处理任务</h2>{error&&<p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}{documents.length===0?<p className="text-sm text-muted-foreground">本课程尚未关联任何资料，新上传的处理任务会记录在这里。</p>:<div className="divide-y">{documents.map((doc)=>{const job=jobs.find((j)=>j.document===doc);return <div key={doc} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p>{doc}</p><p className="mt-1 text-xs text-muted-foreground">{job?`${new Date(job.started_ms).toLocaleString()} · 第 ${job.attempts} 次处理${job.ended_ms?` · ${((job.ended_ms-job.started_ms)/1000).toFixed(1)} 秒`:""}`:"已关联到本课程"}</p>{job?.error&&<p className="mt-1 text-xs text-destructive">{job.error}</p>}</div><div className="flex items-center gap-3"><span className="flex min-w-[220px] items-center gap-2"><span className="flex-1"><span className="block text-[11px] text-muted-foreground">{job?labels[job.status]||job.status:"已关联"}</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"><span className={job?.status==="Failed"?"block h-full rounded-full bg-destructive":job?.status==="Completed"?"block h-full rounded-full bg-emerald-500":"block h-full rounded-full bg-primary transition-all duration-500"} style={{width:`${job?progress[job.status]??0:0}%`}}/></span></span><span className="tnum shrink-0 text-[11px] text-muted-foreground">{job?progress[job.status]??0:0}%</span></span>{job?.status==="Failed"&&<button disabled={!!retrying} className="rounded border px-3 py-1 disabled:opacity-40" onClick={()=>retry(job)}>{retrying===job.uid?"重试中…":"重试"}</button>}<button disabled={!!deleting} className="rounded border border-destructive/40 px-3 py-1 text-destructive disabled:opacity-40" onClick={()=>{if(confirm(`删除资料「${doc}」及其在课程中的知识点和关系？此操作不可恢复。`))removeDocument(doc);}}>{deleting===doc?"删除中…":"删除"}</button></div></div>;})}</div>}</section>;
}
