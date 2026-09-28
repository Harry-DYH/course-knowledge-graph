import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, Search, X, RotateCcw, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { MASTERY_META, RELATION_META, type KEdge, type KNode } from "@/lib/mock";
import { isSeedGrid, relationLayout, spaciousGraph, NODE_W, NODE_H, relationshipPath } from "@/lib/graph-layout";

const W = 1200;
const LS_LAYOUT = "knowtrace:layout:v4";
const LS_GUIDE = "knowtrace:guide-seen:v1";

interface Props {
  nodes: KNode[];
  edges: KEdge[];
  layoutNodes?: KNode[];
  layoutEdges?: KEdge[];
  courseId?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  highlightPath?: string[];
  /** 教师编辑态：显示置信度徽标 */
  editable?: boolean;
  /** 节点被拖动后上报（0~100 坐标） */
  onNodeMove?: (id: string, x: number, y: number) => void;
  /** 提供则启用"恢复默认布局" */
  onResetLayout?: () => void;
  /** 空白处点击（编辑态用于放置新节点 / 普通态收起详情） */
  onCanvasBlank?: (x: number, y: number) => void;
  /** 连线工具下第二次点击节点时请求确认关系类型 */
  onRequestRelation?: (from: string, to: string) => void;
  connectMode?: boolean;
}

