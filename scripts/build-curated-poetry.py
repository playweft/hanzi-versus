"""Build the curated poetry bank. Requires opencc-python-reimplemented and pyyaml."""
import json,re,sys,hashlib,subprocess
from pathlib import Path
from collections import defaultdict
from opencc import OpenCC
import yaml
base=Path(__file__).resolve().parents[1]; root=Path(sys.argv[1]); convert=OpenCC('t2s').convert
tierName={'basic':'入门','normal':'普通','advanced':'进阶'}
# ---------- 题池总表：全库选句与难度的唯一来源 ----------
declared=[]
for n,entry in enumerate(yaml.safe_load((base/'scripts/poetry-tiers.yaml').read_text()),1):
 author=entry.get('author'); title=entry.get('title'); tier=entry.get('tier')
 lines=entry.get('lines'); anchor=entry.get('anchor'); overrides=entry.get('overrides') or {}
 where=f'第 {n} 项 {author}《{title}》'
 if not (isinstance(author,str) and author and isinstance(title,str) and title):
  raise ValueError(f'题池总表缺少作者或篇名: 第 {n} 项')
 if tier not in tierName: raise ValueError(f'题池总表档位无效: {where} {tier}')
 if not (isinstance(lines,list) and lines and all(isinstance(l,str) and l for l in lines)):
  raise ValueError(f'题池总表缺少选句: {where}')
 if len(set(lines))!=len(lines): raise ValueError(f'题池总表选句重复: {where}')
 if anchor is not None and not (isinstance(anchor,str) and anchor):
  raise ValueError(f'题池总表 anchor 无效: {where}')
 if not isinstance(overrides,dict) or any(t not in tierName for t in overrides.values()) or any(not isinstance(l,str) or not l for l in overrides):
  raise ValueError(f'题池总表 overrides 无效: {where}')
 for line in overrides:
  if line not in lines: raise ValueError(f'题池总表 overrides 的句子不在选句里: {where} {line}')
 declared.append(dict(author=author,title=title,lines=lines,anchor=anchor or lines[0],tier=tier,overrides=overrides))
# ---------- 出处登记：只说明这篇为什么收入、原文在哪里 ----------
school=json.loads((base/'scripts/poetry-school.json').read_text())
schoolEntries=school['entries']
for stage,count in [('primary',75),('middle',40),('high',40)]:
 numbers=[e['number'] for e in schoolEntries if e['stage']==stage]
 if sorted(numbers)!=list(range(1,count+1)): raise ValueError(f'课标目录缺项或重复: {stage}')
famous=json.loads((base/'scripts/poetry-famous.json').read_text())
expansion=json.loads((base/'scripts/poetry-expansion.json').read_text())
restored=json.loads((base/'scripts/poetry-restored.json').read_text())
def pick(registry,author,title,anchor,label):
 # 同名多条用 anchor 指明是哪一首；对不上说明这篇不在这份登记里，交给下一处。
 cands=[e for e in registry if e['author']==author and e['title']==title]
 cands=[e for e in cands if 'anchor' not in e or e['anchor']==anchor]
 return cands[0] if len(cands)==1 else None
dupTitles=defaultdict(int)
for d in declared: dupTitles[(d['author'],d['title'])]+=1
def checkAnchors(registry,label):
 # 总表里同名多首时，登记里同名的那几条必须逐条写 anchor，否则无法判断写的是哪一首。
 for e in registry:
  if dupTitles[(e['author'],e['title'])]>1 and 'anchor' not in e:
   raise ValueError(f'{label}里{e["author"]}《{e["title"]}》要与总表的同名篇目区分，请补 anchor')
