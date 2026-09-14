const $ = (selector) => document.querySelector(selector);
const ui = {
  mode: $("#mode-label"), round: $("#round-label"), timer: $("#timer"),
  status: $("#status"), hint: $("#hint"), history: $("#history"), wrongGuesses: $("#wrong-guesses"),
  form: $("#guess-form"), input: $("#guess"), submit: $("#submit"),
  notice: $("#notice"), next: $("#next"),
};

const HAN_2 = /^[\u3400-\u9fff]{2}$/u;
const HAN_4 = /^[\u3400-\u9fff]{4}$/u;
const FALLBACK_HINTS = ["意境", "典故", "情状", "修辞", "故事", "哲理"];
let idioms = [];
let port;
let context;
let roomState;
let clockOffset = 0;
let timerHandle;
let generationKey;
let solo;
const pending = new Map();

function announceReady() {
  window.parent.postMessage({ type: "playweft:bridge-ready", version: 1 }, "*");
}
const bridgeProbe = window.setInterval(announceReady, 500);
announceReady();

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.data?.type !== "playweft:bridge") return;
  const [candidate] = event.ports;
  if (!candidate) return;
  port = candidate;
  window.clearInterval(bridgeProbe);
  port.onmessage = onMessage;
  port.start();
  rpc("game.initialize").then(startPlayweft).catch((error) => showNotice(error.message));
});

function rpc(method, params) {
  if (!port) return Promise.reject(new Error("Playweft bridge is unavailable"));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    port.postMessage({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
  });
}

function onMessage(event) {
  const message = event.data;
  if (message?.jsonrpc !== "2.0") return;
  if (Object.hasOwn(message, "id")) {
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
    return;
  }
  if (message.method === "game.state") applyRoomState(message.params);
}

async function startPlayweft(initialContext) {
  context = initialContext;
  ui.mode.textContent = context.mode === "room" ? "双人对战" : "单人模式";
  if (context.mode === "solo") startSolo();
}

async function loadIdioms() {
  if (idioms.length) return idioms;
  const response = await fetch("./data/idioms_top4500.txt");
  if (!response.ok) throw new Error("题库加载失败");
  idioms = (await response.text()).split(/\r?\n/).map((line) => line.split("\t")[0]).filter((word) => HAN_4.test(word));
  if (!idioms.length) throw new Error("题库为空");
  return idioms;
}

function clean(value) { return String(value ?? "").trim().replace(/\s/g, ""); }
function isValidHint(hint, answer) {
  return HAN_2.test(hint) && [...hint].every((character) => ![...answer].includes(character));
}
function pickFallback(answer, round) {
  const offset = [...answer].reduce((sum, character) => sum + character.codePointAt(0), 0);
  return FALLBACK_HINTS[(offset + round - 1) % FALLBACK_HINTS.length];
}
function extractHint(reply, answer) {
  const labeled = [...reply.matchAll(/(?:最终提示|提示)\s*[：:]\s*([\u3400-\u9fff]{2})/gu)]
    .map((match) => match[1]);
  return labeled.reverse().find((value) => isValidHint(value, answer));
}

async function askAi(answer, hints, guesses, round) {
  const transcript = guesses.length
    ? guesses.map((item) => `第${item.round}轮猜测：${item.guess}`).join("；")
    : "无";
  const prompt = [
    "你是中文成语游戏的线索设计师。",
    `答案成语：${answer}。`,
    `已有提示：${hints.join("、") || "无"}。`,
    `此前双方猜测：${transcript}。`,
    "先分析成语含义、禁用字与候选提示，再选择语义最贴切者。",
    "最后必须另起一行输出“最终提示：XX”，其中 XX 恰好两个汉字、不含答案中的任何字。",
  ].join("\n");
  const compactRetryPrompt = [
    `答案成语：${answer}。禁用答案中的任何汉字。`,
    "上一轮回答没有完成最终提示。请用极简思考后立刻完成输出。",
    "只输出两行：分析：不超过100字；最终提示：XX。XX 必须恰好两个汉字，且与答案无重字。",
  ].join("\n");
  const debugAi = context?.mode === "solo";
  if (debugAi) console.info("[Hanzi Versus] AI prompt", { prompt, round });
  if (!port) return pickFallback(answer, round);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rawReply = await rpc("languageModel.prompt", { input: attempt === 0 ? prompt : compactRetryPrompt });
      if (debugAi) console.info("[Hanzi Versus] AI response", rawReply);
      const reply = clean(rawReply);
      const candidate = extractHint(reply, answer);
      if (candidate) return candidate;
    } catch (error) {
      if (debugAi) console.error("[Hanzi Versus] AI request failed", error);
      if (attempt === 1) showNotice(`AI 提示不可用，已使用本地线索。${error.message}`);
    }
  }
  return pickFallback(answer, round);
}

