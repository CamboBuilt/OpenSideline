import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, appendEvent, undoEvent, replayGame, formatAvg, formatSlg, formatObp} from '../src/index.mjs';

const fresh = () => createGame({homeRoster:[{id:'h1',name:'Home batter',number:'10'}],awayRoster:[{id:'a1',name:'Away batter',number:'20'},{id:'a2',name:'Next batter',number:'21'}]});
const score = (game, type, detail={}) => appendEvent(game, {type, ...detail});
const play = (game, result) => score(game, 'BALL_IN_PLAY', {result});
const repeat = (game, type, count) => Array.from({length:count}).reduce(g=>score(g,type), game);

test('begins top of first with zero scores and first away batter',()=>{
  const v = replayGame(fresh());
  assert.equal(v.inning,1); assert.equal(v.half,'top');
  assert.equal(v.batter.id,'a1'); assert.equal(v.scores.home,0);
});
test('four balls award a walk, count resets and next batter advances',()=>{
  const v = replayGame(repeat(fresh(),'BALL',4));
  assert.equal(v.bases[1]?.id,'a1'); assert.equal(v.batter.id,'a2');
  assert.equal(v.balls,0); assert.equal(v.playerStats.away.a1.BB,1); assert.equal(v.playerStats.away.a1.PA,1);
});
test('fouls with two strikes do not create a strikeout',()=>{
  const v = replayGame(repeat(repeat(fresh(),'STRIKE',2),'FOUL',3));
  assert.equal(v.strikes,2); assert.equal(v.outs,0); assert.equal(v.batter.id,'a1');
});
test('three strikes create a strikeout, an out and the next batter',()=>{
  const v = replayGame(repeat(fresh(),'STRIKE',3));
  assert.equal(v.outs,1); assert.equal(v.batter.id,'a2');
  assert.equal(v.playerStats.away.a1.SO,1); assert.equal(v.playerStats.away.a1.AB,1);
});
test('single then double score correct automatic advances and hits',()=>{
  const v = replayGame(play(play(fresh(),'SINGLE'),'DOUBLE'));
  assert.equal(v.scores.away,0); assert.equal(v.bases[3]?.id,'a1'); assert.equal(v.bases[2]?.id,'a2');
  assert.equal(v.hits.away,2); assert.equal(v.playerStats.away.a2.doubles,1);
});
test('three base hit scores all occupied runners and awards RBI',()=>{
  let g = play(fresh(),'SINGLE'); g = play(g,'DOUBLE'); g = play(g,'TRIPLE');
  const v = replayGame(g);
  assert.equal(v.scores.away,2); assert.equal(v.playerStats.away.a1.R,1);
  assert.equal(v.playerStats.away.a2.R,1); assert.equal(v.playerStats.away.a1.RBI,2);
  assert.equal(v.bases[3]?.id,'a1');
});
test('bases-loaded walk forces run home, awards RBI without hit or AB',()=>{
  let g = score(fresh(),'WALK');g=score(g,'WALK');g=score(g,'WALK');g=score(g,'WALK');
  const v = replayGame(g);
  assert.equal(v.scores.away,1);assert.equal(v.hits.away,0);
  assert.equal(v.playerStats.away.a2.RBI,1);assert.equal(v.playerStats.away.a2.AB,0);
  assert.equal(v.bases[1]?.id,'a2');
  assert.equal(v.bases[2]?.id,'a1');
  assert.equal(v.bases[3]?.id,'a2');
});
test('home run scores batter and runners, including RBIs',()=>{
  const v = replayGame(play(play(fresh(),'SINGLE'),'HOME_RUN'));
  assert.equal(v.scores.away,2); assert.equal(v.playerStats.away.a2.HR,1);
  assert.equal(v.playerStats.away.a2.RBI,2); assert.equal(v.bases[1],null);
});
test('third out changes halves, and bottom of first becomes top of second',()=>{
  let g = fresh();for (let i=0;i<6;i++) g=play(g,'OUT');
  const v = replayGame(g);
  assert.equal(v.inning,2);assert.equal(v.half,'top');assert.equal(v.outs,0);
  assert.equal(v.balls,0);assert.equal(v.batter.id,'a2');
});
test('sac fly requires third base and fewer than 2 outs',()=>{
  assert.throws(()=>play(fresh(),'SAC_FLY'),/runner on third/i);
  let g=play(fresh(),'TRIPLE');g=play(g,'SAC_FLY');
  const v=replayGame(g);
  assert.equal(v.scores.away,1);assert.equal(v.outs,1);
  assert.equal(v.playerStats.away.a2.SF,1);assert.equal(v.playerStats.away.a2.RBI,1);
  assert.equal(v.playerStats.away.a2.AB,0);
});
test('reached on error is at bat, not a hit, charged to defending side',()=>{
  const v = replayGame(play(fresh(),'ERROR'));
  assert.equal(v.errors.home,1);assert.equal(v.hits.away,0);
  assert.equal(v.playerStats.away.a1.AB,1);assert.equal(v.bases[1]?.id,'a1');
});
test('stolen base advances runner and records SB, cannot steal occupied base',()=>{
  let g = play(fresh(),'SINGLE'); g=score(g,'STOLEN_BASE',{from:1});
  let v=replayGame(g);
  assert.equal(v.bases[2]?.id,'a1'); assert.equal(v.playerStats.away.a1.SB,1);
  g = play(fresh(),'SINGLE'); g=play(g,'SINGLE');
  assert.throws(()=>score(g,'STOLEN_BASE',{from:1}),/occupied/);
});
test('runner outs can end an inning without consuming the active plate appearance',()=>{
  let g=play(fresh(),'SINGLE');g=score(g,'RUNNER_OUT',{from:1,caughtStealing:true});
  const v=replayGame(g);
  assert.equal(v.outs,1); assert.equal(v.playerStats.away.a1.CS,1);
  assert.equal(v.batter.id,'a2');
});
test('undo replays cleanly, does not mutate the previous game',()=>{
  const original=fresh();const withHit=play(original,'HOME_RUN');const undone=undoEvent(withHit);
  assert.equal(original.events.length,0);assert.equal(withHit.events.length,1);
  assert.equal(replayGame(undone).scores.away,0);
});
test('invalid action is rejected and does not alter the game',()=>{
  const game=fresh();assert.throws(()=>score(game,'BAD'),/unknown/i);
  assert.equal(game.events.length,0);
});
test('batting average, OBP and slugging calculations',()=>{
  assert.equal(formatAvg(1,4),'.250'); assert.equal(formatAvg(0,0),'.000');
  assert.equal(formatSlg({AB:4,H:2,doubles:1,triples:0,HR:0}),'.750');
  assert.equal(formatObp({AB:4,BB:1,HBP:0,SF:0,H:2}),'.600');
});
