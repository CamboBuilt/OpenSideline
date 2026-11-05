import { createGame, replayGame, appendEvent, undoEvent, PLAY_RESULTS, defaultPlayAdvances, formatAvg, formatObp, formatSlg } from '../../../packages/scoring-engine/src/index.mjs';

import { getQuickPlayPresets } from './quick-play.mjs';

const STORAGE_KEY = 'opensideline:baseball:v1';
const app = document.querySelector('#app');
const TAB_ID = Math.random().toString(36).slice(2);
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('opensideline-baseball-v1') : null;
const query = new URLSearchParams(location.search);
const displayMode = ['spectator', 'overlay'].includes(query.get('view')) ? query.get('view') : 'scorer';
let game = readStoredGame();
let selectedTab = 'plays';
let showSetup = false;
let showPlay = null;
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
  return logs.length ? `<div class="events">${logs.map((row,i) => `<div class="event"><div class="event-bullet ${i === 0 ? 'latest' : ''}"></div><div class="event-content"><div class="event-meta">${row.half === 'top' ? 'TOP' : 'BOT'} ${row.inning} <span>·</span> ${safe(row.offense)}</div><div class="event-label">${safe(row.label)}</div></div>${i === 0 ? '<span class="event-new">LATEST</span>' : ''}</div>`).join('')}</div>` : '<div class="empty-log">No plays yet. Record the first pitch to start the game.</div>';
}
function renderStats(v) {
  const statsFor = (side) => `<section class="stat-block"><h4>${safe(game.teams[side].name)}</h4><div class="table-overflow"><table class="player-stats"><thead><tr><th>PLAYER</th><th>AB</th><th>H</th><th>R</th><th>RBI</th><th>BB</th><th>AVG</th><th>OBP</th></tr></thead><tbody>${game.teams[side].roster.map(p => {
    const s = v.playerStats[side][p.id];
    return `<tr><td><span class="jersey">${safe(p.number || '–')}</span> ${safe(p.name)}</td><td>${s.AB}</td><td>${s.H}</td><td>${s.R}</td><td>${s.RBI}</td><td>${s.BB}</td><td>${formatAvg(s.H,s.AB)}</td><td>${formatObp(s)}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;
  return `${statsFor('away')}${statsFor('home')}<p class="fineprint">New plays ask for each runner destination and RBI decision. Existing v0.1 records retain simplified historical rules. Pitching stats, substitutions and some third-out judgments remain unsupported.</p>`;
}
function playActions(v) {
  const hasRunner = [1,2,3].some(base => v.bases[base]);
  const quick = [
    ['SINGLE','Single','hit'], ['DOUBLE','Double','hit'], ['TRIPLE','Triple','hit'],
    ['HOME_RUN','Home run','homer'], ['OUT','Out','out'],
  ];
  const extra = [
    ['ERROR','Reached on error'], ['SAC_FLY','Sacrifice fly'],
    ['FIELDERS_CHOICE',"Fielder's choice"],
  ];
  return \`<div class="actions-head"><div><h3>Pitch by pitch</h3><p>Big buttons, ready for the next pitch.</p></div></div>
    <div class="pitch-buttons">
      <button type="button" data-action="BALL" class="pitch-btn ball"><b>Ball</b><span>Add a ball</span></button>
      <button type="button" data-action="STRIKE" class="pitch-btn strike"><b>Strike</b><span>Add a strike</span></button>
      <button type="button" data-action="FOUL" class="pitch-btn foul"><b>Foul</b><span>Count stays at 2 strikes</span></button>
    </div>
    <div class="actions-head hit-head"><div><h3>At-bat result</h3><p>One tap when bases are empty. With runners on, pick a quick finish.</p></div></div>
    <div class="play-grid">
      \${quick.map(([type,label,cls]) => \`<button type="button" class="play-btn \${cls}" data-result="\${type}"><span>\${type === 'HOME_RUN' ? '✦ ' : ''}\${label}</span>\${icon('arrow',14)}</button>\`).join('')}
      <button class="play-btn walk" type="button" data-action="WALK"><span>Walk</span>\${icon('arrow',14)}</button>
      <button class="play-btn hbp" type="button" data-action="HBP"><span>Hit by pitch</span>\${icon('arrow',14)}</button>
    </div>
    <button type="button" class="advanced-toggle" data-command="toggle-advanced" aria-expanded="\${showMoreActions}" aria-controls="more-plays">\${showMoreActions ? '− Hide other plays & runners' : '+ More plays & runner controls'}</button>
    <div id="more-plays" \${showMoreActions ? '' : 'hidden'}>
      <div class="extra-play-grid">\${extra.map(([type,label]) => \`<button type="button" class="play-btn neutral" data-result="\${type}" \${(type === 'SAC_FLY' && !(v.outs < 2 && v.bases[3])) || (type === 'FIELDERS_CHOICE' && !hasRunner) ? 'disabled' : ''}>\${label}\${icon('arrow',14)}</button>\`).join('')}</div>
      <div class="advanced-actions">
        \${[1,2,3].map(base => v.bases[base] ? \`<div class="runner-control"><span><b>\${safe(v.bases[base].name)}</b><small>On \${['','1st','2nd','3rd'][base]}</small></span><button type="button" data-advance="\${base}" data-kind="STOLEN_BASE">Steal</button><button type="button" data-advance="\${base}" data-kind="ADVANCE_RUNNER">Advance</button><button type="button" data-advance="\${base}" data-kind="RUNNER_OUT">Out</button></div>\` : '').join('') || '<p class="fineprint">No runners on base.</p>'}
      </div>
    </div>\`;
}
function renderScorer(v) {
  const batter = v.batter;
  return `<div class="shell">
    <aside class="sidebar"><div class="brand"><span class="brand-logo">${icon('baseball',28)}</span><div>Open<span>Sideline</span><small>SPORTS, OPEN TO ALL</small></div></div>
      <div class="nav-label">WORKSPACE</div><nav><button class="nav-item selected">${icon('grid',19)} Game center <span class="nav-indicator"></span></button><button class="nav-item" data-command="open-setup">${icon('people',19)} Teams & rosters</button><button class="nav-item" data-command="show-stats">${icon('stats',19)} Player stats</button></nav>
      <div class="nav-label resources">LIVE VIEWS</div><nav><a class="nav-item" href="?view=spectator" target="_blank" rel="noopener">${icon('radio',19)} Spectator view ${icon('external',13)}</a><a class="nav-item" href="?view=overlay" target="_blank" rel="noopener">${icon('grid',19)} OBS overlay ${icon('external',13)}</a></nav>
      <div class="sidebar-bottom"><div class="opensource-tag"><span class="green-dot"></span> OPEN-SOURCE MVP</div><div class="sidebar-version">Baseball scoring • v0.2.1 preview</div></div>
    </aside>
    <main class="main"><div class="topbar"><div class="crumb">BASEBALL <span>/</span> GAME CENTER</div><div class="topbar-actions"><span class="live-tag"><span class="green-dot"></span> LOCAL GAME</span><button class="btn subtle" data-command="export">${icon('share',16)} Export</button><button class="btn subtle" data-command="open-setup">${icon('settings',16)} Setup</button></div></div>
      <div class="content"><div class="page-heading"><div><div class="eyebrow">THE GAME IS ON</div><h1>Live scorer<span class="accent-dot">.</span></h1><p>Keep your eyes on the game, not the menus.</p></div><button class="btn undo" data-command="undo" ${game.events.length ? '' : 'disabled'}>${icon('undo',16)} Undo last action</button></div>
      <div class="sticky-hud">${scoreHeader(v,true)}<div class="hud-bottom"><span>AT BAT <strong>${safe(v.batter.name)}</strong></span><span class="hud-count">COUNT ${v.balls}–${v.strikes} · ${v.outs} OUT</span><span class="hud-runners">ON BASE ${[1,2,3].map(b => `<b class="${v.bases[b] ? 'active' : ''}" aria-label="${['','First','Second','Third'][b]} base ${v.bases[b] ? 'occupied' : 'empty'}">${b}</b>`).join('')}</span></div></div>
      <div class="work-grid"><section class="card play-card"><div class="card-top"><div class="section-label">AT BAT</div><span class="pill">${safe(game.teams[v.batting].name)}</span></div>
        <div class="at-bat-strip">
          <div class="batter-block"><div class="batter-avatar">\${safe(batter.number || '—')}</div><div><div class="batter-title">\${safe(batter.name)}</div><div class="batter-sub">\${safe(game.teams[v.batting].name)} · Batting #\${(v.battingIndex[v.batting] % game.teams[v.batting].roster.length) + 1}</div></div></div>
          <div class="mini-field" aria-label="Current baserunners">\${renderBases(v)}<div class="runner-summary">\${[1,2,3].filter(base => v.bases[base]).map(base => \`<span>\${['','1B','2B','3B'][base]}: \${safe(v.bases[base].name)}</span>\`).join('') || '<span>Bases empty</span>'}</div></div>
        </div>
        <div class="control-wrap">\${playActions(v)}</div>
      </section>
      <section class="card timeline-card"><div class="timeline-header"><div><div class="section-label">GAME DETAILS</div><h3>Follow the action</h3></div><span class="number-badge">${game.events.length}</span></div>
        <div class="tabs"><button class="${selectedTab === 'plays' ? 'active' : ''}" data-tab="plays">Play-by-play</button><button class="${selectedTab === 'stats' ? 'active' : ''}" data-tab="stats">Box score</button></div>
        <div class="tab-content">${selectedTab === 'plays' ? renderPlayLog(v) : renderStats(v)}</div>
        <div class="timeline-bottom"><div>${icon('info',16)} <span>Game data is saved in this browser only.</span></div><button data-command="export">Export game ${icon('arrow',15)}</button></div>
      </section></div>
      <details class="score-breakdown"><summary>Inning-by-inning score</summary>${lineScore(v)}</details>
      <div class="footer-note"><span>OpenSideline <b>v0.2.1 preview</b> — Community-built sports technology</span><span>Prototype · Not a certified official scorebook</span></div>
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
function setupModal() {
  return `<div class="modal-backdrop" data-command="close-setup"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title"><div class="modal-head"><div><div class="eyebrow">GAME SETTINGS</div><h2 id="setup-title">Set up a game</h2><p>Enter players in batting order. One player per line: <b>#12 Jordan Smith</b>.</p></div><button data-command="close-setup" class="close-button" aria-label="Close setup">×</button></div>
    <form id="setup-form"><div class="setup-columns"><div><label for="away-name">Away team</label><input id="away-name" name="awayName" maxlength="60" value="${safe(game.teams.away.name)}" required/><label for="away-roster">Away roster</label><textarea id="away-roster" name="awayRoster" rows="10" required>${safe(rosterToText('away'))}</textarea></div>
    <div><label for="home-name">Home team</label><input id="home-name" name="homeName" maxlength="60" value="${safe(game.teams.home.name)}" required/><label for="home-roster">Home roster</label><textarea id="home-roster" name="homeRoster" rows="10" required>${safe(rosterToText('home'))}</textarea></div></div>
    <p class="warning-text">Saving setup starts a new game and clears the current plays. Export your game first if you want to keep a record.</p><div class="modal-footer"><button type="button" class="btn subtle" data-command="close-setup">Cancel</button><button class="btn primary" type="submit">Start new game ${icon('arrow',16)}</button></div></form></div></div>`;
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
    return \`<fieldset class="play-runner-row"><legend>\${safe(v.bases[base].name)} <small>• started on \${['','1st','2nd','3rd'][base]}</small></legend>
      <div class="runner-chips">\${options.map(dest => \`<label class="runner-chip"><input type="radio" name="runner-\${base}" value="\${dest}" data-runner-destination="\${base}" \${value === dest ? 'checked' : ''}/><span>\${dest === 'HOLD' ? 'Hold' : dest === 'OUT' ? 'Out' : dest === 'HOME' ? 'Score' : \`\${['','1st','2nd','3rd'][numberedBases[dest]]}\`}</span></label>\`).join('')}</div>
      <label class="rbi-choice"><input type="checkbox" name="rbi-\${base}" \${suggestion.rbi.includes(key) ? 'checked' : ''} \${value === 'HOME' ? '' : 'disabled'}/> Credit RBI if this runner scores</label>
    </fieldset>\`;
  }).join('');
  return \`<div class="modal-backdrop" data-command="close-play"><div class="modal play-modal" role="dialog" aria-modal="true" aria-labelledby="play-title">
    <div class="modal-head"><div><div class="eyebrow">QUICK FINISH</div><h2 id="play-title">\${safe(PLAY_RESULTS[result])}</h2><p>Batter: <b>\${safe(v.batter.name)}</b>. Tap a common outcome to save it instantly, or adjust each runner below.</p></div><button class="close-button" type="button" data-command="close-play" aria-label="Cancel scoring play">×</button></div>
    \${presets.length ? \`<section class="preset-section"><div class="preset-label">QUICK SAVE · TAP A RESULT</div><div class="preset-grid">\${presets.map((p,i) => \`<button class="preset-btn" type="button" data-preset="\${i}"><strong>\${safe(p.label)}</strong><span>\${p.advances.batter === 'OUT' ? 'Batter out' : 'Batter on base'} · \${Object.entries(p.advances.runners).map(([base,to]) => \`From \${base}: \${to === 'HOME' ? 'scores' : to.toLowerCase()}\`).join(', ') || 'Bases empty'}</span></button>\`).join('')}</div></section>\` : ''}
    <form id="play-form"><div class="play-runners"><h3>Customize runner destinations</h3>\${runnerInputs || '<p class="fineprint">Bases empty. Only the batter will be recorded.</p>'}</div>
    <p class="play-warning">Confirm the RBI choices. Runs on a third-out play require additional rules and remain unsupported.</p>
    <p class="play-form-error" data-play-error role="alert" hidden></p>
    <div class="modal-footer"><button class="btn subtle" type="button" data-command="close-play">Cancel</button><button class="btn primary" type="submit">Save custom play</button></div></form>
  </div></div>\`;
}
function render() {
  const v = replayGame(game);
  document.title = `OpenSideline | ${game.teams.away.name} ${v.scores.away}–${v.scores.home} ${game.teams.home.name}`;
  app.innerHTML = (displayMode === 'scorer' ? renderScorer(v) : renderSpectator(v)) + (showSetup && displayMode === 'scorer' ? setupModal() : '') + (showPlay && displayMode === 'scorer' ? playModal(v) : '') + (feedback ? `<div class="toast" role="status">${safe(feedback)}</div>` : '');
}
function perform(event) {
  try { commit(appendEvent(game, { ...event, at: new Date().toISOString() })); return true; }
  catch(e) { toast(e.message || 'Could not record this play.'); return false; }
}
function downloadGame() {
  const json = new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(json);
  const link = document.createElement('a'); link.href = url; link.download = `opensideline-${new Date().toISOString().slice(0,10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Game file exported. Keep youth-player information private.');
}
app.addEventListener('click', event => {
  const trigger = event.target.closest('button[data-action],button[data-result],button[data-command],button[data-tab],button[data-advance],button[data-preset]');
  if (!trigger) {
    if (event.target.classList.contains('modal-backdrop')) { showSetup = false; showPlay = null; render(); }
    return;
  }
  if (trigger.disabled) return;
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
    case 'open-setup': showSetup = true; showPlay = null; render(); break;
    case 'close-play': showPlay = null; render(); break;
    case 'close-setup': showSetup = false; render(); break;
    case 'show-stats': selectedTab = 'stats'; render(); document.querySelector('.timeline-card')?.scrollIntoView({behavior:'smooth'}); break;
    case 'toggle-advanced': showMoreActions = !showMoreActions; render(); break;
  }
});
app.addEventListener('change', e => {
  if (!e.target.matches('[data-runner-destination]')) return;
  const control = e.target.closest('.play-runner-row')?.querySelector('.rbi-choice input');
  if (control) {
    control.disabled = e.target.value !== 'HOME';
    if (control.disabled) control.checked = false;
    else if (['SINGLE','DOUBLE','TRIPLE','HOME_RUN','SAC_FLY'].includes(showPlay)) control.checked = true;
  }
});
app.addEventListener('submit', e => {
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
  if (game.events.length && !confirm('Start a new game? Current plays will be cleared.')) return;
  const form = new FormData(e.target);
  try {
    const next = createGame({ homeName: form.get('homeName'), awayName: form.get('awayName'), homeRoster: parseRoster(form.get('homeRoster'),'home'), awayRoster: parseRoster(form.get('awayRoster'),'away') });
    showSetup=false; showPlay=null; selectedTab='plays'; showMoreActions=false;
    commit(next); toast('New game created. Ready for the first pitch.');
  } catch(e) { toast(e.message); }
});
window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) { game = readStoredGame(); render(); } });
channel?.addEventListener('message', e => {
  if (e.data?.from === TAB_ID || !e.data?.game) return;
  try { replayGame(e.data.game); game = e.data.game; render(); } catch { /* discard malformed messages */ }
});
render();
