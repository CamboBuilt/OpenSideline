import { createGame, replayGame, appendEvent, undoEvent, PLAY_RESULTS, defaultPlayAdvances, formatAvg, formatObp, formatSlg, FIELDING_POSITIONS, HIT_LOCATIONS, LEAGUE_PRESETS } from '../../../packages/scoring-engine/src/index.mjs';

import { getQuickPlayPresets } from './quick-play.mjs';
import { parseRosterImport, importedRosterText, matchImportedDefense } from './roster-import.mjs';
import { summarizeSeason, seasonCsv } from './season-summary.mjs';
import { isCloudConfigured, connectCloud } from './cloud-runtime.mjs';
import { renderCloudPanel } from './cloud-panel.mjs';

const STORAGE_KEY = 'opensideline:baseball:v1';
const ARCHIVE_KEY = 'opensideline:baseball:archive:v1';
function readArchive() {
  try {
    const data=JSON.parse(localStorage.getItem(ARCHIVE_KEY)??'[]');
    if(!Array.isArray(data))return [];
    return data.slice(-20).filter(g=>{
      try{replayGame(g);return true;}catch{return false;}
    });
  }catch{return [];}
}
function archiveGame(g){
  if(!g?.events?.length)return;
  try{
    const items=readArchive().filter(item=>item.id!==g.id);
    items.push(g);
    localStorage.setItem(ARCHIVE_KEY,JSON.stringify(items.slice(-20)));
  }catch{ /* Local storage may be full; game exports remain available. */ }
}
const app = document.querySelector('#app');
const TAB_ID = Math.random().toString(36).slice(2);
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('opensideline-baseball-v1') : null;
const query = new URLSearchParams(location.search);
const displayMode = ['spectator', 'overlay'].includes(query.get('view')) ? query.get('view') : 'scorer';
let game = readStoredGame();
let selectedTab = 'plays';
let showSetup = false;
let showPlay = null;
let fieldingDraft = null;
let defenseDraft = null;
let showLineup = false;
let showCloud = false;
let cloudBusy = false;
let cloudGateway = null;
let cloudUser = null;
let cloudGames = [];
let cloudTeams = [];
let cloudMessage = '';
let cloudTeamChoice = '';
let cloudKnownVersions = new Map();
let lineupSide='away';
let importedSetupPlayers = {away:null,home:null};
let feedback = '';
let showMoreActions = false;
let noticeTimer = null;

