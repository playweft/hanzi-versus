import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidHint, extractHint, clean } from '../src/games/idiom/engine.mjs';
import { generateIdiomHint } from '../src/games/idiom/hints.mjs';
test('idiom clues must have two characters without answer characters',()=>{
 assert.ok(isValidHint('多余','画蛇添足'));
 assert.ok(!isValidHint('添余','画蛇添足'));
 assert.ok(!isValidHint('多余的','画蛇添足'));
 assert.equal(extractHint(clean('分析：说明\n最终提示：多余'),'画蛇添足'),'多余');
});
test('failed generation retries and never returns an unrelated fallback',async()=>{
 let calls=0;
 await assert.rejects(generateIdiomHint('画蛇添足',[],[],1,{request:async()=>{calls++;throw Error('offline');}}),/提示生成失败/);
 assert.equal(calls,2);
 await assert.rejects(generateIdiomHint('画蛇添足',[],[],1),/尚未连接/);
});
test('valid retry is returned without mutating game history',async()=>{
 let calls=0;const hints=[],guesses=[];
 const hint=await generateIdiomHint('画蛇添足',hints,guesses,1,{request:async()=>++calls===1?'没有最终输出':'最终提示：多余'});
 assert.equal(hint,'多余');assert.equal(calls,2);
 assert.deepEqual(hints,[]);assert.deepEqual(guesses,[]);
});
