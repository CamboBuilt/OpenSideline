# OpenSideline v0.2.5 — Game-day scoring

This version focuses on accurate **local** baseball scoring. It preserves the event journal and older v0.1–v0.2.4 saves.

## Set up the game

Open **Setup**. Enter or import the complete home and away rosters. Choose a *league example* (youth/rec, travel, school, standard), then choose the batting format.

- **Continuous**: every roster player bats; common in youth recreational and travel settings.
- **Nine**: the first nine players, or nine explicitly listed jersey numbers, bat. The remaining roster players are on the bench. The engine checks that both teams have at least nine players.
- **Custom**: choose any nonempty subset of roster members in a specific order by entering jersey numbers, separated by commas or new lines. Bench players remain available for substitution.

Example: roster #12, #7, #24, #9, #8, #4, #3, #6, #11, #22, #17; active batting order **12, 7, 24, 9, 8, 4, 3, 6, 11**. The last two athletes remain on the bench and do not bat automatically.

You can edit scheduled innings (1–15) and whether removed players may reenter batting slots. **These are configurable examples, not guaranteed league rules.** They do not automatically end a game or handle curfews/tie-breakers.

## Manage substitutions without restarting

Open **Lineup** while scoring. You can:
- Replace an active batter in any slot with an available bench player; choose substitution or pinch hitter.
- Replace a runner on base with a bench pinch runner; the replacement inherits the old player's batting slot. Subsequent runs go to the replacement player, not the original.
- Change the pitcher. A pitcher change assigns the new pitcher to defensive position 1 and preserves other field positions. Update other defenders separately with **Defense**.

Every change is recorded as an event and can be undone. Existing player stats stay with the original batter. Invalid substitutions (unknown players, two active batting slots, disallowed reentry) are rejected.

## Defense and fielding stats

After scoring a batted ball, open **Add fielding** and record where it went, which positions handled it (e.g., 6–3), and actual player names from the defensive lineup at the time. You may additionally mark:
- PO: putout
- A: assist
- E: individual defensive error
- DP: double-play participation

These awards are **scorer-entered** and may be revised without double-counting. The app does not infer official credits or earned runs from a fielding chain.

## Pitching stats

Assign the pitcher under **Lineup** or **Defense**. The box score totals pitches explicitly entered using Ball, Strike, and Foul, plus batters faced, hits, walks and strikeouts charged to the current pitcher at the end of a plate appearance.

**Important:** One-tap at-bat outcomes without pitch-by-pitch entry do **not** add pitches to this count. A pitching change during a plate appearance assigns its completed result to the pitcher who finished it; detailed mid-count statistical responsibility is a future enhancement. This is not yet a certified official pitching scorebook.

## Local season stats, ball-location counts and export

The **Box score** includes batting, fielding, and a basic pitching table. It also counts marked ball locations and shows local season totals.

When you start a new game, the previous game (if it has events) is archived in the browser, up to 20 games. Current + archived games are aggregated by team name, jersey number and player name, not roster slot. Choose **Export season CSV** to save a local copy.

The archive is local to one browser and one device. It is not an account-based season database, and private-browsing/clearing storage may remove it. Export regularly.

## What v0.2.5 does not claim

- Secure user accounts, cross-device game synchronization, internet live sharing.
- Private QR lineup exchange (requires authenticated, permissioned sharing).
- Automated official rules for reentry and courtesy runners, multi-player substitutions or defensive batting slot replacement.
- Official earned runs, detailed pitching substitutions on an inherited count, or automated force/time-play third-out judgments.
- Continuous spray chart trajectories or location coordinates (we record approximate zone names only).

These are tracked separately for later infrastructure and scoring work. No user data is uploaded by the current MVP.
