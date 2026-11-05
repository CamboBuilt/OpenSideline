import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, appendEvent } from '../../../packages/scoring-engine/src/index.mjs';
import { summarizeSeason, seasonCsv } from '../src/season-summary.mjs';

const make=(team)=>createGame({awayName:team,homeName:'Other Team',
  awayRoster:[{id:'a1',number:'12',name:'Fictional Bat'},
    {id:'a2',number:'8',name:'Fictional Bench'}],
  homeRoster:[{id:'h1',number:'1',name:'Fictional Home'}],
});
const single=g=>appendEvent(g,{type:'BALL_IN_PLAY',result:'SINGLE'});
test('local season totals aggregate identical players across separate game journals',()=>{
  const one=single(make('Demo Tigers'));
  const two=single(make('Demo Tigers'));
  const summary=summarizeSeason([one,two]);
  assert.equal(summary.games,2);
  const player=summary.players.find(p=>p.number==='12'&&p.team==='Demo Tigers');
  assert.ok(player);
  assert.equal(player.games,2);
  assert.equal(player.totals.H,2);
  assert.equal(player.totals.AB,2);
});
test('different team/name does not merge unrelated players with same jersey',()=>{
  const one=single(make('Demo Tigers')),two=single(make('Other Tigers'));
  const v=summarizeSeason([one,two]);
  assert.equal(v.players.filter(p=>p.number==='12').length,2);
});
test('CSV escapes names containing commas and includes fielding columns',()=>{
  const g=single(make('Demo, Tigers'));
  const csv=seasonCsv(summarizeSeason([g]));
  assert.match(csv,/"Demo, Tigers"/);
  assert.match(csv,/Putout|PO/);
  assert.match(csv,/,AB,H,R,RBI/);
});
test('empty games are ignored and archives are bounded',()=>{
  assert.equal(summarizeSeason([make('Demo Tigers')]).games,0);
  assert.throws(()=>summarizeSeason(Array.from({length:51},()=>make('Demo Tigers'))),/50 games/);
});
