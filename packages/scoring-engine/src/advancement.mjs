/**
 * A v0.2 explicit play describes where EVERY runner went during a ball in play.
 * Legacy BALL_IN_PLAY events without `advances` deliberately use the v0.1 rules.
 *
 * advances = {
 *   batter: 'FIRST' | 'SECOND' | 'THIRD' | 'HOME' | 'OUT',
 *   runners: { '1': 'HOLD' | 'SECOND' | 'THIRD' | 'HOME' | 'OUT', ... },
 *   rbi: ['1', '3']  // credit RBI only for the listed runners scoring on the play
 * }
 * Runner keys are ORIGINAL occupied bases, not destinations or player IDs.
 * For a home run the batter always receives an RBI for their own run.
 *
 * A run/out occurring on the same play as the third out cannot be safely ruled
 * without ordering and force/tag details; reject that ambiguity for now.
 */
const assert = (condition, text) => { if (!condition) throw new Error(text); };
const BASE_LABELS = Object.freeze({ 1:'FIRST', 2:'SECOND', 3:'THIRD', 4:'HOME' });
const RESULT_BATTER = Object.freeze({
  SINGLE:'FIRST', DOUBLE:'SECOND', TRIPLE:'THIRD', HOME_RUN:'HOME',
  ERROR:'FIRST', OUT:'OUT', SAC_FLY:'OUT', FIELDERS_CHOICE:'FIRST',
});
const BASE_NUM = Object.freeze({ FIRST:1, SECOND:2, THIRD:3, HOME:4 });
const RUNNER_DESTINATIONS = new Set(['HOLD', 'FIRST', 'SECOND', 'THIRD', 'HOME', 'OUT']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function defaultPlayAdvances(view, result) {
  assert(Object.hasOwn(RESULT_BATTER, result), 'Unknown ball-in-play result.');
  const runners = {};
  for (let from = 1; from <= 3; from++) {
    if (!view.bases[from]) continue;
    const hitBases = { SINGLE:1, DOUBLE:2, TRIPLE:3, HOME_RUN:4 }[result];
    let destination = 'HOLD';
    if (hitBases) destination = BASE_LABELS[Math.min(from + hitBases, 4)];
    if (result === 'ERROR') destination = BASE_LABELS[Math.min(from + 1, 4)];
    if (result === 'SAC_FLY' && from === 3) destination = 'HOME';
    if (result === 'FIELDERS_CHOICE' && from === 1) destination = 'OUT';
    runners[String(from)] = destination;
  }
  const rbi = Object.keys(runners).filter(k => runners[k] === 'HOME' && (
    ['SINGLE','DOUBLE','TRIPLE','HOME_RUN','SAC_FLY'].includes(result)
  ));
  return { batter:RESULT_BATTER[result], runners, rbi };
}

export function applyExplicitPlay(s, batter, result, advances, addRun) {
  assert(isObject(advances) && isObject(advances.runners), 'Explicit play needs runner destinations.');
  assert(advances.batter === RESULT_BATTER[result], 'Batter destination does not match result.');
  assert(Array.isArray(advances.rbi), 'Explicit play needs an RBI decision array.');
  const occupied = [1,2,3].filter(base => s.bases[base]);
  assert(Object.keys(advances.runners).length === occupied.length,
    'Provide exactly one destination for every runner who started the play.');
  assert(Object.keys(advances.runners).every(base => occupied.includes(Number(base)) && String(Number(base)) === base),
    'A destination was supplied for a runner who was not on base.');
  const next = { 1:null, 2:null, 3:null }, runs = [], outs = [];
  const destinations = [['batter', batter, advances.batter]];
  for (const from of occupied) {
    const dest = advances.runners[from];
    assert(RUNNER_DESTINATIONS.has(dest), `Invalid destination for runner on ${from}.`);
    if (dest !== 'HOLD' && dest !== 'OUT') {
      assert(BASE_NUM[dest] > from, `Runner on ${from} cannot move backwards.`);
    }
    destinations.push([String(from), s.bases[from], dest === 'HOLD' ? BASE_LABELS[from] : dest]);
  }
  for (const [key, runner, dest] of destinations) {
    if (dest === 'OUT') { outs.push(key); continue; }
    if (dest === 'HOME') { runs.push([key, runner]); continue; }
    const n = BASE_NUM[dest];
    assert(n >= 1 && n <= 3, 'Invalid runner destination.');
    assert(next[n] === null, `Two players cannot occupy ${dest.toLowerCase()} base.`);
    next[n] = runner;
  }
  assert(s.outs + outs.length <= 3, 'A play cannot produce more than three outs.');
  assert(!(s.outs + outs.length === 3 && runs.length > 0),
    'Scoring on a third-out play needs time-play/force-out decisions (not yet supported).');
  if (result === 'SAC_FLY') {
    assert(s.outs < 2, 'A sacrifice fly requires fewer than two outs.');
    assert(s.bases[3] && advances.runners['3'] === 'HOME',
      'A sacrifice fly requires a runner scoring from third.');
  }
  if (result === 'HOME_RUN') {
    assert(outs.length === 0 && runs.length === occupied.length + 1,
      'A home run must score the batter and every occupied runner.');
  }
  if (result === 'FIELDERS_CHOICE') {
    assert(outs.length > 0, "Fielder's choice must retire a runner.");
  }
  const rbi = new Set(advances.rbi);
  assert(rbi.size === advances.rbi.length, 'Duplicate RBI entries are not allowed.');
  assert([...rbi].every(key => key !== 'batter' && runs.some(([from]) => from === key)),
    'An RBI can be credited only to a runner who scored on the play.');
  if (result === 'SAC_FLY') assert(rbi.has('3'), 'Sacrifice fly must credit RBI for runner on third.');
  s.bases = next;
  // The calculated destinations and RBI decisions are validated before mutating the score.
  for (const [key, runner] of runs) {
    addRun(s, runner, (key === 'batter' || rbi.has(key)) ? batter : null);
  }
  s.outs += outs.length;
  return {runs:runs.length, outs:outs.length};
}
