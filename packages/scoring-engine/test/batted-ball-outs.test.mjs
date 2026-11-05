import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, appendEvent, undoEvent, replayGame, defaultPlayAdvances,
} from '../src/index.mjs';

const fresh = () => createGame({
  awayRoster: [
    { id: 'a1', name: 'Fictional Batter One' },
    { id: 'a2', name: 'Fictional Batter Two' },
    { id: 'a3', name: 'Fictional Batter Three' },
    { id: 'a4', name: 'Fictional Batter Four' },
  ],
  homeRoster: [{ id: 'h1', name: 'Fictional Home Batter' }],
});
const record = (game, result, advances) => appendEvent(game, {
  type: 'BALL_IN_PLAY',
  result,
  advances: advances ?? defaultPlayAdvances(replayGame(game), result),
});
const legacy = (game, result) => appendEvent(game, { type: 'BALL_IN_PLAY', result });

for (const [type, label] of [
  ['GROUND_OUT', 'Groundout'],
  ['LINE_OUT', 'Lineout'],
  ['FLY_OUT', 'Flyout'],
]) {
  test(`${label}: distinct play log, one out, at-bat, no hit, count reset`, () => {
    let g = fresh();
    g = appendEvent(g, { type: 'BALL' });
    g = appendEvent(g, { type: 'STRIKE' });
    g = record(g, type);
    const v = replayGame(g);
    assert.equal(v.outs, 1);
    assert.equal(v.balls, 0);
    assert.equal(v.strikes, 0);
    assert.equal(v.playerStats.away.a1.AB, 1);
    assert.equal(v.playerStats.away.a1.PA, 1);
    assert.equal(v.playerStats.away.a1.H, 0);
    assert.equal(v.hits.away, 0);
    assert.match(v.playLog.at(-1).label, new RegExp(label));
    assert.equal(g.events.at(-1).result, type);
  });
}

test('groundout can advance a runner while retiring the batter', () => {
  let g = legacy(fresh(), 'SINGLE');
  g = record(g, 'GROUND_OUT', { batter: 'OUT', runners: { 1: 'SECOND' }, rbi: [] });
  const v = replayGame(g);
  assert.equal(v.outs, 1);
  assert.equal(v.bases[1], null);
  assert.equal(v.bases[2].id, 'a1');
  assert.equal(v.playerStats.away.a2.AB, 1);
  assert.equal(v.playerStats.away.a2.H, 0);
});

test('groundout can score a runner from third with scorer-awarded RBI', () => {
  let g = legacy(fresh(), 'TRIPLE');
  g = record(g, 'GROUND_OUT', { batter: 'OUT', runners: { 3: 'HOME' }, rbi: ['3'] });
  const v = replayGame(g);
  assert.equal(v.scores.away, 1);
  assert.equal(v.outs, 1);
  assert.equal(v.playerStats.away.a2.RBI, 1);
  assert.equal(v.playerStats.away.a2.AB, 1);
});

test('ground ball double play can retire the batter and a runner', () => {
  let g = legacy(fresh(), 'SINGLE');
  g = record(g, 'GROUND_OUT', { batter: 'OUT', runners: { 1: 'OUT' }, rbi: [] });
  const v = replayGame(g);
  assert.equal(v.outs, 2);
  assert.deepEqual(v.bases, { 1: null, 2: null, 3: null });
  assert.equal(v.hits.away, 1);
});

test('lineout can double up a runner off base and hold other runners', () => {
  let g = legacy(legacy(fresh(), 'DOUBLE'), 'SINGLE'); // runner on third and first
  g = record(g, 'LINE_OUT', { batter: 'OUT', runners: { 1: 'OUT', 3: 'HOLD' }, rbi: [] });
  const v = replayGame(g);
  assert.equal(v.outs, 2);
  assert.equal(v.bases[3].id, 'a1');
  assert.equal(v.bases[1], null);
  assert.equal(v.hits.away, 2);
});

test('flyout preserves runners who remain on base', () => {
  let g = legacy(fresh(), 'TRIPLE');
  g = record(g, 'FLY_OUT', { batter: 'OUT', runners: { 3: 'HOLD' }, rbi: [] });
  const v = replayGame(g);
  assert.equal(v.bases[3].id, 'a1');
  assert.equal(v.outs, 1);
});

test('three different types of outs end a half inning', () => {
  let g = fresh();
  for (const type of ['GROUND_OUT', 'LINE_OUT', 'FLY_OUT']) g = record(g, type);
  const v = replayGame(g);
  assert.equal(v.half, 'bottom');
  assert.equal(v.inning, 1);
  assert.equal(v.outs, 0);
  for (const id of ['a1', 'a2', 'a3']) assert.equal(v.playerStats.away[id].AB, 1);
});

test('undo removes the groundout and preserves old generic OUT events', () => {
  let g = legacy(fresh(), 'OUT');
  const old = replayGame(g);
  g = record(g, 'GROUND_OUT');
  assert.equal(replayGame(g).outs, 2);
  const undone = undoEvent(g);
  assert.deepEqual(replayGame(undone), old);
  assert.equal(undone.events[0].result, 'OUT');
});
