# Roadmap — proposed, subject to community review

## v0.1: Working local baseball demo (this repository)
- [x] Event-based standalone scoring engine
- [x] Basic batting and baserunner actions, inning state and automatic box-score stats
- [x] Responsive web scoreboard + scorer
- [x] Same-browser spectator and OBS-preview displays
- [x] Editable team/roster setup, undo, browser save, JSON export
- [x] Automated scoring tests

## v0.2: Baseball scoring correctness
- [x] Explicit, validated runner destinations on ball-in-play events (Issue #1 candidate)
- [ ] Complete third-out, appeal/force, and timing-sensitive run scoring rules
- [ ] Lineup changes, pinch runners, substitutions, designated hitter rules
- [ ] Pitching stats, wild pitches, passed balls, pickoffs, fielding stats
- [ ] Different game length, mercy rules, tie and extra-inning rules
- [ ] Import/export stability, schema migrations, accessibility testing

## v0.2.1: Scorer experience / outdoor legibility
- [x] Brighter high-contrast light theme with responsive controls
- [x] Compact sticky game scoreboard, inning, count, and occupied bases
- [x] Main pitch and at-bat outcomes visible without opening a menu
- [x] Runner bottom sheet with validated quick-save presets and one-tap destination chips
- [ ] Real-device usability tests in bright sunlight and with accessibility tools

## v0.3: Teams + real synchronized game updates
- [ ] User identities, team roles and permissions
- [ ] Secure server event journal, audit history and sync/conflict resolution
- [ ] Offline queue, reconciliation and cross-device live updates
- [ ] Private-by-default youth athlete identity, parental controls and retention
- [ ] Public spectator data contract and access-level filtering

## v0.4: Integrations and video
- [ ] Versioned public scoreboard event API
- [ ] OBS/browser-source overlay with actual cross-device synchronization
- [ ] Open hardware connector specification for LED scoreboards
- [ ] Livestream provider adapters, controlled access and recording permissions

## Later
- [ ] Mobile apps, event schedules, team chat, attendance and notifications
- [ ] Clip timeline tied to event timestamps
- [ ] Basketball, football, soccer and community-created sport plugins
- [ ] Hosted service with transparent streaming costs and self-hosting option

**Not dates or promises:** this roadmap is an invitation for community contribution, not a release schedule.

## Game-day release candidate and connected-app milestones

- **v0.2.5 (implemented in [PR #9](https://github.com/CamboBuilt/OpenSideline/pull/9))**: separate active batting order, substitutions/pinch runners, basic pitching changes and stats, explicit fielding credits, local season archive/CSV and marked zone counts. Needs field use and scoring rule review before merge.
- **v0.3 ([#10](https://github.com/CamboBuilt/OpenSideline/issues/10))**: private accounts, team/season database, permissioned remote game sync. This requires identity, persistence, server-side event validation and a configured deployment backend.
- **v0.4 ([#11](https://github.com/CamboBuilt/OpenSideline/issues/11))**: revocable QR lineup invitations and coach acceptance. QR codes must never expose raw private youth rosters.
- **v0.5 ([#12](https://github.com/CamboBuilt/OpenSideline/issues/12))**: internet spectator feeds, OBS and external scoreboard events; the existing same-browser demo is not a remote stream.
- **v0.6 ([#14](https://github.com/CamboBuilt/OpenSideline/issues/14))**: player profiles, exact spray coordinates, season leaders and reports beyond the current rough zone counts.
- **Scoring accuracy ([#13](https://github.com/CamboBuilt/OpenSideline/issues/13))**: league-specific substitution rules, third-out judgments, pitcher-of-record and advanced pitching statistics.
- **Installable/offline app ([#15](https://github.com/CamboBuilt/OpenSideline/issues/15))**: PWA/mobile foundation with safe caching, backups and sync queues.

**Current privacy and reliability boundary:** Browser localStorage only. Don't use this prototype as your only source of authoritative team or game records. Export before replacing a game or clearing browser storage; do not publicly share youth rosters in GitHub issues.
