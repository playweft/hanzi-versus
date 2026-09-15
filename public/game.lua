local function reject(code, message)
  return { accepted = false, error = { code = code, message = message } }
end

local function player_ids(state)
  local ids = {}
  for _, player in ipairs(state.players) do table.insert(ids, player.id) end
  return ids
end

local function is_player(state, id)
  for _, player in ipairs(state.players) do
    if player.id == id then return true end
  end
  return false
end

local function other_player(state, id)
  for _, player in ipairs(state.players) do
    if player.id ~= id then return player.id end
  end
  return nil
end

local function reset_for_answer(state, answer)
  state.answer = answer
  state.round = 1
  state.phase = "generating"
  state.hints = {}
  state.guesses = {}
  state.currentHint = nil
  state.attempts = {}
  state.revealedAnswer = nil
  state.deadlineAt = nil
  state.raceDeadlineAt = nil
  state.firstWrongPlayer = nil
  state.extraPlayer = nil
  state.winner = nil
end

local function next_prompt(state)
  state.currentHint = nil
  state.attempts = {}
  state.deadlineAt = nil
  state.raceDeadlineAt = nil
  state.firstWrongPlayer = nil
  state.extraPlayer = nil
  state.winner = nil
  if state.round >= 6 then
    state.phase = "need_new_answer"
    state.revealedAnswer = state.answer
  else
    state.round = state.round + 1
    state.phase = "generating"
  end
end

local function record_guess(state, actor, guess, kind)
  table.insert(state.guesses, {
    round = state.round,
    player = actor,
    guess = guess,
    kind = kind,
  })
end

function setup(context)
  return {
    state = {
      players = context.players,
      hostId = context.match.ownerId,
      phase = "awaiting_answer",
      round = 0,
      hints = {},
      guesses = {},
      attempts = {},
    },
    events = {},
  }
end

