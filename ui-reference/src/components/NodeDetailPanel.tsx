import { CheckCircle2, Link2, Layers, Sparkles, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { EDGES, MASTERY_META, RELATION_META, nodeById, type Mastery } from "@/lib/mock";

interface Props {
  nodeId: string;
  onClose: () => void;
  onJump?: (id: string) => void;
  onMarkMastery?: (id: string, m: Mastery) => void;
  className?: string;
}

export function NodeDetailPanel({ nodeId, onClose, onJump, onMarkMastery, className }: Props) {
  const n = nodeById(nodeId);
  if (!n) return null;
  const rel = (type: keyof typeof RELATION_META) => EDGES.filter((e) => e.type === type && (e.from === nodeId || e.to === nodeId))
    .map((e) => ({ other: e.from === nodeId ? e.to : e.from, out: e.from === nodeId }));

  return (
    <aside className={cn("flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm", className)}>
      <div className="shrink-0 border-b border-border/70 px-4 py-3.5">
        <button onClick={onClose} className="absolute right-3 top-3 grid size-6.5 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent" aria-label="关闭">
          <X size={14} />
        </button>
        <div className="flex flex-wrap items-center gap-1.5 pr-8">
          <span className="rounded-md border border-border/80 bg-secondary/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{n.kind}</span>
          <span className="tnum rounded-md border border-border/80 bg-secondary/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{n.chapter}</span>
          <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
            style={{ background: `color-mix(in oklab, ${MASTERY_META[n.mastery].color} 11%, transparent)`, color: MASTERY_META[n.mastery].color }}>
            <span className="size-1.5 rounded-full" style={{ background: MASTERY_META[n.mastery].color }} />{MASTERY_META[n.mastery].label}
          </span>
        </div>
        <h3 className="mt-2 text-[15.5px] font-semibold leading-snug tracking-tight">{n.label}</h3>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-border/70 overflow-y-auto">
        <section className="px-4 py-3.5">
          <RowLabel icon={Sparkles}>AI 抽取置信度</RowLabel>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500 [transition-timing-function:var(--ease-soft)]" style={{ width: `${n.confidence * 100}%` }} />
            </div>
            <span className="tnum text-[12px] font-medium text-primary">{Math.round(n.confidence * 100)}%</span>
          </div>
        </section>

        <section className="px-4 py-3.5">
          <RowLabel icon={Layers}>定义</RowLabel>
          <p className="mt-1.5 text-[12.5px] leading-[1.75] text-muted-foreground">{n.definition}</p>
        </section>

        <section className="px-4 py-3.5">
          <RowLabel icon={Sparkles}>示例</RowLabel>
          <ul className="mt-1.5 space-y-1.5">
            {n.examples.map((ex, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed">
                <span className="mt-[8px] size-1 shrink-0 rounded-full bg-primary/40" />{ex}
              </li>
            ))}
          </ul>
        </section>

        {(Object.keys(RELATION_META) as (keyof typeof RELATION_META)[]).map((t) => {
          const list = rel(t);
          if (!list.length) return null;
          return (
            <section key={t} className="px-4 py-3.5">
              <RowLabel icon={Link2}>
                <span style={{ color: RELATION_META[t].color }}>{RELATION_META[t].label}</span>
                <span className="tnum ml-1 text-muted-foreground">{list.length}</span>
              </RowLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {list.map(({ other, out }) => (
                  <button key={other} onClick={() => onJump?.(other)}
                    className="flex items-center gap-1 rounded-lg border border-border/80 bg-card px-2 py-1 text-[12px] shadow-xs transition-all duration-200 [transition-timing-function:var(--ease-soft)] hover:-translate-y-px hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary hover:shadow-sm">
                    <span className="text-[10px] text-muted-foreground">{out ? "→" : "←"}</span>
                    {nodeById(other).label}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        <section className="px-4 py-3.5">
          <RowLabel icon={FileText}>相关资源</RowLabel>
          <div className="mt-1.5 space-y-0.5">
            {n.resources.map((r) => (
              <div key={r.name} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors hover:bg-accent/60">
                <span className="tnum shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.type}</span>
                <span className="truncate">{r.name}</span>
              </div>
            ))}
          </div>
        </section>

        {onMarkMastery && (
          <section className="px-4 py-3.5">
            <RowLabel icon={CheckCircle2}>标记我的掌握状态</RowLabel>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(Object.keys(MASTERY_META) as Mastery[]).map((m) => {
                const on = n.mastery === m;
                return (
                  <button key={m} onClick={() => onMarkMastery(n.id, m)}
                    className={cn("flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[12px] transition-all duration-200 [transition-timing-function:var(--ease-soft)]",
                      on ? "border-transparent font-medium text-white shadow-sm" : "border-border/80 text-muted-foreground hover:bg-accent")}
                    style={on ? { background: MASTERY_META[m].color } : undefined}>
                    {on && <CheckCircle2 size={11} />}{MASTERY_META[m].label}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function RowLabel({ icon: Icon, children }: { icon: typeof Layers; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
      <Icon size={12} className="shrink-0 opacity-70" />{children}
    </div>
  );
}
