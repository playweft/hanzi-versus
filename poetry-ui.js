import { makeQuestion, validAnswers } from './poetry-engine.mjs';
const $ = s => document.querySelector(s);
let poems, question, selected = [], solved = false, round = 0, room, act, busy = false;
export async function loadPoetry() {
  if (!poems) {
    const response = await fetch('./data/poetry-top1000.json');
    if (!response.ok) throw new Error('诗词题库加载失败，请重试');
    poems = await response.json();
  }
  return poems;
}
export async function createPoetryQuestion() {
  await loadPoetry();
  const q = makeQuestion(poems, Math.random, question?.poemId);
  q.answers = validAnswers(poems, q.tiles, q.answer.length);
  return q;
}
export async function startPoetry(action) {
  act = action;
  $('#poetry-game').hidden = false;
  if (action) { $('#poetry-status').textContent = '等待房主出题…'; return; }
  await next();
}
async function next() {
  if (busy) return;
  busy = true;
  $('#poetry-next').disabled = true;
  try {
    if (act) await act({type:'start_poetry', question:await createPoetryQuestion()});
    else { question = await createPoetryQuestion(); round++; selected=[]; solved=false; render(); }
  } catch (error) { $('#poetry-status').textContent = error.message; }
  finally { busy=false; $('#poetry-next').disabled=false; }
}
export function renderPoetryRoom(state, playerId) {
  room = {state,playerId};
  if (!state.poetry) return;
  if (question?.id !== state.poetry.id) { selected=[]; }
  question = state.poetry; round=state.round; solved=state.phase==='poetry_solved';
  render();
}
function render() {
  if (!question) return;
  $('#poetry-round').textContent = `第 ${round} 题 · ${question.tiles.length} 选 ${question.length || question.answer.length}`;
  const length = question.length || question.answer.length;
  if (solved) {
    const answer = room ? room.state.revealedAnswer : question.answer;
    const used = new Set();
    selected = [...answer].map(char => { const i = question.tiles.findIndex((c, i) => c === char && !used.has(i)); used.add(i); return i; });
  }
  $('#poetry-slots').style.setProperty('--letters', length);
  $('#poetry-slots').replaceChildren(...Array.from({length},(_,i)=> {
    const button=document.createElement('button');
    button.type='button'; button.className='poetry-slot';
    button.textContent=selected[i] === undefined ? '' : question.tiles[selected[i]];
    button.setAttribute('aria-label',`第 ${i+1} 字${button.textContent ? ' '+button.textContent+'，点击撤回' : '，待选'}`);
    button.disabled=solved || selected[i]===undefined;
    button.onclick=()=>{selected.splice(i,1);render();};return button;
  }));
  $('#poetry-tiles').style.setProperty('--columns',length===5 ? 3:4);
  $('#poetry-tiles').replaceChildren(...question.tiles.map((char,i)=> {
    const button=document.createElement('button'); button.type='button'; button.className='poetry-tile';
    button.textContent=char; button.disabled=solved || selected.includes(i) || selected.length===length;
    button.setAttribute('aria-label',`${char}，第 ${i+1} 块`);
    button.onclick=()=>{selected.push(i);render();};return button;
  }));
  $('#poetry-submit').disabled=solved || selected.length!==length;
  $('#poetry-clear').disabled=solved || !selected.length;
  $('#poetry-next').hidden=!!room && room.playerId!==room.state.hostId;
  $('#poetry-reveal').hidden=!!room;
  $('#poetry-status').textContent=solved ? (room ? `${room.state.players.find(p=>p.id===room.state.winner)?.name || '玩家'} 已答对！${room.state.revealedAnswer}` : '此句已解，继续下一题吧。') : '依次点选汉字，组成一句诗。点上方的字可撤回。';
  $('#poetry-source').textContent=solved ? (room ? `${question.author}《${question.title}》` : `${question.answer} —— ${question.author}《${question.title}》`) : '';
}
$('#poetry-clear').onclick=()=>{selected=[];render();};
$('#poetry-next').onclick=next;
$('#poetry-reveal').onclick=()=>{solved=true;render();};
$('#poetry-submit').onclick=async()=>{
  if(solved || !question) return;
  const guess=selected.map(i=>question.tiles[i]).join('');
  if(guess.length!==(question.length || question.answer.length)) return;
  if(act) { await act({type:'poetry_guess',guess}); return; }
  const match=question.answers.find(a=>a.line===guess);
  if(match) {solved=true; question={...question,answer:guess,title:match.title,author:match.author};render();}
  else $('#poetry-status').textContent='还没拼对，试着调整字的顺序。';
};
