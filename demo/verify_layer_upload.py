import urllib.request,json,time
from pathlib import Path
base='http://127.0.0.1:8000/course_workspace'
def call(path,data=None,method=None):
 req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method=method)
 return json.load(urllib.request.urlopen(req,timeout=240))
c=call('/courses',{'title':'分层功能验收示范'});cid=c['uid'];Path('local-logs/layer-test-course.txt').write_text(cid)
text='''# 第一章 集合基础
集合是具有确定性、互异性和无序性的对象全体。示例：集合 A={1,2,3}。学习资源：《离散数学》集合章节。
并集公式：A∪B={x|x∈A 或 x∈B}。示例：{1,2}∪{2,3}={1,2,3}。
德摩根定理：在同一全集中，(A∪B)ᶜ=Aᶜ∩Bᶜ。
集合枚举方法：逐一列出元素，然后检查是否有重复元素。示例：把一周工作日列为集合。
集合应用：用集合表示选课学生名单，交集表示同时选两门课的学生。
先学习集合，再学习并集公式、德摩根定理、集合枚举方法和集合应用。
# 第二章 函数基础
函数是从定义域到值域的单值映射。示例：每位学生映射到唯一学号。学习资源：《离散数学》函数章节。
复合函数公式：(g∘f)(x)=g(f(x))。示例：f(x)=x+1、g(x)=2x，则复合结果为2(x+1)。
复合函数结合律定理：函数满足可复合条件时，h∘(g∘f)=(h∘g)∘f。
函数求值方法：先代入内层函数，再计算外层函数。示例：先计算f(2)，再计算g(f(2))。
函数应用：用函数表示摄氏温度到华氏温度的转换。
先学习函数，再学习复合函数公式、复合函数结合律定理、函数求值方法和函数应用。
'''
filename='分层补齐_双章节样例.md';Path('demo/'+filename).write_text(text,encoding='utf-8')
boundary='LayerUploadBoundary';payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: text/markdown\r\n\r\n').encode()+text.encode()+f'\r\n--{boundary}--\r\n'.encode()
req=urllib.request.Request(base+f'/courses/{cid}/upload',data=payload,headers={'Content-Type':f'multipart/form-data; boundary={boundary}'},method='POST');t=time.time()
try:
 g=json.load(urllib.request.urlopen(req,timeout=300))['graph'];print(json.dumps({'course':cid,'seconds':round(time.time()-t,1),'points':len(g['points']),'kinds':list(set(p['kind'] for p in g['points'])),'chapters':g['chapters']},ensure_ascii=False));Path('demo/分层补齐真实上传结果.json').write_text(json.dumps(g,ensure_ascii=False,indent=2),encoding='utf-8')
except urllib.error.HTTPError as e:print(e.code,e.read().decode());raise
