"""Usage: python build-poetry.py SOURCE_DIR [K]; requires opencc-python-reimplemented."""
import json, math, re, sys, hashlib, subprocess
from pathlib import Path
from opencc import OpenCC
root = Path(sys.argv[1]); k = int(sys.argv[2]) if len(sys.argv)>2 else 1000
convert = OpenCC('t2s').convert
engines = ['baidu','so360','bing','bing_en','google']
records = []
for folder, pattern, source in [('poet','poet.tang.rank.*.json','全唐诗'),('ci','ci.song.rank.*.json','宋词')]:
 for path in sorted((root/'rank'/folder).glob(pattern)):
  original = root/source/path.name.replace('.rank.', '.')
  poems=json.loads(original.read_text()); ranks=json.loads(path.read_text())
  for idx,(poem,rank) in enumerate(zip(poems,ranks)):
   title=poem.get('title',poem.get('rhythmic',''))
   if poem['author']!=rank.get('author') or title!=rank.get('title',rank.get('rhythmic','')): continue
   if re.match(r'^(句|又一首|又歌)(\s|$)',convert(title)): continue
   if len(title.strip()) < 2 or any(c in title+poem['author'] for c in '□�？?') or len(poem['author'].strip()) < 2: continue
   lines=list(dict.fromkeys(line for paragraph in poem['paragraphs'] for line in re.split('[，。！？；：、,.!?;:]',convert(paragraph)) if re.fullmatch(r'[\u3400-\u9fff]{5}|[\u3400-\u9fff]{7}',line)))
   if not lines: continue
   values=[]
   for engine in engines:
    try: n=float(rank.get(engine,0))
    except (ValueError,TypeError): n=0
    if math.isfinite(n) and n>0: values.append(math.log1p(n))
   if not values: continue
   score=sum(values)/len(values)
   body=convert(''.join(poem['paragraphs']))
   records.append(dict(id=hashlib.sha256((poem['author']+body).encode()).hexdigest()[:16],title=convert(title),author=convert(poem['author']),kind='唐诗' if folder=='poet' else '宋词',lines=lines,score=round(score,6)))
records.sort(key=lambda p:(-p['score'],p['id']))
seen=set(); selected=[]
for p in records:
 if p['id'] in seen: continue
 seen.add(p['id']); p['rank']=len(selected)+1; selected.append(p)
 if len(selected)==k: break
out=Path(__file__).resolve().parents[1]/'public/data'
(out/'poetry-top1000.json').write_text(json.dumps(selected,ensure_ascii=False,separators=(',',':'))+'\n')
(out/'poetry-LICENSE.txt').write_text((root/'LICENSE').read_text())
commit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
(out/'poetry-README.md').write_text(f'''# 拾字成诗题库
来源：https://github.com/chinese-poetry/chinese-poetry
版本：{commit}
范围：唐诗和宋词（不含宋诗），包含至少一个完整五字或七字标点分句。
数量：{len(selected)} 首，{sum(len(p['lines']) for p in selected)} 个候选句。
排序：各有效搜索引擎结果数的 log(1+n) 均值，降序取 Top {k}；非正数、缺失值不计。并列按内容 ID 排序。
剔除标题过短、残缺及“句/又一首/又歌”等缺乏可辨识标题的记录。
先核对 rank 与原作作者、标题的对应关系，按作者和全文去重，使用 OpenCC t2s 转简体。
rank 为历史搜索结果量代理，非权威难度分级；宋词词牌查询可能对应多首作品。
运行 scripts/build-poetry.py SOURCE_DIR {k} 可重建。源数据 MIT 许可证见 poetry-LICENSE.txt。
''')
print(len(selected),sum(len(p['lines']) for p in selected),[(p['author'],p['title']) for p in selected[:8]])

for name in ['poetry-top1000.json','poetry-README.md','poetry-LICENSE.txt']:
 (out.parents[1]/'data'/name).write_text((out/name).read_text())
