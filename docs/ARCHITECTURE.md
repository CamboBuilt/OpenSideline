# Architecture notes

## Event-sourced game state

A game is a JSON document containing two teams, batting order rosters and an ordered `events[]` journal. `replayGame(game)` rebuilds the entire scoreboard and all player statistics from that journal. `appendEvent(game, event)` returns a new document and verifies it can be replayed; `undoEvent(game)` removes the last journal entry. The engine has no dependency on the browser or Node-specific APIs.

Why event sourcing? Score corrections are common in youth baseball. An immutable event journal provides a natural undo mechanism, makes deterministic tests possible, and is a useful basis for future timeline-driven highlights and live scoreboard subscribers.

### Example

```javascript
import { createGame, appendEvent, replayGame } from './packages/scoring-engine/src/index.mjs';
let game = createGame();
game = appendEvent(game, { type: 'BALL' });
game = appendEvent(game, { type: 'BALL_IN_PLAY', result: 'SINGLE' });
const view = replayGame(game);
console.log(view.bases[1], view.hits.away);
```

## Web MVP

The prototype is static HTML/CSS/native JS modules, served with a tiny local HTTP server. Data persists in localStorage on one browser profile. `BroadcastChannel` mirrors changes to local spectator/overlay tabs. **This is not a cloud synchronization layer**; do not describe it to prospective users as real-time online scoring.

## Future sport-agnostic design

We plan a shared platform boundary around `SportProvider` with sport-specific rules, input UI and statistics aggregators. Each sport can expose `createGame`, `validateAction`, `applyAction`, `getScoreboard` and `getStatDefinitions` and publish a versioned schema. Baseball's v0.1 interface should not be treated as the final shared API.

## Production priorities

1. Normalize commands vs. events: an event should describe **what happened** rather than just a button press; include batter, runner, pitcher and fielding actors.
2. Implement at-bat + runner movement as one atomic play, with scored-by-judgment actions rather than fixed advancements.
3. Explicit lineup roles, substitutions, eligibility, pitching staff and rules variations by organization.
4. Build distributed event sequence IDs, server validation, idempotency, optimistic editing and conflict resolution for offline scoring.
5. Integrate authorization (coach, scorekeeper, guardian, viewer), youth-specific access rules, audit logging, data retention and verified permissions.
6. Introduce sport-neutral public API and physical scoreboard event adapters; managed streaming as a separate paid-cost infrastructure service.

## Public API safety

Never broadcast raw youth roster records to arbitrary public listeners. A spectator API needs scoped fields, privacy-controlled player identifiers, limited visibility and moderation/reporting flows. Server authority must be separate from client-supplied scoreboard events.
