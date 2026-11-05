# OpenSideline

**Every sport. Every team. Everyone.**

OpenSideline is an early-stage, community-built open-source sports platform. This repository contains our first working milestone: **a dependency-free, browser-based baseball scorekeeping prototype** and a standalone, event-sourced scoring engine.

> **Status: v0.1 proof of concept.** This is not a commercial release, live internet scoreboard, complete baseball scorebook or production-ready youth sports service. The project name is provisional pending full name/trademark review.

## Get it running

**No-install preview:** `OpenSideline-Demo.html` remains a **v0.1 snapshot**. To use the new v0.2 runner-decision interface, start the application with `npm start`. Some browsers restrict saving from local files; use `npm start` for reliable browser storage and multiple-tab syncing.

**Requirements:** Node.js 20 or newer. No `npm install` needed.

```bash
npm start
```

Open **http://localhost:5173** in your browser. To run automated tests:

```bash
npm test
```

You can also use Python's static server (`python3 -m http.server 5173`) from the repository root and open `http://localhost:5173/apps/web/`.

## v0.2 runner advancement candidate

Issue #1 introduces a play decision form for every occupied base, explicit RBI decisions and fielder's choices, with event replay and undo retaining compatibility with old exports. See the [scoring event contract](docs/SCORING-EVENTS.md). **This is still a prototype**, not an official scorebook; scored runs on plays producing the third out are deliberately blocked pending timing/force-out support.

## v0.3 alpha: Optional private accounts and cloud saves

- **Local-first scorer remains unchanged**. No cloud upload occurs until the user explicitly saves a game.
- Optional `My OpenSideline` email sign-in, owner-only private team creation, game save/load, and conflict-safe server revisions.
- Schema, SQL migration and Row Level Security policies live in `supabase/migrations/`.
- Cloud requires a Supabase project, the applied SQL migration and **public-only** frontend settings; without those, the Cloud panel clearly says it is unconfigured.
- [Cloud setup & live security-test checklist](docs/CLOUD-SETUP.md). Follow before entering any real youth-team information.
- **Not included yet:** team invitations, automatic sync, live internet spectators, protected QR lineup sharing, and verified real-database integration tests.
- **Offline app shell:** Installable PWA manifest, original icon, and service-worker caching for first-party static assets. No cloud sessions or player data are cached by the service worker. See [Offline installation guide](docs/OFFLINE-APP.md).


## v0.2.5: Active lineups, substitutions, fielding stats and local season totals

- Batting order is separate from the roster: continuous / nine / custom formats, bench players don't bat automatically.
- In-game pinch hitters, pinch runners and pitching changes; optional example rule presets, scheduled innings and reentry setting.
- Explicit PO/A/E/DP fielding decisions and basic pitcher stats in the box score.
- Local browser season archive and CSV rollups, plus rough ball-location counts.
- See [Game-day guide](docs/GAME-DAY.md) for detailed behavior, supported formats and important scoring limitations.

**Accounts, secure QR lineup sharing, internet live updates, exact spray charts and official-scoring guarantees are not yet implemented.**

## v0.2.4: Defensive lineup + roster imports (preview)

- **Defense** opens a 9-position field layout for either team. Choose the actual defender at each position and save whenever players switch positions. This is recorded in the game journal, not inferred from batting order.
- On a batted-ball play, OpenSideline remembers the **defensive assignments that existed when the ball was hit**. Later fielding annotations like 6–3 automatically resolve to those players, even if the defense has since changed. You can still override a player manually.
- **Setup → Import CSV/JSON** can load a team roster and batting order, plus optional starting fielding positions. **Defense → Import CSV/JSON** maps the position data to already rostered players by jersey number and name.
- Download a sample roster CSV inside Setup; see [Roster import guide](docs/ROSTER-IMPORT.md).
- Imports stay in this browser. Changing an established roster via Setup starts a **new game** and clears earlier play events; export the game before replacing rosters.

**Limitations:** The importer accepts standard CSV/JSON—not proprietary GameChanger formats directly. Player substitutions and official fielding putout/assist calculations still need separate scoring logic.

## v0.2.3: Fielding positions + ball location (preview)

After a hit or out, select **Add fielding** next to the last batted-ball play, or choose **Fielding details** on an earlier play in the game history. Tap a location on the field and tap the numbered fielders in the sequence of their involvement (e.g. 6–3 or 4–6–3); assign actual defender names from the defensive team's roster. Common defensive chains are one-tap presets. Marking these details is optional to preserve fast scoring.

