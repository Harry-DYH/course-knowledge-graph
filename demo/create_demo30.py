"""Create a reusable, curated 30-point demonstration via the existing course API."""
import json, urllib.request
from pathlib import Path
BASE='http://127.0.0.1:8000/course_workspace'
def call(method,path,data=None):
 req=urllib.request.Request(BASE+path,data=None if data is None else json.dumps(data,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'},method=method)
 with urllib.request.urlopen(req,timeout=60) as response:return json.load(response)
rows=[
('编程基础','基础准备','概念','程序通过变量、控制流程与表达式描述计算过程。','用条件判断验证输入是否为空。'),
('需求分析','基础准备','方法','识别用户目标、使用场景及系统约束，形成可验证的需求。','明确课程系统需要支持知识图谱查询和学习进度保存。'),
('数据库基础','基础准备','概念','数据库以结构化方式持久化数据，并支持查询与更新。','将课程、知识点和学习记录保存到数据库。'),
('网络基础','基础准备','概念','理解客户端与服务端通过网络地址、端口和协议交换数据。','浏览器通过本机端口访问后台服务。'),
('函数','需求与程序结构','概念','函数将一段可复用的操作封装为具有输入和输出的单元。','将先修条件检查封装成独立函数。'),
('数据结构','需求与程序结构','概念','数据结构规定数据的组织方式及访问操作。','使用邻接表存储知识点之间的先修关系。'),
('功能需求','需求与程序结构','概念','功能需求描述系统必须提供的具体行为和服务。','教师可以创建、修改和删除知识点。'),
('非功能需求','需求与程序结构','概念','非功能需求描述性能、可靠性、安全性等质量要求。','学习路径查询在规定规模下及时返回。'),
('SQL','需求与程序结构','工具','SQL 是用于关系数据库查询和数据操作的语言。','通过 SELECT 查询某个学生的学习记录。'),
('HTTP','需求与程序结构','协议','HTTP 规定客户端与服务端请求、响应及状态码的语义。','POST 提交新的课程，GET 获取课程信息。'),
('模块化','系统设计','方法','模块化按职责划分程序，并通过明确接口协作。','将图谱、问答和学习路径拆为独立模块。'),
('用例建模','系统设计','方法','用例以参与者与系统交互描述完成目标的过程。','学生选择课程、计算路线并标记掌握。'),
('性能指标','系统设计','指标','性能指标以响应时间、吞吐量和资源使用等量化系统表现。','记录路径接口的耗时和处理知识点数量。'),
('接口设计','系统设计','方法','接口设计明确调用者和被调用者之间的数据、行为及错误约定。','路径接口返回有序步骤、缺少先修和当前可学状态。'),
('数据建模','系统设计','方法','数据建模定义实体、属性、关系及一致性约束。','定义课程与知识点的一对多关系及先修边。'),
('高内聚','架构与数据优化','原则','高内聚要求模块内部职责紧密相关，围绕明确目标组织。','学习路径模块只负责依赖计算与推荐。'),
('低耦合','架构与数据优化','原则','低耦合通过稳定接口减少模块对彼此内部实现的依赖。','前端通过公开 API 获取路线，而不直接读取数据库。'),
('分层架构','架构与数据优化','架构','分层架构将系统职责划分为表现、业务和数据访问等层。','页面展示、推荐算法和数据库查询分别放在对应层。'),
('REST接口','架构与数据优化','方法','REST 接口以资源和统一操作语义组织服务访问。','用 GET /courses 获取课程资源集合。'),
('索引优化','架构与数据优化','方法','索引优化根据查询条件建立合适的索引以减少扫描成本。','为经常查询的课程标识建立索引。'),
('依赖注入','工程实现','方法','依赖注入由外部提供组件所需依赖，减少内部固定绑定。','为推荐服务注入可替换的知识图谱仓库。'),
('组件设计','工程实现','方法','组件设计把职责明确、接口稳定的模块组合成可协作单元。','图谱组件接收节点与关系，并输出知识点选择事件。'),
('缓存设计','工程实现','方法','缓存保存可复用结果，并规定失效策略以平衡速度和一致性。','按课程修订号缓存图谱，修改后使旧缓存失效。'),
('事务管理','工程实现','机制','事务管理保证关联的数据操作满足一致性要求。','修改节点与关系在同一事务中提交，失败时回滚。'),
('身份认证','工程实现','机制','身份认证验证访问者身份，并为后续访问控制提供依据。','教师登录后才可进入教师编辑入口。'),
('单元测试','测试与交付','方法','单元测试独立验证函数或模块的行为与边界情况。','验证存在多个先修时必须全部掌握才能推荐目标。'),
('集成测试','测试与交付','方法','集成测试验证多个组件协作时的数据传递和行为。','保存掌握状态后检查推荐接口与页面同步更新。'),
('日志监控','测试与交付','方法','日志监控收集运行事件和指标，用于发现故障与定位原因。','记录课程解析失败的任务标识和错误信息。'),
('容器部署','测试与交付','工具','容器部署将运行环境及应用打包，并通过配置启动服务。','分别启动前端、后端与数据库容器并配置健康检查。'),
('系统可维护性','测试与交付','质量属性','可维护性衡量系统理解、修改、验证和持续演进的便利程度。','通过职责分离、自动测试和运行日志降低修改成本。')]
prereqs=[(0,4),(0,5),(1,6),(1,7),(2,8),(3,9),(4,10),(5,10),(6,11),(7,12),(4,13),(9,13),(2,14),(8,14),(10,15),(10,16),(11,17),(15,17),(16,17),(9,18),(13,18),(8,19),(14,19),(16,20),(15,21),(16,21),(13,21),(12,22),(14,22),(14,23),(8,23),(9,24),(13,24),(4,25),(10,25),(18,26),(23,26),(25,26),(12,27),(17,27),(3,28),(17,28),(27,28),(15,29),(16,29),(26,29),(27,29)]
related=[(19,22),(20,21),(24,23),(22,12),(28,26),(11,6)]
title='软件架构进阶演示（30个知识点）'
existing=next((c for c in call('GET','/courses') if c['title']==title),None)
course=existing or call('POST','/courses',{'title':title});cid=course['uid']
assert not existing, '演示课程已存在，请先查看现有课程，避免覆盖修改'
points=[{'uid':f'{cid}:manual:demo30-{i:02d}','label':label,'chapter':chapter,'chapters':[chapter],'kind':kind,'definition':definition,'example':example,'resource':'人工编写的展示样例；非教材原文','x':50,'y':50} for i,(label,chapter,kind,definition,example) in enumerate(rows)]
edges=[{'source':points[a]['uid'],'target':points[b]['uid'],'kind':kind} for kind,pairs in [('PREREQUISITE_OF',prereqs),('RELATED_TO',related)] for a,b in pairs]
payload={'revision':course['revision'],'points':points,'edges':edges}
graph=call('PUT',f'/courses/{cid}/graph',payload)
rec=call('GET',f'/courses/{cid}/next/demo30-check')
path=call('GET',f'/courses/{cid}/path/demo30-check/{points[29]["uid"]}')
assert len(graph['points'])==30 and len(graph['edges'])==53
assert not rec['has_cycle'] and all(s['depth']==0 for s in rec['steps'])
assert [s['depth'] for s in path['steps']]==sorted(s['depth'] for s in path['steps'])
Path('demo/软件架构进阶_30知识点.json').write_text(json.dumps(graph,ensure_ascii=False,indent=2),encoding='utf-8')
text=['# 软件架构进阶：30 个知识点展示样例','人工编写的演示数据，用于观察布局和学习路径。非教材抽取结果。','']
for label,chapter,kind,definition,example in rows:text.extend([f'## {chapter} / {label}（{kind}）',definition,'例子：'+example,''])
text.append('## 先修关系')
text.extend(f'{rows[a][0]} → {rows[b][0]}' for a,b in prereqs)
Path('demo/软件架构进阶_30知识点.txt').write_text('\n'.join(text),encoding='utf-8')
report={'course':cid,'points':30,'edges':len(edges),'prerequisites':len(prereqs),'stages':len(rec['stages']),'recommended':[s['label'] for s in rec['steps']],'target':'系统可维护性','path':[s['label'] for s in path['steps']]}
Path('demo/30知识点演示验收.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
