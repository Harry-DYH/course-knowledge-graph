export type Course = { uid: string; title: string; documents: string[]; revision: number };
export type Point = { uid: string; label: string; kind: string; definition: string; example: string; resource: string; x: number; y: number; origin_id?: string | null; sources?: string[];teacher_edited?:boolean;chapter?:string;chapters?:string[];content_version?:string };
export type SourceSnippet = {document:string;page:number|null;text:string};
export type Edge = { uid?: string; source: string; target: string; kind: "PREREQUISITE_OF" | "CONTAINS" | "RELATED_TO" };
export type CourseGraph = { course: Course; points: Point[]; edges: Edge[]; chapters?: {key:string;title:string;document:string;page:number;count:number;recognized:boolean}[] };
export type DocumentRow = { name: string; status: string; nodes: number };
export type PointRef = {uid:string;label:string};
export type PathStep = { uid: string; label: string; reason: string; priority: number;depth:number;phase:string;ready:boolean;is_target:boolean;missing:PointRef[] };
export type LearningStage = {level:number|null;title:string;total:number;completed:number;available:number;points:{uid:string;label:string;kind:string;status:"mastered"|"ready"|"blocked";missing:PointRef[]}[]};
export type NextRecommendation = {state:string;steps:{uid:string;label:string;kind:string;depth:number;phase:string;foundation_for:number;unlocks:number;unlock_points:PointRef[];prerequisites:PointRef[];reason:string;priority:number}[];stages:LearningStage[];remaining:number;has_cycle:boolean;has_prerequisites:boolean;ordering:string};
export type ProcessJob = { uid:string;document:string;status:string;started_ms:number;ended_ms?:number|null;attempts:number;error?:string };
export type Quiz = {attempt_id:string;questions:{id:string;type:"choice"|"blank"|"judge";prompt:string;definition:string;options?:string[];name?:string;sources:string[]}[]};
export type QuizResult = {score:number;correct:number;total:number;results:{type:string;definition:string;selected:string;answer:string;correct:boolean;explanation?:string}[]};
export type QuizHistory = {uid:string;score:number;total:number;completed_ms:number};

const backend = import.meta.env.VITE_BACKEND_API_URL || "http://127.0.0.1:8000";
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${backend}/course_workspace${path}`, {
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers },
  });
  if (!response.ok) {
    let detail = `请求失败（${response.status}）`;
    try { const error = await response.json(); detail = typeof error.detail === "string" ? error.detail : detail; } catch { /* keep status */ }
    throw new Error(detail);
  }
  return response.json();
}
export const api = {
  courses: () => request<Course[]>("/courses"),
  documents: () => request<DocumentRow[]>("/documents"),
  createCourse: (title: string) => request<Course>("/courses", { method: "POST", body: JSON.stringify({ title }) }),
  renameCourse: (id:string,title:string)=>request<Course>(`/courses/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify({title})}),
  deleteCourse: (id: string) => request<{deleted:string}>(`/courses/${encodeURIComponent(id)}`, { method: "DELETE" }),
  completeContent: (id:string)=>request<CourseGraph>(`/courses/${encodeURIComponent(id)}/complete-content`,{method:"POST"}),
  next: (id:string,learner:string)=>request<NextRecommendation>(`/courses/${encodeURIComponent(id)}/next/${encodeURIComponent(learner)}`),
  graph: (id: string) => request<CourseGraph>(`/courses/${encodeURIComponent(id)}/graph`),
  pointSources: (id:string,point:string)=>request<SourceSnippet[]>(`/courses/${encodeURIComponent(id)}/points/${encodeURIComponent(point)}/sources`),
  importDocument: (id: string, document: string) => request<CourseGraph>(`/courses/${encodeURIComponent(id)}/import`, { method: "POST", body: JSON.stringify({ document }) }),
  deleteDocument: (id: string, document: string) => request<CourseGraph>(`/courses/${encodeURIComponent(id)}/documents/${encodeURIComponent(document)}`, { method: "DELETE" }),
  saveGraph: (id: string, graph: CourseGraph) => request<CourseGraph>(`/courses/${encodeURIComponent(id)}/graph`, { method: "PUT", body: JSON.stringify({ revision: graph.course.revision, points: graph.points, edges: graph.edges }) }),
  upload: (id: string, file: File) => { const form = new FormData(); form.append("file", file); return request<{ graph: CourseGraph }>(`/courses/${encodeURIComponent(id)}/upload`, { method: "POST", body: form }); },
  jobs: (id:string)=>request<ProcessJob[]>(`/courses/${encodeURIComponent(id)}/jobs`),
  activity: (id:string)=>request<{action:string,detail:string,at_ms:number}[]>(`/courses/${encodeURIComponent(id)}/activity`),
  retry: (id:string,job_id:string)=>request<{graph:CourseGraph}>(`/courses/${encodeURIComponent(id)}/retry`,{method:"POST",body:JSON.stringify({job_id})}),
  quiz: (id:string,learner:string,count?:number,types?:string[])=>request<Quiz>(`/courses/${encodeURIComponent(id)}/quiz`,{method:"POST",body:JSON.stringify({learner,count,types})}),
  submitQuiz: (id:string,learner:string,attempt_id:string,answers:string[])=>request<QuizResult>(`/courses/${encodeURIComponent(id)}/quiz/submit`,{method:"POST",body:JSON.stringify({learner,attempt_id,answers})}),
  quizHistory: (id:string,learner:string)=>request<QuizHistory[]>(`/courses/${encodeURIComponent(id)}/quiz/history/${encodeURIComponent(learner)}`),
  progress: (id: string, learner: string) => request<string[]>(`/courses/${encodeURIComponent(id)}/progress/${encodeURIComponent(learner)}`),
  setProgress: (id: string, learner: string, point_uid: string, mastered: boolean) => request<{ok:boolean}>(`/courses/${encodeURIComponent(id)}/progress`, { method: "PUT", body: JSON.stringify({learner,point_uid,mastered}) }),
  path: (id: string, learner: string, target: string) => request<{steps:PathStep[],already_mastered:boolean}>(`/courses/${encodeURIComponent(id)}/path/${encodeURIComponent(learner)}/${encodeURIComponent(target)}`),
  ask: (id: string, question: string, learner: string) => request<{answer:string,sources:string[],snippets:{document:string,page:number|null,text:string}[],relevant_points?:{uid:string,label:string}[],seconds:number}>(`/courses/${encodeURIComponent(id)}/ask`, { method: "POST", body: JSON.stringify({question,learner}) }),
};
