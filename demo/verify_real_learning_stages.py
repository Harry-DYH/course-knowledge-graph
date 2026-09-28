import json, urllib.request
from pathlib import Path
base='http://127.0.0.1:8000/course_workspace/courses/'
reports=[]
for cid in ['fee006f7-90c3-4cce-a43c-ece545fcd251','1a517ecc-8f5d-430a-ba9e-24408d4c0330']:
 def get(s):
  with urllib.request.urlopen(base+cid+s) as r:return json.load(r)
 g=get('/graph');r=get('/next/foundation-stage-reader')
 assert sum(s['total'] for s in r['stages'])==len(g['points'])
 assert all(x['depth']==0 for x in r['steps'])
 levels=[s['level'] for s in r['stages'] if s['level'] is not None]
 assert levels==sorted(levels)
 reports.append({'course':g['course']['title'],'points':len(g['points']),'stages':len(levels),'recommended':[x['label'] for x in r['steps']]})
Path('demo/真实课程学习阶段验收.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(reports,ensure_ascii=False))
