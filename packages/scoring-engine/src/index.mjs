/**
 * OpenSideline baseball scoring engine, v0.2 candidate.
 * Immutable game event journal + pure replay. The domain package has no UI dependencies.
 *
 * Scope: standard pitch counts, basic PA outcomes, deterministic one/two/three-base
 * hit advancement, forced walks, simple outs, steals and manual runner movement.
 * v0.2 adds opt-in explicit in-play runner destinations; v0.1 journal events replay unchanged.
 */
import { applyExplicitPlay } from './advancement.mjs';
import { validateFieldingAnnotation, describeFielding } from './fielding.mjs';
import { emptyDefensiveLineup, validateDefensiveLineup } from './defensive-lineup.mjs';
import { normalizeGameRules, chooseInitialBattingOrder, validateBattingOrder } from './game-day-rules.mjs';
export { LEAGUE_PRESETS, normalizeGameRules } from './game-day-rules.mjs';
export { emptyDefensiveLineup } from './defensive-lineup.mjs';
export { FIELDING_POSITIONS, HIT_LOCATIONS } from './fielding.mjs';
export { defaultPlayAdvances } from './advancement.mjs';
export const ENGINE_VERSION = '0.2.5';
export const PLAY_RESULTS = Object.freeze({
  SINGLE: 'Single', DOUBLE: 'Double', TRIPLE: 'Triple', HOME_RUN: 'Home run',
  OUT: 'Other out', GROUND_OUT: 'Groundout', LINE_OUT: 'Lineout', FLY_OUT: 'Flyout',
  ERROR: 'Reached on error', SAC_FLY: 'Sacrifice fly',
  FIELDERS_CHOICE: "Fielder's choice",
});
const EVENT_TYPES = new Set(['BALL', 'STRIKE', 'FOUL', 'BALL_IN_PLAY', 'WALK', 'HBP', 'STOLEN_BASE', 'ADVANCE_RUNNER', 'RUNNER_OUT', 'PLAY_ANNOTATION', 'DEFENSIVE_LINEUP', 'LINEUP_SUBSTITUTION', 'PINCH_RUNNER', 'PITCHER_CHANGE']);
const STATS = () => ({ PA: 0, AB: 0, H: 0, R: 0, RBI: 0, BB: 0, SO: 0, HBP: 0, doubles: 0, triples: 0, HR: 0, SF: 0, SB: 0, CS: 0 });
const PITCH_STATS = () => ({P:0,Balls:0,Strikes:0,BF:0,H:0,BB:0,SO:0,HBP:0});
const FIELD_STATS = () => ({PO:0,A:0,E:0,DP:0});
const assert = (condition, text) => { if (!condition) throw new Error(text); };
const sanitize = (str, max = 50) => String(str ?? '').trim().slice(0, max);
const defaultRoster = (prefix) => Array.from({ length: 9 }, (_, i) => ({ id: `${prefix}-${i + 1}`, number: String(i + 1), name: `Player ${i + 1}` }));

function validateRoster(roster, prefix) {
  assert(Array.isArray(roster) && roster.length >= 1 && roster.length <= 30, 'Each roster needs 1–30 players.');
  const ids = new Set();
  return roster.map((p, i) => {
    const name = sanitize(p?.name, 60);
    assert(name.length > 0, `Player ${i + 1} needs a name.`);
    const id = sanitize(p?.id || `${prefix}-${i + 1}`, 80);
    assert(!ids.has(id), 'Each player needs a unique ID on their team.');
    ids.add(id);
    return { id, number: sanitize(p?.number, 5), name };
  });
}

export function createGame({
  homeName='Home Hawks',awayName='Visiting Tigers',homeRoster,awayRoster,
  homeBattingOrder,awayBattingOrder,rules:rulesInput,
} = {}) {
  const nameHome=sanitize(homeName,60),nameAway=sanitize(awayName,60);
  assert(nameHome&&nameAway,'Both teams need names.');
  const rules=normalizeGameRules(rulesInput ?? {});
  const home=validateRoster(homeRoster ?? defaultRoster('home'),'home');
  const away=validateRoster(awayRoster ?? defaultRoster('away'),'away');
  if(rules.battingMode==='nine'){
    assert(home.length>=9 && away.length>=9,'Nine-batter mode requires at least nine roster players per team.');
  }
  const homeOrder=chooseInitialBattingOrder(home,rules,homeBattingOrder);
  const awayOrder=chooseInitialBattingOrder(away,rules,awayBattingOrder);
  if(rules.battingMode==='nine')
    assert(homeOrder.length===9&&awayOrder.length===9,'Nine-batter mode requires exactly nine active batters per team.');
  if(rules.battingMode==='continuous')
    assert(homeOrder.length===home.length&&awayOrder.length===away.length,
      'Continuous mode must include every roster player in the batting order.');
  return {
    schemaVersion:1,engineVersion:ENGINE_VERSION,
    id:`game-${Date.now().toString(36)}`,createdAt:new Date().toISOString(),
    rules,
    teams:{
      home:{name:nameHome,roster:home,battingOrder:homeOrder},
      away:{name:nameAway,roster:away,battingOrder:awayOrder},
    },
    events:[],
  };
}

