import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeQuestion, pickPoem, overlap, chooseExtras, selectDistractors, validAnswers } from '../poetry-engine.mjs';
const poems=JSON.parse(readFileSync(new URL('../public/data/poetry-curated.json',import.meta.url)));
let seed=42;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
test('curated bank contains traceable distinct poems and familiar staples',()=>{
 assert.ok(poems.length>=300 && poems.length<=500);
 assert.ok(poems.reduce((n,p)=>n+p.lines.length,0)>=1500);assert.equal(new Set(poems.map(p=>p.id)).size,poems.length);
 for (const title of ["静夜思","春晓","登鹳雀楼","山居秋暝","登高","夜雨寄北","别董大","游园不值"]) assert.ok(poems.some(p=>p.title===title));
 poems.forEach((p,i)=>{assert.ok(p.lines.length);assert.ok(p.lines.every(l=>/^(?:[\u3400-\u9fff]{5}|[\u3400-\u9fff]{7})$/.test(l))); assert.ok(p.source.file && p.selection.anchor);assert.equal(p.score,undefined);});
});
test('duplicate characters counted as separate tiles; tail removal preferred',()=>{
 assert.equal(overlap('人人人','人人'),2);
 const extras=chooseExtras('甲乙丙丁戊',['甲己庚辛壬'],4,random);
 assert.equal(overlap('甲己庚辛壬',[...'甲乙丙丁戊',...extras]),4);
 assert.ok(extras.includes('己'));
 assert.equal(chooseExtras('甲乙丙丁戊',['乙甲丙丁戊'],4,random),null);
});
test('random questions keep all answer tiles, exact board sizes and best overlap sources',()=>{
 const sizes=new Set();const sourceCounts=new Set();
 for(let i=0;i<100;i++){
  const q=makeQuestion(poems,random);sizes.add(q.answer.length);sourceCounts.add(q.sources.length);
  assert.equal(q.tiles.length,q.answer.length===5?9:12);assert.equal(overlap(q.answer,q.tiles),q.answer.length);
  assert.ok(validAnswers(poems,q.tiles,q.answer.length).some(a=>a.line===q.answer));
  for(const source of q.sources) assert.ok(overlap(source.line,q.tiles)<source.line.length);
  const max=Math.max(...poems.filter(p=>p.id!==q.poemId).flatMap(p=>p.lines.filter(l=>l!==q.answer&&l.length===q.answer.length&&overlap(q.answer,l)<l.length).map(l=>overlap(q.answer,l))));
  assert.equal(overlap(q.answer,q.sources[0].line),max);
 }
 assert.deepEqual([...sizes].sort(),[5,7]);assert.ok([...sourceCounts].every(n=>n===1 || n===2));
});

test('joint coverage is optimal and sources cannot complete each other',()=>{
 const answer='甲乙丙丁戊', lines=['甲乙己庚辛','丙丁己庚壬'];
 const extras=chooseExtras(answer,lines,4,random);
 const board=[...answer,...extras];
 assert.equal(lines.reduce((sum,l)=>sum+overlap(l,board),0),8);
 lines.forEach(l=>assert.equal(overlap(l,board),4));
 // Several distinct multisets attain the same optimum; all are valid.
 assert.ok(extras.includes('己') || extras.includes('庚'));
});
test('additional copies of common characters count only when needed',()=>{
 const answer='甲乙丙丁戊', line='甲甲甲己庚';
 const extras=chooseExtras(answer,[line],4,random);
 assert.equal(overlap(line,[...answer,...extras]),4);
 assert.ok(extras.filter(c=>c==='甲').length>=2);
});

test('consecutive questions prefer different authors',()=>{
 const previous=poems[0];
 for(let i=0;i<20;i++) assert.notEqual(makeQuestion(poems,random,previous.id).author,previous.author);
});

