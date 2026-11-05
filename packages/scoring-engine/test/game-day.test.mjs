import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, replayGame, appendEvent, undoEvent, LEAGUE_PRESETS, normalizeGameRules,
} from '../src/index.mjs';

const roster=(prefix,amount=11)=>Array.from({length:amount},(_,i)=>({id:`${prefix}${i+1}`,number:String(i+1),name:`${prefix.toUpperCase()} Player ${i+1}`}));
const game=(options={})=>createGame({homeRoster:roster('h'),awayRoster:roster('a'),...options});
const event=(g,type,options={})=>appendEvent(g,{type,...options});
const ball=(g,result)=>event(g,'BALL_IN_PLAY',{result});

test('default continuous order includes every roster member',()=>{
  const g=game();const v=replayGame(g);
  assert.equal(v.battingOrder.away.length,11);
  assert.equal(v.battingOrder.home.length,11);
  assert.equal(v.batter.id,'a1');
});
test('nine-batter mode excludes bench players from the batting rotation',()=>{
  const g=game({rules:{preset:'adult',battingMode:'nine'}});
  assert.equal(replayGame(g).battingOrder.away.length,9);
  let current=g;
  for(let i=0;i<9;i++)current=ball(current,'GROUND_OUT');
  const v=replayGame(current);
  assert.equal(v.batter.id,'a1');
  assert.equal(v.playerStats.away.a10.PA,0);
  assert.equal(v.playerStats.away.a9.PA,1);
});
test('custom active batting order can omit or reorder bench players',()=>{
  let g=game({rules:{preset:'travel',battingMode:'custom'},
    awayBattingOrder:['a3','a1'],homeBattingOrder:['h2','h1']});
  assert.equal(replayGame(g).batter.id,'a3');
  g=ball(g,'SINGLE');
  assert.equal(replayGame(g).batter.id,'a1');
  g=ball(g,'SINGLE');
  assert.equal(replayGame(g).batter.id,'a3');
  assert.equal(replayGame(g).playerStats.away.a2.PA,0);
});
test('substitution replaces exactly one slot and maintains former batter stats',()=>{
  let g=game({rules:{preset:'adult',battingMode:'nine'}});
  g=ball(g,'SINGLE');
  const original=replayGame(g);
  g=event(g,'LINEUP_SUBSTITUTION',{side:'away',slot:1,playerId:'a10',kind:'PH'});
  const v=replayGame(g);
  assert.equal(v.batter.id,'a10');
  assert.equal(v.battingOrder.away[0],'a1');
  assert.equal(v.battingOrder.away[1],'a10');
  assert.equal(v.playerStats.away.a1.H,original.playerStats.away.a1.H);
  assert.equal(v.playerStats.away.a2.PA,0);
  assert.equal(v.substitutions.at(-1).kind,'PH');
  g=ball(g,'GROUND_OUT');
  assert.equal(replayGame(g).playerStats.away.a10.AB,1);
});
test('out-of-range, duplicate, or unknown lineup substitutions are rejected',()=>{
  const g=game({rules:{preset:'adult',battingMode:'nine'}});
  assert.throws(()=>event(g,'LINEUP_SUBSTITUTION',{side:'away',slot:9,playerId:'a10'}),/batting slot/i);
  assert.throws(()=>event(g,'LINEUP_SUBSTITUTION',{side:'away',slot:0,playerId:'a2'}),/already has/i);
  assert.throws(()=>event(g,'LINEUP_SUBSTITUTION',{side:'away',slot:0,playerId:'h10'}),/roster/i);
});
test('batting reentry follows the configured option',()=>{
  let g=game({rules:{preset:'adult',battingMode:'nine',allowReentry:false}});
  g=event(g,'LINEUP_SUBSTITUTION',{side:'away',slot:0,playerId:'a10'});
  assert.throws(()=>event(g,'LINEUP_SUBSTITUTION',{side:'away',slot:0,playerId:'a1'}),/re-enter/i);
  let allowed=game({rules:{preset:'adult',battingMode:'nine',allowReentry:true}});
  allowed=event(allowed,'LINEUP_SUBSTITUTION',{side:'away',slot:0,playerId:'a10'});
  allowed=event(allowed,'LINEUP_SUBSTITUTION',{side:'away',slot:0,playerId:'a1'});
  assert.equal(replayGame(allowed).batter.id,'a1');
});
test('pinch runner inherits base and batting slot; run goes to incoming player',()=>{
  let g=game({rules:{preset:'adult',battingMode:'nine'}});
  g=ball(g,'SINGLE');
  g=event(g,'PINCH_RUNNER',{from:1,playerId:'a10'});
  let v=replayGame(g);
  assert.equal(v.bases[1].id,'a10');
  assert.equal(v.battingOrder.away[0],'a10');
  assert.equal(v.playerStats.away.a1.H,1);
  g=ball(g,'HOME_RUN');
  v=replayGame(g);
  assert.equal(v.playerStats.away.a10.R,1);
  assert.equal(v.playerStats.away.a1.R,0);
  assert.equal(v.scores.away,2);
});
test('pinch runner must be on roster but not an existing lineup batter or baserunner',()=>{
  let g=game({rules:{preset:'adult',battingMode:'nine'}});
  g=ball(g,'SINGLE');
  assert.throws(()=>event(g,'PINCH_RUNNER',{from:2,playerId:'a10'}),/occupied base/i);
  assert.throws(()=>event(g,'PINCH_RUNNER',{from:1,playerId:'a9'}),/current batter/i);
  assert.throws(()=>event(g,'PINCH_RUNNER',{from:1,playerId:'h10'}),/roster/i);
});
test('pitching change updates defensive pitcher and preserves other positions',()=>{
  let g=game();
  g=event(g,'DEFENSIVE_LINEUP',{side:'home',assignments:{'1':'h1','6':'h6','3':'h3'}});
  g=event(g,'PITCHER_CHANGE',{side:'home',playerId:'h10'});
  const v=replayGame(g);
  assert.equal(v.defenseLineup.home['1'],'h10');
  assert.equal(v.defenseLineup.home['6'],'h6');
  assert.equal(v.defenseLineup.home['3'],'h3');
  assert.equal(v.defenseLineup.away['1'],null);
});
test('pitcher totals follow changes and recorded pitch outcomes',()=>{
  let g=game();
  g=event(g,'PITCHER_CHANGE',{side:'home',playerId:'h10'});
  g=event(g,'BALL');
  g=event(g,'STRIKE');
  g=event(g,'FOUL');
  g=event(g,'WALK');
  g=event(g,'PITCHER_CHANGE',{side:'home',playerId:'h11'});
  g=ball(g,'GROUND_OUT');
  const p=replayGame(g).pitchingStats.home;
  assert.equal(p.h10.P,3);
  assert.equal(p.h10.Balls,1);
  assert.equal(p.h10.Strikes,2);
  assert.equal(p.h10.BF,1);
  assert.equal(p.h10.BB,1);
  assert.equal(p.h11.BF,1);
  assert.equal(p.h11.BB,0);
});
test('fielding credits reflect only latest annotation for a play',()=>{
  let g=game();
  g=event(g,'DEFENSIVE_LINEUP',{side:'home',assignments:{'6':'h6','3':'h3'}});
  g=ball(g,'GROUND_OUT'); // event index 1
  g=event(g,'PLAY_ANNOTATION',{target:1,fielding:{location:'SS',sequence:[
    {position:6,playerId:null},{position:3,playerId:null}],
    credits:{putouts:['h3'],assists:['h6'],errors:[],doublePlays:[]}}});
  let v=replayGame(g);
  assert.equal(v.fieldingStats.home.h3.PO,1);
  assert.equal(v.fieldingStats.home.h6.A,1);
  const prior=g;
  g=event(g,'PLAY_ANNOTATION',{target:1,fielding:{location:'SS',sequence:[
    {position:6,playerId:null},{position:3,playerId:null}],
    credits:{putouts:['h6'],assists:['h3'],errors:[],doublePlays:['h6','h3']}}});
  v=replayGame(g);
  assert.equal(v.fieldingStats.home.h6.PO,1);
  assert.equal(v.fieldingStats.home.h3.PO,0);
  assert.equal(v.fieldingStats.home.h3.A,1);
  assert.equal(v.fieldingStats.home.h3.DP,1);
  assert.equal(replayGame(undoEvent(g)).fieldingStats.home.h3.PO,
    replayGame(prior).fieldingStats.home.h3.PO);
});
test('invalid fielding credit IDs and duplicates cannot enter the journal',()=>{
  let g=ball(game(),'GROUND_OUT');
  const base={location:'SS',sequence:[{position:6,playerId:null}]};
  assert.throws(()=>event(g,'PLAY_ANNOTATION',{target:0,fielding:{...base,credits:{putouts:['a1']}}}),/defensive roster/i);
  assert.throws(()=>event(g,'PLAY_ANNOTATION',{target:0,fielding:{...base,credits:{putouts:['h1','h1']}}}),/Duplicate fielding credit/i);
});
test('preset rules are defaults only and scheduled innings do not prematurely end a game',()=>{
  assert.equal(LEAGUE_PRESETS.adult.innings,9);
  assert.equal(normalizeGameRules({preset:'youth'}).allowReentry,true);
  assert.equal(normalizeGameRules({preset:'adult'}).battingMode,'nine');
  assert.throws(()=>normalizeGameRules({innings:16}),/Innings/i);
  assert.throws(()=>game({rules:{preset:'adult'},awayRoster:roster('a',8)}),/at least nine/i);
});
test('older v0.2 events with no game rules or batting order still replay',()=>{
  const g=game();
  delete g.rules;
  delete g.teams.home.battingOrder;
  delete g.teams.away.battingOrder;
  const v=replayGame(ball(g,'SINGLE'));
  assert.equal(v.battingOrder.away.length,11);
  assert.equal(v.playerStats.away.a1.H,1);
});