function freshView(game) {
  return {
    inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0,
    bases: { 1: null, 2: null, 3: null },
    scores: { home: 0, away: 0 }, hits: { home: 0, away: 0 }, errors: { home: 0, away: 0 },
    lineScore: { home: {}, away: {} },
    battingIndex: {home:0,away:0},
    battingOrder:{
      home:validateBattingOrder(game.teams.home.battingOrder ?? game.teams.home.roster.map(p=>p.id),game.teams.home.roster),
      away:validateBattingOrder(game.teams.away.battingOrder ?? game.teams.away.roster.map(p=>p.id),game.teams.away.roster),
    },
    lineupRemoved:{home:[],away:[]},
    substitutions:[],
    rules:normalizeGameRules(game.rules??{}),
    pitchingStats:{
      home:Object.fromEntries(game.teams.home.roster.map(p=>[p.id,PITCH_STATS()])),
      away:Object.fromEntries(game.teams.away.roster.map(p=>[p.id,PITCH_STATS()])),
    },
    fieldingStats:{
      home:Object.fromEntries(game.teams.home.roster.map(p=>[p.id,FIELD_STATS()])),
      away:Object.fromEntries(game.teams.away.roster.map(p=>[p.id,FIELD_STATS()])),
    },
    defenseLineup: {home:emptyDefensiveLineup(),away:emptyDefensiveLineup()},
    playerStats: {
      home: Object.fromEntries(game.teams.home.roster.map(p => [p.id, STATS()])),
      away: Object.fromEntries(game.teams.away.roster.map(p => [p.id, STATS()])),
    },
    playLog: [], eventCount: 0,
  };
}
const battingSide = (s) => s.half === 'top' ? 'away' : 'home';
const fieldingSide = (s) => s.half === 'top' ? 'home' : 'away';
const batterOf = (s, game) => {
  const side=battingSide(s),roster=game.teams[side].roster;
  const order=s.battingOrder[side];
  return roster.find(player=>player.id===order[s.battingIndex[side]%order.length]);
};
function addRun(s, runner, rbiBatter = null) {
  const side = battingSide(s);
  s.scores[side] += 1;
  s.lineScore[side][s.inning] = (s.lineScore[side][s.inning] ?? 0) + 1;
  s.playerStats[side][runner.id].R += 1;
  if (rbiBatter) s.playerStats[side][rbiBatter.id].RBI += 1;
}
function finishPA(s, game, { hit = null, ab = false, walk = false, strikeout = false, hbp = false, sf = false } = {}) {
  const side = battingSide(s), batter = batterOf(s, game), st = s.playerStats[side][batter.id];
  st.PA++; if (ab) st.AB++; if (walk) st.BB++; if (strikeout) st.SO++;
  if (hbp) st.HBP++; if (sf) st.SF++;
  if (hit) {
    st.H++; s.hits[side]++;
    if (hit === 'DOUBLE') st.doubles++;
    if (hit === 'TRIPLE') st.triples++;
    if (hit === 'HOME_RUN') st.HR++;
  }
  const pitcherId=s.defenseLineup[fieldingSide(s)]['1'];
  if(pitcherId){
    const pitching=s.pitchingStats[fieldingSide(s)][pitcherId];
    pitching.BF++; if(hit)pitching.H++; if(walk)pitching.BB++;
    if(strikeout)pitching.SO++; if(hbp)pitching.HBP++;
  }
  s.battingIndex[side]++;
  s.balls=0;s.strikes=0;
}
function endHalfIfNeeded(s) {
  if (s.outs !== 3) return false;
  s.outs = 0; s.balls = 0; s.strikes = 0;
  s.bases = { 1: null, 2: null, 3: null };
  if (s.half === 'top') s.half = 'bottom';
  else { s.half = 'top'; s.inning++; }
  return true;
}
function forceFirst(s, batter, grantRbi) {
  const b1 = s.bases[1], b2 = s.bases[2], b3 = s.bases[3];
  if (b1 && b2 && b3) addRun(s, b3, grantRbi ? batter : null);
  if (b1 && b2) s.bases[3] = b2;
  if (b1) s.bases[2] = b1;
  s.bases[1] = batter;
}
function moveOnHit(s, batter, bases) {
  const existing = { ...s.bases }, next = { 1: null, 2: null, 3: null };
  for (let from = 3; from >= 1; from--) {
    const runner = existing[from];
    if (!runner) continue;
    const to = from + bases;
    if (to >= 4) addRun(s, runner, batter);
    else next[to] = runner;
  }
  if (bases === 4) addRun(s, batter, batter);
  else next[bases] = batter;
  s.bases = next;
}
function addLog(s, event, label, prior, game) {
  s.playLog.push({
    index: s.eventCount + 1, at: event.at || '',
    inning: prior.inning, half: prior.half,
    offense: prior.half === 'top' ? game.teams.away.name : game.teams.home.name,
    label,
    ...(event.type === 'BALL_IN_PLAY'
      ? {defenseAssignments:{...s.defenseLineup[prior.half==='top' ? 'home' : 'away']}}
      : {}),
  });
}
function process(s, game, event) {
  assert(event && EVENT_TYPES.has(event.type), 'Unknown scoring action.');
  const prev = { inning: s.inning, half: s.half };
  const batter = batterOf(s, game);
  const team=battingSide(s),defense=fieldingSide(s);
  const pitchId=s.defenseLineup[defense]['1'];
  const pitchStats=pitchId?s.pitchingStats[defense][pitchId]:null;
  if(['BALL','STRIKE','FOUL'].includes(event.type)&&pitchStats){
    pitchStats.P++;
    if(event.type==='BALL')pitchStats.Balls++;
    else pitchStats.Strikes++;
  }
  let label='';
  switch (event.type) {
    case 'DEFENSIVE_LINEUP': {
      assert(event.side === 'home' || event.side === 'away', 'Choose the home or away team.');
      s.defenseLineup[event.side] = validateDefensiveLineup(
        event.assignments, game.teams[event.side].roster
      );
      label = 'Defensive lineup updated';
      break;
    }
    case 'LINEUP_SUBSTITUTION': {
      const side=event.side,slot=event.slot,playerId=event.playerId;
      assert(side==='home'||side==='away','Choose a valid team to substitute.');
      const order=s.battingOrder[side];
      assert(Number.isInteger(slot)&&slot>=0&&slot<order.length,'Choose a valid batting slot.');
      assert(typeof playerId==='string'&&game.teams[side].roster.some(p=>p.id===playerId),
        'Substitute must be on this team’s roster.');
      assert(!order.includes(playerId),'This player already has a batting slot.');
      assert(!s.lineupRemoved[side].includes(playerId)||s.rules.allowReentry,
        'Your rules do not allow this player to re-enter the batting order.');
      assert(!Object.values(s.bases).some(p=>p?.id===playerId),
        'A baserunner cannot simultaneously enter a different batting slot.');
      const outgoing=order[slot];
      order[slot]=playerId;
      if(!s.lineupRemoved[side].includes(outgoing))s.lineupRemoved[side].push(outgoing);
      s.substitutions.push({type:'LINEUP_SUBSTITUTION',side,slot,outgoing,incoming:playerId,
        kind:event.kind==='PH'?'PH':'SUB',eventIndex:s.eventCount});
      label=`${game.teams[side].roster.find(p=>p.id===playerId).name} replaces ${game.teams[side].roster.find(p=>p.id===outgoing).name} in batting slot ${slot+1}`;
      break;
    }
    case 'PINCH_RUNNER': {
      const from=Number(event.from),playerId=event.playerId,side=battingSide(s);
      assert([1,2,3].includes(from)&&s.bases[from],'Choose an occupied base for the pinch runner.');
      assert(typeof playerId==='string'&&game.teams[side].roster.some(p=>p.id===playerId),
        'Pinch runner must be on the batting team’s roster.');
      assert(!Object.values(s.bases).some(p=>p?.id===playerId),
        'Pinch runner is already on base.');
      assert(!s.battingOrder[side].includes(playerId),
        'A current batter cannot be used as a pinch runner.');
      assert(!s.lineupRemoved[side].includes(playerId)||s.rules.allowReentry,
        'Your rules do not allow this player to re-enter.');
      const outgoing=s.bases[from],slot=s.battingOrder[side].indexOf(outgoing.id);
      assert(slot>=0,'The runner’s batting slot is not available for substitution.');
      s.bases[from]=game.teams[side].roster.find(p=>p.id===playerId);
      s.battingOrder[side][slot]=playerId;
      if(!s.lineupRemoved[side].includes(outgoing.id))s.lineupRemoved[side].push(outgoing.id);
      s.substitutions.push({type:'PINCH_RUNNER',side,slot,from,outgoing:outgoing.id,incoming:playerId,eventIndex:s.eventCount});
      label=`${s.bases[from].name} pinch-runs for ${outgoing.name} on ${from===1?'first':from===2?'second':'third'}`;
      break;
    }
    case 'PITCHER_CHANGE': {
      const side=event.side,playerId=event.playerId;
      assert(side==='home'||side==='away','Choose a valid team for a pitching change.');
      assert(typeof playerId==='string'&&game.teams[side].roster.some(p=>p.id===playerId),
        'New pitcher must be on the defensive roster.');
      const updated={...s.defenseLineup[side]};
      for(const position of Object.keys(updated))if(updated[position]===playerId)updated[position]=null;
      updated['1']=playerId;
      s.defenseLineup[side]=validateDefensiveLineup(updated,game.teams[side].roster);
      label=`${game.teams[side].roster.find(p=>p.id===playerId).name} enters as pitcher`;
      break;
    }
    case 'BALL':
      s.balls++;
      if (s.balls === 4) {
        forceFirst(s, batter, true);
        finishPA(s, game, { walk: true });
        label = `${batter.name} walks (four balls)`;
      } else label = `Ball • ${s.balls}-${s.strikes}`;
      break;
    case 'STRIKE':
      s.strikes++;
      if (s.strikes === 3) {
        finishPA(s, game, { ab: true, strikeout: true });
        s.outs++; label = `${batter.name} strikes out`;
        endHalfIfNeeded(s);
      } else label = `Strike • ${s.balls}-${s.strikes}`;
      break;
    case 'FOUL':
      if (s.strikes < 2) s.strikes++;
      label = `Foul • ${s.balls}-${s.strikes}`;
      break;
    case 'WALK':
      forceFirst(s, batter, true);
      finishPA(s, game, { walk: true });
      label = `${batter.name} walks`;
      break;
    case 'HBP':
      forceFirst(s, batter, true);
      finishPA(s, game, { hbp: true });
      label = `${batter.name} hit by pitch`;
      break;
    case 'BALL_IN_PLAY': {
      const result = event.result;
      assert(Object.prototype.hasOwnProperty.call(PLAY_RESULTS, result), 'Unknown ball-in-play result.');
      if (event.advances !== undefined) {
        const totals = applyExplicitPlay(s, batter, result, event.advances, addRun);
        if (['SINGLE', 'DOUBLE', 'TRIPLE', 'HOME_RUN'].includes(result)) {
          finishPA(s, game, {ab:true, hit:result});
        } else if (result === 'SAC_FLY') {
          finishPA(s, game, {sf:true});
        } else {
          if (result === 'ERROR') s.errors[defense]++;
          finishPA(s, game, {ab:true});
        }
        label = `${batter.name} • ${PLAY_RESULTS[result]} • ${totals.runs} scored, ${totals.outs} out`;
        endHalfIfNeeded(s);
      } else if (result === 'FIELDERS_CHOICE') {
        throw new Error("Fielder's choice requires explicit runner destinations.");
      } else if (['SINGLE', 'DOUBLE', 'TRIPLE', 'HOME_RUN'].includes(result)) {
        const bases = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, HOME_RUN: 4 }[result];
        moveOnHit(s, batter, bases);
        finishPA(s, game, { ab: true, hit: result });
        label = `${batter.name} • ${PLAY_RESULTS[result]}`;
      } else if (result === 'ERROR') {
        forceFirst(s, batter, false);
        s.errors[defense]++;
        finishPA(s, game, { ab: true });
        label = `${batter.name} reaches on error`;
      } else if (result === 'SAC_FLY') {
        assert(s.outs < 2, 'A sacrifice fly requires fewer than two outs.');
        assert(s.bases[3], 'A sacrifice fly requires a runner on third.');
        addRun(s, s.bases[3], batter); s.bases[3] = null;
        finishPA(s, game, { sf: true });
        s.outs++; label = `${batter.name} • sacrifice fly (1 RBI)`;
        endHalfIfNeeded(s);
      } else {
        finishPA(s, game, { ab: true });
        s.outs++; label = `${batter.name} • ${PLAY_RESULTS[result]}`;
        endHalfIfNeeded(s);
      }
      break;
    }
    case 'STOLEN_BASE':
    case 'ADVANCE_RUNNER': {
      const from = Number(event.from);
      assert([1, 2, 3].includes(from), 'Choose a valid occupied base.');
      assert(s.bases[from], 'No runner on that base.');
      const runner = s.bases[from];
      const to = from + 1;
      assert(to === 4 || !s.bases[to], 'Next base is already occupied.');
      s.bases[from] = null;
      if (to === 4) addRun(s, runner);
      else s.bases[to] = runner;
      if (event.type === 'STOLEN_BASE') s.playerStats[team][runner.id].SB++;
      label = `${runner.name} ${event.type === 'STOLEN_BASE' ? 'steals' : 'advances to'} ${to === 4 ? 'home' : `${['', 'first', 'second', 'third'][to]} base`}`;
      break;
    }
    case 'PLAY_ANNOTATION': {
      const target=event.target;
      assert(Number.isInteger(target) && target>=0 && target<s.eventCount,
        'Fielding annotation needs a previous play index.');
      assert(game.events[target]?.type==='BALL_IN_PLAY',
        'Fielding details can only annotate a batted-ball play.');
      const log=s.playLog.find(item=>item.index===target+1);
      assert(log, 'The original play could not be found.');
      const defend=log.half==='top' ? 'home' : 'away';
      const roster=game.teams[defend].roster;
      const details=validateFieldingAnnotation(event.fielding,roster);
      const snapshot=log.defenseAssignments ?? emptyDefensiveLineup();
      const resolved={ ...details,
        sequence:details.sequence.map(step=>({
          position:step.position,
          playerId:step.playerId ?? snapshot[String(step.position)] ?? null,
        })) };
      log.fielding=resolved;
      log.baseLabel ??= log.label;
      log.label=`${log.baseLabel} • ${describeFielding(resolved,roster)}`;
      label='Fielding details updated';
      break;
    }
    case 'RUNNER_OUT': {
      const from = Number(event.from);
      assert([1, 2, 3].includes(from) && s.bases[from], 'Choose an occupied base.');
      const runner = s.bases[from];
      s.bases[from] = null; s.outs++;
      if (event.caughtStealing) s.playerStats[team][runner.id].CS++;
      label = `${runner.name} out on bases${event.caughtStealing ? ' (caught stealing)' : ''}`;
      endHalfIfNeeded(s);
      break;
    }
  }
  if (event.type !== 'PLAY_ANNOTATION' && event.type !== 'DEFENSIVE_LINEUP') addLog(s, event, label, prev, game);
  s.eventCount++;
  return s;
}

