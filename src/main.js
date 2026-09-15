import { HAN_4, clean, loadIdioms } from "./games/idiom/engine.mjs";
import { generateIdiomHint } from "./games/idiom/hints.mjs";
import {
  startPoetry,
  createPoetryQuestion,
  renderPoetryRoom,
  showPoetryNotice,
} from "./games/poetry/ui.js";
const $ = (selector) => document.querySelector(selector);
const ui = {
  startScreen: $("#start-screen"),
  startButtons: [...document.querySelectorAll("[data-play-mode]")],
  startStatus: $("#start-status"),
  game: $("#game"),
  mode: $("#mode-label"),
  round: $("#round-label"),
  timer: $("#timer"),
  status: $("#status"),
  hint: $("#hint"),
  history: $("#history"),
  wrongGuesses: $("#wrong-guesses"),
  form: $("#guess-form"),
  input: $("#guess"),
  submit: $("#submit"),
  notice: $("#notice"),
  next: $("#next"),
};

let port;
let context;
let roomState;
let clockOffset = 0;
let timerHandle;
let generationKey;
let hintFailure = null,
  soloHintBusy = false;
let solo;
let started = false;
let activeMode = "idiom";
let poetryStarting = false;
const pending = new Map();

function announceReady() {
  window.parent.postMessage({ type: "playweft:bridge-ready", version: 1 }, "*");
}
const bridgeProbe = window.setInterval(announceReady, 500);
announceReady();

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.data?.type !== "playweft:bridge")
    return;
  const [candidate] = event.ports;
  if (!candidate) return;
  port = candidate;
  window.clearInterval(bridgeProbe);
  port.onmessage = onMessage;
  port.start();
  rpc("game.initialize")
    .then(startPlayweft)
    .catch((error) => showNotice(error.message));
});

function rpc(method, params) {
  if (!port) return Promise.reject(new Error("Playweft bridge is unavailable"));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    port.postMessage({
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined ? {} : { params }),
    });
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
  updateStartScreen();
  if (started && context.mode === "room") {
    renderRoom();
    maybeRunRoomAutomation();
  }
}

function updateStartScreen() {
  const inRoom = context?.mode === "room";
  const guestWaiting =
    inRoom &&
    roomState &&
    context.playerId !== roomState.hostId &&
    !roomState.gameType;
  ui.startButtons.forEach((button) => {
    button.disabled =
      started ||
      !context ||
      (inRoom && !roomState) ||
      guestWaiting ||
      Boolean(
        inRoom &&
        roomState?.gameType &&
        roomState.gameType !== button.dataset.playMode,
      );
  });
  ui.startStatus.textContent = !context
    ? "正在连接…"
    : inRoom && !roomState
      ? "正在同步房间…"
      : guestWaiting
        ? "等待房主选择玩法。"
        : inRoom && roomState.gameType
          ? "点击对应玩法，加入房间。"
          : inRoom
            ? "选择玩法，开始双人对战。"
            : "点击玩法，即可开始。";
}

function askAi(answer, hints, guesses, round) {
  return generateIdiomHint(answer, hints, guesses, round, {
    request: port ? (payload) => rpc("languageModel.prompt", payload) : null,
    debug: context?.mode === "solo",
  });
}

function setNotice(message) {
  ui.notice.hidden = !message;
  ui.notice.textContent = message || "";
}
function showNotice(message) {
  setNotice(message);
  window.setTimeout(() => setNotice(""), 4800);
}
function setHistory(hints) {
  ui.history.replaceChildren(
    ...hints.map((hint, index) => {
      const el = document.createElement("span");
      el.className = `hint-tile${index === hints.length - 1 ? " current" : ""}`;
      el.textContent = hint;
      if (index === hints.length - 1) el.id = "hint";
      return el;
    }),
  );
  ui.hint = $("#hint");
}
function setWrongGuesses(guesses) {
  if (!guesses.length) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = "还没有错误猜测";
    ui.wrongGuesses.replaceChildren(empty);
    return;
  }
  ui.wrongGuesses.replaceChildren(
    ...guesses.map(({ guess }) => {
      const el = document.createElement("span");
      el.className = "wrong-chip";
      el.textContent = guess;
      return el;
    }),
  );
}
function nowServer() {
  return Date.now() + clockOffset;
}

function applyRoomState(update) {
  roomState = update.state;
  updateStartScreen();
  clockOffset = Number(update.serverTime ?? Date.now()) - Date.now();
  if (!started || !context) return;
  if (roomState.gameType === "poetry") {
    activeMode = "poetry";
    ui.game.hidden = true;
    startPoetry(roomAction);
    renderPoetryRoom(roomState, context.playerId);
    return;
  }
  if (activeMode === "poetry") {
    if (
      !roomState.gameType &&
      context.playerId === roomState.hostId &&
      !poetryStarting
    ) {
      poetryStarting = true;
      createPoetryQuestion()
        .then((question) => roomAction({ type: "start_poetry", question }))
        .catch((error) => {
          showPoetryNotice(error.message);
        })
        .finally(() => {
          poetryStarting = false;
        });
    }
    return;
  }
  renderRoom();
  maybeRunRoomAutomation();
}

