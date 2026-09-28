import urllib.request,json
from pathlib import Path
base='http://127.0.0.1:8000/course_workspace';cid=Path('local-logs/layer-test-course.txt').read_text();prefix='/courses/'+cid
checks=[]
def call(path,data=None,method=None):
 req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method=method)
 return json.load(urllib.request.urlopen(req,timeout=240))
g=call(prefix+'/complete-content',{},'POST');assert len(g['chapters'])==2 and len({p['kind'] for p in g['points']})==5;checks.append('双章节与五类实际抽取')
raw=Path('demo/分层补齐_双章节样例.md').read_text(encoding='utf-8');assert all(not p['example'] or p['example'] in raw for p in g['points']);assert all(not p['resource'] or p['resource'] in raw for p in g['points']);checks.append('全部示例资源原文逐字核对')
again=call(prefix+'/complete-content',{},'POST');assert again['course']['revision']==g['course']['revision'];checks.append('重复补全不重复写入')
temp=call('/courses',{'title':'分层接口临时验收'});tid=temp['uid'];tp='/courses/'+tid
try:
 imported=call(tp+'/import',{'document':'分层补齐_双章节样例.md'})
 p=imported['points'][0];p['definition']='教师修订：此定义必须保留';p['chapter']='教师指定章节';p['chapters']=['教师指定章节']
 saved=call(tp+'/graph',{'revision':imported['course']['revision'],'points':imported['points'],'edges':imported['edges']},'PUT')
 filled=call(tp+'/complete-content',{},'POST');same=next(x for x in filled['points'] if x['uid']==p['uid']);assert same['definition']==p['definition'] and same['chapter']==p['chapter'];checks.append('自动补全保留教师定义与章节')
 nodes=[dict(uid=tid+':manual:'+x,label=x,kind='概念',definition='临时知识点',example='',resource='',x=20+i*15,y=50) for i,x in enumerate('ABCD')];ids={n['label']:n['uid'] for n in nodes};edges=[dict(source=ids[a],target=ids[b],kind='PREREQUISITE_OF') for a,b in [('A','C'),('B','C'),('A','D')]]
 call(tp+'/graph',{'revision':filled['course']['revision'],'points':nodes,'edges':edges},'PUT')
 n=call(tp+'/next/learner-one');assert {s['label'] for s in n['steps']}=={'A','B'}
 call(tp+'/progress',{'learner':'learner-one','point_uid':ids['A'],'mastered':True},'PUT');assert {s['label'] for s in call(tp+'/next/learner-one')['steps']}=={'B','D'};assert {s['label'] for s in call(tp+'/next/learner-two')['steps']}=={'A','B'};checks.append('推荐解锁更新及学习者隔离')
 assert call(prefix+'/next/learner-one')['remaining']==10;checks.append('推荐课程隔离')
finally:call(tp,method='DELETE')
Path('demo/分层补齐接口验收.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':len(checks)}))