function setNotice(message) {
  ui.notice.hidden = !message;
  ui.notice.textContent = message || "";
}
function showNotice(message) { setNotice(message); window.setTimeout(() => setNotice(""), 4800); }
function setHistory(hints) {
  ui.history.replaceChildren(...hints.map((hint, index) => {
    const el = document.createElement("span");
    el.className = `hint-tile${index === hints.length - 1 ? " current" : ""}`;
    el.textContent = hint;
    if (index === hints.length - 1) el.id = "hint";
    return el;
  }));
  ui.hint = $("#hint");
}
function setWrongGuesses(guesses) {
  if (!guesses.length) {
    const empty = document.createElement("span"); empty.className = "empty-state"; empty.textContent = "还没有错误猜测";
    ui.wrongGuesses.replaceChildren(empty); return;
  }
  ui.wrongGuesses.replaceChildren(...guesses.map(({ guess }) => {
    const el = document.createElement("span"); el.className = "wrong-chip"; el.textContent = guess; return el;
  }));
}
function nowServer() { return Date.now() + clockOffset; }

function applyRoomState(update) {
  roomState = update.state;
  clockOffset = Number(update.serverTime ?? Date.now()) - Date.now();
  renderRoom();
  maybeRunRoomAutomation();
}

function playerName(id) {
  return roomState?.players?.find((player) => player.id === id)?.name || "对手";
}

function renderRoom() {
  const state = roomState;
  if (!state) return;
  ui.round.textContent = state.round ? `第 ${state.round} / 6 轮` : "准备中";
  setHistory(state.hints || []);
  if (!(state.hints || []).length) setHistory([state.currentHint || "？"]);
  setWrongGuesses((state.guesses || []).filter((item) => item.player === context.playerId && item.guess !== state.revealedAnswer));
  ui.next.hidden = !(context.playerId === state.hostId && ["solved", "need_new_answer"].includes(state.phase));
  ui.next.textContent = state.phase === "solved" ? "下一题" : "换一个成语";
  const canGuess = ["guessing", "race_window", "last_chance"].includes(state.phase)
    && !(state.phase === "last_chance" && state.extraPlayer !== context.playerId)
    && !(state.phase === "race_window" && state.firstWrongPlayer === context.playerId);
  ui.input.disabled = !canGuess;
  ui.submit.disabled = !canGuess;
  const statuses = {
    awaiting_answer: "房主正在从题库抽取成语…",
    generating: "AI 正在构思新的二字提示…",
    guessing: "双方可同时抢答。",
    race_window: `${playerName(state.firstWrongPlayer)} 未猜中，正在确认是否有竞态提交…`,
    last_chance: state.extraPlayer === context.playerId ? "轮到你：获得一次 8 秒延时猜测。" : "对手正在获得一次延时猜测。",
    solved: `${playerName(state.winner)} 猜中了：${state.revealedAnswer}。`,
    need_new_answer: `六条提示仍未猜出，答案是：${state.revealedAnswer}。`,
  };
  ui.status.textContent = statuses[state.phase] || "同步中…";
  renderTimer(state.deadlineAt || state.raceDeadlineAt);
}

function renderTimer(deadline) {
  window.clearTimeout(timerHandle);
  if (!deadline) { ui.timer.textContent = "--:--"; return; }
  const tick = () => {
    const remaining = Math.max(0, deadline - nowServer());
    ui.timer.textContent = `00:${String(Math.ceil(remaining / 1000)).padStart(2, "0")}`;
    if (remaining > 0) timerHandle = window.setTimeout(tick, 200);
  };
  tick();
}

