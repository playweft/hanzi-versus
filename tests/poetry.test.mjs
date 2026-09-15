import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeQuestion, pickPoem, overlap, chooseExtras, selectDistractors, validAnswers, rankDistractors } from '../poetry-engine.mjs';
const poems=JSON.parse(readFileSync(new URL('../public/data/poetry-curated.json',import.meta.url)));
let seed=42;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
test('curated bank contains traceable distinct poems and familiar staples',()=>{
 assert.ok(poems.length>=300 && poems.length<=500);
 assert.ok(poems.reduce((n,p)=>n+p.lines.length,0)>=1500);assert.equal(new Set(poems.map(p=>p.id)).size,poems.length);
 for (const title of ["静夜思","春晓","登鹳雀楼","山居秋暝","登高","夜雨寄北","别董大","游园不值"]) assert.ok(poems.some(p=>p.title===title));
 poems.forEach((p,i)=>{assert.ok(p.lines.length);assert.ok(p.lines.every(l=>/^(?:[\u3400-\u9fff]{5}|[\u3400-\u9fff]{7})$/.test(l))); assert.ok(p.source.file && p.selection.anchor);assert.equal(p.score,undefined);});
});
test('duplicate characters counted as separate tiles; decoy remains incomplete',()=>{
 assert.equal(overlap('人人人','人人'),2);
 const extras=chooseExtras('甲乙丙丁戊',['甲己庚辛壬'],4,random);
 assert.equal(overlap('甲己庚辛壬',[...'甲乙丙丁戊',...extras]),4);

 assert.equal(chooseExtras('甲乙丙丁戊',['乙甲丙丁戊'],4,random),null);
});
test('random questions keep all answer tiles, exact board sizes and best overlap sources',()=>{
 const sizes=new Set();const sourceCounts=new Set();
 for(let i=0;i<100;i++){
  const q=makeQuestion(poems,random);sizes.add(q.answer.length);sourceCounts.add(q.sources.length);
  assert.equal(q.tiles.length,q.answer.length===5?9:12);assert.equal(overlap(q.answer,q.tiles),q.answer.length);
  assert.ok(validAnswers(poems,q.tiles,q.answer.length).some(a=>a.line===q.answer));
  for(const source of q.sources) assert.ok(overlap(source.line,q.tiles)<source.line.length);
  assert.equal(overlap(q.sources[0].line,q.tiles),Math.min(q.answer.length-1,overlap(q.answer,q.sources[0].line)+(q.answer.length===5?4:5)));
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
 const extras=chooseExtras(answer,[line],4,random,false);
 assert.equal(overlap(line,[...answer,...extras]),4);
 assert.ok(extras.includes('甲'));
 extras.forEach((_,i)=>assert.equal(overlap(line,[...answer,...extras.filter((_,j)=>i!==j)]),3));
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

test('primary decoy stays one character short before adding a secondary decoy',()=>{
 const answer='直挂云帆济沧海';
 const candidates=[{poem:{id:'one'},line:'曾经沧海难为水'},{poem:{id:'two'},line:'海上明月共潮生'}];
 for(let i=0;i<50;i++) {
  const {sources,extras}=selectDistractors(answer,candidates,5,random);
  const board=[...answer,...extras];
  assert.equal(overlap(candidates[0].line,board),6);
  assert.equal([...'曾经难为水'].filter(c=>!board.includes(c)).length,1);
  assert.equal(extras.length,5);
  sources.forEach(s=>assert.ok(overlap(s.line,board)<7));
 }
});
test('a primary decoy that needs every slot does not recruit a secondary',()=>{
 const candidates=[{poem:{id:'one'},line:'甲己庚辛壬'},{poem:{id:'two'},line:'乙己庚癸子'}];
 const {sources,extras}=selectDistractors('甲乙丙丁戊',candidates,3,random);
 assert.equal(sources.length,1);
 assert.equal(overlap(candidates[0].line,[...'甲乙丙丁戊',...extras]),4);
});
test('secondary coverage cannot displace primary coverage even for a better total',()=>{
 const answer='甲乙丙丁戊己庚';
 const extras=chooseExtras(answer,['甲辛壬癸子丑寅','乙丁辛壬卯辰巳'],5,random,false);
 assert.equal(overlap('甲辛壬癸子丑寅',[...answer,...extras]),6);
});

test('later missing positions have exponentially higher probability',()=>{
 const counts=Array(5).fill(0), line='己庚辛壬癸';
 for(let i=0;i<12000;i++) {
  const extras=chooseExtras('甲乙丙丁戊',[line],4,random,false);
  const missing=[...line].findIndex(c=>!extras.includes(c));
  assert.ok(missing>=0);counts[missing]++;
 }
 const totalWeight=31;
 counts.forEach((n,i)=>assert.ok(Math.abs(n/12000-2**i/totalWeight)<.02));
 for(let i=1;i<5;i++) assert.ok(counts[i]>counts[i-1]);
});
test('secondary fill preserves the primary omission drawn before it',()=>{
 const answer='直挂云帆济沧海', first={poem:{id:'one'},line:'曾经沧海难为水'};
 const second={poem:{id:'two'},line:'海上明月共潮生'};
 for(let seed=1;seed<=30;seed++) {
  const rng=()=>{let s=seed;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/2**32);};
  const primary=chooseExtras(answer,[first.line],5,rng(),false);
  const {extras}=selectDistractors(answer,[first,second],5,rng());
  const missing=[...first.line].filter(c=>![...answer,...primary].includes(c));
  missing.forEach(c=>assert.ok(!extras.includes(c)));
  primary.forEach(c=>assert.ok(extras.includes(c)));
 }
});

test('overlap remains strict while tied familiarity uses weighted random chances',()=>{
 const tied=['basic','normal','advanced'].map(tier=>({poem:{tier},score:2}));
 const counts={basic:0,normal:0,advanced:0};
 for(let i=0;i<14000;i++) counts[rankDistractors(tied,random)[0].poem.tier]++;
 for(const [tier,weight] of [['basic',4],['normal',2],['advanced',1]]) {
  assert.ok(Math.abs(counts[tier]/14000-weight/7)<.02);
 }
 const stronger={poem:{tier:'advanced'},score:3};
 for(let i=0;i<100;i++) assert.equal(rankDistractors([...tied,stronger],random)[0],stronger);
});
test('each equally familiar tied line has its own chance, including lines from the same poem',()=>{
 const shared={id:'one',tier:'basic'};
 const candidates=[{poem:shared,line:'a',score:2},{poem:shared,line:'b',score:2},
  {poem:{id:'two',tier:'basic'},line:'c',score:2}];
 const counts={a:0,b:0,c:0};
 for(let i=0;i<6000;i++) counts[rankDistractors(candidates,random)[0].line]++;
 Object.values(counts).forEach(n=>assert.ok(Math.abs(n/6000-1/3)<.03));
});
