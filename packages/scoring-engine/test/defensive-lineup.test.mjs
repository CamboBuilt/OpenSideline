import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, replayGame, appendEvent, undoEvent, emptyDefensiveLineup,
} from '../src/index.mjs';

const game=()=>createGame({
  awayRoster:Array.from({length:9},(_,i)=>({id:`a${i+1}`,name:`Away ${i+1}`,number:String(i+1)})),
  homeRoster:Array.from({length:9},(_,i)=>({id:`h${i+1}`,name:`Home ${i+1}`,number:String(i+1)})),
});
const lineup=(g,side,assignments)=>appendEvent(g,{type:'DEFENSIVE_LINEUP',side,assignments});
const play=(g,result='GROUND_OUT')=>appendEvent(g,{type:'BALL_IN_PLAY',result});
const annotate=(g,target,sequence)=>appendEvent(g,{type:'PLAY_ANNOTATION',target,
  fielding:{location:'SS',sequence:sequence.map(position=>({position,playerId:null}))}});

test('defensive positions default to unassigned and old game journals still replay',()=>{
  const v=replayGame(game());
  assert.deepEqual(v.defenseLineup.home,emptyDefensiveLineup());
  assert.deepEqual(v.defenseLineup.away,emptyDefensiveLineup());
  assert.equal(v.playLog.length,0);
});
test('setting a defensive lineup does not change score, count, batter, or play history',()=>{
  const g=lineup(game(),'home',{'6':'h6','3':'h3'});
  const v=replayGame(g);
  assert.equal(v.events,undefined);
  assert.equal(v.batter.id,'a1');
  assert.deepEqual(v.scores,{away:0,home:0});
  assert.equal(v.outs,0);
  assert.equal(v.playLog.length,0);
  assert.equal(v.defenseLineup.home['6'],'h6');
  assert.equal(v.defenseLineup.home['3'],'h3');
  assert.equal(v.defenseLineup.home['1'],null);
});
test('6–3 annotation automatically resolves the players from the lineup active on that play',()=>{
  let g=lineup(game(),'home',{'6':'h6','3':'h3'});
  g=play(g);
  g=annotate(g,1,[6,3]);
  const v=replayGame(g);
  assert.equal(v.outs,1);
  assert.equal(v.playLog.length,1);
  assert.equal(v.playLog[0].index,2);
  assert.deepEqual(v.playLog[0].fielding.sequence,
    [{position:6,playerId:'h6'},{position:3,playerId:'h3'}]);
  assert.match(v.playLog[0].label,/6 Home 6 → 3 Home 3/);
});
test('position changes later do not alter the fielders on an earlier ball in play',()=>{
  let g=lineup(game(),'home',{'6':'h6','3':'h3'});
  g=play(g); // event 1, home shortstop is h6
  g=lineup(g,'home',{'6':'h5','3':'h4'});
  g=annotate(g,1,[6,3]); // saved after the lineup changed
  const v=replayGame(g);
  assert.equal(v.defenseLineup.home['6'],'h5');
  assert.equal(v.playLog[0].fielding.sequence[0].playerId,'h6');
  assert.equal(v.playLog[0].fielding.sequence[1].playerId,'h3');
  assert.ok(!v.playLog[0].label.includes('Home 5'));
});
test('automatic names work for a later play following a defensive swap',()=>{
  let g=lineup(game(),'home',{'6':'h6','3':'h3'});
  g=play(g); // original SS
  g=lineup(g,'home',{'6':'h5','3':'h4'});
  g=play(g);
  g=annotate(g,3,[6,3]);
  const v=replayGame(g);
  assert.equal(v.playLog[1].fielding.sequence[0].playerId,'h5');
  assert.equal(v.playLog[1].fielding.sequence[1].playerId,'h4');
  assert.equal(v.playLog[0].defenseAssignments['6'],'h6');
});
test('manual fielder correction takes precedence over suggested defender',()=>{
  let g=lineup(game(),'home',{'6':'h6','3':'h3'});
  g=play(g);
  g=appendEvent(g,{type:'PLAY_ANNOTATION',target:1,fielding:{location:'SS',
    sequence:[{position:6,playerId:'h7'},{position:3,playerId:null}]}});
  const v=replayGame(g);
  assert.equal(v.playLog[0].fielding.sequence[0].playerId,'h7');
  assert.equal(v.playLog[0].fielding.sequence[1].playerId,'h3');
});
test('lineup changes for home and away teams are independent across half innings',()=>{
  let g=lineup(game(),'home',{'6':'h6'});
  g=lineup(g,'away',{'6':'a6'});
  for(let i=0;i<3;i++)g=play(g);
  assert.equal(replayGame(g).half,'bottom');
  g=play(g);
  g=annotate(g,5,[6]);
  const v=replayGame(g);
  assert.equal(v.playLog[3].fielding.sequence[0].playerId,'a6');
  assert.equal(v.defenseLineup.home['6'],'h6');
});
test('undo of defensive substitution restores previous lineup and its next-play identity',()=>{
  let g=lineup(game(),'home',{'6':'h6'});
  const first=g;
  g=lineup(g,'home',{'6':'h5'});
  assert.equal(replayGame(g).defenseLineup.home['6'],'h5');
  assert.deepEqual(replayGame(undoEvent(g)),replayGame(first));
});
test('lineup rejects duplicate players, unknown players, wrong team, invalid position and side',()=>{
  const g=game();
  assert.throws(()=>lineup(g,'home',{'6':'h2','3':'h2'}),/two defensive positions/i);
  assert.throws(()=>lineup(g,'home',{'6':'a6'}),/roster/i);
  assert.throws(()=>lineup(g,'home',{'6':'stranger'}),/roster/i);
  assert.throws(()=>lineup(g,'home',{'10':'h6'}),/position/i);
  assert.throws(()=>lineup(g,'home',{'__proto__':'h6'}),/position/i);
  assert.throws(()=>lineup(g,'home',null),/object/i);
  assert.throws(()=>lineup(g,'other',{'6':'h6'}),/home or away/i);
});
test('valid partial lineup is supported for small/demo rosters and JSON export',()=>{
  const g=JSON.parse(JSON.stringify(lineup(game(),'home',{'6':'h6', '3':null})));
  const v=replayGame(g);
  assert.equal(v.defenseLineup.home['6'],'h6');
  assert.equal(Object.keys(v.defenseLineup.home).length,9);
  assert.equal(v.playLog.length,0);
});
