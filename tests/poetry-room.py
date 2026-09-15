from pathlib import Path
from lupa import LuaRuntime
lua=LuaRuntime(unpack_returned_tuples=True)
lua.execute(Path('game.lua').read_text())
lua.execute('''
local players = {{id="host",name="房主"},{id="guest",name="客人"}}
local state = setup({players=players,match={ownerId="host"}}).state
local function ctx(id,t) return {actor={id=id},actionAt=t} end
local q={answer="床前明月光",title="静夜思",author="李白",tiles={"床","前","明","月","光","山","中","夜","雨"},answers={{line="床前明月光",title="静夜思",author="李白"}}}
assert(not on_action(state,{type="start_poetry",question=q},ctx("guest",1)).accepted)
assert(on_action(state,{type="start_poetry",question=q},ctx("host",2)).accepted)
local visible=view(state,{}, {viewer={id="guest"}}).state
assert(visible.poetry.length==5 and #visible.poetry.tiles==9)
assert(visible.answer==nil and visible.poetryAnswers==nil and visible.poetry.title==nil)
assert(not on_action(state,{type="poetry_guess",guess="床床明月光"},ctx("guest",3)).accepted)
assert(not on_action(state,{type="poetry_guess",guess="前床明月光"},ctx("guest",4)).accepted)
assert(on_action(state,{type="poetry_guess",guess="床前明月光"},ctx("guest",5)).accepted)
assert(state.winner=="guest" and state.poetry.title=="静夜思")
assert(not on_action(state,{type="poetry_guess",guess="床前明月光"},ctx("host",6)).accepted)
assert(on_action(state,{type="start_poetry",question=q},ctx("host",7)).accepted)
assert(state.round==2 and state.winner==nil and state.poetry.title==nil)
local idiom=setup({players=players,match={ownerId="host"}}).state
assert(on_action(idiom,{type="start_game",answer="画蛇添足"},ctx("host",1)).accepted)
assert(on_action(idiom,{type="set_hint",hint="多余"},ctx("host",2)).accepted)
assert(on_action(idiom,{type="guess",guess="画蛇添足"},ctx("guest",3)).accepted)
assert(idiom.winner=="guest")
''')
print('Lua: host authority, hidden answer, tile multiplicity, incorrect/correct guesses, winner lock, next round, idiom regression passed')