test('default mix uses tier weights rather than bank sizes',()=>{
 const counts={basic:0,normal:0,advanced:0};
 for(let i=0;i<10000;i++) counts[pickPoem(poems,random).tier]++;
 assert.ok(counts.basic>4200 && counts.basic<4800);
 assert.ok(counts.normal>4200 && counts.normal<4800);
 assert.ok(counts.advanced>800 && counts.advanced<1200);
});
test('all lines are distinct and restored versions match familiar text',()=>{
 const lines=poems.flatMap(p=>p.lines);assert.equal(new Set(lines).size,lines.length);
 assert.ok(lines.includes('千里黄云白日曛'));assert.ok(lines.includes('应怜屐齿印苍苔'));
 assert.ok(poems.every(p=>['basic','normal','advanced'].includes(p.tier)));
 const only=poems.filter(p=>p.tier==='normal');
 assert.equal(pickPoem(only,random).tier,'normal');
});

test('leftover slots recruit a second source instead of duplicate padding',()=>{
 const answer='不知转入此中来';
 const candidates=[{poem:{id:'one'},line:'闺中少妇不知愁'}, {poem:{id:'two'},line:'此夜曲中闻折柳'}];
 const {sources,extras}=selectDistractors(answer,candidates,5,()=>.1);
 assert.equal(sources.length,2);assert.equal(extras.length,5);
 assert.ok(!extras.includes('中') && !extras.includes('转'));
 const board=[...answer,...extras];
 for(const source of sources) assert.ok(overlap(source.line,board)<7);
 // Every added tile increases joint coverage: removing any one lowers it.
 const score=tiles=>sources.reduce((n,s)=>n+overlap(s.line,tiles),0);
 extras.forEach((_,i)=>assert.ok(score([...answer,...extras.filter((_,j)=>j!==i)])<score(board)));
});
test('fully constrained sources still pad safely to the exact size',()=>{
 const answer='甲乙丙丁戊';
 const {sources,extras}=selectDistractors(answer,[{poem:{id:'one'},line:'甲乙丙丁己'}],4,random);
 assert.equal(extras.length,4);assert.ok(!extras.includes('己'));
 assert.equal(overlap(sources[0].line,[...answer,...extras]),4);
});

test('school pools cover the full checklist and never admit extracurricular lines',()=>{
 const school=JSON.parse(readFileSync(new URL('../scripts/poetry-school.json',import.meta.url)));
 for(const [stage,count] of [['primary',75],['middle',40],['high',40]]) {
  assert.deepEqual(school.entries.filter(e=>e.stage===stage).map(e=>e.number).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i+1));
 }
 for(const entry of school.entries) {
  const poem=poems.find(p=>p.id===`school-${entry.stage}-${entry.number}`);
  if(!entry.lines.length) { assert.equal(poem,undefined);continue; }
  assert.ok(poem,entry.title);assert.deepEqual(poem.lines,entry.lines);assert.equal(poem.tier,entry.tier);
 }
 for(const poem of poems.filter(p=>p.tier!=='advanced')) {
  assert.equal(poem.source.file,'scripts/poetry-school.json');
  assert.equal(poem.tier==='basic',poem.selection.stage==='primary');
 }
 assert.equal(poems.find(p=>p.lines.includes('双泪落君前')).tier,'advanced');
 assert.deepEqual(poems.find(p=>p.id==='school-primary-18').lines,['小时不识月','呼作白玉盘','又疑瑶台镜','飞在青云端']);
 assert.equal(poems.find(p=>p.lines.includes('泉眼无声惜细流')).title,'小池');
 assert.equal(poems.find(p=>p.lines.includes('梅子金黄杏子肥')).author,'范成大');
 assert.ok(poems.find(p=>p.id==='school-high-15').lines.includes('隔篱呼取尽余杯'));
 assert.deepEqual(readFileSync(new URL('../data/poetry-curated.json',import.meta.url)),readFileSync(new URL('../public/data/poetry-curated.json',import.meta.url)));
});