function on_action(state, action, context)
  if not is_player(state, context.actor.id) then
    return reject("NOT_A_PLAYER", "Spectators cannot play")
  end

  if action.type == "start_poetry" then
    if context.actor.id ~= state.hostId then return reject("HOST_ONLY", "由房主开始下一题") end
    local q = action.question
    if type(q) ~= "table" or type(q.answer) ~= "string" or (#q.answer ~= 15 and #q.answer ~= 21)
      or type(q.tiles) ~= "table" or type(q.answers) ~= "table" or #q.answers > 2000
      or type(q.title) ~= "string" or type(q.author) ~= "string" then
      return reject("INVALID_QUESTION", "诗句题目无效")
    end
    local size = #q.answer / 3
    if #q.tiles ~= (size == 5 and 9 or 12) then return reject("INVALID_TILES", "选字数量无效") end
    local counts = {}
    for _, c in ipairs(q.tiles) do
      if type(c) ~= "string" or #c ~= 3 then return reject("INVALID_TILES", "字块无效") end
      counts[c] = (counts[c] or 0) + 1
    end
    for i = 1, #q.answer, 3 do
      local c = string.sub(q.answer, i, i + 2)
      if not counts[c] or counts[c] == 0 then return reject("INVALID_TILES", "字块缺少答案用字") end
      counts[c] = counts[c] - 1
    end
    state.gameType = "poetry"
    state.round = state.round + 1
    state.phase = "poetry_guessing"
    state.poetry = { id = tostring(context.actionAt) .. ":" .. tostring(state.round), tiles = q.tiles, length = size, tier = (q.tier == "normal" or q.tier == "advanced") and q.tier or "basic" }
    state.poetryFeedback = {}
    state.poetryAnswers = q.answers
    state.answer = q.answer
    state.poetryTitle = q.title
    state.poetryAuthor = q.author
    state.winner = nil
    state.revealedAnswer = nil
    state.deadlineAt = nil
    state.raceDeadlineAt = nil
    return { accepted = true, state = state, events = {} }
  end
  if action.type == "poetry_guess" then
    if state.gameType ~= "poetry" or state.phase ~= "poetry_guessing" then return reject("WRONG_PHASE", "本题已经结束") end
    if type(action.guess) ~= "string" or #action.guess ~= state.poetry.length * 3 then return reject("INVALID_GUESS", "请选择完整诗句") end
    local counts = {}
    for _, c in ipairs(state.poetry.tiles) do counts[c] = (counts[c] or 0) + 1 end
    for i = 1, #action.guess, 3 do
      local c = string.sub(action.guess, i, i + 2)
      if not counts[c] or counts[c] == 0 then return reject("INVALID_GUESS", "请选择题面中的汉字") end
      counts[c] = counts[c] - 1
    end
    local correct = action.guess == state.answer
    for _, answer in ipairs(state.poetryAnswers) do
      if answer.line == action.guess then
        correct = true
        state.poetryTitle = answer.title
        state.poetryAuthor = answer.author
        break
      end
    end
    if not correct then
      if state.poetry.tier ~= "advanced" then return reject("TRY_AGAIN", "还没拼对，试着调整字的顺序。") end
      local remaining, present = {}, {}
      for i = 1, #state.answer, 3 do
        local c = string.sub(state.answer, i, i + 2)
        remaining[c] = (remaining[c] or 0) + 1
      end
      for i = 1, #action.guess, 3 do
        local c = string.sub(action.guess, i, i + 2)
        local found = (remaining[c] or 0) > 0
        present[#present + 1] = found
        if found then remaining[c] = remaining[c] - 1 end
      end
      state.poetryFeedback = state.poetryFeedback or {}
      state.poetryFeedback[context.actor.id] = { guess = action.guess, present = present }
      return { accepted = true, state = state, events = {} }
    end
    state.phase = "poetry_solved"
    state.winner = context.actor.id
    state.revealedAnswer = action.guess
    state.poetry.title = state.poetryTitle
    state.poetry.author = state.poetryAuthor
    return { accepted = true, state = state, events = {} }
  end
  if state.gameType == "poetry" then return reject("WRONG_MODE", "当前为拾字成诗") end

  if action.type == "start_game" then
    if context.actor.id ~= state.hostId then
      return reject("HOST_ONLY", "Only the room host may start a new idiom")
    end
    if type(action.answer) ~= "string" or #action.answer ~= 12 then
      return reject("INVALID_ANSWER", "Answer must be a four-character Chinese idiom")
    end
    state.gameType = "idiom"
    reset_for_answer(state, action.answer)
    return { accepted = true, state = state, events = { { type = "new_idiom" } } }
  end

  if action.type == "set_hint" then
    if context.actor.id ~= state.hostId then
      return reject("HOST_ONLY", "Only the room host may publish an AI hint")
    end
    if state.phase ~= "generating" then
      return reject("WRONG_PHASE", "A hint is not needed now")
    end
    if type(action.hint) ~= "string" or #action.hint ~= 6 then
      return reject("INVALID_HINT", "Hint must contain exactly two Chinese characters")
    end
    state.currentHint = action.hint
    table.insert(state.hints, action.hint)
    state.phase = "guessing"
    state.deadlineAt = context.actionAt + 20000
    return { accepted = true, state = state, events = { { type = "hint", round = state.round } } }
  end

  if action.type == "resolve_race" then
    if state.phase ~= "race_window" then
      return reject("WRONG_PHASE", "There is no race to resolve")
    end
    if context.actionAt < state.raceDeadlineAt then
      return reject("TOO_EARLY", "The simultaneous-submit window is still open")
    end
    state.phase = "last_chance"
    state.extraPlayer = other_player(state, state.firstWrongPlayer)
    state.deadlineAt = context.actionAt + 8000
    return { accepted = true, state = state, events = { { type = "last_chance", player = state.extraPlayer } } }
  end

  if action.type == "timeout" then
    if state.phase == "guessing" and context.actionAt >= state.deadlineAt then
      next_prompt(state)
      return { accepted = true, state = state, events = { { type = "round_timeout" } } }
    end
    if state.phase == "last_chance" and context.actionAt >= state.deadlineAt then
      next_prompt(state)
      return { accepted = true, state = state, events = { { type = "last_chance_timeout" } } }
    end
    return reject("TOO_EARLY", "The timer has not expired")
  end

  if action.type ~= "guess" or type(action.guess) ~= "string" or #action.guess ~= 12 then
    return reject("INVALID_GUESS", "Submit one four-character idiom")
  end

  local actor = context.actor.id
  if state.phase == "guessing" then
    if context.actionAt > state.deadlineAt then
      next_prompt(state)
      return { accepted = true, state = state, events = { { type = "round_timeout" } } }
    end
    if state.attempts[actor] then return reject("ALREADY_GUESSED", "Your first guess is locked") end
    state.attempts[actor] = action.guess
    record_guess(state, actor, action.guess, "initial")
    if action.guess == state.answer then
      state.phase = "solved"
      state.winner = actor
      state.revealedAnswer = state.answer
      return { accepted = true, state = state, events = { { type = "solved", player = actor } } }
    end
    state.phase = "race_window"
    state.firstWrongPlayer = actor
    state.raceDeadlineAt = context.actionAt + 800
    return { accepted = true, state = state, events = { { type = "first_wrong", player = actor } } }
  end

  if state.phase == "race_window" then
    if actor == state.firstWrongPlayer then return reject("ALREADY_GUESSED", "Wait for the other player") end
    if context.actionAt > state.raceDeadlineAt then
      return reject("RACE_WINDOW_CLOSED", "Wait for the delayed-guess phase")
    end
    record_guess(state, actor, action.guess, "simultaneous")
    if action.guess == state.answer then
      state.phase = "solved"
      state.winner = actor
      state.revealedAnswer = state.answer
      return { accepted = true, state = state, events = { { type = "solved", player = actor } } }
    end
    next_prompt(state)
    return { accepted = true, state = state, events = { { type = "race_failed" } } }
  end

  if state.phase == "last_chance" then
    if actor ~= state.extraPlayer then return reject("NOT_YOUR_TURN", "The other player has the delayed guess") end
    if context.actionAt > state.deadlineAt then
      next_prompt(state)
      return { accepted = true, state = state, events = { { type = "last_chance_timeout" } } }
    end
    record_guess(state, actor, action.guess, "delayed")
    if action.guess == state.answer then
      state.phase = "solved"
      state.winner = actor
      state.revealedAnswer = state.answer
      return { accepted = true, state = state, events = { { type = "solved", player = actor } } }
    end
    next_prompt(state)
    return { accepted = true, state = state, events = { { type = "last_chance_failed" } } }
  end

  return reject("WRONG_PHASE", "Guessing is not available now")
end

function view(state, events, context)
  local visible = {
    gameType = state.gameType,
    poetry = state.poetry,
    poetryFeedback = state.phase == "poetry_guessing" and state.poetryFeedback and state.poetryFeedback[context.viewer.id] or nil,
    players = state.players,
    hostId = state.hostId,
    phase = state.phase,
    round = state.round,
    hints = state.hints,
    guesses = state.guesses,
    currentHint = state.currentHint,
    deadlineAt = state.deadlineAt,
    raceDeadlineAt = state.raceDeadlineAt,
    firstWrongPlayer = state.firstWrongPlayer,
    extraPlayer = state.extraPlayer,
    winner = state.winner,
    revealedAnswer = state.revealedAnswer,
  }
  if context.viewer.id == state.hostId and state.phase == "generating" then
    visible.answerForHint = state.answer
  end
  return { state = visible, events = events }
end

function on_return_to_room(state, context)
  return true
end
