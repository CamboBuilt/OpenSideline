# Baseball play events — v0.2 candidate

OpenSideline stores game actions in an append-only, JSON-serializable `events[]` journal. `replayGame(game)` recomputes score, bases, outs, inning and batter stats. `undoEvent(game)` removes the last event without mutating earlier game objects.

## Explicit ball-in-play advancement

New scorer interactions record `BALL_IN_PLAY` events with `advances`:

```json
{
  "type": "BALL_IN_PLAY",
  "result": "SINGLE",
  "advances": {
    "batter": "FIRST",
    "runners": { "2": "HOME" },
    "rbi": ["2"]
  }
}
```

`batter` is a required destination determined by `result`: SINGLE → FIRST, DOUBLE → SECOND, TRIPLE → THIRD, HOME_RUN → HOME, ERROR → FIRST, OUT → OUT, SAC_FLY → OUT, FIELDERS_CHOICE → FIRST.

`runners` is a map of **starting base** (`"1"`, `"2"`, `"3"`) to that runner's final destination, which may be `HOLD`, `SECOND`, `THIRD`, `HOME`, or `OUT` as appropriate to the starting base. **Every originally occupied base must have exactly one decision**, even when the runner stays put. The scorer may independently decide that a runner scores from second on a single, holds on a double, or is retired while the batter reaches base.

`rbi` is an explicit list of those starting-base keys whose scored runs are credited as RBI to this batter. The scorer must decide RBI credit; defaults in the interface are suggestions. A home-run batter is automatically credited with an RBI for their own run. `SAC_FLY` requires a runner to score from third and gives that runner an RBI. For `ERROR`, `OUT`, and `FIELDERS_CHOICE` there is no default RBI (scorer may award one if justified).

Validation rejects impossible destinations, duplicate bases, missing/nonexistent runners, more than three outs, incompatible batter destinations and RBI claims for players who did not score. A runner may only advance, hold, score, or be put out—not move backward.

## Batted-ball out types (v0.2.2 preview)

`BALL_IN_PLAY` may now have `result: "GROUND_OUT"`, `"LINE_OUT"`, or `"FLY_OUT"` in addition to the backwards-compatible `"OUT"` generic result. All four retire the batter, record an at-bat and plate appearance, and reset the count; none records a hit. They retain their distinct labels in play-by-play and JSON exports. Existing legacy `"OUT"` events remain readable.

Runner decisions are still governed by `advances`. The scorer can record a runner advancing or being doubled off on the same batted ball. Groundouts can credit a scorer-confirmed RBI for a runner scoring from third. **Sacrifice flies must use `"SAC_FLY"` rather than `"FLY_OUT"`** so the batter receives a sacrifice fly rather than an at-bat. Precise defensive fielder positions (e.g. 6-3), assists, and putouts are future work.

## Optional fielding annotations (v0.2.3 preview)

Fielding information is stored as a **new event** referring to the zero-based index of an existing `BALL_IN_PLAY` event; it does not mutate the original scoring event.

```json
{
  "type": "PLAY_ANNOTATION",
  "target": 12,
  "fielding": {
    "location": "SS",
    "sequence": [
      { "position": 6, "playerId": "defender-12" },
      { "position": 3, "playerId": "defender-3" }
    ]
  }
}
```

`location` may be `null` or one of: C, P, 1B, 2B, SS, 3B, LF, LCF, CF, RCF, RF. A `sequence` contains up to eight touches in order, each with a defensive `position` 1–9 and optional `playerId`. Player IDs are validated against the team **fielding at the time the target ball was put in play**, not inferred from batting order. When names are not yet selected, playerId is `null` and only the position chain is shown.

For backwards compatibility, events without annotations replay identically. Later annotations to the same target replace earlier annotations in the **derived display**; undoing the last annotation restores the earlier display. The original play log includes the recorded information without creating an extra batted-ball event.

Field positions/touches do **not** automatically award putouts and assists. A chain like 6–4–3 does not uniquely identify who recorded each out in every situation, so these statistics require a future explicit scorer decision.

## Defensive lineup events (v0.2.4 preview)

The `DEFENSIVE_LINEUP` event records a full position-to-player snapshot for one team, independent of batting order.

```json
{"type":"DEFENSIVE_LINEUP","side":"home","assignments":{"1":"pitcher-id","2":"catcher-id","3":"first-base-id","6":"shortstop-id"}}
```

Position keys are the baseball scorebook numbers **1 through 9**. Missing or null keys mean unassigned. Each non-null player ID must occur in that team's roster, and a player may occupy **at most one defensive position** in the same snapshot. The validation layer normalizes every lineup to nine slots. A new lineup event replaces the team's previous alignment while preserving prior events and older game replays. Lineup events do not increment outs, counts, scores or batting orders.

Every `BALL_IN_PLAY` play-log item takes a copy of the defending team's lineup **before processing that play**. When a `PLAY_ANNOTATION` for that play supplies a position without an explicit player ID, the replay engine resolves the player from this *original play snapshot*, not the latest lineup. Explicit scorer-chosen player IDs take precedence. This makes later substitutions safe for historical fielding records.

Lineups don't themselves award fielding putouts/assists, and roster changes currently start a new game, not in-game substitutions.

## Compatibility

Older v0.1 games use `schemaVersion: 1`, where `BALL_IN_PLAY` events have **no `advances` field**. They continue to replay with their original simplified automatic runner rules, so existing JSON exports need no migration and are not silently reinterpreted. New events can be appended to an old game; the journal remains `schemaVersion: 1` because the extension is backward-compatible to the new reader. Older app versions may not understand the extension; retain an export before upgrading.

## Limitations — not yet an official scorebook

- **Runs on a play producing the third out are rejected** until force outs, timing, passing runners and appeal plays can be modeled. This prevents silently counting runs that might not count. Scorekeepers will see a validation error instead of an inaccurate score.
- Hit, error, fielder's choice, sacrifice and RBI decisions must be made by a knowledgeable scorer. The app cannot currently verify official scoring judgment, caught stealing rules, force-vs-tag decisions, fielding assists, earned runs or pitchers of record.
- Pitching changes, pinch runners, substitutions, run responsibility and league-specific rules are separate follow-up features.
- The app saves locally to your browser, not a synced server. Don't enter private youth-athlete details into public demos.

See [Roadmap](ROADMAP.md) and issue #1 for remaining rule coverage.