checkAnchors(schoolEntries,'课标目录')
checkAnchors(famous,'名句白名单')
checkAnchors(expansion,'扩展选单')
checkAnchors(restored,'通行文本')
# ---------- 语料索引：用于定位原诗并核对选句确实出自原文 ----------
authors={d['author'] for d in declared}; index=defaultdict(list)
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
documents={}
def sourcePoem(file,indexPath):
 # 与扩展、名句共用一种定位：数字进数组、字符串进对象，蒙学（content/N/content/M）才引用得到。
 if file not in documents: documents[file]=json.loads((root/file).read_text())
 node=documents[file]
 for key in str(indexPath).split('/'):
  node=node[int(key)] if isinstance(node,list) else node[key]
 paras=[re.sub(r'（.*?）|\(.*?\)','',convert(x)) for x in flatten(node.get('paragraphs',node.get('para',[])))]
 # 逐段切分（有的语料段末不带句号，拼起来会粘连），再去除空片。
 lines=[l for para in paras for l in re.split('[，。！？；：、,.!?;:]',para) if l]
 return dict(author=re.sub(r'（.*?）|\(.*?\)','',convert(node['author'])),
  title=convert(node.get('title',node.get('chapter',node.get('rhythmic','')))),
  lines=lines,body=''.join(paras),
  anthology='tangshisanbaishou' in file or '唐' in node['author'])
def locate(author,anchor,lines):
 cands=[p for p in index[author] if anchor in p['body']]
 # Prefer the version covering the most selected lines, then the shortest work.
 cands.sort(key=lambda p:(0 if p['source'].startswith('蒙学/') else 1,-sum(l in p['lines'] for l in lines),len(p['body']),p['source'],p['sourceIndex']))
 return cands[0] if cands else None
# ---------- 每个篇目按出处登记装配成题库记录 ----------
phases=defaultdict(list)
for d in declared:
 author,title,anchor,lines=d['author'],d['title'],d['anchor'],d['lines']
 where=f'{author}《{title}》'
 entry=pick(schoolEntries,author,title,anchor,'课标目录')
 if entry:
  phases['school'].append(dict(declared=d,key=(entry['stage'],entry['number']),rec=dict(id=f"school-{entry['stage']}-{entry['number']}",
   title=title,author=author,kind='古诗词',lines=lines,
   selection={'basis':school['sources']['primaryMiddleStandard' if entry['stage']!='high' else 'highStandard'],
    'mode':'school-selected-lines','anchor':anchor,'review':entry['selectionNote'],
    'stage':entry['stage'],'number':entry['number']},
   source={'file':'scripts/poetry-school.json','url':school['sources']['compilation'],'title':title})))
  continue
 entry=pick(famous,author,title,anchor,'名句白名单')
 if entry:
  source=entry['source']
  if 'file' in source:
   blank=sourcePoem(source['file'],source['index'])
   if blank['author']!=author or blank['title']!=source['title'] or any(l not in blank['lines'] for l in lines):
    raise ValueError(f'名句补充源文不一致: {where}')
  elif not source.get('url') or not source.get('review'):
   raise ValueError(f'名句补充缺少异文核对出处: {where}')
  phases['famous'].append(dict(declared=d,key=(entry['author'],entry['title']),rec=dict(
   id='famous-'+hashlib.sha256((author+title).encode()).hexdigest()[:16],
   author=author,title=title,kind='古诗词',lines=lines,
   selection={'basis':entry['basis'],'mode':'famous-selected-lines','anchor':anchor,'review':'逐句补充白名单，保留源文或通行异文出处'},
   source={'file':'scripts/poetry-famous.json','title':title,'original':source})))
  continue
 entry=pick(expansion,author,title,anchor,'扩展选单')
 if entry:
  blank=sourcePoem(entry['file'],entry['index'])
  if blank['author']!=author or blank['title']!=title or any(l not in blank['lines'] for l in lines):
   raise ValueError(f'扩展源文不一致: {where}')
  phases['expansion'].append(dict(declared=d,key=(entry['author'],entry['title']),rec=dict(
   id=hashlib.sha256((author+blank['body']).encode()).hexdigest()[:16],author=author,title=title,
   kind='唐诗' if blank['anthology'] else '宋诗',lines=lines,
   selection={'basis':entry['basis'],'mode':'selected-lines','anchor':anchor,'review':'显式编辑选单，精确回查源文；分级为编辑判断'},
   source={'file':entry['file'],'index':entry['index'],'title':title})))
  continue
 entry=pick(restored,author,title,anchor,'通行文本')
 if entry:
  phases['restored'].append(dict(declared=d,key=(entry['author'],entry['title']),rec=dict(
   id=hashlib.sha256((author+''.join(lines)).encode()).hexdigest()[:16],
   author=author,title=title,kind=entry['kind'],lines=lines,
   selection={'basis':entry['basis'],'mode':'short-poem','anchor':anchor,'review':entry['reviewed']},
   source={'file':'scripts/poetry-restored.json','url':entry['url'],'title':title})))
  continue
 # 其余一律按课外选单核对原文
 p=locate(author,anchor,lines)
 if not p: raise ValueError(f'选单未匹配原诗: {where} 定位句 {anchor}')
 missing=[l for l in lines if l not in p['lines']]
 if missing: raise ValueError(f'选单未匹配选句: {where} {missing}')
 mode='short-poem' if lines==p['lines'] else 'selected-lines'
 if mode=='short-poem' and len(lines)>8: raise ValueError(f'长诗不能全文入选: {where}')
 phases['selection'].append(dict(declared=d,key=(author,title),rec=dict(
  id=hashlib.sha256((author+p['body']).encode()).hexdigest()[:16],title=title,author=author,kind=p['kind'],lines=lines,
  selection={'basis':'课外选单；编辑精选：常见短诗全文或长篇名句；非搜索排名','mode':mode,'anchor':anchor,'review':'逐条显式选句并与源文精确核对'},
  source={'file':p['source'],'index':p['sourceIndex'],'title':p['title']})))