function playerName(id) {
  return roomState?.players?.find((player) => player.id === id)?.name || "对手";
}

function renderRoom() {
  const state = roomState;
  if (!state || activeMode === "poetry") return;
  ui.round.textContent = state.round ? `第 ${state.round} / 6 轮` : "准备中";
  setHistory(state.hints || []);
  if (!(state.hints || []).length) setHistory([state.currentHint || "？"]);
  setWrongGuesses(
    (state.guesses || []).filter(
      (item) =>
        item.player === context.playerId && item.guess !== state.revealedAnswer,
    ),
  );
  ui.next.hidden = !(
    context.playerId === state.hostId &&
    ["solved", "need_new_answer"].includes(state.phase)
  );
  ui.next.textContent = state.phase === "solved" ? "下一题" : "换一个成语";
  const canGuess =
    ["guessing", "race_window", "last_chance"].includes(state.phase) &&
    !(
      state.phase === "last_chance" && state.extraPlayer !== context.playerId
    ) &&
    !(
      state.phase === "race_window" &&
      state.firstWrongPlayer === context.playerId
    );
  ui.input.disabled = !canGuess;
  ui.submit.disabled = !canGuess;
  const statuses = {
    awaiting_answer: "房主正在从题库抽取成语…",
    generating: "AI 正在构思新的二字提示…",
    guessing: "双方可同时抢答。",
    race_window: `${playerName(state.firstWrongPlayer)} 未猜中，正在确认是否有竞态提交…`,
    last_chance:
      state.extraPlayer === context.playerId
        ? "轮到你：获得一次 8 秒延时猜测。"
        : "对手正在获得一次延时猜测。",
    solved: `${playerName(state.winner)} 猜中了：${state.revealedAnswer}。`,
    need_new_answer: `六条提示仍未猜出，答案是：${state.revealedAnswer}。`,
  };
  ui.status.textContent = statuses[state.phase] || "同步中…";
  const failed =
    state.phase === "generating" &&
    hintFailure?.key ===
      `${state.round}:${state.hints.length}:${state.answerForHint}`;
  $("#retry-hint").hidden = !failed;
  if (failed) ui.status.textContent = hintFailure.message;
  renderTimer(
    state.phase === "generating"
      ? null
      : state.deadlineAt || state.raceDeadlineAt,
  );
}

function renderTimer(deadline) {
  window.clearTimeout(timerHandle);
  if (!deadline) {
    ui.timer.textContent = "--:--";
    return;
  }
  const tick = () => {
    const remaining = Math.max(0, deadline - nowServer());
    ui.timer.textContent = `00:${String(Math.ceil(remaining / 1000)).padStart(2, "0")}`;
    if (remaining > 0) timerHandle = window.setTimeout(tick, 200);
  };
  tick();
}

async function maybeRunRoomAutomation() {
  const state = roomState;
  if (
    !started ||
    !context ||
    !state ||
    activeMode === "poetry" ||
    state.gameType === "poetry"
  )
    return;
  if (state.phase === "awaiting_answer" && context.playerId === state.hostId) {
    const pool = await loadIdioms().catch((error) => {
      showNotice(error.message);
      return [];
    });
    if (pool.length)
      await roomAction({
        type: "start_game",
        answer: pool[Math.floor(Math.random() * pool.length)],
      });
    return;
  }
  if (
    state.phase === "generating" &&
    context.playerId === state.hostId &&
    state.answerForHint
  ) {
    const key = `${state.round}:${state.hints.length}:${state.answerForHint}`;
    if (generationKey === key) return;
    generationKey = key;
    hintFailure = null;
    $("#retry-hint").hidden = true;
    try {
      const hint = await askAi(
        state.answerForHint,
        state.hints,
        state.guesses,
        state.round,
      );
      if (
        roomState?.phase === "generating" &&
        `${roomState.round}:${roomState.hints.length}:${roomState.answerForHint}` ===
          key
      )
        await roomAction({ type: "set_hint", hint });
    } catch (error) {
      if (roomState?.phase === "generating" && generationKey === key) {
        hintFailure = { key, message: error.message };
        renderRoom();
      }
    }
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
    if (result?.accepted === false) {
      const message = result.error?.message || "操作未被接受";
      if (activeMode === "poetry") showPoetryNotice(message, result.error?.code === "TRY_AGAIN");
      else showNotice(message);
    }
  } catch (error) {
    if (activeMode === "poetry")
      showPoetryNotice(error.message);
    else showNotice(error.message);
  }
}