async function maybeRunRoomAutomation() {
  const state = roomState;
  if (!state) return;
  if (state.phase === "awaiting_answer" && context.playerId === state.hostId) {
    const pool = await loadIdioms().catch((error) => { showNotice(error.message); return []; });
    if (pool.length) await roomAction({ type: "start_game", answer: pool[Math.floor(Math.random() * pool.length)] });
    return;
  }
  if (state.phase === "generating" && context.playerId === state.hostId && state.answerForHint) {
    const key = `${state.round}:${state.hints.length}:${state.answerForHint}`;
    if (generationKey === key) return;
    generationKey = key;
    const hint = await askAi(state.answerForHint, state.hints, state.guesses, state.round);
    if (roomState?.phase === "generating") await roomAction({ type: "set_hint", hint });
    return;
  }
  if (state.phase === "race_window") {
    const delay = Math.max(0, state.raceDeadlineAt - nowServer()) + 30;
    window.setTimeout(() => roomAction({ type: "resolve_race" }), delay);
  }
  if (["guessing", "last_chance"].includes(state.phase) && state.deadlineAt) {
    const delay = Math.max(0, state.deadlineAt - nowServer()) + 30;
    window.setTimeout(() => roomAction({ type: "timeout" }), delay);
  }
}

async function roomAction(action) {
  try {
    const result = await rpc("room.action", { action });
    if (result?.accepted === false) showNotice(result.error?.message || "操作未被接受");
  } catch (error) { showNotice(error.message); }
}

async function startSolo() {
  const pool = await loadIdioms().catch((error) => { showNotice(error.message); return []; });
  if (!pool.length) return;
  solo = { answer: pool[Math.floor(Math.random() * pool.length)], hints: [], guesses: [], round: 0, solved: false };
  setHistory(["？"]); setWrongGuesses([]);
  await nextSoloHint();
}

async function nextSoloHint() {
  if (!solo) return;
  if (solo.round >= 6) {
    solo.solved = true;
    ui.status.textContent = `六条提示仍未猜出，答案是：${solo.answer}`;
    ui.next.hidden = false; ui.next.textContent = "下一题"; return;
  }
  solo.round += 1;
  ui.round.textContent = `第 ${solo.round} / 6 轮`;
  ui.status.textContent = "AI 正在生成二字提示…";
  ui.input.disabled = true; ui.submit.disabled = true;
  const hint = await askAi(solo.answer, solo.hints, solo.guesses, solo.round);
  solo.hints.push(hint);
  setHistory(solo.hints);
  ui.status.textContent = "输入一个四字成语来猜测。";
  ui.input.disabled = false; ui.submit.disabled = false; ui.input.focus();
}

ui.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const guess = clean(ui.input.value);
  if (!HAN_4.test(guess)) return showNotice("请输入恰好四个汉字的成语。");
  ui.input.value = "";
  if (context?.mode === "room") return roomAction({ type: "guess", guess });
  if (!solo || solo.solved) return;
  solo.guesses.push({ round: solo.round, guess });
  if (guess === solo.answer) {
    solo.solved = true; ui.status.textContent = `答对了！答案就是：${solo.answer}`;
    ui.next.hidden = false; ui.next.textContent = "下一题"; ui.input.disabled = true; ui.submit.disabled = true; return;
  }
  setWrongGuesses(solo.guesses);
  showNotice("没有猜中，AI 会给出下一条提示。");
  await nextSoloHint();
});

ui.next.addEventListener("click", async () => {
  if (context?.mode === "room") {
    const pool = await loadIdioms().catch((error) => { showNotice(error.message); return []; });
    if (pool.length) await roomAction({ type: "start_game", answer: pool[Math.floor(Math.random() * pool.length)] });
    return;
  }
  await startSolo(); ui.next.hidden = true; ui.input.disabled = false; ui.submit.disabled = false;
});

// Allows the page to remain usable as a static preview outside Playweft.
window.setTimeout(() => { if (!context) { context = { mode: "solo" }; startSolo(); } }, 900);
