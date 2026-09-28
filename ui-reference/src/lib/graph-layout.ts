import type { KNode, KEdge } from "./mock";
export const GRAPH_W=1200;
export const NODE_W=150;
export const NODE_H=120;
/** Only the entire untouched upstream grid is eligible for automatic placement. */
export function isSeedGrid(nodes: KNode[]) {
 if(nodes.length<2)return false;
 const cols=Math.max(2,Math.ceil(Math.sqrt(nodes.length))),rows=Math.max(2,Math.ceil(nodes.length/cols));
 const aligned=(v:number,n:number)=>Array.from({length:n},(_,i)=>8+84*i/(n-1)).some(x=>Math.abs(x-v)<0.001);
 return nodes.every(n=>aligned(n.x,cols)&&aligned(n.y,rows))&&new Set(nodes.map(n=>`${n.x}:${n.y}`)).size===nodes.length;
}
/** Preserve the original spring layout, with extra space for circular labels. */
export function spaciousGraph(nodes:KNode[],edges:KEdge[]) {
 const width=GRAPH_W,height=Math.max(820,Math.ceil(Math.sqrt(nodes.length))*155);
 const ordered=[...nodes].sort((a,b)=>a.id.localeCompare(b.id));
 const points=ordered.map((n,i)=>({id:n.id,x:50+32*Math.cos(i*2*Math.PI/ordered.length),y:50+32*Math.sin(i*2*Math.PI/ordered.length)}));
 const index=new Map(points.map((p,i)=>[p.id,i]));
 const links=edges.flatMap(e=>{const a=index.get(e.from),b=index.get(e.to);return a!==undefined&&b!==undefined?[[a,b] as const]:[]});
 const ideal=Math.max(17,76/Math.sqrt(Math.max(1,points.length)));
 for(let step=0;step<300;step++){
  const forces=points.map(()=>({x:0,y:0}));
  for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++){
   const dx=points[a].x-points[b].x,dy=points[a].y-points[b].y,d=Math.max(0.1,Math.hypot(dx,dy)),push=ideal*ideal/d;
   forces[a].x+=dx/d*push;forces[a].y+=dy/d*push;forces[b].x-=dx/d*push;forces[b].y-=dy/d*push;
  }
  for(const [a,b] of links){const dx=points[b].x-points[a].x,dy=points[b].y-points[a].y,d=Math.max(0.1,Math.hypot(dx,dy)),pull=d*d/ideal*0.45;forces[a].x+=dx/d*pull;forces[a].y+=dy/d*pull;forces[b].x-=dx/d*pull;forces[b].y-=dy/d*pull;}
  const temperature=2*(1-step/300)+0.03;
  points.forEach((p,i)=>{const f=forces[i];f.x+=(50-p.x)*0.5;f.y+=(50-p.y)*0.5;const d=Math.max(0.1,Math.hypot(f.x,f.y));p.x+=f.x/d*Math.min(d,temperature);p.y+=f.y/d*Math.min(d,temperature)});
 }
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys),spanX=Math.max(...xs)-minX,spanY=Math.max(...ys)-minY;
 points.forEach(p=>{p.x=spanX?140+(p.x-minX)/spanX*(width-280):width/2;p.y=spanY?110+(p.y-minY)/spanY*(height-230):height/2});
 // Resolve only remaining close pairs, keeping the spring arrangement recognizable.
 for(let step=0;step<120;step++) {
  let moved=false;
  for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++){
   const dx=points[b].x-points[a].x,dy=points[b].y-points[a].y,px=NODE_W+20-Math.abs(dx),py=NODE_H+18-Math.abs(dy);
   if(px<=0||py<=0)continue;
   moved=true;
   if(px<py){const shift=(px+0.1)/2*(dx>=0?1:-1);points[a].x-=shift;points[b].x+=shift;}else{const shift=(py+0.1)/2*(dy>=0?1:-1);points[a].y-=shift;points[b].y+=shift;}
  }
  if(!moved)break;
 }
 return {positions:new Map(points.map(p=>[p.id,{x:p.x/width*100,y:p.y/height*100}])),width,height};
}
export function relationLayout(nodes:KNode[],edges:KEdge[]){return spaciousGraph(nodes,edges).positions}
export function labelLines(label:string) {
 const chars=Array.from(label),lines:string[]=[];let line='',units=0;
 for(const char of chars){const width=/[\u0000-\u00ff]/.test(char)?0.55:1;if(units+width>5&&line){lines.push(line);line='';units=0;}line+=char;units+=width;}
 if(line)lines.push(line);
 return lines.length>2?[lines[0],lines[1].slice(0,-1)+'…']:lines;
}
/** Parallel types and reverse edges occupy separate lanes. Clip tangent to card bounds. */
export function relationshipPath(edge:KEdge,edges:KEdge[],a:{cx:number;cy:number},b:{cx:number;cy:number}) {
 const peers=edges.filter(e=>(e.from===edge.from&&e.to===edge.to)||(e.from===edge.to&&e.to===edge.from)).sort((x,y)=>(x.from+x.to+x.type).localeCompare(y.from+y.to+y.type));
 const lane=peers.indexOf(edge)-(peers.length-1)/2,canonical=edge.from<edge.to?1:-1;
 const dx=b.cx-a.cx,dy=b.cy-a.cy,d=Math.max(1,Math.hypot(dx,dy));
 const offset=lane*34*canonical;
 const mx=(a.cx+b.cx)/2-dy/d*offset,my=(a.cy+b.cy)/2+dx/d*offset;
 const boundary=(p:{cx:number;cy:number},tx:number,ty:number,padding:number)=>{const x=tx-p.cx,y=ty-p.cy,d=Math.max(1,Math.hypot(x,y));return {x:p.cx+x/d*(42+padding),y:p.cy+y/d*(42+padding)}};
 const start=boundary(a,mx,my,3),end=boundary(b,mx,my,edge.type==='related'?3:9);
 return `M ${start.x} ${start.y} Q ${mx} ${my} ${end.x} ${end.y}`;
}
