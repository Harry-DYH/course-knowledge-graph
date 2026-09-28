import {useEffect,useState} from "react";
import {api,type Quiz,type QuizResult,type QuizHistory} from "@/lib/course-api";

export function CourseQuiz({courseId,learner}:{courseId:string;learner:string}) {
  const [quiz,setQuiz]=useState<Quiz|null>(null);
  const [answers,setAnswers]=useState<string[]>([]);
  const [result,setResult]=useState<QuizResult|null>(null);
  const [history,setHistory]=useState<QuizHistory[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{api.quizHistory(courseId,learner).then(setHistory).catch((e)=>setError(e.message));},[courseId,learner]);
  async function start() {
    setBusy(true);setError("");
    try {const next=await api.quiz(courseId,learner);setQuiz(next);setAnswers(next.questions.map(()=>""));setResult(null);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  async function submit() {
    if(!quiz)return;setBusy(true);setError("");
    try {setResult(await api.submitQuiz(courseId,learner,quiz.attempt_id,answers));setHistory(await api.quizHistory(courseId,learner));}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"><section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">课程知识自测</h2><p className="mt-1 text-xs text-muted-foreground">依据当前课程图谱的定义出题，每次最多 5 题。教师修订保存后会用于新题。</p></div><button disabled={busy} className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={start}>{quiz?"重新出题":"开始自测"}</button></div>{error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}{result&&<p role="status" className="mt-4 rounded-lg bg-secondary p-3 text-sm">得分 {result.score} 分，答对 {result.correct} / {result.total} 题。错误题目可回到知识地图复习。</p>}{quiz&&<div className="mt-4 space-y-4">{quiz.questions.map((q,index)=><fieldset key={q.id} className="rounded-lg border p-4"><legend className="px-1 text-sm font-medium">第 {index+1} 题 · {q.prompt}</legend><p className="mb-3 text-sm leading-6">{q.definition}</p><div className="grid gap-2 sm:grid-cols-2">{q.options.map((option)=><label key={option} className={`flex items-center gap-2 rounded border p-2 text-sm ${answers[index]===option?"border-primary bg-primary/5":""}`}><input disabled={busy||!!result} type="radio" name={`quiz-${q.id}`} checked={answers[index]===option} onChange={()=>setAnswers((old)=>old.map((a,i)=>i===index?option:a))}/>{option}</label>)}</div><p className="mt-2 text-xs text-muted-foreground">图谱依据：{q.sources.join("、")}</p>{result&&<p className={`mt-2 text-sm ${result.results[index].correct?"text-emerald-700":"text-destructive"}`}>{result.results[index].correct?"回答正确":`正确知识点：${result.results[index].answer}`}</p>}</fieldset>)}{!result&&<button disabled={busy||answers.some((a)=>!a)} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={submit}>{busy?"提交中…":"提交并查看结果"}</button>}</div>}</section><section className="rounded-xl border bg-card p-5"><h2 className="mb-3 font-semibold">最近自测</h2>{history.length===0?<p className="text-sm text-muted-foreground">完成自测后，成绩会保存到当前课程和学习者。</p>:history.map((h)=><div key={h.uid} className="mb-2 rounded border p-3 text-sm"><strong>{h.score} 分</strong><p className="mt-1 text-xs text-muted-foreground">{h.total} 题 · {new Date(h.completed_ms).toLocaleString()}</p></div>)}</section></div>;
}
