from pathlib import Path
import sys,json,time
sys.path.insert(0,str(Path('backend').resolve()))
from src.course_learning import next_points,target_path
checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name)
def points(ids):return [{'uid':x,'label':x} for x in ids]
def edges(pairs):return [{'source':a,'target':b,'kind':'PREREQUISITE_OF'} for a,b in pairs]
p=points('ABDZ');e=edges([('A','D'),('D','Z'),('B','Z')])
r=target_path(p,e,[],'Z');check('多分支目标先基础后进阶',[x['uid'] for x in r['steps']]==list('ABDZ'));check('目标路线先修状态',[x['ready'] for x in r['steps']]==[True,True,False,False])
r=next_points(points('ABDEF'),edges([('A','D'),('D','E'),('E','F')]),['A']);check('基础层优先于可解锁的进阶点',[x['uid'] for x in r['steps']]==['B','D'])
e=edges([('A','B'),('A','C'),('B','D'),('C','D')]);r=next_points(points('ABCD'),e,[]);check('共同后继去重覆盖',r['steps'][0]['foundation_for']==3);check('立即解锁点明示',{x['uid'] for x in r['steps'][0]['unlock_points']}=={'B','C'})
r=next_points(points('ABCD'),e,['A','B']);check('合取先修未全部满足不推荐D',[x['uid'] for x in r['steps']]==['C']);r=next_points(points('ABCD'),e,['A','B','C']);check('掌握后解锁进阶D',r['steps'][0]['uid']=='D' and r['steps'][0]['depth']==2)
r=next_points(points('ABCD'),edges([('A','B'),('B','A'),('B','C')]),[]);check('环及下游隔离',r['has_cycle'] and [x['uid'] for x in r['steps']]==['D'] and len(next(s for s in r['stages'] if s['level'] is None)['points'])==3)
try:target_path(points('AB'),edges([('A','B'),('B','A')]),[],'A');raise AssertionError('cycle accepted')
except ValueError:checks.append('循环目标路线拒绝')
check('零边不伪造层级',not next_points(points('AB'),[],[])['has_prerequisites']);check('空图完成',next_points([],[],[])['state']=='completed');check('已掌握目标跳过',target_path(p,edges([]),['Z'],'Z')['already_mastered'])
ps=points([str(i) for i in range(100)]);es=edges([(str(i),str(i+1)) for i in range(99)]);t=time.perf_counter();r=next_points(ps,es,[]);duration=time.perf_counter()-t;check('百点先修阶段计算',len(r['stages'])==100 and r['steps'][0]['foundation_for']==99 and duration<3)
Path('demo/学习路径分层算法验收.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'hundred_points_seconds':duration},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':len(checks),'hundred_points_seconds':duration}))
