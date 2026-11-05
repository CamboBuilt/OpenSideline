import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, appendEvent, replayGame } from '../../../packages/scoring-engine/src/index.mjs';
import { getQuickPlayPresets } from '../src/quick-play.mjs';

const game = () => createGame({
  awayRoster: [{id:'a1',name:'Fictional One'},{id:'a2',name:'Fictional Two'},{id:'a3',name:'Fictional Three'}],
  homeRoster: [{id:'h1',name:'Fictional Home'}],
});
const hit = (g,result) => appendEvent(g,{type:'BALL_IN_PLAY',result});
const choices = (g,result) => getQuickPlayPresets(g,replayGame(g),result);
const apply = (g,result,preset) => appendEvent(g,{type:'BALL_IN_PLAY',result,advances:preset.advances});

test('base-empty quick result is a valid one-tap play',()=>{
  const g=game(), options=choices(g,'SINGLE');
  assert.equal(options.length,1);
  const after=replayGame(apply(g,'SINGLE',options[0]));
  assert.equal(after.bases[1]?.id,'a1');
  assert.equal(after.hits.away,1);
});
test('score from second on a single can be recorded in one shortcut',()=>{
  const g=hit(game(),'DOUBLE');
  const option=choices(g,'SINGLE').find(p=>p.label==='Runner on 2nd scores');
  assert.ok(option);
  const v=replayGame(apply(g,'SINGLE',option));
  assert.equal(v.scores.away,1);
  assert.equal(v.playerStats.away.a2.RBI,1);
});
test('runner can advance first to third on a single',()=>{
  const g=hit(game(),'SINGLE');
  const option=choices(g,'SINGLE').find(p=>p.label==='Runner on 1st to 3rd');
  assert.ok(option);
  const v=replayGame(apply(g,'SINGLE',option));
  assert.equal(v.bases[3].id,'a1');
  assert.equal(v.bases[1].id,'a2');
});
test('preset can put a runner out while recording a hit',()=>{
  const g=hit(game(),'SINGLE');
  const option=choices(g,'SINGLE').find(p=>p.label==='Runner on 1st is out');
  assert.ok(option);
  const v=replayGame(apply(g,'SINGLE',option));
  assert.equal(v.outs,1);
  assert.equal(v.hits.away,2);
});
test('shortcuts exclude a base collision (runner already going to third)',()=>{
  const g=hit(hit(game(),'SINGLE'),'SINGLE');
  const labels=choices(g,'SINGLE').map(p=>p.label);
  assert.equal(labels.includes('Runner on 1st to 3rd'),false);
});
test('presets are deterministic and do not alter the existing game journal',()=>{
  const g=hit(game(),'SINGLE'), snapshot=JSON.stringify(g);
  const a=choices(g,'DOUBLE');
  const b=choices(g,'DOUBLE');
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify(g),snapshot);
});
test('no runner-to-score suggestion on a third-out play',()=>{
  let g=hit(game(),'TRIPLE');
  g=appendEvent(g,{type:'BALL_IN_PLAY',result:'OUT'});
  g=appendEvent(g,{type:'BALL_IN_PLAY',result:'OUT'});
  const options=choices(g,'OUT');
  assert.equal(options.some(p=>p.label==='Runner on 3rd scores'),false);
});
