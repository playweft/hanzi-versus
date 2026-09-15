"""Build explicit editor-selected lines. Requires opencc-python-reimplemented."""
import json,re,sys,hashlib,subprocess
from pathlib import Path
from collections import defaultdict
from opencc import OpenCC
base=Path(__file__).resolve().parents[1]; root=Path(sys.argv[1]); convert=OpenCC('t2s').convert
selection=[]
for n,line in enumerate((base/'scripts/poetry-selection.txt').read_text().splitlines(),1):
 if line and not line.startswith('#'): selection.append((n,*line.split('|')))
authors={x[1] for x in selection}; index=defaultdict(list)
def flatten(items):
 for x in items:
  if isinstance(x,list): yield from flatten(x)
  elif isinstance(x,str): yield x

for folder,pattern,kind in [('全唐诗','poet.tang.*.json','唐诗'),('全唐诗','poet.song.*.json','宋诗'),('宋词','ci.song.*.json','宋词')]:
 for path in sorted((root/folder).glob(pattern)):
  for i,p in enumerate(json.loads(path.read_text())):
   author=convert(p['author'])
   if author not in authors: continue
   paragraphs=[convert(x) for x in flatten(p['paragraphs'])]
   lines=[x for paragraph in paragraphs for x in re.split('[，。！？；：、,.!?;:]',paragraph) if re.fullmatch('[\u3400-\u9fff]{5}|[\u3400-\u9fff]{7}',x)]
   index[author].append(dict(title=convert(p.get('title',p.get('rhythmic',''))),lines=lines,body=''.join(paragraphs),kind=kind,source=f'{folder}/{path.name}',sourceIndex=i))
for name in ['tangshisanbaishou','qianjiashi']:
 document=json.loads((root/'蒙学'/f'{name}.json').read_text())
 for sectionIndex,section in enumerate(document['content']):
  for i,p in enumerate(section['content']):
   author=re.sub(r'（.*?）|\(.*?\)','',convert(p['author']))
   if author not in authors: continue
   paragraphs=[re.sub(r'（.*?）|\(.*?\)','',convert(x)) for x in flatten(p['paragraphs'])]
   lines=[x for paragraph in paragraphs for x in re.split('[，。！？；：、,.!?;:]',paragraph) if re.fullmatch('[\u3400-\u9fff]{5}|[\u3400-\u9fff]{7}',x)]
   index[author].append(dict(title=convert(p['chapter']),lines=lines,body=''.join(paragraphs),kind='唐诗' if name=='tangshisanbaishou' or '唐' in p['author'] else '宋诗',source=f'蒙学/{name}.json',sourceIndex=f'content/{sectionIndex}/content/{i}'))
result=[];issues=[]
for n,author,title,anchor,chosen in selection:
 candidates=[p for p in index[author] if anchor in p['body']]
 # Prefer the version covering the most explicitly selected lines, then shortest work.
 explicit=chosen.split('/') if chosen!='all' else []
 candidates.sort(key=lambda p:(0 if p['source'].startswith('蒙学/') else 1,-sum(l in p['lines'] for l in explicit),len(p['body']),p['source'],p['sourceIndex']))
 if not candidates: issues.append(f'{n}: 未匹配 {author} {title} {anchor}');continue
 p=candidates[0]
 lines=list(dict.fromkeys(p['lines'] if chosen=='all' else [l for l in explicit if l in p['lines']]))
 missing=[l for l in explicit if l not in p['lines']]
 if missing: issues.append(f'{n}: 未匹配选句 {title} {missing}')
 if not lines: continue
 if chosen=='all' and len(lines)>8: raise ValueError(f'长诗不能全文入选: {title}')
 result.append(dict(id=hashlib.sha256((author+p['body']).encode()).hexdigest()[:16],title=title,author=author,kind=p['kind'],lines=lines,tier='basic',selection={'basis':'编辑精选：常见短诗全文或长篇名句；非搜索排名','mode':'short-poem' if chosen=='all' else 'selected-lines','anchor':anchor,'review':'逐条显式选句并与源文精确核对'},source={'file':p['source'],'index':p['sourceIndex'],'title':p['title']}))
# Expansion is an explicit reviewed list, never an automatic anthology-wide import.
documents={}
for entry in json.loads((base/'scripts/poetry-expansion.json').read_text()):
 file=entry['file']
 if file not in documents: documents[file]=json.loads((root/file).read_text())
 source=documents[file]
 for key in entry['index'].split('/'):
  source=source[int(key)] if isinstance(source,list) else source[key]
 author=re.sub(r'（.*?）|\(.*?\)','',convert(source['author']))
 title=convert(source['chapter'])
 paragraphs=[re.sub(r'（.*?）|\(.*?\)','',convert(x)) for x in flatten(source['paragraphs'])]
 body=''.join(paragraphs)
 sourceLines=re.split('[，。！？；：、,.!?;:]',body)
 if author!=entry['author'] or title!=entry['title'] or any(l not in sourceLines for l in entry['lines']):
  raise ValueError(f'扩展源文不一致: {entry["title"]}')
 result.append(dict(id=hashlib.sha256((author+body).encode()).hexdigest()[:16],author=author,title=title,
  kind='唐诗' if 'tangshisanbaishou' in file or '唐' in source['author'] else '宋诗',
  lines=entry['lines'],tier=entry['tier'],selection={'basis':entry['basis'],'mode':'selected-lines','anchor':entry['lines'][0],'review':'显式编辑选单，精确回查源文；分级为编辑判断'},
  source={'file':file,'index':entry['index'],'title':title}))
