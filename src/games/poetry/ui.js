import { capturePoetryCard, animatePoetryCompletion, animatePoetryNext } from './transition.mjs';
import { makeQuestion, validAnswers, guessMembership } from './engine.mjs';
const $ = s => document.querySelector(s);
let poems, question, selected = [], solved = false, round = 0, room, act, busy = false, feedback = null, reviewing = false, revealed = false;
export async function loadPoetry() {
  if (!poems) {
    const response = await fetch('./data/poetry-curated.json');
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
  if (busy || finishTransition) return;
  busy = true;
  $('#poetry-next').disabled = true;
  try {
    if (act) await act({type:'start_poetry', question:await createPoetryQuestion()});
    else { question = await createPoetryQuestion(); round++; selected=[]; solved=false; feedback=null; reviewing=false; revealed=false; render(); }
  } catch (error) { $('#poetry-status').hidden=false; $('#poetry-status').textContent = error.message; }
  finally { busy=false; $('#poetry-next').disabled=false; }
}
export function renderPoetryRoom(state, playerId) {
  room = {state,playerId};
  if (!state.poetry) return;
  if (question?.id !== state.poetry.id) { selected=[]; feedback=null; reviewing=false; revealed=false; }
  if (state.poetryFeedback?.guess === selected.map(i=>state.poetry.tiles[i]).join('')) feedback=state.poetryFeedback;
  question = state.poetry; round=state.round; solved=state.phase==='poetry_solved';
  render();
}
let renderedKey, renderedSolved = false, finishTransition = null;
function render() {
  if (!question) return;
  const key = question.id || `${round}:${question.poemId}`;
  if (finishTransition && key === renderedKey && solved === renderedSolved) return;
  if (finishTransition) finishTransition();
  const changingQuestion = renderedKey !== undefined && key !== renderedKey && !solved;
  const completing = key === renderedKey && !renderedSolved && solved;
  const before = completing ? capturePoetryCard() : null;
  const answer = room ? room.state.revealedAnswer : question.answer;
  const moveLetters = !revealed && before?.letters.map(l=>l.text).join('') === answer;
  renderedKey = key; renderedSolved = solved;
  if (completing) finishTransition = animatePoetryCompletion(before, moveLetters, renderContent, ()=>{finishTransition=null;});
  else if (changingQuestion) finishTransition = animatePoetryNext(renderContent, ()=>{finishTransition=null;});
  else renderContent();
}
function renderContent() {
  if (!question) return;
  $('#poetry-game').classList.toggle('is-solved', solved);
  $('#poetry-title').textContent = solved ? (revealed ? '本题诗句' : '答对了') : '拼出诗句';
  $('#poetry-tiles').hidden = solved && !reviewing;
  $('#poetry-review').hidden = !solved;
  $('#poetry-review').textContent = reviewing ? '收起字盘' : '查看字盘';
  $('#poetry-instruction').hidden = solved;
  $('#poetry-status').hidden = !room && (solved || !feedback);
  $('#poetry-review').setAttribute('aria-expanded', String(reviewing));
  $('.poetry-edit-actions').hidden = solved;
  $('#poetry-source').hidden = !solved;
  $('#poetry-round').textContent = `第 ${round} 题 · ${{basic:"入门",normal:"普通",advanced:"进阶"}[question.tier] || "入门"} · ${question.tiles.length} 选 ${question.length || question.answer.length}`;
  const length = question.length || question.answer.length;
  if (solved) {
    const answer = room ? room.state.revealedAnswer : question.answer;
    const used = new Set();
    selected = [...answer].map(char => { const i = question.tiles.findIndex((c, i) => c === char && !used.has(i)); used.add(i); return i; });
  }
  $('#poetry-slots').style.setProperty('--letters', length);
  const slots = $('#poetry-slots');
  while(slots.children.length > length) slots.lastElementChild.remove();
  for(let i=0;i<length;i++) {
    let button=slots.children[i];
    if(!button) { button=document.createElement('button');button.append(document.createElement('span'));slots.append(button); }
    const glyph=button.firstElementChild;glyph.className='poetry-glyph';
    button.title='';
    button.type='button'; button.className='poetry-slot';
    const text=selected[i] === undefined ? '' : question.tiles[selected[i]];
    if(glyph.textContent!==text) glyph.textContent=text;
    if (!solved && question.tier==='advanced' && feedback && selected[i]!==undefined) {
      button.classList.add(feedback.present[i] ? 'guess-present' : 'guess-absent');
      button.title=feedback.present[i] ? '目标句中有这个字，不代表位置正确' : '目标句中没有这个字，或数量已用完';
    }
    button.setAttribute('aria-label',`第 ${i+1} 字${button.textContent ? ' '+button.textContent+(button.title ? '，'+button.title : '')+'，点击撤回' : '，待选'}`);
    button.disabled=solved || selected[i]===undefined;
    button.onclick=()=>{if(solved)return;selected.splice(i,1);feedback=null;render();};
  }
  slots.setAttribute('aria-label', solved ? selected.map(i=>question.tiles[i]).join('') : '已选诗句');
  $('#poetry-tiles').style.setProperty('--columns',length===5 ? 3:4);
  $('#poetry-tiles').replaceChildren(...question.tiles.map((char,i)=> {
    const button=document.createElement('button'); button.type='button'; button.className='poetry-tile';
    if (solved) button.classList.add(selected.includes(i) ? 'review-answer' : 'review-extra');
    button.textContent=char; button.disabled=solved || selected.includes(i) || selected.length===length;
    button.setAttribute('aria-label',`${char}，第 ${i+1} 块${solved ? (selected.includes(i) ? '，答案用字' : '，干扰字') : ''}`);
    button.onclick=()=>{selected.push(i);feedback=null;render();};return button;
  }));
  $('#poetry-submit').disabled=solved || selected.length!==length;
  $('#poetry-clear').disabled=solved || !selected.length;
  $('#poetry-next').textContent=solved ? '下一题' : '跳过';
  $('#poetry-next').classList.toggle('quiet-button', !solved);
  $('#poetry-next').hidden=room ? room.playerId!==room.state.hostId : !solved;
  $('#poetry-reveal').hidden=!!room || solved;
  $('#poetry-status').textContent=solved ? (room ? `${room.state.players.find(p=>p.id===room.state.winner)?.name || '玩家'} 已答对！${room.playerId!==room.state.hostId ? '等待房主开始下一题。' : ''}` : '读罢此句，再拾新诗。') : feedback && question.tier==='advanced' ? '还没拼对。绿色：目标句中有；灰色：没有或数量超出。颜色不表示位置正确。' : '';
  $('#poetry-source').textContent=solved ? (room ? `${question.author}《${question.title}》` : `${question.author} ·《${question.title}》`) : '';
}
$('#poetry-review').onclick=()=>{reviewing=!reviewing;render();};
$('#poetry-clear').onclick=()=>{selected=[];feedback=null;render();};
$('#poetry-next').onclick=next;
$('#poetry-reveal').onclick=()=>{revealed=true;solved=true;render();};
$('#poetry-submit').onclick=async()=>{
  if(solved || !question || finishTransition) return;
  const guess=selected.map(i=>question.tiles[i]).join('');
  if(guess.length!==(question.length || question.answer.length)) return;
  if(act) { await act({type:'poetry_guess',guess}); return; }
  const match=question.answers.find(a=>a.line===guess);
  if(match) {revealed=false;solved=true; question={...question,answer:guess,title:match.title,author:match.author};render();}
  else if(question.tier==='advanced') { feedback={guess,present:guessMembership(question.answer,guess)};render(); }
  else { $('#poetry-status').hidden=false; $('#poetry-status').textContent='还没拼对，试着调整字的顺序。'; }
};
