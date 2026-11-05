# Suggested v0.2 GitHub issues

These are recommended issue drafts; no issues were created automatically because the connected GitHub integration returned HTTP 403 for write actions.

## Issue 1 — Model runner advancement per play instead of fixed hit results

The prototype advances all runners by the same number of bases as the batter's hit, which is not generally accurate. Add a structured play model for every runner's destination (hold, first, second, third, home, out) and the batter's result. Reject impossible base collisions. Preserve event replay and undo. Acceptance: cover run from 2B on a single, runner holding on a double, run scoring on a groundout, an out at home, and the third out on the bases. Tests must verify runs, outs, RBIs, hits, and line score.

## Issue 2 — Introduce defensive and lineup substitutions

Support pinch hitters, pinch runners, batting-order positions, defensive positions, and reentry rules as optional per-league configuration. Ensure substitute stats attach to the correct player and that game state can be replayed from the event journal. Acceptance: a pinch runner scores, a player is replaced mid-plate appearance, and undo restores the roster state. Document unsupported rule variations.

## Issue 3 — Add pitcher identity and pitching stats

Track the active pitcher with pitching substitutions, pitches thrown, strikeouts, walks, hit batters, innings pitched in outs, and earned/unearned runs only once the error/runner model is sufficiently complete. Acceptance: changing pitchers mid-inning preserves pitch counts and attributes plate appearances appropriately. Don't guess earned runs where the data is insufficient.

## Issue 4 — Publish a stable spectator event protocol

Define a versioned JSON schema for score updates and game state snapshots, with privacy-aware projection (no unnecessary youth player details). Include idempotent event identifiers and reconnection behavior. Acceptance: local consumer can replay messages and derive accurate score, inning, outs, counts, and bases, and malformed messages are rejected. No public internet data until authorization rules are implemented.

## Issue 5 — Improve accessibility and mobile scorekeeping ergonomics

Audit keyboard support, contrast, touch targets, screen-reader labels, and responsive layouts on phone screens. Acceptance: scorer's primary controls are keyboard accessible and labelable, no horizontal overflow on 375px viewport, undo is clearly labeled, and end-of-inning changes are announced to assistive technology.