Each fielding annotation becomes a separate journal event, so you can undo it without losing the at-bat. The play log and JSON export preserve the annotated ball zone, numbered sequence and player IDs.

**Limits:** A field location is an approximate zone, not a GPS coordinate or spray chart. A fielding chain describes involved defenders but does not yet assign putouts or assists, because double plays and other scoring situations require more information. Annotations are stored only in this browser until cross-device sync is built.

## v0.2.2: Groundouts, lineouts and flyouts (preview)

The main scoring screen now has separate **Ground out**, **Line out** and **Fly out** buttons. These record distinct play descriptions, award a batter a plate appearance and at-bat, and record an out without a hit. When runners are aboard, you can hold/advance/retire runners in the same quick sheet; common groundout RBI advancement from third is offered as a scorer-reviewed shortcut. **Sacrifice fly remains a separate action** in More plays because its at-bat/statistical treatment differs. The generic **Other out** remains available for unusual plays. Fielding positions, putouts and assists are not yet modeled.

## v0.2.1: Faster, brighter scoring (preview)

- A high-contrast, field-light scorer with a compact **sticky** score/count/runner bar.
- Main pitch and hit buttons remain on one screen. Additional play types and manual runner controls are optional, expandable actions.
- When bases are empty, a hit or out is recorded with one tap. When runners are on, a bottom-sheet presents **validated quick-save suggestions** plus accessible runner-by-runner choices.
- Suggestions are not automatic official-scoring judgments; confirm RBI decisions and review advanced plays.

This is a browser-local MVP. Do not use real minors’ personal data in the demo.

## What works today

- Create a new baseball game with editable home/away names and batting-order rosters.
- Record balls, strikes, fouls, walks, hit by pitch, singles, doubles, triples, home runs, outs, errors and sacrifice flies.
- Track basic runners, stolen bases, manual single-base advances, runners put out, innings, runs, hits, errors and counts.
- Automatically calculate simplified batter plate appearances, at-bats, hits, batting average, OBP, RBI, HR and more.
- Undo any recorded event through event-journal replay.
- Follow a play-by-play timeline and box score.
- Open **Spectator view** or **OBS overlay** from the side navigation. These update between tabs in the **same browser profile** via localStorage/BroadcastChannel.
- Save automatically in browser localStorage and export a game file as JSON.
- Run scoring-engine tests with the built-in Node test runner.

### What does *not* work yet

No real cross-device networking, cloud backend, sign-in, player privacy controls, online spectators, video streaming or clip generation, scorekeeper collaboration, lineup substitutions, pitch-by-pitch location, fielding position decisions, pitcher's stats or complete baseball rulebook coverage. In-play hits use fixed base advancement (e.g. everyone advances one base on a single). Advanced scorers must **not** treat the resulting stats as an official record without verification. The OBS page is a **visual preview**, not a remotely synchronized production overlay.

### Youth athlete privacy

**Do not use real minors' private details in public demonstrations, screenshots, streams, issues or exported files.** Browser-only localStorage is not a complete privacy/security design. See [docs/PRIVACY.md](docs/PRIVACY.md). Never commit real player records or sensitive footage to this repository.

## Project layout

```text
apps/web/                    Browser-based scorer, spectator, overlay
packages/scoring-engine/     Pure event-based baseball rules and automated tests
scripts/server.mjs           Zero-dependency local development server
docs/                        Architecture, privacy and roadmap
.github/                     Community contribution templates
```

## Philosophy

- **Community first:** publicly documented project, approachable issues, code review and published roadmap.
- **Sport-neutral platform:** baseball is the first sport module, not the only future sport.
- **Modular core:** domain rules must run independently of a specific app, API or database.
- **Useful for free:** keep the essential scoring/statistics experience accessible.
- **Flexible hardware:** standardized future events for scoreboards, streaming overlays and developer-built integrations.
- **Privacy by design:** default-protect children and team information before online hosting.

## Development approach

This deliberately uses native browser modules and Node test tooling rather than a large framework, keeping the first milestone easy to inspect and run. Future production clients may adopt React Native/React/Next.js, but the scoring engine remains reusable. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Contributing

Contributions, play-testing, test cases and design feedback are welcome. Please start with [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ROADMAP.md](docs/ROADMAP.md). Don't publish real youth player information in issues or pull requests.

## License

Apache License 2.0. See [LICENSE](LICENSE). Future donated code will need to be appropriately licensed; any necessary patent/trademark review is separate from software licensing.
