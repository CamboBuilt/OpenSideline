import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, appendEvent, undoEvent, replayGame, defaultPlayAdvances } from '../src/index.mjs';

const newGame = () => createGame({
  awayRoster: [
    {id:'a1',name:'Fictional A'},
    {id:'a2',name:'Fictional B'},
    {id:'a3',name:'Fictional C'},
    {id:'a4',name:'Fictional D'},
  ],
  homeRoster: [{id:'h1',name:'Fictional Home'}],
});
const event = (g, type, rest = {}) => appendEvent(g, {type, ...rest});
const old = (g, result) => event(g, 'BALL_IN_PLAY', {result});
const explicit = (g, result, runners, rbi = [], batter) => {
  const suggested = defaultPlayAdvances(replayGame(g), result);
  return event(g, 'BALL_IN_PLAY', {result, advances:{batter:batter ?? suggested.batter, runners, rbi}});
};

test('runner on second scores on a single with scorer-awarded RBI', () => {
  const g = explicit(old(newGame(), 'DOUBLE'), 'SINGLE', {2:'HOME'}, ['2']);
  const v = replayGame(g);
  assert.equal(v.scores.away, 1);
  assert.equal(v.bases[1].id, 'a2');
  assert.equal(v.bases[2], null);
  assert.equal(v.playerStats.away.a1.R, 1);
  assert.equal(v.playerStats.away.a2.RBI, 1);
  assert.equal(v.hits.away, 2);
});

test('runner stays at first on a double, independent of the batter destination', () => {
  const g = explicit(old(newGame(),'SINGLE'), 'DOUBLE', {1:'HOLD'});
  const v = replayGame(g);
  assert.equal(v.bases[1].id, 'a1');
  assert.equal(v.bases[2].id, 'a2');
  assert.equal(v.scores.away, 0);
  assert.equal(v.playerStats.away.a2.doubles, 1);
});

test('bases-loaded double can score two and place another runner on third', () => {
  let g = newGame();
  for (let i = 0; i < 3; i++) g = old(g,'SINGLE');
  const v = replayGame(explicit(g,'DOUBLE',{1:'THIRD', 2:'HOME', 3:'HOME'},['2','3']));
  assert.equal(v.scores.away,2);
  assert.equal(v.bases[3].id,'a3');
  assert.equal(v.bases[2].id,'a4');
  assert.equal(v.playerStats.away.a4.RBI,2);
});

test('runner is out on the bases while the batter singles', () => {
  let g = old(newGame(),'SINGLE');
  g = explicit(g,'SINGLE',{1:'OUT'});
  const v = replayGame(g);
  assert.equal(v.outs,1);
  assert.equal(v.bases[1].id,'a2');
  assert.equal(v.playerStats.away.a2.H,1);
  assert.equal(v.playerStats.away.a1.R,0);
});

test('fielder choice records a runner out and batter reaching first without a hit', () => {
  let g = old(newGame(),'SINGLE');
  g = explicit(g,'FIELDERS_CHOICE',{1:'OUT'});
  const v = replayGame(g);
  assert.equal(v.outs,1);
  assert.equal(v.bases[1].id,'a2');
  assert.equal(v.hits.away,1);
  assert.equal(v.playerStats.away.a2.AB,1);
  assert.equal(v.playerStats.away.a2.H,0);
});

test('flyout can score runner from third, without automatic RBI', () => {
  const g = explicit(old(newGame(),'TRIPLE'),'OUT',{3:'HOME'});
  const v = replayGame(g);
  assert.equal(v.outs,1);
  assert.equal(v.scores.away,1);
  assert.equal(v.playerStats.away.a2.RBI,0);
});

test('sac fly records RBI, SF, out, but no at bat', () => {
  const g = explicit(old(newGame(),'TRIPLE'),'SAC_FLY',{3:'HOME'},['3']);
  const v = replayGame(g);
  assert.equal(v.scores.away,1);
  assert.equal(v.outs,1);
  assert.equal(v.playerStats.away.a2.RBI,1);
  assert.equal(v.playerStats.away.a2.SF,1);
  assert.equal(v.playerStats.away.a2.AB,0);
});

test('invalid runner decisions are rejected before event is accepted', () => {
  const g = old(newGame(),'SINGLE');
  assert.throws(() => explicit(g,'DOUBLE',{1:'SECOND'}),/Two players/);
  assert.throws(() => explicit(g,'SINGLE',{}),/exactly one/);
  assert.throws(() => explicit(g,'DOUBLE',{1:'FIRST'}),/backwards/);
  assert.throws(() => explicit(g,'SINGLE',{1:'THIRD'},['1']),/RBI.*scored/i);
  assert.throws(() => explicit(g,'SINGLE',{1:'HOME'},['1','1']),/Duplicate RBI/);
  assert.throws(() => explicit(g,'SINGLE',{1:'HOME'}, [], 'HOME'),/Batter destination/);
});

test('two out in play can complete the half without scoring', () => {
  let g = old(newGame(),'SINGLE');
  g = explicit(g,'OUT',{1:'OUT'});
  let v = replayGame(g);
  assert.equal(v.outs,2);
  assert.equal(v.half,'top');
  g = explicit(g,'OUT',{});
  v = replayGame(g);
  assert.equal(v.half,'bottom');
  assert.equal(v.outs,0);
  assert.equal(v.scores.away,0);
});

test('reject an ambiguous run on a third-out play; still allow no-run third outs', () => {
  let g = old(newGame(),'TRIPLE');
  g = explicit(g,'OUT',{3:'HOLD'});
  g = explicit(g,'OUT',{3:'HOLD'});
  assert.throws(() => explicit(g,'OUT',{3:'HOME'}),/third-out play/i);
  const v = replayGame(explicit(g,'OUT',{3:'HOLD'}));
  assert.equal(v.half,'bottom');
  assert.equal(v.scores.away,0);
});

test('home run always scores every existing runner and the batter', () => {
  const g = old(newGame(),'SINGLE');
  const advanced = explicit(g,'HOME_RUN',{1:'HOME'},['1']);
  const v = replayGame(advanced);
  assert.equal(v.scores.away,2);
  assert.equal(v.playerStats.away.a2.RBI,2);
  assert.throws(() => explicit(g,'HOME_RUN',{1:'HOLD'}),/home run/i);
});

test('undo replays an explicit play without mutating original journal', () => {
  const g1 = old(newGame(),'DOUBLE');
  const snap = JSON.stringify(g1);
  const g2 = explicit(g1,'SINGLE',{2:'HOME'},['2']);
  assert.equal(replayGame(g2).scores.away,1);
  const g3 = undoEvent(g2);
  assert.deepEqual(replayGame(g3),replayGame(g1));
  assert.equal(JSON.stringify(g1),snap);
});

test('legacy v0.1 events remain readable and unchanged, including mixed journals', () => {
  let g = newGame();
  assert.equal(g.schemaVersion,1);
  g = old(g,'SINGLE');
  assert.equal(replayGame(g).bases[1].id,'a1');
  g = explicit(g,'DOUBLE',{1:'HOLD'});
  const roundTripped = JSON.parse(JSON.stringify(g));
  assert.deepEqual(replayGame(roundTripped),replayGame(g));
  assert.equal(replayGame(roundTripped).bases[1].id,'a1');
});