# 课标、名句、选单、扩展、通行依次去重：先声明者留下这一句。
built=phases['school']+phases['famous']+phases['selection']+phases['expansion']+phases['restored']
seenLines=set()
for item in built:
 item['rec']['lines']=[line for line in item['rec']['lines'] if not (line in seenLines or seenLines.add(line))]
for item in built:
 d=item['declared']
 item['tiers']=[d['overrides'].get(line,d['tier']) for line in item['rec']['lines']]
# 同一记录里跨档位的句子拆成多条，各按自己的档位出题。
result=[]
for item in built:
 rec=item['rec']; parts=[]
 for line,tier in zip(rec['lines'],item['tiers']):
  if parts and parts[-1][1]==tier: parts[-1][0].append(line)
  else: parts.append(([line],tier))
 for lines,tier in parts:
  part=dict(rec,lines=lines,tier=tier)
  if len(parts)>1: part['id']=f'{rec["id"]}-{tier}'
  result.append(part)
for poem in result:
 if any(not re.fullmatch('[\u3400-\u9fff]{5}|[\u3400-\u9fff]{7}',l) for l in poem['lines']): raise ValueError(poem['title'])
# 课标有的以课标为准：源文与课标只差一字的句子，不得在课标篇目之外另立条目，
# 否则逐句去重只会剩下那一字之差的残句（如源文“秋成万颗子”对课标“秋收万颗子”）。
leftovers=[]
for poem in result:
 if poem['selection']['mode']=='school-selected-lines': continue
 for other in result:
  if other['selection']['mode']!='school-selected-lines' or other['author']!=poem['author']: continue
  if len(other['lines'])<=len(poem['lines']): continue
  if all(any(len(a)==len(b) and sum(x!=y for x,y in zip(a,b))==1 for b in other['lines']) for a in poem['lines']):
   leftovers.append(f"{poem['title']}（{'/'.join(poem['lines'])}）与《{other['title']}》仅差一字"); break
if leftovers:
 raise ValueError('课标篇目残留，请在 poetry-tiers.yaml 中移除对应项：'+'；'.join(leftovers))
