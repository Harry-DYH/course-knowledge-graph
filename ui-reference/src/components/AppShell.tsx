import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Network, Upload, ListTree, GitBranch, BookOpen, MessagesSquare, Route as RouteIcon,
  GraduationCap, Presentation, Menu, X, ChevronRight, ChevronDown, Check,
  RotateCcw, LogOut, UserCircle2, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/mock";
import { api, type Course } from "@/lib/course-api";

type Role = "teacher" | "student";

interface NavItem { to: string; label: string; Icon: typeof Network }

const NAV: Record<Role, NavItem[]> = {
  teacher: [
    { to: "/teacher", label: "资料上传与解析", Icon: Upload },
    { to: "/teacher/pipeline", label: "图谱生成进度", Icon: GitBranch },
    { to: "/teacher/editor", label: "图谱编辑修正", Icon: ListTree },
    { to: "/teacher/courses", label: "多课程管理", Icon: BookOpen },
  ],
  student: [
    { to: "/", label: "知识地图", Icon: Network },
    { to: "/learn/path", label: "学习路径", Icon: RouteIcon },
    { to: "/learn/ask", label: "向助教提问", Icon: MessagesSquare },
  ],
};

export const TOPBAR_H = 52;

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const role: Role = pathname.startsWith("/teacher") ? "teacher" : "student";
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<"none" | "user" | "course">("none");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState(localStorage.getItem("knowtrace:course:v2") || "");
  useEffect(() => {
    let active = true;
    api.courses().then((list) => {
      if (!active) return;
      setCourses(list);
      setCourseId((cur) => (list.some((c) => c.uid === cur) ? cur : (list[0]?.uid || "")));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const course = courses.find((c) => c.uid === courseId);
  const items = NAV[role];

  // 按最长前缀匹配，避免 /teacher/editor 被 /teacher 抢先命中
  const isOn = (to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));
  const activeItem = [...items].filter((i) => isOn(i.to)).sort((a, b) => b.to.length - a.to.length)[0];

  return (
    <div className="flex min-h-screen bg-background" onClick={() => setMenu("none")}>
      {open && <div className="fade-in fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden" onClick={() => setOpen(false)} />}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 [transition-timing-function:var(--ease-soft)] md:sticky md:top-0 md:h-screen md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        {/* 品牌标识 */}
        <div className="flex items-center gap-2.5 px-4 pb-4 pt-[18px]">
          <div className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-sidebar-primary to-[oklch(0.6_0.14_250)] text-sidebar-primary-foreground shadow-[0_2px_8px_-2px_oklch(0.7_0.12_240/0.5),inset_0_1px_0_oklch(1_0_0/0.22)]">
            <Network size={16} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[14.5px] font-semibold tracking-tight">{BRAND.name}</span>
              <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/40">{BRAND.en}</span>
            </div>
            <div className="truncate text-[10.5px] text-sidebar-foreground/45">{BRAND.desc}</div>
          </div>
          <button className="ml-auto text-sidebar-foreground/50 md:hidden" onClick={() => setOpen(false)} aria-label="关闭菜单">
            <X size={16} />
          </button>
        </div>

        {/* 角色切换：分段控件 */}
        <div className="mx-3 flex rounded-lg border border-sidebar-border/80 bg-sidebar-accent/40 p-[3px]">
          {(["student", "teacher"] as Role[]).map((r) => {
            const active = r === role;
            return (
              <Link key={r} to={r === "student" ? "/" : "/teacher"} onClick={() => setOpen(false)}
                className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-all duration-200 [transition-timing-function:var(--ease-soft)]",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_1px_3px_oklch(0_0_0/0.25),inset_0_1px_0_oklch(1_0_0/0.06)]" : "text-sidebar-foreground/50 hover:text-sidebar-foreground/85")}>
                {r === "student" ? <GraduationCap size={13} /> : <Presentation size={13} />}
                {r === "student" ? "学生" : "教师"}
              </Link>
            );
          })}
        </div>

        <nav className="mt-4 flex-1 space-y-[3px] overflow-y-auto px-2.5 pb-2">
          <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/30">
            {role === "teacher" ? "教学工作台" : "学习"}
          </div>
          {items.map((it) => {
            const active = isOn(it.to);
            return (
              <Link key={it.to} to={it.to} onClick={() => setOpen(false)}
                className={cn("group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7.5px] text-[13px] transition-all duration-200 [transition-timing-function:var(--ease-soft)]",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.05)]"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground")}>
                {active && <span className="absolute -left-2.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary shadow-[0_0_8px_oklch(0.74_0.11_235/0.7)]" />}
                <it.Icon size={15} strokeWidth={active ? 2.1 : 1.8} className={cn("shrink-0 transition-colors", active ? "text-sidebar-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70")} />
                <span className="truncate">{it.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 课程切换器 */}
        <div className="relative border-t border-sidebar-border/80 p-2.5">
          <button onClick={(e) => { e.stopPropagation(); setMenu(menu === "course" ? "none" : "course"); }}
            className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent/60">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-sidebar-border/80 bg-sidebar-accent/50">
              <Layers size={12.5} className="text-sidebar-foreground/55" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">{course?.title || "请选择课程"}</span>
              <span className="block truncate text-[10.5px] text-sidebar-foreground/45">{course ? `${course.documents.length} 份资料` : "前往多课程管理创建"}</span>
            </span>
            <ChevronDown size={13} className={cn("mt-1.5 shrink-0 text-sidebar-foreground/40 transition-transform duration-200", menu === "course" && "rotate-180")} />
          </button>

          {menu === "course" && (
            <div className="panel-in absolute bottom-full left-2.5 right-2.5 mb-1.5 overflow-hidden rounded-xl border border-sidebar-border bg-sidebar shadow-lg"
              onClick={(e) => e.stopPropagation()}>
              <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/35">切换课程</div>
              {courses.length === 0 && <p className="px-3 pb-2 text-[11px] text-sidebar-foreground/45">暂无课程</p>}
              {courses.map((c) => (
                <button key={c.uid} onClick={() => { setCourseId(c.uid); localStorage.setItem("knowtrace:course:v2", c.uid); setMenu("none"); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent">
                  <span className="size-1.5 shrink-0 rounded-full bg-sidebar-primary" />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.uid === courseId && <Check size={13} className="shrink-0 text-sidebar-primary" />}
                </button>
              ))}
              <div className="border-t border-sidebar-border/80 px-3 py-2 text-[10.5px] text-sidebar-foreground/35">
                课程间图谱数据完全隔离
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-border/70 bg-card/75 px-3 backdrop-blur-xl md:px-5" style={{ height: TOPBAR_H }}>
          <button className="text-muted-foreground md:hidden" onClick={() => setOpen(true)} aria-label="打开菜单">
            <Menu size={17} />
          </button>
          <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <span className="hidden sm:inline">{role === "teacher" ? "教师" : "学生"}</span>
            <ChevronRight size={12} className="hidden shrink-0 opacity-40 sm:inline" />
            <span className="truncate font-medium text-foreground">{activeItem?.label ?? BRAND.name}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 py-1 pl-2 pr-2.5 text-[11px] text-muted-foreground lg:flex" title="图数据库连接正常（演示环境为本地模拟数据）">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-mastery-mastered opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-mastery-mastered" />
              </span>
              服务正常
            </span>
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setMenu(menu === "user" ? "none" : "user"); }}
                className={cn("flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition-colors duration-200 hover:bg-accent", menu === "user" && "bg-accent")}>
                <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-primary to-[oklch(0.5_0.13_265)] text-[11px] font-medium text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.2)]">
                  {role === "teacher" ? "王" : "李"}
                </span>
                <ChevronDown size={12} className={cn("text-muted-foreground transition-transform duration-200", menu === "user" && "rotate-180")} />
              </button>
              {menu === "user" && (
                <div className="panel-in absolute right-0 top-full z-40 mt-1.5 w-56 overflow-hidden rounded-xl border border-border/80 bg-popover shadow-lg"
                  onClick={(e) => e.stopPropagation()}>
                  <div className="border-b border-border/70 px-3.5 py-3">
                    <div className="text-[13px] font-medium">{role === "teacher" ? "王立群" : "李思远"}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{role === "teacher" ? "任课教师 · 电子信息学院" : "2023 级 · 物联网工程"}</div>
                  </div>
                  <div className="p-1">
                    {[
                      { Icon: UserCircle2, label: role === "teacher" ? "我的授课班级" : "我的学习计划" },
                      { Icon: RotateCcw, label: "重置演示数据", hint: "清空本地改动" },
                      { Icon: LogOut, label: "退出登录" },
                    ].map((o) => (
                      <button key={o.label} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors hover:bg-accent">
                        <o.Icon size={13} className="text-muted-foreground" />
                        {o.label}
                        {o.hint && <span className="ml-auto text-[10.5px] text-muted-foreground">{o.hint}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/** 供各页计算满高布局：视口高度减去顶栏 */
export const fullHeight = () => `calc(100vh - ${TOPBAR_H}px)`;