function readStoredGame() {
  try {
    const found = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (found) { replayGame(found); return found; }
  } catch { /* Corrupt saved games are ignored in favor of a fresh demo. */ }
  return createGame();
}
function commit(next) {
  game = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(game)); }
  catch { /* The page remains usable in private or restricted storage modes. */ }
  channel?.postMessage({ from: TAB_ID, game });
  render();
}
function toast(text) {
  feedback = text;
  clearTimeout(noticeTimer);
  render();
  noticeTimer = setTimeout(() => { feedback = ''; render(); }, 3500);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const safe = escapeHtml;
function icon(name, size = 18) {
  const paths = {
    baseball: '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7c3.1 3.5 3.1 9.1 0 12.6M18.3 5.7c-3.1 3.5-3.1 9.1 0 12.6M6.9 8l2 1.2m-2 2.4 2.1 1m6-3.5 2-1.2m-2 4.8 2.1-1"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    people: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8"/>',
    stats: '<path d="M3 3v18h18M7 16v-5m5 5V7m5 9V5"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15l1.5 1.1-2 3.4-1.8-.7a8 8 0 0 1-1.6.9l-.3 1.9h-4l-.3-1.9a8 8 0 0 1-1.6-.9l-1.8.7-2-3.4L7 15a7 7 0 0 1 0-2l-1.5-1.1 2-3.4 1.8.7a8 8 0 0 1 1.6-.9l.3-1.9h4l.3 1.9a8 8 0 0 1 1.6.9l1.8-.7 2 3.4-1.5 1.1a7 7 0 0 1 0 2Z"/>',
    share: '<path d="M12 16V3m0 0L7 8m5-5 5 5M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/>',
    undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    new: '<path d="M12 5v14M5 12h14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M20 14v6H4V4h6"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16m16-16a11 11 0 0 1 0 16"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
}
const titleCase = word => word === 'top' ? 'TOP' : 'BOT';
function getCounts(n, maximum) { return Array.from({length: maximum}, (_, i) => `<span class="light ${i < n ? 'on' : ''}"></span>`).join(''); }
function renderBases(view, large = false) {
  return `<div class="diamond ${large ? 'diamond-large' : ''}" aria-label="Bases: ${[1,2,3].filter(n => view.bases[n]).map(n => `${n}${n===1?'st':n===2?'nd':'rd'} occupied`).join(', ') || 'empty'}">
    <div class="infield"></div>
    <div class="base base-2 ${view.bases[2] ? 'occupied' : ''}" title="Second base: ${safe(view.bases[2]?.name || 'empty')}"></div>
    <div class="base base-3 ${view.bases[3] ? 'occupied' : ''}" title="Third base: ${safe(view.bases[3]?.name || 'empty')}"></div>
    <div class="base base-1 ${view.bases[1] ? 'occupied' : ''}" title="First base: ${safe(view.bases[1]?.name || 'empty')}"></div>
    <div class="home-plate"></div>
    <span class="pitchers-mound"></span>
  </div>`;
}
function lineScore(v) {
  const innings = Array.from({ length: Math.max(v.inning, 3) }, (_, i) => i + 1);
  const cells = (side) => innings.map(i => {
    const isFuture = i > v.inning || (i === v.inning && side === 'home' && v.half === 'top');
    return `<td>${isFuture && !v.lineScore[side][i] ? '–' : (v.lineScore[side][i] ?? 0)}</td>`;
  }).join('');
  return `<div class="line-scroll"><table class="linescore"><thead><tr><th>TEAM</th>${innings.map(i => `<th>${i}</th>`).join('')}<th>R</th><th>H</th><th>E</th></tr></thead>
    <tbody><tr><td>${safe(game.teams.away.name)}</td>${cells('away')}<td class="strong">${v.scores.away}</td><td>${v.hits.away}</td><td>${v.errors.away}</td></tr>
    <tr><td>${safe(game.teams.home.name)}</td>${cells('home')}<td class="strong">${v.scores.home}</td><td>${v.hits.home}</td><td>${v.errors.home}</td></tr></tbody></table></div>`;
}
function scoreHeader(v, compact = false) {
  return `<section class="score-panel ${compact ? 'score-compact' : ''}">
    <div class="score-teams">
      <div class="team away"><div class="team-mark away-mark">${safe(game.teams.away.name[0] || 'A')}</div><div class="team-text"><div class="team-sub">AWAY</div><div class="team-name">${safe(game.teams.away.name)}</div></div><div class="score">${v.scores.away}</div></div>
      <div class="versus"><span>VS</span></div>
      <div class="team home"><div class="team-mark home-mark">${safe(game.teams.home.name[0] || 'H')}</div><div class="team-text"><div class="team-sub">HOME</div><div class="team-name">${safe(game.teams.home.name)}</div></div><div class="score">${v.scores.home}</div></div>
    </div>
    <div class="game-facts"><div class="fact-inning"><span class="up-down">${v.half === 'top' ? '▲' : '▼'}</span><div><small>INNING</small><b>${titleCase(v.half)} ${v.inning}</b></div></div>
      <div class="fact"><small>BALLS</small><span class="lights balls">${getCounts(v.balls,3)}</span></div>
      <div class="fact"><small>STRIKES</small><span class="lights strikes">${getCounts(v.strikes,2)}</span></div>
      <div class="fact"><small>OUTS</small><span class="lights outs">${getCounts(v.outs,2)}</span></div></div>
    ${compact ? '' : lineScore(v)}
  </section>`;
}
function renderPlayLog(v) {
  const logs = v.playLog.slice(-12).reverse();
  return logs.length ? `<div class="events">${logs.map((row,i) => `<div class="event"><div class="event-bullet ${i === 0 ? 'latest' : ''}"></div><div class="event-content"><div class="event-meta">${row.half === 'top' ? 'TOP' : 'BOT'} ${row.inning} <span>·</span> ${safe(row.offense)}</div><div class="event-label">${safe(row.label)}</div></div>${i === 0 ? '<span class="event-new">LATEST</span>' : ''}${displayMode==='scorer' && game.events[row.index-1]?.type==='BALL_IN_PLAY' ? `<button class="event-fielding-btn" type="button" data-command="open-fielding" data-target="${row.index-1}">Fielding details</button>` : ''}</div>`).join('')}</div>` : '<div class="empty-log">No plays yet. Record the first pitch to start the game.</div>';
}
function renderStats(v) {
  const statsFor=side=>{
    const rows=game.teams[side].roster.map(p=>{
      const b=v.playerStats[side][p.id],f=v.fieldingStats[side][p.id],pitch=v.pitchingStats[side][p.id];
      const slot=v.battingOrder[side].indexOf(p.id);
      return `<tr><td><span class="jersey">${safe(p.number||'–')}</span> ${safe(p.name)}<small class="stat-roster-tag">${slot>=0?'Bats #'+(slot+1):'Bench'}</small></td>
        <td>${b.AB}</td><td>${b.H}</td><td>${b.R}</td><td>${b.RBI}</td><td>${b.BB}</td><td>${formatAvg(b.H,b.AB)}</td><td>${formatObp(b)}</td>
        <td>${f.PO}</td><td>${f.A}</td><td>${f.E}</td><td>${f.DP}</td></tr>`;
    }).join('');
    const pitchers=game.teams[side].roster.map(p=>{
      const x=v.pitchingStats[side][p.id];
      if(!x.P&&!x.BF&&!Object.values(v.defenseLineup[side]).includes(p.id))return '';
      return `<tr><td><span class="jersey">${safe(p.number||'–')}</span> ${safe(p.name)}</td>
        <td>${x.P}</td><td>${x.BF}</td><td>${x.H}</td><td>${x.BB}</td><td>${x.SO}</td></tr>`;
    }).join('');
    return `<section class="stat-block"><h4>${safe(game.teams[side].name)}</h4>
      <div class="table-overflow"><table class="player-stats"><thead><tr><th>PLAYER</th><th>AB</th><th>H</th><th>R</th><th>RBI</th><th>BB</th><th>AVG</th><th>OBP</th><th>PO</th><th>A</th><th>E</th><th>DP</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <h4 class="stat-secondary-title">Pitching (recorded pitches and batters faced only)</h4>
      <div class="table-overflow"><table class="player-stats"><thead><tr><th>PITCHER</th><th>PITCHES</th><th>BF</th><th>H</th><th>BB</th><th>SO</th></tr></thead>
      <tbody>${pitchers||'<tr><td colspan="6">Assign a pitcher to track basic pitching stats.</td></tr>'}</tbody></table></div>
    </section>`;
  };
  const spray=Object.entries(HIT_LOCATIONS).map(([zone,label])=>{
    const count=v.playLog.filter(p=>p.fielding?.location===zone).length;
    return `<span class="spray-zone" title="${safe(label)}">${safe(zone)} <b>${count}</b></span>`;
  }).join('');
  const season=summarizeSeason([...readArchive(),game]);
  const totals=season.players.filter(p=>p.totals.PA>0||p.totals.PO>0||p.totals.A>0);
  return `${statsFor('away')}${statsFor('home')}
    <section class="stat-block"><h4>Ball-location summary</h4><p class="fineprint">Approximate marked zones in this game; unmarked balls are excluded.</p>
      <div class="spray-zones">${spray}</div></section>
    <section class="stat-block"><div class="stat-action-title"><h4>Local season totals · ${season.games} saved game${season.games===1?'':'s'}</h4>
      <button type="button" class="btn subtle" data-command="export-season">Export season CSV</button></div>
      <div class="table-overflow"><table class="player-stats"><thead><tr><th>PLAYER</th><th>TEAM</th><th>G</th><th>AB</th><th>H</th><th>RBI</th><th>PO</th><th>A</th><th>E</th></tr></thead>
      <tbody>${totals.slice(0,40).map(p=>`<tr><td>${safe(p.name)}</td><td>${safe(p.team)}</td><td>${p.games}</td><td>${p.totals.AB}</td><td>${p.totals.H}</td><td>${p.totals.RBI}</td><td>${p.totals.PO}</td><td>${p.totals.A}</td><td>${p.totals.E}</td></tr>`).join('')||'<tr><td colspan="9">Score a few plays to populate season totals.</td></tr>'}</tbody></table></div>
    </section>
    <p class="fineprint">Fielding PO/A/E/DP credits are scorer-assigned, not automatically inferred. Pitch count is incomplete if at-bats are logged without individual pitches. The season archive is private to this browser and is not synchronized across devices.</p>`;
}
function playActions(v) {
  const hasRunner = [1,2,3].some(base => v.bases[base]);
  const quick = [
    ['SINGLE','Single','hit'], ['DOUBLE','Double','hit'], ['TRIPLE','Triple','hit'],
    ['HOME_RUN','Home run','homer'],
    ['GROUND_OUT','Ground out','out'], ['LINE_OUT','Line out','out'], ['FLY_OUT','Fly out','out'],
  ];
  const extra = [
    ['ERROR','Reached on error'], ['SAC_FLY','Sacrifice fly'], ['OUT','Other out'],
    ['FIELDERS_CHOICE',"Fielder's choice"],
  ];
  return `<div class="actions-head"><div><h3>Pitch by pitch</h3><p>Big buttons, ready for the next pitch.</p></div></div>
    <div class="pitch-buttons">
      <button type="button" data-action="BALL" class="pitch-btn ball"><b>Ball</b><span>Add a ball</span></button>
      <button type="button" data-action="STRIKE" class="pitch-btn strike"><b>Strike</b><span>Add a strike</span></button>
      <button type="button" data-action="FOUL" class="pitch-btn foul"><b>Foul</b><span>Count stays at 2 strikes</span></button>
    </div>
    <div class="actions-head hit-head"><div><h3>At-bat result</h3><p>One tap when bases are empty. With runners on, pick a quick finish.</p></div></div>
    <div class="play-grid">
      ${quick.map(([type,label,cls]) => `<button type="button" class="play-btn ${cls}" data-result="${type}"><span>${type === 'HOME_RUN' ? '✦ ' : ''}${label}</span>${icon('arrow',14)}</button>`).join('')}
      <button class="play-btn walk" type="button" data-action="WALK"><span>Walk</span>${icon('arrow',14)}</button>
      <button class="play-btn hbp" type="button" data-action="HBP"><span>Hit by pitch</span>${icon('arrow',14)}</button>
    </div>
    <button type="button" class="advanced-toggle" data-command="toggle-advanced" aria-expanded="${showMoreActions}" aria-controls="more-plays">${showMoreActions ? '− Hide other plays & runners' : '+ More plays & runner controls'}</button>
    <div id="more-plays" ${showMoreActions ? '' : 'hidden'}>
      <div class="extra-play-grid">${extra.map(([type,label]) => `<button type="button" class="play-btn neutral" data-result="${type}" ${(type === 'SAC_FLY' && !(v.outs < 2 && v.bases[3])) || (type === 'FIELDERS_CHOICE' && !hasRunner) ? 'disabled' : ''}>${label}${icon('arrow',14)}</button>`).join('')}</div>
      <div class="advanced-actions">
        ${[1,2,3].map(base => v.bases[base] ? `<div class="runner-control"><span><b>${safe(v.bases[base].name)}</b><small>On ${['','1st','2nd','3rd'][base]}</small></span><button type="button" data-advance="${base}" data-kind="STOLEN_BASE">Steal</button><button type="button" data-advance="${base}" data-kind="ADVANCE_RUNNER">Advance</button><button type="button" data-advance="${base}" data-kind="RUNNER_OUT">Out</button></div>` : '').join('') || '<p class="fineprint">No runners on base.</p>'}
      </div>
    </div>`;
}
function renderScorer(v) {
  const batter = v.batter;
  return `<div class="shell">
    <aside class="sidebar"><div class="brand"><span class="brand-logo">${icon('baseball',28)}</span><div>Open<span>Sideline</span><small>SPORTS, OPEN TO ALL</small></div></div>
      <div class="nav-label">WORKSPACE</div><nav><button class="nav-item selected">${icon('grid',19)} Game center <span class="nav-indicator"></span></button><button class="nav-item" data-command="open-setup">${icon('people',19)} Teams & rosters</button><button class="nav-item" data-command="open-defense">${icon('grid',19)} Defensive lineup</button><button class="nav-item" data-command="open-lineup">${icon('people',19)} Batting & substitutions</button><button class="nav-item" data-command="show-stats">${icon('stats',19)} Player stats</button></nav>
      <div class="nav-label resources">LIVE VIEWS</div><nav><a class="nav-item" href="?view=spectator" target="_blank" rel="noopener">${icon('radio',19)} Spectator view ${icon('external',13)}</a><a class="nav-item" href="?view=overlay" target="_blank" rel="noopener">${icon('grid',19)} OBS overlay ${icon('external',13)}</a></nav>
      <div class="sidebar-bottom"><div class="opensource-tag"><span class="green-dot"></span> OPEN-SOURCE MVP</div><div class="sidebar-version">Baseball scoring • v0.2.5 preview</div></div>
    </aside>
    <main class="main"><div class="topbar"><div class="crumb">BASEBALL <span>/</span> GAME CENTER</div><div class="topbar-actions"><span class="live-tag"><span class="green-dot"></span> LOCAL GAME</span><button class="btn subtle" data-command="export">${icon('share',16)} Export</button><button class="btn subtle" data-command="open-defense" title="Edit defensive lineup">${icon('grid',16)} Defense</button><button class="btn subtle" data-command="open-lineup">${icon('people',16)} Lineup</button><button class="btn subtle" data-command="open-setup">${icon('settings',16)} Setup</button></div></div>
      <div class="content"><div class="page-heading"><div><div class="eyebrow">THE GAME IS ON</div><h1>Live scorer<span class="accent-dot">.</span></h1><p>Keep your eyes on the game, not the menus.</p></div><button class="btn undo" data-command="undo" ${game.events.length ? '' : 'disabled'}>${icon('undo',16)} Undo last action</button></div>
      <div class="sticky-hud">${scoreHeader(v,true)}<div class="hud-bottom"><span>AT BAT <strong>${safe(v.batter.name)}</strong></span><span class="hud-count">COUNT ${v.balls}–${v.strikes} · ${v.outs} OUT</span><span class="hud-runners">ON BASE ${[1,2,3].map(b => `<b class="${v.bases[b] ? 'active' : ''}" aria-label="${['','First','Second','Third'][b]} base ${v.bases[b] ? 'occupied' : 'empty'}">${b}</b>`).join('')}</span></div></div>
      <div class="work-grid"><section class="card play-card"><div class="card-top"><div class="section-label">AT BAT</div><div class="card-top-tools"><button type="button" class="btn defense-open" data-command="open-defense">Defense ${icon('arrow',13)}</button><span class="pill">${safe(game.teams[v.batting].name)}</span></div></div>
        <div class="at-bat-strip">
          <div class="batter-block"><div class="batter-avatar">${safe(batter.number || '—')}</div><div><div class="batter-title">${safe(batter.name)}</div><div class="batter-sub">${safe(game.teams[v.batting].name)} · Batting #${(v.battingIndex[v.batting] % v.battingOrder[v.batting].length) + 1} of ${v.battingOrder[v.batting].length}</div></div></div>
          <div class="mini-field" aria-label="Current baserunners">${renderBases(v)}<div class="runner-summary">${[1,2,3].filter(base => v.bases[base]).map(base => `<span>${['','1B','2B','3B'][base]}: ${safe(v.bases[base].name)}</span>`).join('') || '<span>Bases empty</span>'}</div></div>
        </div>
        <div class="control-wrap">${playActions(v)}</div>
        ${lastBallInPlayIndex()>=0 ? `<div class="fielding-shortcut"><div><strong>Last batted ball:</strong> ${safe(PLAY_RESULTS[game.events[lastBallInPlayIndex()].result])}<small>Record location, defensive sequence and fielder names</small></div>
           <button type="button" data-command="open-fielding" data-target="${lastBallInPlayIndex()}">${game.events.some(e=>e.type==='PLAY_ANNOTATION'&&e.target===lastBallInPlayIndex())?'Edit fielding':'Add fielding'} ${icon('arrow',15)}</button></div>` : ''}
      </section>
      <section class="card timeline-card"><div class="timeline-header"><div><div class="section-label">GAME DETAILS</div><h3>Follow the action</h3></div><span class="number-badge">${game.events.length}</span></div>
        <div class="tabs"><button class="${selectedTab === 'plays' ? 'active' : ''}" data-tab="plays">Play-by-play</button><button class="${selectedTab === 'stats' ? 'active' : ''}" data-tab="stats">Box score</button></div>
        <div class="tab-content">${selectedTab === 'plays' ? renderPlayLog(v) : renderStats(v)}</div>
        <div class="timeline-bottom"><div>${icon('info',16)} <span>Game data is saved in this browser only.</span></div><button data-command="export">Export game ${icon('arrow',15)}</button></div>
      </section></div>
      <details class="score-breakdown"><summary>Inning-by-inning score</summary>${lineScore(v)}</details>
      <div class="footer-note"><span>OpenSideline <b>v0.2.5 preview</b> — Community-built sports technology</span><span>Prototype · Not a certified official scorebook</span></div>
    </div></main></div>`;
}
function renderSpectator(v) {
  const overlay = displayMode === 'overlay';
  return `<div class="${overlay ? 'overlay-mode' : 'spectator-mode'}"><div class="spectator-head"><div class="brand compact"><span class="brand-logo">${icon('baseball',25)}</span><div>Open<span>Sideline</span></div></div>${overlay ? '<span class="tag muted">OBS DEMO</span>' : '<span class="live-tag"><span class="green-dot"></span> LOCAL LIVE VIEW</span>'}</div>
  ${scoreHeader(v,true)}${overlay ? '' : `<section class="spectator-base"><div class="section-label">CURRENT SITUATION</div><div class="spectator-grid">${renderBases(v,true)}<div class="batter-now"><small>AT BAT</small><h2>${safe(v.batter.name)}</h2><span>${safe(game.teams[v.batting].name)}</span><p>${v.outs} out${v.outs === 1 ? '' : 's'} · ${v.balls}-${v.strikes} count</p></div></div></section><div class="spectator-updates"><h3>Recent plays</h3>${renderPlayLog(v)}</div>`}
  <div class="spectator-footer">${overlay ? 'Preview only — syncs across tabs in the same browser profile.' : 'OpenSideline prototype • Local-tab synchronization only; not an internet broadcast.'}</div>
  </div>`;
}
function parseRoster(raw, prefix) {
  const entries = String(raw).split('\n').map(x=>x.trim()).filter(Boolean);
  return entries.map((line,i) => {
    const m = line.match(/^#?(\d{1,3})\s*[-:.]?\s+(.+)$/);
    return { id: `${prefix}-${i+1}`, number: m ? m[1] : String(i+1), name: m ? m[2].trim() : line };
  });
}
function rosterToText(side) { return game.teams[side].roster.map(p => `#${p.number} ${p.name}`).join('\n'); }
function lineupNumbers(side) {
  const roster=game.teams[side].roster,ids=game.teams[side].battingOrder??roster.map(p=>p.id);
  return ids.map(id=>roster.find(p=>p.id===id)?.number??'').filter(Boolean).join(', ');
}
function selectedBatters(roster,numbers,mode) {
  if(mode==='continuous')return roster.map(p=>p.id);
  const entries=String(numbers??'').split(/[,\n; ]+/).map(s=>s.trim()).filter(Boolean);
  if(mode==='nine' && entries.length===0)return roster.slice(0,9).map(p=>p.id);
  const chosen=entries.length?entries:roster.map(p=>p.number);
  return chosen.map(number=>{
    const matches=roster.filter(p=>String(p.number)===number);
    if(matches.length!==1)throw new Error('Batting jersey #'+number+' must match exactly one roster member.');
    return matches[0].id;
  });
}
function setupModal() {
  const teamEditor = (side, label) => `<div class="setup-team">
    <label for="${side}-name">${label}</label>
    <input id="${side}-name" name="${side}Name" maxlength="60" value="${safe(game.teams[side].name)}" required/>
    <div class="import-control-row">
      <label class="import-file-label">Import CSV / JSON roster
        <input type="file" data-roster-import="${side}" accept=".csv,.json,text/csv,application/json" aria-label="Import ${label.toLowerCase()} roster from CSV or JSON"/>
      </label>
      <span class="import-status" id="import-status-${side}" role="status"></span>
    </div>
    <label for="${side}-roster">${label} full roster (batters and bench)</label>
    <textarea id="${side}-roster" name="${side}Roster" rows="10" required>${safe(rosterToText(side))}</textarea>
    <p class="import-hint">One player per line. Imported defensive positions will be saved.</p>
    <label for="${side}-order">Active batting order · jersey numbers in order</label>
    <input id="${side}-order" name="${side}Order" value="${safe(lineupNumbers(side))}" placeholder="12, 7, 24, 18" />
    <p class="import-hint">In continuous batting, everyone in the roster bats. For nine/custom, edit this list to choose only active batters; others stay on the bench.</p>
  </div>`;
  return `<div class="modal-backdrop" data-command="close-setup"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
    <div class="modal-head"><div><div class="eyebrow">TEAMS + BATTING ORDER</div><h2 id="setup-title">Set up a game</h2>
      <p>Paste rosters or import a standard CSV/JSON file. Optional P, C, 1B, 2B, 3B, SS, LF, CF and RF values set the starting defense.</p>
      <button class="btn subtle template-button" data-command="download-roster-template" type="button">Download sample CSV</button>
    </div><button data-command="close-setup" class="close-button" aria-label="Close setup">×</button></div>
    <form id="setup-form"><div class="rules-setup">
      <label>Rules example<select name="preset" id="game-preset">
        ${Object.entries(LEAGUE_PRESETS).map(([key,p])=>`<option value="${key}" ${(game.rules?.preset??'travel')===key?'selected':''}>${safe(p.label)}</option>`).join('')}
      </select></label>
      <label>Batting format<select name="battingMode" id="batting-mode">
        ${[['continuous','Continuous (everyone bats)'],['nine','Nine active batters'],['custom','Custom active lineup']].map(([key,label])=>`<option value="${key}" ${(game.rules?.battingMode??'continuous')===key?'selected':''}>${label}</option>`).join('')}
      </select></label>
      <label>Scheduled innings<input type="number" name="innings" id="game-innings" min="1" max="15" value="${game.rules?.innings??7}"/></label>
      <label class="reentry-choice"><input type="checkbox" name="allowReentry" id="game-reentry" ${(game.rules?.allowReentry??true)?'checked':''}/> Allow batting reentry</label>
    </div>
    <div class="setup-columns">${teamEditor('away','Away team')}${teamEditor('home','Home team')}</div>
    <p class="warning-text">Starting a new game clears all current plays and defensive lineup changes. Export the current game first if you want a copy.</p>
    <div class="modal-footer"><button type="button" class="btn subtle" data-command="close-setup">Cancel</button>
      <button class="btn primary" type="submit">Start new game ${icon('arrow',16)}</button></div></form>
  </div></div>`;
}
const destinations = ['HOLD', 'FIRST', 'SECOND', 'THIRD', 'HOME', 'OUT'];
const numberedBases = {FIRST:1, SECOND:2, THIRD:3};
function playModal(v) {
  const result = showPlay;
  const suggestion = defaultPlayAdvances(v, result);
  const presets = getQuickPlayPresets(game, v, result);
  const runnerInputs = [1,2,3].filter(base => v.bases[base]).map(base => {
    const key = String(base), value = suggestion.runners[key];
    const options = destinations.filter(target => target === 'HOLD' || target === 'OUT' || target === 'HOME' || numberedBases[target] > base);
    return `<fieldset class="play-runner-row"><legend>${safe(v.bases[base].name)} <small>• started on ${['','1st','2nd','3rd'][base]}</small></legend>
      <div class="runner-chips">${options.map(dest => `<label class="runner-chip"><input type="radio" name="runner-${base}" value="${dest}" data-runner-destination="${base}" ${value === dest ? 'checked' : ''}/><span>${dest === 'HOLD' ? 'Hold' : dest === 'OUT' ? 'Out' : dest === 'HOME' ? 'Score' : `${['','1st','2nd','3rd'][numberedBases[dest]]}`}</span></label>`).join('')}</div>
      <label class="rbi-choice"><input type="checkbox" name="rbi-${base}" ${suggestion.rbi.includes(key) ? 'checked' : ''} ${value === 'HOME' ? '' : 'disabled'}/> Credit RBI if this runner scores</label>
    </fieldset>`;
  }).join('');
  return `<div class="modal-backdrop" data-command="close-play"><div class="modal play-modal" role="dialog" aria-modal="true" aria-labelledby="play-title">
    <div class="modal-head"><div><div class="eyebrow">QUICK FINISH</div><h2 id="play-title">${safe(PLAY_RESULTS[result])}</h2><p>Batter: <b>${safe(v.batter.name)}</b>. Tap a common outcome to save it instantly, or adjust each runner below.</p></div><button class="close-button" type="button" data-command="close-play" aria-label="Cancel scoring play">×</button></div>
    ${presets.length ? `<section class="preset-section"><div class="preset-label">QUICK SAVE · TAP A RESULT</div><div class="preset-grid">${presets.map((p,i) => `<button class="preset-btn" type="button" data-preset="${i}"><strong>${safe(p.label)}</strong><span>${p.advances.batter === 'OUT' ? 'Batter out' : 'Batter on base'} · ${Object.entries(p.advances.runners).map(([base,to]) => `From ${base}: ${to === 'HOME' ? 'scores' : to.toLowerCase()}`).join(', ') || 'Bases empty'}</span></button>`).join('')}</div></section>` : ''}
    <form id="play-form"><div class="play-runners"><h3>Customize runner destinations</h3>${runnerInputs || '<p class="fineprint">Bases empty. Only the batter will be recorded.</p>'}</div>
    <p class="play-warning">Confirm the RBI choices. Runs on a third-out play require additional rules and remain unsupported.</p>
    <p class="play-form-error" data-play-error role="alert" hidden></p>
    <div class="modal-footer"><button class="btn subtle" type="button" data-command="close-play">Cancel</button><button class="btn primary" type="submit">Save custom play</button></div></form>
  </div></div>`;
}

const locationCoordinates = Object.freeze({
  LF:[16,22], LCF:[31,12], CF:[50,8], RCF:[69,12], RF:[84,22],
  '3B':[24,61], SS:[39,48], P:[50,65], '2B':[62,48], '1B':[76,61], C:[50,91],
});
const defensePresets = Object.freeze({
  GROUND_OUT:[[6,3],[5,3],[4,3],[3],[6,4,3],[4,6,3]],
  LINE_OUT:[[6],[4],[5],[3],[8],[7],[9]],
  FLY_OUT:[[7],[8],[9],[6],[4]],
});
function lastBallInPlayIndex() {
  for (let i=game.events.length-1;i>=0;i--) {
    if (game.events[i]?.type==='BALL_IN_PLAY') return i;
  }
  return -1;
}
function openFieldingEditor(target) {
  if (!Number.isInteger(target) || game.events[target]?.type!=='BALL_IN_PLAY') return;
  const prior=[...game.events].reverse().find(e=>e.type==='PLAY_ANNOTATION' && e.target===target)?.fielding;
  fieldingDraft={
    target, location:prior?.location ?? null,
    sequence:(prior?.sequence ?? []).map(x=>({position:x.position,playerId:x.playerId ?? null})),
    credits:prior?.credits??{putouts:[],assists:[],errors:[],doublePlays:[]},
  };
  render();
}
function fieldingModal(v) {
  const target=fieldingDraft.target, log=v.playLog.find(row=>row.index===target+1);
  if (!log) return '';
  const defending=log.half==='top'?'home':'away';
  const defenders=game.teams[defending].roster;
  const result=game.events[target].result;
  const originalDefense=log.defenseAssignments ?? {};
  const presets=defensePresets[result] ?? [];
  const zones=Object.entries(locationCoordinates).map(([zone,[x,y]])=>
    `<button type="button" class="field-zone ${fieldingDraft.location===zone?'selected':''}" data-hit-location="${zone}"
        style="left:${x}%;top:${y}%"
        aria-pressed="${fieldingDraft.location===zone}" title="${safe(HIT_LOCATIONS[zone])}">
      ${zone}</button>`).join('');
  const positions=Object.entries(FIELDING_POSITIONS).map(([pos,label])=>
    `<button class="fielder-choice" type="button" data-fielder-position="${pos}" title="${safe(label)}">${pos}<small>${safe(label)}</small></button>`).join('');
  const touches=fieldingDraft.sequence.map((step,i)=>
    `<div class="fielder-touch"><span class="touch-index">${i+1}</span>
      <div class="touch-position"><b>${step.position} · ${safe(FIELDING_POSITIONS[step.position])}</b></div>
      <label class="touch-player-label"><span class="visually-hidden">Actual player for defensive position ${step.position}</span><select data-player-slot="${i}">
        <option value="">Player not assigned</option>
        ${defenders.map(p=>`<option value="${safe(p.id)}" ${(step.playerId??originalDefense[String(step.position)])===p.id?'selected':''}>${safe('#'+(p.number||'—')+' '+p.name)}</option>`).join('')}
      </select></label>
      <div class="fielder-credit-choice">${[['putouts','PO'],['assists','A'],['errors','E'],['doublePlays','DP']].map(([key,label])=>{
        const id=step.playerId??originalDefense[String(step.position)];
        return `<label><input type="checkbox" name="field-${key}-${i}" ${id&&fieldingDraft.credits[key]?.includes(id)?'checked':''}/> ${label}</label>`;
      }).join('')}</div>
    </div>`).join('');
  return `<div class="modal-backdrop" data-command="close-fielding"><div class="modal fielding-modal" role="dialog" aria-modal="true" aria-labelledby="fielding-title">
    <div class="modal-head"><div><div class="eyebrow">BALL LOCATION + DEFENSIVE PLAY</div><h2 id="fielding-title">Mark the play</h2>
      <p>${safe(log.baseLabel || log.label)} · Defending: <b>${safe(game.teams[defending].name)}</b></p></div>
      <button type="button" class="close-button" data-command="close-fielding" aria-label="Close fielding details">×</button></div>
    <form id="fielding-form">
      <div class="fielding-layout"><section class="fielding-section">
        <h3>Where was the ball hit?</h3><p>Tap the approximate zone. This is optional.</p>
        <div class="hit-map" role="group" aria-label="Ball location">
          <div class="hit-map-outfield"></div><div class="hit-map-infield"></div>${zones}
        </div>
        <div class="location-summary">Selected: <b>${safe(fieldingDraft.location ? HIT_LOCATIONS[fieldingDraft.location] : 'Not marked')}</b>
          <button type="button" data-hit-location="">Clear location</button></div>
      </section>
      <section class="fielding-section">
        <h3>Who made the play?</h3><p>Tap positions in order, e.g. 6 → 3. The player names are filled from the defensive lineup saved at the time of this play.</p>
        ${presets.length ? `<div class="sequence-presets">${presets.map(seq=>`<button type="button" data-chain-preset="${seq.join('-')}">${seq.join('–')}</button>`).join('')}</div>` : ''}
        <div class="fielding-position-grid" role="group" aria-label="Tap fielders in order">${positions}</div>
        <div class="chain-toolbar"><strong>${fieldingDraft.sequence.map(x=>x.position).join('–') || 'No fielder selected'}</strong>
          <button type="button" data-command="remove-fielder" ${fieldingDraft.sequence.length?'':'disabled'}>Undo fielder</button>
          <button type="button" data-command="clear-fielders">Clear</button></div>
        ${touches ? `<div class="fielder-touches"><p>Players suggested from the saved defensive lineup for this play. Override any position if needed:</p>${touches}</div>`:''}
      </section></div>
      <p class="play-warning">Positions 1–9 follow baseball's scoring shorthand. Mark PO (putout), A (assist), E (error), or DP for the appropriate player. These are explicit scorer-awarded stats, not automatic official rulings.</p>
      <p class="play-form-error" data-fielding-error role="alert" hidden></p>
      <div class="modal-footer"><button class="btn subtle" type="button" data-command="close-fielding">Cancel</button><button class="btn primary" type="submit">Save fielding details</button></div>
    </form>
  </div></div>`;
}

const defenseOrder = [7,8,9,5,6,4,3,1,2];
const defenseNames = {1:'P',2:'C',3:'1B',4:'2B',5:'3B',6:'SS',7:'LF',8:'CF',9:'RF'};
function openDefenseEditor(side) {
  const view=replayGame(game);
  if (!['home','away'].includes(side)) side=view.fielding;
  defenseDraft = {side, assignments:{...view.defenseLineup[side]}};
  fieldingDraft = null;
  showPlay = null;
  showSetup = false;
  render();
}
function defenseModal(v){
  const side=defenseDraft.side, roster=game.teams[side].roster;
  const slots=defenseOrder.map(position=>{
    const key=String(position),selected=defenseDraft.assignments[key] ?? '';
    return `<div class="defense-slot defense-slot-${position}">
      <label for="defense-${position}"><strong>${position} · ${defenseNames[position]}</strong><small>${safe(FIELDING_POSITIONS[position])}</small></label>
      <select id="defense-${position}" data-defense-position="${position}" aria-label="${safe(FIELDING_POSITIONS[position])} defender">
        <option value="">Unassigned</option>
        ${roster.map(player=>`<option value="${safe(player.id)}" ${selected===player.id?'selected':''}>${safe('#'+(player.number||'—')+' '+player.name)}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
  const assigned=Object.values(defenseDraft.assignments).filter(Boolean).length;
  return `<div class="modal-backdrop" data-command="close-defense"><div class="modal defense-modal" role="dialog" aria-modal="true" aria-labelledby="defense-title">
    <div class="modal-head"><div><div class="eyebrow">INNING DEFENSE</div><h2 id="defense-title">Defensive lineup</h2>
      <p>Assign players once; we'll remember who occupied each position on every subsequent batted ball.</p></div>
      <button class="close-button" data-command="close-defense" type="button" aria-label="Close defensive lineup">×</button>
    </div>
    <div class="defense-team-switch" role="group" aria-label="Choose defensive team">
      ${['away','home'].map(value=>`<button type="button" class="${side===value?'selected':''}" data-defense-team="${value}" aria-pressed="${side===value}">${value==='away'?'Away':'Home'} · ${safe(game.teams[value].name)}</button>`).join('')}
    </div>
    <form id="defense-form">
      <div class="defense-field" aria-label="Visual baseball defensive field">
        <div class="defense-grass"></div>${slots}
      </div>
      <div class="defense-summary"><strong>${assigned} of 9 positions assigned</strong>
        <button type="button" data-command="clear-defense">Clear defense</button></div>
      <div class="defense-import">
        <label class="import-file-label">Import a lineup for this team's existing roster (CSV or JSON)
          <input type="file" data-import-defense accept=".csv,.json,text/csv,application/json" aria-label="Import defensive positions matching this roster"/>
        </label><span id="defense-import-status" role="status"></span>
      </div>
      <p class="import-hint">Choose players from the team's roster; nobody can play two positions at once. Save updates whenever you make a defensive change. Empty positions are allowed.</p>
      <p class="play-form-error" data-defense-error role="alert" hidden></p>
      <div class="modal-footer"><button class="btn subtle" type="button" data-command="close-defense">Cancel</button>
        <button class="btn primary" type="submit">Save defensive lineup</button></div>
    </form>
  </div></div>`;
}
function lineupModal(v) {
  const side=lineupSide,roster=game.teams[side].roster,order=v.battingOrder[side];
  const bench=roster.filter(p=>!order.includes(p.id));
  const options=(players)=>players.map(p=>`<option value="${safe(p.id)}">${safe('#'+(p.number||'—')+' '+p.name)}</option>`).join('');
  const lineupRows=order.map((id,i)=>{
    const p=roster.find(x=>x.id===id);
    return `<form class="lineup-row" data-substitution-slot="${i}">
      <span class="lineup-slot">${i+1}</span>
      <div class="lineup-player"><strong>${safe(p?.name??'Unknown')}</strong><small>Jersey #${safe(p?.number??'—')}${v.batting===side&&v.battingIndex[side]%order.length===i?' · At bat':''}</small></div>
      <select aria-label="Substitute for slot ${i+1}" name="playerId" required>
        <option value="">Choose bench player</option>${options(bench)}
      </select>
      <select aria-label="Substitution type" name="kind"><option value="SUB">Sub</option><option value="PH">Pinch hitter</option></select>
      <button class="btn primary" type="submit" ${bench.length?'':'disabled'}>Swap</button>
    </form>`;
  }).join('');
  const liveRunners=[1,2,3].filter(base=>v.bases[base]);
  const pitching=game.teams[side].roster.find(p=>p.id===v.defenseLineup[side]['1']);
  return `<div class="modal-backdrop" data-command="close-lineup"><div class="modal lineup-modal" role="dialog" aria-modal="true" aria-labelledby="lineup-title">
    <div class="modal-head"><div><div class="eyebrow">GAME-DAY CHANGES</div><h2 id="lineup-title">Lineup & substitutions</h2>
      <p>Roster: ${roster.length} · Active batting slots: ${order.length} · ${safe(v.rules.battingMode)} batting · ${v.rules.innings} scheduled innings.</p></div>
      <button class="close-button" type="button" data-command="close-lineup" aria-label="Close lineup">×</button></div>
    <div class="defense-team-switch">${['away','home'].map(value=>`<button type="button" data-lineup-team="${value}" class="${side===value?'selected':''}" aria-pressed="${side===value}">${value==='away'?'Away':'Home'} · ${safe(game.teams[value].name)}</button>`).join('')}</div>
    <div class="lineup-entries"><h3>Batting order</h3><p>Replace an active batter with a bench player. Current game stats stay with the correct player.</p>${lineupRows}</div>
    <div class="lineup-extras">
      <form id="pitcher-change-form" class="game-day-form"><h3>Pitching change</h3><p>Current pitcher: ${safe(pitching?.name??'Not set')}</p>
        <select name="playerId" aria-label="New pitcher" required><option value="">Choose pitcher</option>${options(roster)}</select>
        <button class="btn primary" type="submit">Change pitcher</button></form>
      <form id="pinch-runner-form" class="game-day-form"><h3>Pinch runner</h3>
        <p>${v.batting===side?'Replace a runner on base; the substitute takes over their batting slot.':'Select the team currently batting to replace a runner.'}</p>
        <select name="base" aria-label="Runner to replace" required ${v.batting!==side?'disabled':''}>
          <option value="">Choose base</option>${liveRunners.map(base=>`<option value="${base}">${['','First','Second','Third'][base]} · ${safe(v.bases[base].name)}</option>`).join('')}
        </select>
        <select name="playerId" aria-label="New pinch runner" required ${v.batting!==side?'disabled':''}>
          <option value="">Choose bench runner</option>${options(bench.filter(p=>!Object.values(v.bases).some(r=>r?.id===p.id)))}
        </select>
        <button class="btn primary" type="submit" ${v.batting===side&&liveRunners.length&&bench.length?'':'disabled'}>Make substitution</button>
      </form>
    </div>
    <p class="fineprint">Example league rules need verification against your association. No official substitution, reentry or courtesy-runner rulings are automated.</p>
    <p class="play-form-error" data-lineup-error role="alert" hidden></p>
  </div></div>`;
}
function downloadRosterTemplate() {
  const csv=['number,name,position,batting_order','12,Alex Rivera,SS,1','7,Jordan Brooks,CF,2','24,Taylor Lane,P,3'].join('\n')+'\n';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download='opensideline-roster-template.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}


function cloudStatus(text){
  cloudMessage=String(text??'').slice(0,250);
  render();
}
async function refreshCloudData(){
  if(!cloudGateway || !cloudUser) return;
  const userId=cloudUser.id;
  const [games,teams]=await Promise.all([cloudGateway.listGames(),cloudGateway.listTeams()]);
  if(cloudUser?.id!==userId)return;
  cloudGames=games;
  cloudTeams=teams;
  if(cloudTeamChoice && !teams.some(t=>t.id===cloudTeamChoice))cloudTeamChoice='';
  render();
}
async function initializeCloud(){
  if(!isCloudConfigured() || cloudGateway || cloudBusy)return;
  cloudBusy=true;render();
  try{
    const gateway=await connectCloud();
    cloudGateway=gateway;
    gateway.onAuthStateChange((event,session)=>{
      const nextUser=session?.user??null;
      if(nextUser?.id!==cloudUser?.id){
        cloudKnownVersions=new Map();
        cloudGames=[];cloudTeams=[];cloudTeamChoice='';
      }
      cloudUser=nextUser;
      if(event==='SIGNED_OUT')cloudMessage='Signed out. Your browser-local game is unchanged.';
      render();
    });
    try{cloudUser=await gateway.getUser()}catch{cloudUser=null}
    if(cloudUser)await refreshCloudData();
  }catch(error){
    cloudMessage=error.message||'Cloud connection failed.';
  }finally{
    cloudBusy=false;render();
  }
}
function openCloud(){
  showCloud=true;
  showSetup=false;showPlay=null;fieldingDraft=null;
  defenseDraft=null;showLineup=false;
  render();
  if(isCloudConfigured()&&!cloudGateway)void initializeCloud();
}
async function runCloudAction(action){
  if(!cloudGateway || cloudBusy)return;
  cloudBusy=true;render();
  try{
    if(action==='signout'){
      await cloudGateway.signOut();
      cloudUser=null;cloudGames=[];cloudTeams=[];
      cloudKnownVersions.clear();cloudTeamChoice='';
      cloudMessage='Signed out. Your local game is unchanged.';
    }else if(action==='refresh'){
      await refreshCloudData();
      cloudMessage='Cloud list refreshed.';
    }else if(action==='save'){
      const snapshot=JSON.parse(JSON.stringify(game));
      const expectedVersion=cloudKnownVersions.get(snapshot.id)??null;
      const saved=await cloudGateway.saveGame(snapshot,{
        expectedVersion,teamId:cloudTeamChoice||null,
      });
      cloudKnownVersions.set(snapshot.id,saved.version);
      cloudMessage='Saved privately to your cloud account — revision '+saved.version+'.';
      await refreshCloudData();
    }
  }catch(error){
    cloudMessage=error.name==='CloudConflictError'
      ?'Cloud version conflict. Download a local backup, then refresh and open the cloud version before trying again.'
      :error.message||'Cloud request failed. Local scoring is still available.';
  }finally{cloudBusy=false;render()}
}
function openCloudGame(index){
  const entry=cloudGames[index];
  if(!entry || !cloudUser)return;
  try{
    const snapshot=JSON.parse(JSON.stringify(entry.snapshot));
    replayGame(snapshot);
    if(game.events.length && game.id!==snapshot.id &&
       !confirm('Open this cloud game? Your current game will be copied to your local archive first. Export a backup if needed.'))return;
    archiveGame(game);
    cloudKnownVersions.set(snapshot.id,entry.version);
    showCloud=false;
    cloudMessage='Cloud game opened locally. Save when you want to publish your next edits.';
    commit(snapshot);
  }catch(error){cloudStatus(error.message||'Invalid cloud game')}
}

function render() {
  const v = replayGame(game);
  document.title = `OpenSideline | ${game.teams.away.name} ${v.scores.away}–${v.scores.home} ${game.teams.home.name}`;
  app.innerHTML = (displayMode === 'scorer' ? renderScorer(v) : renderSpectator(v)) + (showSetup && displayMode === 'scorer' ? setupModal() : '') + (showPlay && displayMode === 'scorer' ? playModal(v) : '') + (fieldingDraft && displayMode === 'scorer' ? fieldingModal(v) : '') + (defenseDraft && displayMode === 'scorer' ? defenseModal(v) : '') + (showLineup && displayMode === 'scorer' ? lineupModal(v) : '') + (showCloud && displayMode === 'scorer' ? renderCloudPanel({configured:isCloudConfigured(),loading:cloudBusy&&!cloudGateway,user:cloudUser,games:cloudGames,teams:cloudTeams,message:cloudMessage,selectedTeam:cloudTeamChoice},safe) : '') + (feedback ? `<div class="toast" role="status">${safe(feedback)}</div>` : '');
}
function perform(event) {
  try { commit(appendEvent(game, { ...event, at: new Date().toISOString() })); return true; }
  catch(e) { toast(e.message || 'Could not record this play.'); return false; }
}
function downloadSeason(){
  const summary=summarizeSeason([...readArchive(),game]);
  const csv=seasonCsv(summary);
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='opensideline-season-stats.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadGame() {
  const json = new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(json);
  const link = document.createElement('a'); link.href = url; link.download = `opensideline-${new Date().toISOString().slice(0,10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Game file exported. Keep youth-player information private.');
}
app.addEventListener('click', event => {
  const trigger = event.target.closest('button[data-action],button[data-result],button[data-command],button[data-tab],button[data-advance],button[data-preset],button[data-hit-location],button[data-fielder-position],button[data-chain-preset],button[data-defense-team],button[data-lineup-team]');
  if (!trigger) {
    if (event.target.classList.contains('modal-backdrop')) { showSetup=false; showPlay=null; fieldingDraft=null; defenseDraft=null; showLineup=false; render(); }
    return;
  }
  if (trigger.disabled) return;
  if(showLineup&&trigger.dataset.lineupTeam){lineupSide=trigger.dataset.lineupTeam;render();return;}
  if (defenseDraft && trigger.dataset.defenseTeam) {
    openDefenseEditor(trigger.dataset.defenseTeam); return;
  }
  if (defenseDraft && trigger.dataset.defenseTeam === 'away') {
    openDefenseEditor('away');return;
  }
  if (defenseDraft && trigger.dataset.hitLocation !== undefined) {
    fieldingDraft.location=trigger.dataset.hitLocation || null; render(); return;
  }
  if (fieldingDraft && trigger.dataset.fielderPosition) {
    if (fieldingDraft.sequence.length>=8) return;
    fieldingDraft.sequence.push({position:Number(trigger.dataset.fielderPosition),playerId:null});render();return;
  }
  if (fieldingDraft && trigger.dataset.chainPreset) {
    fieldingDraft.sequence=trigger.dataset.chainPreset.split('-').map(n=>({position:Number(n),playerId:null}));render();return;
  }
  if (trigger.dataset.action) return perform({type:trigger.dataset.action});
  if (trigger.dataset.result) {
    const result = trigger.dataset.result, view = replayGame(game);
    if (![1,2,3].some(base => view.bases[base])) {
      return perform({type:'BALL_IN_PLAY', result, advances:defaultPlayAdvances(view,result)});
    }
    showPlay = result;
    render();
    return;
  }
  if (trigger.dataset.preset !== undefined) {
    if (!showPlay) return;
    const view = replayGame(game);
    const preset = getQuickPlayPresets(game, view, showPlay)[Number(trigger.dataset.preset)];
    if (!preset) return;
    const proposed = {type:'BALL_IN_PLAY',result:showPlay,advances:preset.advances,at:new Date().toISOString()};
    try { const next = appendEvent(game, proposed); showPlay = null; commit(next); }
    catch (err) { const field = app.querySelector('[data-play-error]'); if (field) { field.textContent = err.message; field.hidden = false; } }
    return;
  }
  if (trigger.dataset.advance) return perform({type:trigger.dataset.kind,from:Number(trigger.dataset.advance)});
  if (trigger.dataset.tab) { selectedTab=trigger.dataset.tab; render(); return; }
  switch (trigger.dataset.command) {
    case 'undo': if (game.events.length) commit(undoEvent(game)); break;
    case 'export': downloadGame(); break;
    case 'export-season': downloadSeason();break;
    case 'open-setup': showSetup=true;showPlay=null;fieldingDraft=null;defenseDraft=null;showLineup=false;importedSetupPlayers={home:null,away:null};render();break;
    case 'open-defense': showLineup=false;openDefenseEditor(replayGame(game).fielding);break;
    case 'open-lineup': showLineup=true;lineupSide=replayGame(game).batting;showSetup=false;fieldingDraft=null;defenseDraft=null;showPlay=null;render();break;
    case 'close-lineup': showLineup=false;render();break;
    case 'close-defense': defenseDraft=null;render();break;
    case 'clear-defense': if(defenseDraft){defenseDraft.assignments=Object.fromEntries(Array.from({length:9},(_,i)=>[String(i+1),null]));render();}break;
    case 'download-roster-template': downloadRosterTemplate();break;
    case 'open-fielding': openFieldingEditor(Number(trigger.dataset.target)); break;
    case 'close-fielding': fieldingDraft=null; render(); break;
    case 'remove-fielder': if (fieldingDraft?.sequence.length) {fieldingDraft.sequence.pop();render();} break;
    case 'clear-fielders': if (fieldingDraft) {fieldingDraft.sequence=[];render();} break;
    case 'close-play': showPlay = null; render(); break;
    case 'close-setup': showSetup = false; render(); break;
    case 'show-stats': selectedTab = 'stats'; render(); document.querySelector('.timeline-card')?.scrollIntoView({behavior:'smooth'}); break;
    case 'toggle-advanced': showMoreActions = !showMoreActions; render(); break;
  }
});
app.addEventListener('change', async e => {
  if(e.target.matches('#game-preset')){
    const preset=LEAGUE_PRESETS[e.target.value];if(!preset)return;
    const mode=document.querySelector('#batting-mode'),innings=document.querySelector('#game-innings'),reentry=document.querySelector('#game-reentry');
    if(mode)mode.value=preset.battingMode;if(innings)innings.value=preset.innings;
    if(reentry)reentry.checked=preset.allowReentry;
    for(const side of ['away','home']){
      const list=document.querySelector('#'+side+'-roster'),input=document.querySelector('#'+side+'-order');
      if(input&&list){const rs=parseRoster(list.value,side);input.value=(preset.battingMode==='nine'?rs.slice(0,9):rs).map(p=>p.number).join(', ');}
    }
    return;
  }
  if(e.target.matches('#batting-mode')){
    for(const side of ['away','home']){
      const list=document.querySelector('#'+side+'-roster'),input=document.querySelector('#'+side+'-order');
      if(input&&list){const rs=parseRoster(list.value,side);input.value=(e.target.value==='nine'?rs.slice(0,9):rs).map(p=>p.number).join(', ');}
    }
    return;
  }
  if (e.target.matches('[data-roster-import]')) {
    const side=e.target.dataset.rosterImport,file=e.target.files?.[0];
    if (!file || !['home','away'].includes(side)) return;
    const box=document.querySelector('#import-status-'+side);
    try{
      if(file.size>128*1024)throw new Error('Roster file is too large (128 KB limit).');
      const parsed=parseRosterImport(await file.text(),file.name,side);
      if(!showSetup) return;
      const textArea=document.querySelector('#'+side+'-roster'),teamName=document.querySelector('#'+side+'-name');
      if(!textArea||!teamName)return;
      textArea.value=importedRosterText(parsed.players);
      const orderInput=document.querySelector('#'+side+'-order');
      if(orderInput){
        const mode=document.querySelector('#batting-mode')?.value??'continuous';
        const choices=mode==='nine'?parsed.players.slice(0,9):parsed.players;
        orderInput.value=choices.map(p=>p.number).join(', ');
      }
      if(parsed.teamName)teamName.value=parsed.teamName;
      importedSetupPlayers[side]=parsed.players;
      if(box){box.textContent='Imported '+parsed.players.length+' players; '+parsed.players.filter(p=>p.position!==null).length+' starting positions.';box.classList.remove('import-error');}
    }catch(err){if(box){box.textContent=err.message||'Could not import file.';box.classList.add('import-error');}}
    e.target.value='';return;
  }
  if (e.target.matches('[data-import-defense]') && defenseDraft) {
    const file=e.target.files?.[0];if(!file)return;
    const side=defenseDraft.side,box=document.querySelector('#defense-import-status');
    try {
      if(file.size>128*1024)throw new Error('Lineup file is too large (128 KB limit).');
      const imported=parseRosterImport(await file.text(),file.name,side);
      if(!defenseDraft || defenseDraft.side!==side)return;
      const assignments=matchImportedDefense(game.teams[side].roster,imported.players);
      if(!Object.keys(assignments).length)throw new Error('No matching roster members with defensive positions were found. Import the roster from Game Setup first.');
      defenseDraft.assignments=Object.fromEntries(Array.from({length:9},(_,i)=>[String(i+1),assignments[String(i+1)]??null]));
      render();
      const status=document.querySelector('#defense-import-status');if(status)status.textContent=Object.keys(assignments).length+' positions loaded; review and save.';
    }catch(err){if(box){box.textContent=err.message||'Could not import lineup.';box.classList.add('import-error');}}
    e.target.value='';return;
  }
  if (e.target.matches('[data-defense-position]') && defenseDraft) {
    const position=e.target.dataset.defensePosition,id=e.target.value||null;
    if(id)for(const key of Object.keys(defenseDraft.assignments))if(key!==position&&defenseDraft.assignments[key]===id)defenseDraft.assignments[key]=null;
    defenseDraft.assignments[position]=id;render();return;
  }
  if (e.target.matches('[data-player-slot]') && fieldingDraft) {
    const slot=Number(e.target.dataset.playerSlot);
    if (Number.isInteger(slot) && fieldingDraft.sequence[slot])
      fieldingDraft.sequence[slot].playerId=e.target.value || null;
    return;
  }
  if (!e.target.matches('[data-runner-destination]')) return;
  const control = e.target.closest('.play-runner-row')?.querySelector('.rbi-choice input');
  if (control) {
    control.disabled = e.target.value !== 'HOME';
    if (control.disabled) control.checked = false;
    else if (['SINGLE','DOUBLE','TRIPLE','HOME_RUN','SAC_FLY'].includes(showPlay)) control.checked = true;
  }
});
app.addEventListener('submit', e => {
  if(e.target.matches('[data-substitution-slot]')){
    e.preventDefault();
    const slot=Number(e.target.dataset.substitutionSlot),form=new FormData(e.target);
    if(!form.get('playerId'))return;
    perform({type:'LINEUP_SUBSTITUTION',side:lineupSide,slot,playerId:form.get('playerId'),kind:form.get('kind')});
    return;
  }
  if(e.target.id==='pinch-runner-form'){
    e.preventDefault();const form=new FormData(e.target);
    perform({type:'PINCH_RUNNER',from:Number(form.get('base')),playerId:form.get('playerId')});
    return;
  }
  if(e.target.id==='pitcher-change-form'){
    e.preventDefault();const form=new FormData(e.target);
    perform({type:'PITCHER_CHANGE',side:lineupSide,playerId:form.get('playerId')});
    return;
  }
  if(e.target.id==='defense-form'){
    e.preventDefault();
    if(!defenseDraft)return;
    try {
      const next=appendEvent(game,{type:'DEFENSIVE_LINEUP',side:defenseDraft.side,
        assignments:{...defenseDraft.assignments},at:new Date().toISOString()});
      defenseDraft=null;commit(next);
    }catch(err){
      const box=e.target.querySelector('[data-defense-error]');
      if(box){box.textContent=err.message||'Invalid defensive lineup.';box.hidden=false;}
    }
    return;
  }
  if (e.target.id === 'fielding-form') {
    e.preventDefault();
    if (!fieldingDraft) return;
    const {target,location,sequence}=fieldingDraft;
    try {
      const form=new FormData(e.target);
      const log=replayGame(game).playLog.find(row=>row.index===target+1);
      const originalDefense=log?.defenseAssignments??{};
      const credits={putouts:[],assists:[],errors:[],doublePlays:[]};
      for(let i=0;i<sequence.length;i++){
        const step=sequence[i];
        const id=step.playerId??originalDefense[String(step.position)]??null;
        for(const key of Object.keys(credits)){
          if(form.get('field-'+key+'-'+i)!=='on')continue;
          if(!id)throw new Error('Assign a player before awarding a fielding stat.');
          if(!credits[key].includes(id))credits[key].push(id);
        }
      }
      const next=appendEvent(game,{type:'PLAY_ANNOTATION',target,
        fielding:{location,sequence:sequence.map(({position,playerId})=>({position,playerId})),credits},
        at:new Date().toISOString()});
      fieldingDraft=null;commit(next);
    } catch(error) {
      const box=e.target.querySelector('[data-fielding-error]');
      if(box){box.textContent=error.message || 'Invalid fielding information.';box.hidden=false;}
    }
    return;
  }
  if (e.target.id === 'play-form') {
    e.preventDefault();
    const result = showPlay, v = replayGame(game), form = new FormData(e.target);
    const runners = {}, rbi = [];
    for (const base of [1,2,3]) {
      if (!v.bases[base]) continue;
      const key = String(base);
      runners[key] = form.get(`runner-${base}`);
      if (runners[key] === 'HOME' && form.get(`rbi-${base}`) === 'on') rbi.push(key);
    }
    const advances = {batter:defaultPlayAdvances(v,result).batter, runners, rbi};
    const event = {type:'BALL_IN_PLAY',result,advances,at:new Date().toISOString()};
    try { const next = appendEvent(game, event); showPlay = null; commit(next); }
    catch (error) { const field = e.target.querySelector('[data-play-error]'); if (field) { field.textContent = error.message || 'Invalid play. Check the runner destinations.'; field.hidden = false; } }
    return;
  }
  if (e.target.id !== 'setup-form') return;
  e.preventDefault();
  if (game.events.length && !confirm('Start a new game? Current plays will be cleared. It will first be saved to your local season archive.')) return;
  const form = new FormData(e.target);
  try {
    const awayRoster=parseRoster(form.get('awayRoster'),'away');
    const homeRoster=parseRoster(form.get('homeRoster'),'home');
    const battingMode=form.get('battingMode');
    const rules={preset:form.get('preset'),battingMode,
      innings:Number(form.get('innings')),allowReentry:form.get('allowReentry')==='on'};
    let next=createGame({homeName:form.get('homeName'),awayName:form.get('awayName'),
      homeRoster,awayRoster,rules,
      homeBattingOrder:selectedBatters(homeRoster,form.get('homeOrder'),battingMode),
      awayBattingOrder:selectedBatters(awayRoster,form.get('awayOrder'),battingMode)});

    for(const side of ['away','home']){
      if(!importedSetupPlayers[side])continue;
      const assignments=matchImportedDefense(next.teams[side].roster, importedSetupPlayers[side]);
      if(Object.keys(assignments).length)next=appendEvent(next,{type:'DEFENSIVE_LINEUP',side,assignments,at:new Date().toISOString()});
    }
    archiveGame(game);
    importedSetupPlayers={home:null,away:null};
    showSetup=false;showPlay=null;fieldingDraft=null;defenseDraft=null;showLineup=false;selectedTab='plays'; showMoreActions=false;
    commit(next); toast('New game created. Ready for the first pitch.');
  } catch(e) { toast(e.message); }
});
window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) { game = readStoredGame(); render(); } });
channel?.addEventListener('message', e => {
  if (e.data?.from === TAB_ID || !e.data?.game) return;
  try { replayGame(e.data.game); game = e.data.game; render(); } catch { /* discard malformed messages */ }
});
render();
