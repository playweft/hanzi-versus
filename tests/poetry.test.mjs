import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeQuestion, overlap, trimLine, validAnswers } from '../poetry-engine.mjs';
const poems=JSON.parse(readFileSync(new URL('../public/data/poetry-top1000.json',import.meta.url)));
let seed=42;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
test('top K contains valid distinct poems with descending scores',()=>{
 assert.equal(poems.length,1000);assert.equal(new Set(poems.map(p=>p.id)).size,1000);
 poems.forEach((p,i)=>{assert.ok(p.lines.length);assert.ok(p.lines.every(l=>/^(?:[\u3400-\u9fff]{5}|[\u3400-\u9fff]{7})$/.test(l))); if(i)assert.ok(poems[i-1].score>=p.score);});
});
test('duplicate characters counted as separate tiles; tail removal preferred',()=>{
 assert.equal(overlap('人人人','人人'),2);
 assert.equal(trimLine('一二三四五六七',5,random).slice(0,4).join(''),'一二三四');
});
test('random questions keep all answer tiles, exact board sizes and best overlap sources',()=>{
 const sizes=new Set();const sourceCounts=new Set();
 for(let i=0;i<100;i++){
  const q=makeQuestion(poems,random);sizes.add(q.answer.length);sourceCounts.add(q.sources.length);
  assert.equal(q.tiles.length,q.answer.length===5?9:12);assert.equal(overlap(q.answer,q.tiles),q.answer.length);
  assert.ok(validAnswers(poems,q.tiles,q.answer.length).some(a=>a.line===q.answer));
  const max=Math.max(...poems.filter(p=>p.id!==q.poemId).flatMap(p=>p.lines.filter(l=>l!==q.answer&&l.length===q.answer.length).map(l=>overlap(q.answer,l))));
  assert.equal(overlap(q.answer,q.sources[0].line),max);
 }
 assert.deepEqual([...sizes].sort(),[5,7]);assert.deepEqual([...sourceCounts].sort(),[1,2]);
});