async function startSolo() {
  const pool = await loadIdioms().catch((error) => {
    showNotice(error.message);
    return [];
  });
  if (!pool.length) return;
  solo = {
    answer: pool[Math.floor(Math.random() * pool.length)],
    hints: [],
    guesses: [],
    round: 0,
    solved: false,
  };
  ui.round.textContent = "准备中";
  setHistory(["？"]);
  setWrongGuesses([]);
  await nextSoloHint();
}

async function nextSoloHint() {
  if (!solo || soloHintBusy) return;
  if (solo.round >= 6) {
    solo.solved = true;
    ui.status.textContent = `六条提示仍未猜出，答案是：${solo.answer}`;
    ui.next.hidden = false;
    ui.next.textContent = "下一题";
    return;
  }
  soloHintBusy = true;
  $("#retry-hint").hidden = true;
  ui.status.textContent = "AI 正在生成二字提示…";
  ui.input.disabled = true;
  ui.submit.disabled = true;
  renderTimer(null);
  const current = solo;
  try {
    const hint = await askAi(
      current.answer,
      current.hints,
      current.guesses,
      current.round + 1,
    );
    if (solo !== current) return;
    current.round += 1;
    current.hints.push(hint);
    ui.round.textContent = `第 ${current.round} / 6 轮`;
    setHistory(current.hints);
    ui.status.textContent = "输入一个四字成语来猜测。";
    ui.input.disabled = false;
    ui.submit.disabled = false;
    ui.input.focus();
  } catch (error) {
    if (solo === current) {
      ui.status.textContent = error.message;
      $("#retry-hint").hidden = false;
    }
  } finally {
    soloHintBusy = false;
  }
}

ui.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const guess = clean(ui.input.value);
  if (!HAN_4.test(guess)) return showNotice("请输入恰好四个汉字的成语。");
  ui.input.value = "";
  if (context?.mode === "room") return roomAction({ type: "guess", guess });
  if (!solo || solo.solved || soloHintBusy || ui.submit.disabled) return;
  solo.guesses.push({ round: solo.round, guess });
  if (guess === solo.answer) {
    solo.solved = true;
    ui.status.textContent = `答对了！答案就是：${solo.answer}`;
    ui.next.hidden = false;
    ui.next.textContent = "下一题";
    ui.input.disabled = true;
    ui.submit.disabled = true;
    return;
  }
  setWrongGuesses(solo.guesses);
  showNotice("没有猜中，AI 会给出下一条提示。");
  await nextSoloHint();
});

ui.next.addEventListener("click", async () => {
  if (context?.mode === "room") {
    const pool = await loadIdioms().catch((error) => {
      showNotice(error.message);
      return [];
    });
    if (pool.length)
      await roomAction({
        type: "start_game",
        answer: pool[Math.floor(Math.random() * pool.length)],
      });
    return;
  }
  ui.next.hidden = true;
  await startSolo();
});

ui.startButtons.forEach((button) =>
  button.addEventListener("click", async () => {
    if (started || !context || button.disabled) return;
    activeMode = button.dataset.playMode;
    if (context.mode === "room" && roomState?.gameType)
      activeMode = roomState.gameType;
    else if (context.mode === "room" && context.playerId !== roomState?.hostId)
      activeMode = "idiom";
    started = true;
    updateStartScreen();
    if (activeMode === "poetry") {
      button.setAttribute("aria-busy", "true");
      try {
        await startPoetry(context.mode === "room" ? roomAction : undefined);
        ui.startScreen.hidden = true;
        if (context.mode === "room") {
          if (roomState?.gameType === "poetry")
            renderPoetryRoom(roomState, context.playerId);
          else if (context.playerId === roomState?.hostId)
            await roomAction({
              type: "start_poetry",
              question: await createPoetryQuestion(),
            });
        }
      } catch (error) {
        started = false;
        $("#poetry-game").hidden = true;
        ui.startScreen.hidden = false;
        updateStartScreen();
        ui.startStatus.textContent = error.message;
      } finally {
        button.setAttribute("aria-busy", "false");
      }
      return;
    }
    ui.startScreen.hidden = true;
    ui.game.hidden = false;
    ui.input.disabled = true;
    ui.submit.disabled = true;
    if (context.mode === "room") {
      ui.status.textContent = "等待房间同步…";
      renderRoom();
      await maybeRunRoomAutomation();
    } else {
      await startSolo();
      if (!solo) {
        started = false;
        ui.game.hidden = true;
        ui.startScreen.hidden = false;
        updateStartScreen();
        ui.startStatus.textContent = "题库加载失败，请点击玩法重试。";
      }
    }
  }),
);

// Static previews can start locally; embedded games wait for their bridge.
if (window.parent === window) {
  context = { mode: "solo" };
  updateStartScreen();
}

$("#retry-hint").onclick = async () => {
  if (context?.mode === "room") {
    if (
      !hintFailure ||
      context.playerId !== roomState?.hostId ||
      roomState.phase !== "generating"
    )
      return;
    hintFailure = null;
    generationKey = null;
    renderRoom();
    await maybeRunRoomAutomation();
  } else await nextSoloHint();
};