def tierText(items):
 found=[]
 for item in items:
  for tier in item['tiers']:
   if tier not in found: found.append(tier)
 return '/'.join(tierName[t] for t in found) if found else '不出题'
summary={tier:{'poems':sum(p['tier']==tier for p in result),'lines':sum(len(p['lines']) for p in result if p['tier']==tier)} for tier in ['basic','normal','advanced']}
commit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
# 上线文件只在 public/，仓库根目录不再保留副本；选篇清单是给人看的，放 docs/。
docs=base/'docs'; docs.mkdir(exist_ok=True)
out=base/'public/data'
(out/'poetry-curated.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(out/'poetry-README.md').write_text(f'''# 拾字成诗：熟悉诗句精选库
共 {len(result)} 条作品分层记录（同一作品可有不同层的选句），{sum(len(p['lines']) for p in result)} 个候选句。
原文：https://github.com/chinese-poetry/chinese-poetry ，版本 {commit}。
分层：{json.dumps(summary,ensure_ascii=False)}。默认入门35%、普通55%、进阶10%，各层先抽作品再抽句子。
选篇：scripts/poetry-tiers.yaml 是全库选句与难度的唯一来源，每篇写作者、篇名、选句与题池，某几句要单独定档就写在该篇的 overrides 下。
出处另记四处：scripts/poetry-school.json 为课标目录，scripts/poetry-expansion.json 为《唐诗三百首》《千家诗》逐篇复核，scripts/poetry-restored.json 为通行异文核对，scripts/poetry-famous.json 为熟悉名句补充。四处只登记篇目与理由，不写句子。
每题都回查原文：选句必须逐字出现在对应出处；对上不构建失败，禁止静默补入或漏项。不是某一教材的完整篇目表，也不是对人群熟悉度的统计结论。
常见短诗只保留源文中完整五言七言句，长篇只取明确列出的句子。
仍可能因古籍异文或个体积累而感到陌生，后续可按真实答题反馈调整。源数据 MIT 许可证见 poetry-LICENSE.txt。
重建：python scripts/build-curated-poetry.py /path/to/chinese-poetry（需要 opencc-python-reimplemented 和 pyyaml）。
''')
# Human-readable, complete checklist including excluded entries.
rows=['# 课标诗词篇目与游戏选句', '', '来源：'+school['sources']['compilation'], '', *school['notes'], '', '| 学段 | 编号 | 作者 | 篇目 | 题池 | 选句 |', '| --- | --- | --- | --- | --- | --- |']
for e in schoolEntries:
 items=[i for i in built if i['key']==(e['stage'],e['number']) and i['rec']['selection']['mode']=='school-selected-lines']
 rows.append('| '+ ' | '.join([{'primary':'小学','middle':'初中','high':'高中'}[e['stage']],str(e['number']),e['author'],e['title'],tierText(items),'；'.join(items[0]['rec']['lines']) if items else e['selectionNote']])+' |')
(docs/'poetry-school-list.md').write_text('\n'.join(rows)+'\n')
rows=['# 熟悉名句补充清单', '', '在课标目录之外按句补充，分层为编辑判断；只提升名句本身，整篇皆是名句时可整篇提升。', '', '| 作者 | 篇目 | 题池 | 选句 | 筛选来源 |', '| --- | --- | --- | --- | --- |']
for e in famous:
 items=[i for i in built if i['key']==(e['author'],e['title']) and i['rec']['source']['file']=='scripts/poetry-famous.json']
 rows.append('| '+' | '.join([e['author'],e['title'],tierText(items),'；'.join(items[0]['rec']['lines']) if items else '',('[主题或选集]('+e['discoveryUrl']+')') if e.get('discoveryUrl') else '前期逐句精选'])+' |')
(docs/'poetry-famous-list.md').write_text('\n'.join(rows)+'\n')
print(summary)
print(f'{len(result)} 首 / {sum(len(p["lines"]) for p in result)} 句')
