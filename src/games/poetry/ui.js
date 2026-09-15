import { capturePoetryCard, animatePoetryCompletion, animatePoetryNext } from './transition.mjs';
import { makeQuestion, validAnswers, guessMembership } from './engine.mjs';
import { holdToConfirm } from '../../hold-confirm.mjs';
const $ = s => document.querySelector(s);
let poems, question, selected = [], solved = false, round = 0, room, act, busy = false, feedback = null, reviewing = false, revealed = false;
let toastTimer, submitting = false;
function announce(message) { $('#poetry-announcement').textContent = message; }
export function showPoetryNotice(message, wrong = false) {
  announce(message);
  if (wrong) {
    const slots = $('#poetry-slots');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      slots.animate([{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:220});
    for (const slot of slots.children) slot.animate([{borderColor:'#ce6969'},{borderColor:getComputedStyle(slot).borderColor}],{duration:650});
    return;
  }
  clearTimeout(toastTimer);
  const toast = $('#poetry-toast');toast.textContent=message;toast.hidden=false;
  toastTimer=setTimeout(()=>{toast.hidden=true;},4000);
}
function buttonBusy(button, pending) {
  button.setAttribute('aria-busy',String(pending));
  button.disabled=pending;
}
function updateMatch() {
  const el=$('#poetry-match');el.hidden=!act;
  if(!act)return;
  el.textContent=room && solved ? `${room.state.players.find(p=>p.id===room.state.winner)?.name || '玩家'} 已答对 · ${room.playerId===room.state.hostId ? '可开始下一题' : '等待房主开始下一题'}` : question && room ? '双方正在答题' : '等待房主出题…';
  el.title=el.textContent;
}
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
  if (!action) await loadPoetry();
  act = action;
  if (!action) room = null;
  $('#poetry-game').hidden = false;
  updateMatch();
  if (action) return;
  await next();
}
async function next() {
  if (busy || finishTransition) return;
  busy = true;
  buttonBusy($('#poetry-next'),true);
  try {
    if (act) await act({type:'start_poetry', question:await createPoetryQuestion()});
    else { question = await createPoetryQuestion(); round++; selected=[]; solved=false; feedback=null; reviewing=false; revealed=false; render(); }
  } catch (error) { showPoetryNotice(error.message); }
  finally { busy=false; buttonBusy($('#poetry-next'),false); }
}
export function renderPoetryRoom(state, playerId) {
  room = {state,playerId};
  if (!state.poetry) return;
  if (question?.id !== state.poetry.id) { selected=[]; feedback=null; reviewing=false; revealed=false; }
  if (state.poetryFeedback?.guess === guessText()) {
    if (feedback !== state.poetryFeedback) announce('还没拼对。绿色表示目标句中有这个字，灰色表示没有或数量超出，颜色不表示位置。');
    feedback=state.poetryFeedback;
  }
  question = state.poetry; round=state.round; solved=state.phase==='poetry_solved';
  render();
}
let renderedKey, renderedSolved = false, finishTransition = null;
// Slots are positional: selected[i] holds the tile index placed in slot i, or
// undefined for a hole. Removing a character leaves the ones after it alone, and
// the next pick always lands in the first hole.
function slotCount(){ return question ? (question.length || question.answer.length) : 0; }
function filled(){ return selected.filter(i=>i!==undefined).length; }
function complete(){ return filled()===slotCount(); }
function guessText(){ return selected.map(i=>i===undefined ? '' : question.tiles[i]).join(''); }
function render() {
  if (!question) return;
  const key = question.id || `${round}:${question.poemId}`;
  if (finishTransition && key === renderedKey && solved === renderedSolved) return;
  if (finishTransition) finishTransition();
  const changingQuestion = renderedKey !== undefined && key !== renderedKey && !solved;
  const completing = key === renderedKey && !renderedSolved && solved;
  if (changingQuestion || completing) { clearTimeout(toastTimer);$('#poetry-toast').hidden=true; }
  if (completing) announce(room ? `${room.state.players.find(p=>p.id===room.state.winner)?.name || '玩家'} 已答对` : revealed ? '已揭晓诗句' : '答对了');
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
  $('#poetry-title').textContent = solved ? (revealed ? '本题诗句' : '答对了') : '';
  $('#poetry-heading').hidden = !solved;
  $('#poetry-tiles').hidden = solved && !reviewing;
  $('#poetry-review').hidden = !solved;
  $('#poetry-review').textContent = reviewing ? '收起字盘' : '查看字盘';
  updateMatch();
  $('#poetry-review').setAttribute('aria-expanded', String(reviewing));
  $('.poetry-edit-actions').hidden = solved;
  $('#poetry-source').hidden = !solved;
  $('#poetry-round').textContent = {basic:"入门",normal:"普通",advanced:"进阶"}[question.tier] || "入门";
  const length = question.length || question.answer.length;
  if (solved) {
    const answer = room ? room.state.revealedAnswer : question.answer;
    const used = new Set();
    selected = [...answer].map(char => { const i = question.tiles.findIndex((c, i) => c === char && !used.has(i)); used.add(i); return i; });
  } else if (selected.length !== length) {
    // Keep the slot array exactly as long as the answer; extra entries are holes.
    selected = Array.from({length}, (_, i) => selected[i]);
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
    button.onclick=()=>{if(solved)return;selected[i]=undefined;feedback=null;render();};
  }
  slots.setAttribute('aria-label', solved ? guessText() : '已选诗句');
  $('#poetry-tiles').style.setProperty('--columns',length===5 ? 3:4);
  $('#poetry-tiles').replaceChildren(...question.tiles.map((char,i)=> {
    const button=document.createElement('button'); button.type='button'; button.className='poetry-tile';
    const placed=selected.includes(i);
    if (solved) button.classList.add(placed ? 'review-answer' : 'review-extra');
    else if (placed) button.classList.add('is-used');
    button.textContent=char; button.disabled=solved || (!placed && complete());
    button.setAttribute('aria-label',`${char}，第 ${i+1} 块${solved ? (placed ? '，答案用字' : '，干扰字') : placed ? '，已填入，点击撤回' : '，点击填入'}`);
    button.onclick=()=>{
      const at=selected.indexOf(i);
      if(at!==-1) selected[at]=undefined;          // put this exact tile back
      else { const slot=selected.indexOf(undefined); if(slot===-1) return; selected[slot]=i; }
      feedback=null;render();
    };return button;
  }));
  $('#poetry-submit').disabled=submitting || solved || !complete();
  $('#poetry-clear').disabled=solved || !filled();
  $('#poetry-next').textContent=solved ? '下一题' : '跳过';
  $('#poetry-next').classList.toggle('quiet-button', !solved);
  $('#poetry-next').hidden=room ? room.playerId!==room.state.hostId : !solved;
  $('#poetry-reveal').hidden=!!room || solved;
  $('#poetry-next').closest('.poetry-navigation').hidden=$('#poetry-next').hidden;
  $('#poetry-source').textContent=solved ? (room ? `${question.author}《${question.title}》` : `${question.author} ·《${question.title}》`) : '';
}
$('#poetry-review').onclick=()=>{reviewing=!reviewing;render();};
$('#poetry-clear').onclick=()=>{selected=[];feedback=null;render();};
$('#poetry-next').onclick=next;
// Revealing forfeits the question, so it takes a deliberate hold. Keyboard and
// assistive activation confirm straight away instead of faking the gesture.
holdToConfirm($('#poetry-reveal'),{
  onConfirm:()=>{ if (!question || solved || room || finishTransition) return; revealed=true; solved=true; render(); },
});
$('#poetry-submit').onclick=async()=>{
  if(submitting || solved || !question || finishTransition) return;
  const guess=guessText();
  if(guess.length!==(question.length || question.answer.length)) return;
  if(act) {
    submitting=true;buttonBusy($('#poetry-submit'),true);
    try { await act({type:'poetry_guess',guess}); }
    finally { submitting=false;buttonBusy($('#poetry-submit'),false);$('#poetry-submit').disabled=solved || !complete(); }
    return;
  }
  const match=question.answers.find(a=>a.line===guess);
  if(match) {revealed=false;solved=true; question={...question,answer:guess,title:match.title,author:match.author};render();}
  else if(question.tier==='advanced') { feedback={guess,present:guessMembership(question.answer,guess)};render();announce('还没拼对。绿色表示目标句中有这个字，灰色表示没有或数量超出，颜色不表示位置。'); }
  else showPoetryNotice('还没拼对，试着调整字的顺序。',true);
};
