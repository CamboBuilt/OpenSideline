import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, appendEvent, undoEvent, replayGame, FIELDING_POSITIONS, HIT_LOCATIONS } from '../src/index.mjs';

const game = () => createGame({
  awayRoster:[{id:'a1',name:'Away One'},{id:'a2',name:'Away Two'},{id:'a3',name:'Away Three'}],
  homeRoster:[{id:'h1',name:'Home One',number:'10'},{id:'h2',name:'Home Two',number:'11'},{id:'h3',name:'Home Three',number:'12'}],
});
const play = (g,result) => appendEvent(g,{type:'BALL_IN_PLAY',result});
const note = (g,target,location,sequence=[]) => appendEvent(g,{
  type:'PLAY_ANNOTATION',target,fielding:{location,sequence},
});
test('6–3 groundout can identify shortstop and first baseman by roster IDs',()=>{
  let g=play(game(),'GROUND_OUT');
  const before=replayGame(g);
  g=note(g,0,'SS',[{position:6,playerId:'h2'},{position:3,playerId:'h1'}]);
  const v=replayGame(g);
  assert.equal(v.outs,1);
  assert.deepEqual(v.scores,before.scores);
  assert.deepEqual(v.playerStats,before.playerStats);
  assert.equal(v.playLog.length,1);
  assert.match(v.playLog[0].label,/fielded 6–3/);
  assert.match(v.playLog[0].label,/6 Home Two → 3 Home One/);
  assert.match(v.playLog[0].label,/Shortstop area/);
  assert.equal(v.playLog[0].fielding.location,'SS');
});
test('hit location can be recorded for a single with no fielders',()=>{
  let g=play(game(),'SINGLE');g=note(g,0,'RCF');
  const v=replayGame(g);
  assert.equal(v.hits.away,1);
  assert.equal(v.bases[1].id,'a1');
  assert.match(v.playLog[0].label,/Right-center field/);
});
test('lineout with no known player still records positions in fielding chain',()=>{
  let g=play(game(),'LINE_OUT');
  g=note(g,0,'2B',[{position:4,playerId:null}]);
  assert.match(replayGame(g).playLog[0].label,/fielded 4/);
  assert.ok(!replayGame(g).playLog[0].label.includes('Home One'));
});
test('annotations remain correct for an out after a half-inning switch',()=>{
  let g=game();
  for (let i=0;i<3;i++)g=play(g,'GROUND_OUT');
  assert.equal(replayGame(g).half,'bottom');
  g=note(g,0,'P',[{position:1,playerId:'h2'}]);
  assert.match(replayGame(g).playLog[0].label,/Home Two/);
  assert.throws(()=>note(g,1,'P',[{position:1,playerId:'a1'}]),/defensive team/);
});
test('annotations can be revised without duplicating the previous label',()=>{
  let g=play(game(),'FLY_OUT');
  g=note(g,0,'LF',[{position:7,playerId:'h2'}]);
  g=note(g,0,'CF',[{position:8,playerId:'h3'}]);
  const v=replayGame(g);
  assert.equal(v.playLog.length,1);
  assert.equal((v.playLog[0].label.match(/fielded/g)||[]).length,1);
  assert.ok(!v.playLog[0].label.includes('Left field'));
  assert.match(v.playLog[0].label,/Center field/);
  assert.match(v.playLog[0].label,/Home Three/);
});
test('annotate after pitches and undo restores prior annotation without undoing the scored out',()=>{
  let g=play(game(),'GROUND_OUT');
  g=appendEvent(g,{type:'BALL'});
  const v=replayGame(g);
  g=note(g,0,'3B',[{position:5,playerId:'h1'},{position:3,playerId:'h2'}]);
  assert.equal(replayGame(g).balls,1);
  const undone=undoEvent(g);
  assert.deepEqual(replayGame(undone),v);
  assert.equal(undone.events.length,2);
});
test('invalid location, position, unknown player and duplicate-free blank annotation rejected',()=>{
  let g=play(game(),'GROUND_OUT');
  for (const location of ['WALL','<script>',7]) assert.throws(()=>note(g,0,location),/location/i);
  assert.throws(()=>note(g,0,null),/at least/i);
  assert.throws(()=>note(g,0,'LF',[{position:10,playerId:'h1'}]),/position/i);
  assert.throws(()=>note(g,0,'LF',[{position:6,playerId:'a1'}]),/defensive team/i);
  assert.throws(()=>note(g,0,'LF',[{position:6,playerId:'fake'}]),/defensive team/i);
  assert.throws(()=>note(g,2,'LF'),/previous play index/i);
  assert.throws(()=>note(g,0,'LF',Array.from({length:9},()=>({position:6}))),/eight fielders/);
});
test('cannot attach an annotation to a pitch or another annotation',()=>{
  let g=appendEvent(game(),{type:'BALL'});
  assert.throws(()=>note(g,0,'P'),/batted-ball/i);
  g=play(g,'GROUND_OUT');
  g=note(g,1,'SS');
  assert.throws(()=>note(g,2,'RF'),/batted-ball/i);
});
test('player ID and location survive JSON export/import and consecutive scoring events',()=>{
  let g=play(game(),'GROUND_OUT');
  g=note(g,0,'SS',[{position:6,playerId:'h3'},{position:3,playerId:'h1'}]);
  g=play(g,'LINE_OUT');
  const roundTrip=JSON.parse(JSON.stringify(g));
  assert.deepEqual(replayGame(roundTrip),replayGame(g));
  assert.equal(replayGame(roundTrip).outs,2);
  assert.equal(replayGame(roundTrip).playLog.length,2);
});
test('locations and fielding positions expose stable scorebook labels',()=>{
  assert.equal(FIELDING_POSITIONS[6],'Shortstop');
  assert.equal(FIELDING_POSITIONS[3],'First base');
  assert.equal(HIT_LOCATIONS.LCF,'Left-center field');
});
