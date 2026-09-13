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

  if action.type == "start_game" then
    if context.actor.id ~= state.hostId then
      return reject("HOST_ONLY", "Only the room host may start a new idiom")
    end
    if type(action.answer) ~= "string" or #action.answer ~= 12 then
      return reject("INVALID_ANSWER", "Answer must be a four-character Chinese idiom")
    end
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