for entry in json.loads((base/'scripts/poetry-restored.json').read_text()):
 result.append(dict(id=hashlib.sha256((entry['author']+''.join(entry['lines'])).encode()).hexdigest()[:16],
  author=entry['author'],title=entry['title'],kind=entry['kind'],lines=entry['lines'],tier='basic',
  selection={'basis':entry['basis'],'mode':'short-poem','anchor':entry['lines'][0],'review':entry['reviewed']},
  source={'file':'scripts/poetry-restored.json','url':entry['url'],'title':entry['title']}))
seen=set(); result=[p for p in result if not(p['id'] in seen or seen.add(p['id']))]
commit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
report='\n'.join(issues)
if issues: (base/'scripts/poetry-selection-issues.txt').write_text(report+'\n')
else: (base/'scripts/poetry-selection-issues.txt').unlink(missing_ok=True)
if issues:
 print(report); print('未写入题库：请先解决上述匹配问题');sys.exit(1)
# School membership is an explicit line whitelist, never inferred from an author/title.
school=json.loads((base/'scripts/poetry-school.json').read_text())
entries=school['entries']
for stage,count in [('primary',75),('middle',40),('high',40)]:
 numbers=[e['number'] for e in entries if e['stage']==stage]
 if sorted(numbers)!=list(range(1,count+1)): raise ValueError(f'课标目录缺项或重复: {stage}')
schoolPoems=[]
for entry in entries:
 if not entry['lines']: continue
 if len(entry['lines'])!=len(set(entry['lines'])): raise ValueError(f'课标选句重复: {entry["title"]}')
 schoolPoems.append(dict(id=f"school-{entry['stage']}-{entry['number']}",
  title=entry['title'],author=entry['author'],kind='古诗词',lines=entry['lines'],tier=entry['tier'],
  selection={'basis':school['sources']['primaryMiddleStandard' if entry['stage']!='high' else 'highStandard'],
   'mode':'school-selected-lines','anchor':entry['lines'][0],'review':entry['selectionNote'],
   'stage':entry['stage'],'number':entry['number']},
  source={'file':'scripts/poetry-school.json','url':school['sources']['compilation'],'title':entry['title']}))
for poem in result:
 poem['tier']='advanced'
 poem['selection']['basis']='课外或课标白名单之外的选句，仅进阶；'+poem['selection']['basis']
result=schoolPoems+result
# Drop duplicate lines across works, including competing attributions; first reviewed source wins.
seenLines=set()
for poem in result:
 poem['lines']=[line for line in poem['lines'] if not (line in seenLines or seenLines.add(line))]
result=[p for p in result if p['lines']]
for poem in result:
 if any(not re.fullmatch('[\u3400-\u9fff]{5}|[\u3400-\u9fff]{7}',l) for l in poem['lines']): raise ValueError(poem['title'])
summary={tier:{'poems':sum(p['tier']==tier for p in result),'lines':sum(len(p['lines']) for p in result if p['tier']==tier)} for tier in ['basic','normal','advanced']}
for out in [base/'data',base/'public/data']:
 (out/'poetry-curated.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 (out/'poetry-README.md').write_text(f'''# 拾字成诗：熟悉诗句精选库
共 {len(result)} 条作品分层记录（同一作品可有不同层的选句），{sum(len(p['lines']) for p in result)} 个候选句。
原文：https://github.com/chinese-poetry/chinese-poetry ，版本 {commit}。
分层：{json.dumps(summary,ensure_ascii=False)}。默认入门45%、普通45%、进阶10%，各层先抽作品再抽句子。
选篇：scripts/poetry-school.json 为课标篇目及逐句白名单，小学入门，初高中普通，个别生僻高中篇目进阶。课标共155项，非五七字篇目保留在清单但不出题。scripts/poetry-selection.txt 为课外选单，scripts/poetry-expansion.json 为《唐诗三百首》《千家诗》逐篇复核的扩展选单，scripts/poetry-restored.json 保存通行文本与核对网址。课标白名单优先去重，旧选单仅供进阶。不是某一教材的完整篇目表，也不是对人群熟悉度的统计结论。
每条作品保留源文件、数组位置、原标题、匹配锚点与选句依据；不使用作者或词牌的模糊匹配，不使用搜索排名。
常见短诗只保留源文中完整五言七言句，长篇只取明确列出的句子；原文不匹配时构建失败，禁止静默补入或漏项。
仍可能因古籍异文或个体积累而感到陌生，后续可按真实答题反馈调整。源数据 MIT 许可证见 poetry-LICENSE.txt。
重建：python scripts/build-curated-poetry.py /path/to/chinese-poetry（需要 opencc-python-reimplemented）。
''')
# Human-readable, complete checklist including excluded entries.
rows=['# 课标诗词篇目与游戏选句', '', '来源：'+school['sources']['compilation'], '', *school['notes'], '', '| 学段 | 编号 | 作者 | 篇目 | 题池 | 选句 |', '| --- | --- | --- | --- | --- | --- |']
for e in entries:
 rows.append('| '+ ' | '.join([{'primary':'小学','middle':'初中','high':'高中'}[e['stage']],str(e['number']),e['author'],e['title'],{'basic':'入门','normal':'普通','advanced':'进阶'}[e['tier']] if e['lines'] else '不出题','；'.join(e['lines']) or e['selectionNote']])+' |')
(base/'data/poetry-school-list.md').write_text('\n'.join(rows)+'\n')
print(summary)
print(f'{len(result)} 首 / {sum(len(p["lines"]) for p in result)} 句')