export function GraphCanvas({
  nodes, edges, layoutNodes=nodes, layoutEdges=edges, courseId = "default", selectedId, onSelect, highlightPath = [], editable,
  onNodeMove, onResetLayout, onCanvasBlank, onRequestRelation, connectMode,
}: Props) {
  const layout=useMemo(()=>spaciousGraph(layoutNodes,layoutEdges),[layoutNodes,layoutEdges]);
  const H=layout.height;
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);
  const [guide, setGuide] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const [frame,setFrame]=useState({width:1200,height:680});
  const viewportH=Math.max(H,W*frame.height/Math.max(1,frame.width));
  useEffect(()=>{const svg=svgRef.current;if(!svg)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;if(r.width&&r.height)setFrame({width:r.width,height:r.height});});observer.observe(svg);return()=>observer.disconnect();},[]);
  const pan = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const dragNode = useRef<{ id: string; moved: boolean; x?:number; y?:number } | null>(null);

  // 本地持久化的节点位置覆盖（学生端可拖动改布局）
  const [saved, setSaved] = useState<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${LS_LAYOUT}:${courseId}`);
      setSaved(raw ? JSON.parse(raw) : {});
      setGuide(!localStorage.getItem(LS_GUIDE));
    } catch { /* 隐私模式等场景静默降级 */ }
  }, [courseId]);

  const persist = (next: Record<string, { x: number; y: number }>) => {
    setSaved(next);
    try { localStorage.setItem(`${LS_LAYOUT}:${courseId}`, JSON.stringify(next)); } catch { /* ignore */ }
  };

  useEffect(()=>{setView({x:0,y:0,k:1});},[courseId]);
  const pos = useMemo(() => {
    const m = new Map<string, { cx: number; cy: number }>();
    const automatic = isSeedGrid(layoutNodes) ? layout.positions : null;
    nodes.forEach((n) => {
      const base = automatic?.get(n.id) ?? {x:n.x,y:n.y};
      const p = editable && dragNode.current?.id!==n.id ? base : saved[n.id] ?? base;
      m.set(n.id, { cx: (p.x / 100) * W, cy: (p.y / 100) * H });
    });
    return m;
  }, [nodes, edges, saved, editable,layout,H,layoutNodes]);

  const fitView=()=>{
    if(!pos.size){setView({x:0,y:0,k:1});return;}
    const values=[...pos.values()],minX=Math.min(...values.map(p=>p.cx))-NODE_W/2,maxX=Math.max(...values.map(p=>p.cx))+NODE_W/2,minY=Math.min(...values.map(p=>p.cy))-NODE_H/2,maxY=Math.max(...values.map(p=>p.cy))+NODE_H/2;
    const k=Math.min(2.6,(W-90)/(maxX-minX),(viewportH-340)/(maxY-minY));
    setView({x:W/2-(minX+maxX)/2*k,y:140-minY*k,k});
  };
  const visibleIds=nodes.map(n=>n.id).join('|');
  useEffect(()=>{fitView();},[courseId,visibleIds,frame.width,frame.height]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter((n) => n.label.toLowerCase().includes(q) || n.definition.toLowerCase().includes(q) || n.chapter.includes(q));
  }, [query, nodes]);

  const matched = useMemo(() => (candidates.length ? new Set(candidates.map((n) => n.id)) : null), [candidates]);

  const activeSet = useMemo(() => {
    const focus = hover ?? selectedId;
    if (!focus) return null;
    const s = new Set<string>([focus]);
    edges.forEach((e) => {
      if (e.from === focus) s.add(e.to);
      if (e.to === focus) s.add(e.from);
    });
    return s;
  }, [hover, selectedId, edges]);

  const pathSet = new Set(highlightPath);

  const zoom = (factor: number) => setView((v) => ({ ...v, k: Math.min(2.6, Math.max(0.45, v.k * factor)) }));

  /** 把某节点平移到画布中心并适度放大 */
  const centerOn = (id: string, k = 1.35) => {
    const p = pos.get(id);
    if (!p) return;
    setView({ k, x: W / 2 - p.cx * k, y: viewportH / 2 - p.cy * k });
  };

  const pickCandidate = (i: number) => {
    const n = candidates[i];
    if (!n) return;
    onSelect?.(n.id);
    centerOn(n.id);
    setQuery("");
  };

  // ── 指针交互：区分「拖节点」与「平移画布」───────────────
  const clientToSvg = (cx: number, cy: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const scale = Math.min(rect.width / W, rect.height / viewportH);
    const offX = (rect.width - W * scale) / 2;
    const offY = (rect.height - viewportH * scale) / 2;
    return { x: ((cx - rect.left - offX) / scale - view.x) / view.k, y: ((cy - rect.top - offY) / scale - view.y) / view.k };
  };

  const onPointerDownCanvas = (e: React.PointerEvent) => {
    if (dragNode.current) return;
    pan.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragNode.current) {
      const p = clientToSvg(e.clientX, e.clientY);
      const nx = Math.max(4, Math.min(96, (p.x / W) * 100));
      const ny = Math.max(4, Math.min(96, (p.y / H) * 100));
      dragNode.current.moved = true;
      dragNode.current.x = nx;
      dragNode.current.y = ny;
      const id = dragNode.current.id;
      setSaved((prev) => ({ ...prev, [id]: { x: nx, y: ny } }));
      return;
    }
    if (!pan.current) return;
    setView((v) => ({ ...v, x: pan.current!.ox + (e.clientX - pan.current!.sx) * (W / (svgRef.current?.getBoundingClientRect().width || W)), y: pan.current!.oy + (e.clientY - pan.current!.sy) * (viewportH / (svgRef.current?.getBoundingClientRect().height || viewportH)) }));
  };

  const endAll = () => {
    pan.current = null;
    const finished=dragNode.current;
    dragNode.current = null;
    if(finished?.moved&&finished.x!==undefined&&finished.y!==undefined){
      onNodeMove?.(finished.id,finished.x,finished.y);
      if(editable)setSaved((old)=>{const next={...old};delete next[finished.id];return next;});
      else persist({...saved,[finished.id]:{x:finished.x,y:finished.y}});
    }
  };

  const startNodeDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    dragNode.current = { id, moved: false };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const clickNode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (dragNode.current?.moved) return;
    if (connectMode && selectedId && selectedId !== id) {
      onRequestRelation?.(selectedId, id);
      return;
    }
    onSelect?.(id);
  };

  const dblNode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onSelect?.(id);
    centerOn(id, 1.7);
  };

  const onBlankClick = (e: React.MouseEvent) => {
    if (editable || onCanvasBlank) {
      const p = clientToSvg(e.clientX, e.clientY);
      onCanvasBlank?.(Math.max(4, Math.min(96, (p.x / W) * 100)), Math.max(4, Math.min(96, (p.y / H) * 100)));
    } else {
      onSelect?.(null);
    }
  };

  // ── 键盘可达：Tab 在节点间移动，Enter 打开，Esc 关闭 ──────
  const onKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(id);
      centerOn(id, 1.5);
    }
  };


  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-border/80 bg-paper graph-grid shadow-sm">
      {/* 搜索定位 */}
      <div className="absolute left-3 top-3 z-20 w-[210px] sm:w-[248px]">
        <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card/85 px-2.5 py-[7px] shadow-sm backdrop-blur-md transition-colors focus-within:border-primary/40 focus-within:shadow-md">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setFocusIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(candidates.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); pickCandidate(focusIdx); }
              else if (e.key === "Escape") setQuery("");
            }}
            placeholder="搜索知识点…" aria-label="搜索知识点"
            className="w-full min-w-0 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/70" />
          {query && <button onClick={() => setQuery("")} aria-label="清空搜索"><X size={12} className="text-muted-foreground" /></button>}
        </div>
        {candidates.length > 0 && (
          <div className="panel-in mt-1.5 max-h-[240px] overflow-y-auto rounded-xl border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur-md">
            <div className="px-2.5 py-1 text-[10.5px] text-muted-foreground">
              {candidates.length} 个结果 · ↑↓ 选择 · Enter 定位
            </div>
            {candidates.map((n, i) => (
              <button key={n.id} onMouseEnter={() => setFocusIdx(i)} onClick={() => pickCandidate(i)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors duration-150",
                  i === focusIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")}>
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: MASTERY_META[n.mastery].color }} />
                <span className="min-w-0 flex-1 truncate">{n.label}</span>
                <span className="shrink-0 text-[10.5px] text-muted-foreground">{n.chapter}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 视图控制 */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-border/80 bg-card/85 p-[3px] shadow-sm backdrop-blur-md">
        <button onClick={() => zoom(0.85)} className="grid size-7 place-items-center rounded-md transition-colors hover:bg-accent" aria-label="缩小"><Minus size={13} /></button>
        <span className="tnum w-9 text-center text-[11px] text-muted-foreground">{Math.round(view.k * 100)}%</span>
        <button onClick={() => zoom(1.18)} className="grid size-7 place-items-center rounded-md transition-colors hover:bg-accent" aria-label="放大"><Plus size={13} /></button>
        <div className="mx-0.5 h-4 w-px bg-border/80" />
        <button onClick={fitView} className="grid size-7 place-items-center rounded-md transition-colors hover:bg-accent" aria-label="重置视图"><RotateCcw size={12} /></button>
        <button onClick={() => setView({ x: 0, y: 0, k: 1.5 })} className="grid size-7 place-items-center rounded-md transition-colors hover:bg-accent" aria-label="放大查看"><Maximize2 size={12} /></button>
        {(onResetLayout || !editable) && (
          <>
            <div className="mx-0.5 h-4 w-px bg-border/80" />
            <button onClick={() => { onResetLayout?.(); fitView(); persist(editable?{}:Object.fromEntries(relationLayout(nodes,edges))); }}
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="清除本地保存的节点位置">
              自动布局
            </button>
          </>
        )}
      </div>

      {/* 图例 */}
      <div className="absolute bottom-3 left-3 z-10 hidden rounded-xl border border-border/80 bg-card/85 px-3 py-2.5 shadow-sm backdrop-blur-md sm:block">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">关系</div>
        <div className="space-y-1">
          {(Object.keys(RELATION_META) as (keyof typeof RELATION_META)[]).map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-[11px]">
              <svg width="22" height="6"><line x1="1" y1="3" x2="21" y2="3" stroke={RELATION_META[k].color} strokeOpacity="0.8" strokeWidth="1.6" strokeDasharray={k === "related" ? "3 3" : undefined} strokeLinecap="round" /></svg>
              <span className="text-muted-foreground">{RELATION_META[k].label}</span>
            </div>
          ))}
        </div>
        <div className="mb-1.5 mt-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">掌握</div>
        <div className="flex gap-2.5">
          {(Object.keys(MASTERY_META) as (keyof typeof MASTERY_META)[]).map((k) => (
            <div key={k} className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ background: MASTERY_META[k].color }} />{MASTERY_META[k].label}
            </div>
          ))}
        </div>
      </div>

      {/* 一次性引导（可关闭并记住） */}
      {guide && (
        <div className="panel-in absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/80 bg-card/90 py-1.5 pl-3 pr-1.5 text-[11.5px] shadow-md backdrop-blur-md">
          <Keyboard size={12} className="shrink-0 text-primary" />
          <span className="hidden text-muted-foreground sm:inline">拖动节点可调整布局 · 双击居中放大 · Tab 键逐个浏览</span>
          <span className="text-muted-foreground sm:hidden">拖动节点调整布局</span>
          <button onClick={() => { setGuide(false); try { localStorage.setItem(LS_GUIDE, "1"); } catch { /* ignore */ } }}
            className="ml-0.5 grid size-5 place-items-center rounded-full transition-colors hover:bg-accent" aria-label="关闭提示">
            <X size={11} />
          </button>
        </div>
      )}

      <svg ref={svgRef} viewBox={`0 0 ${W} ${viewportH}`}
        className="h-full w-full touch-none select-none"
        style={{ cursor: connectMode ? "crosshair" : pan.current ? "grabbing" : "default" }}
        onWheel={(e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 0.91); }}
        onPointerDown={onPointerDownCanvas} onPointerMove={onPointerMove} onPointerUp={endAll} onPointerLeave={endAll}
        onClick={onBlankClick}>
        <defs>
          {Object.entries(RELATION_META).map(([k, v]) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
              <path d="M 1 1.5 L 8.5 5 L 1 8.5" fill="none" stroke={v.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          ))}
          {/* 节点柔和投影：悬停/选中态更实 */}
          <filter id="node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="3" floodColor="oklch(0.35 0.05 258)" floodOpacity="0.14" />
          </filter>
          <filter id="node-shadow-strong" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="3" stdDeviation="7" floodColor="oklch(0.35 0.06 254)" floodOpacity="0.2" />
          </filter>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`} style={{ transition: pan.current || dragNode.current ? "none" : "transform .26s var(--ease-soft, ease-out)" }}>
          {/* 边 */}
          {edges.map((e, i) => {
            const a = pos.get(e.from); const b = pos.get(e.to);
            if (!a || !b) return null;
            const dim = activeSet ? !(activeSet.has(e.from) && activeSet.has(e.to)) : false;
            const onPath = pathSet.has(e.from) && pathSet.has(e.to);
            const active = activeSet && !dim;
            const color = RELATION_META[e.type].color;
            return (
              <path key={i} data-relation={e.type} d={relationshipPath(e,edges,a,b)} fill="none"
                opacity={dim ? 0.28 : 1}
                stroke={color} strokeOpacity={onPath ? 1 : active ? 1 : 0.8}
                strokeWidth={onPath ? 3.5 : active ? 3 : 2.2} strokeLinecap="round"
                strokeDasharray={e.type === "related" ? "5 5" : undefined}
                markerEnd={e.type==='related'?undefined:`url(#arrow-${e.type})`} className={onPath ? "edge-flow" : undefined}
                style={{ transition: "opacity .22s var(--ease-soft, ease-out), stroke-width .22s var(--ease-soft, ease-out)" }}><title>{RELATION_META[e.type].label}</title></path>
            );
          })}

          {/* 节点 */}
          {nodes.map((n) => {
            const p = pos.get(n.id)!;
            const r = 42;
            const isSel = selectedId === n.id;
            const isHover = hover === n.id;
            const dim = (activeSet && !activeSet.has(n.id)) || (matched && !matched.has(n.id));
            const inPath = pathSet.has(n.id);
            const mc = MASTERY_META[n.mastery].color;
            return (
              <g key={n.id} transform={`translate(${p.cx} ${p.cy})`} opacity={dim ? 0.42 : 1}
                tabIndex={0} role="button" aria-label={`${n.label}，${n.kind}${n.chapter ? `，${n.chapter}` : ""}`}
                className="cursor-pointer outline-none focus-visible:opacity-100"
                style={{ transition: "opacity .22s var(--ease-soft, ease-out)" }}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                onPointerDown={(e) => startNodeDrag(e, n.id)}
                onClick={(e) => clickNode(e, n.id)} onDoubleClick={(e) => dblNode(e, n.id)}
                onKeyDown={(e) => onKeyDown(e, n.id)}>
                <title>{n.label} · {n.kind}{n.chapter?` · ${n.chapter}`:""}</title>
                {(isSel||inPath)&&<circle r="51" fill={inPath?"var(--primary)":mc} className="node-pulse"/>}
                <circle r="46" fill="none" stroke={mc} strokeWidth="1" opacity={isHover?0.5:0}/>
                <circle data-node-circle r="42" fill="var(--card)" stroke={isSel?"var(--primary)":mc} strokeWidth={isSel?2.5:1.5} filter={isSel||isHover?"url(#node-shadow-strong)":"url(#node-shadow)"}/>
                {isSel&&<circle r="38" fill="none" stroke="var(--primary)" strokeOpacity="0.35"/>}
                <text textAnchor="middle" dy="0.35em" fontSize="22" fontWeight="600" fill="var(--ink)" stroke="var(--card)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">{n.label.length>7?n.label.slice(0,7)+"…":n.label}</text>
                <text textAnchor="middle" y="61" fontSize="12" fill="var(--muted-foreground)" stroke="var(--paper)" strokeWidth="3" paintOrder="stroke">{n.kind}</text>
                {editable && n.confidence < 1 && (
                  <g transform={`translate(${r - 3} ${-r + 2})`} pointerEvents="none">
                    <rect x="-13" y="-7.5" width="26" height="15" rx="7.5"
                      fill={n.confidence > 0.85 ? "var(--mastery-mastered)" : n.confidence > 0.75 ? "var(--chart-4)" : "var(--destructive)"} />
                    <text textAnchor="middle" y="3.5" fontSize="9" fontWeight={600} fill="#fff" stroke="none">{Math.round(n.confidence * 100)}</text>
                  </g>
                )}
                {inPath && (
                  <g transform={`translate(${-r - 1} ${-r - 1})`} pointerEvents="none">
                    <circle r="8.5" fill="var(--primary)" stroke="var(--card)" strokeWidth="1.5" />
                    <text textAnchor="middle" y="3.2" fontSize="9.5" fontWeight={700} fill="#fff" stroke="none">{pathIndex(pathSet, n.id)}</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* 悬停摘要 */}
      {hover && !selectedId && (
        <div className="panel-in pointer-events-none absolute bottom-3 right-3 z-10 max-w-[240px] rounded-xl border border-border/80 bg-card/90 p-3 shadow-md backdrop-blur-md">
           <div className="text-[12.5px] font-medium">{nodes.find((n) => n.id === hover)?.label}</div>
           <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{nodes.find((n) => n.id === hover)?.definition}</div>
        </div>
      )}
    </div>
  );
}

/** 路径序号：按集合插入顺序给出 1-based 位次 */
function pathIndex(set: Set<string>, id: string) {
  let i = 0;
  for (const v of set) { i++; if (v === id) return i; }
  return i;
}