export function replayGame(game) {
  assert(game && game.schemaVersion === 1 && game.teams && Array.isArray(game.events), 'Invalid or unsupported game file.');
  // Incomplete/invalid external data must not be trusted simply because it parses as JSON.
  const validated = {
    events: game.events, // annotation lookups use the already validated, ordered journal
    rules:game.rules,
    teams: {
      home: {name:sanitize(game.teams.home?.name,60),roster:validateRoster(game.teams.home?.roster,'home'),
        battingOrder:game.teams.home?.battingOrder},
      away: {name:sanitize(game.teams.away?.name,60),roster:validateRoster(game.teams.away?.roster,'away'),
        battingOrder:game.teams.away?.battingOrder},
    },
  };
  assert(game.events.length <= 10000, 'Game has too many events.');
  const state = freshView(validated);
  for (const event of game.events) process(state, validated, event);
  // Derive fielding totals only from the latest annotation for each play.
  // Re-annotating an earlier ball cannot double-count credited fielders.
  for(const log of state.playLog){
    const credits=log.fielding?.credits;
    if(!credits)continue;
    const side=log.half==='top'?'home':'away';
    for(const [key,stat] of [['putouts','PO'],['assists','A'],['errors','E'],['doublePlays','DP']]){
      for(const id of credits[key]??[]) state.fieldingStats[side][id][stat]++;
    }
  }
  state.batter = batterOf(state, validated);
  state.batting = battingSide(state);
  state.fielding = fieldingSide(state);
  return state;
}
export function appendEvent(game, event) {
  const next = { ...game, events: [...game.events, { ...event }] };
  replayGame(next); // validation before accepting the new event
  return next;
}
export function undoEvent(game) {
  return { ...game, events: game.events.slice(0, -1) };
}
export function formatAvg(h, ab) { return ab ? (h / ab).toFixed(3).replace(/^0/, '') : '.000'; }
export function formatObp(st) {
  const denominator = st.AB + st.BB + st.HBP + st.SF;
  return denominator ? ((st.H + st.BB + st.HBP) / denominator).toFixed(3).replace(/^0/, '') : '.000';
}
export function formatSlg(st) {
  return st.AB ? ((st.H + st.doubles + 2 * st.triples + 3 * st.HR) / st.AB).toFixed(3).replace(/^0/, '') : '.000';
}
