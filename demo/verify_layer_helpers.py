from pathlib import Path
import sys,tempfile,json
sys.path.insert(0,str(Path('backend').resolve()))
from src.course_content import *
checks=[]
def ok(name,condition):
 assert condition,name
 checks.append(name)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'text.txt';p.write_bytes('第一章 集合\n集合的定义'.encode('gbk'));ok('GBK严格读取',read_text_file(p)[0].startswith('第一章'))
 p.write_bytes(b'\xff');
 try:read_text_file(p);raise AssertionError('invalid accepted')
 except ValueError:checks.append('非法字节拒绝')
parts=split_chapters(['页眉\n第一章 集合\n公式 A ∪ B\n1','页眉\n第二章 函数\nf(x)=x²\n2','页眉\n继续函数\n3'])
ok('分章与公式保留',len(parts)==2 and '∪' in parts[0]['text'] and 'x²' in parts[1]['text'] and '页眉' not in parts[0]['text'])
pts=[dict(uid=x,label=x) for x in 'ABCD'];edges=[dict(source=a,target=b,kind='PREREQUISITE_OF') for a,b in [('A','C'),('B','C'),('A','D')]]
ok('初始推荐',set(x['uid'] for x in next_points(pts,edges,[])['steps'])=={'A','B'})
ok('合取先修',set(x['uid'] for x in next_points(pts,edges,['A'])['steps'])=={'B','D'})
ok('掌握后的解锁',set(x['uid'] for x in next_points(pts,edges,['A','B'])['steps'])=={'C','D'})
ok('全部完成',next_points(pts,edges,list('ABCD'))['state']=='completed')
cycle=[dict(source=a,target=b,kind='PREREQUISITE_OF') for a,b in [('A','B'),('B','A')]]
ok('循环提示',next_points(pts[:2],cycle,[])['state']=='blocked')
v=validate_enrichment([dict(uid='A',kind='概念',evidence='集合',definition='定义',example='编造',resource='https://fake.test')],[dict(uid='A',text='集合的概念')]);ok('无依据示例资源不保存',not v[0]['example'] and not v[0]['resource'])
Path('demo/分层补齐纯逻辑验收.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(checks,ensure_ascii=False))
