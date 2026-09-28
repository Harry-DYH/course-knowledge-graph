const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('../ui-reference/node_modules/typescript');
const source=fs.readFileSync(path.join(__dirname,'../ui-reference/src/lib/graph-layout.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sandbox={exports:{},Map,Set,Math};vm.runInNewContext(compiled,sandbox);const layout=sandbox.exports;
const reports=[];
for(const title of ['离散数学','软件架构基础']) {
 const graph=JSON.parse(fs.readFileSync(path.join(__dirname,'../local-logs/'+title+'-layout.json'),'utf8'));
 const nodes=graph.points.map(p=>({...p,id:p.uid})),edges=graph.edges.map(e=>({from:e.source,to:e.target,type:e.kind==='PREREQUISITE_OF'?'prereq':e.kind==='CONTAINS'?'contain':'related'}));
 const result=layout.spaciousGraph(nodes,edges);assert.equal(result.positions.size,nodes.length);
 assert.equal(JSON.stringify([...result.positions]),JSON.stringify([...layout.spaciousGraph([...nodes].reverse(),edges).positions]));
 const points=[...result.positions].map(([id,p])=>({id,cx:p.x/100*result.width,cy:p.y/100*result.height}));
 for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++) assert.ok(Math.abs(points[a].cx-points[b].cx)>=layout.NODE_W+12||Math.abs(points[a].cy-points[b].cy)>=layout.NODE_H+12,'card overlap');

 const edgePaths=edges.map(e=>layout.relationshipPath(e,edges,points.find(p=>p.id===e.from),points.find(p=>p.id===e.to)));
 assert.equal(new Set(edgePaths).size,edgePaths.length,'parallel edge overlap');
 reports.push({course:title,nodes:nodes.length,edges:edges.length,labelOverlaps:0,parallelPathsUnique:true,deterministic:true});
}
assert.equal(layout.spaciousGraph([],[]).positions.size,0);
assert.equal(layout.spaciousGraph([{id:'a',label:'a'},{id:'b',label:'b'}],[{from:'a',to:'b',type:'prereq'},{from:'b',to:'a',type:'prereq'}]).positions.size,2);
fs.writeFileSync(path.join(__dirname,'图谱间距验收.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
