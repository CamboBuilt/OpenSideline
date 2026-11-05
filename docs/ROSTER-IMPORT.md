# Import a team roster and starting defensive lineup

OpenSideline accepts **CSV** and **JSON** roster files. These are standard, portable formats so you can reuse a spreadsheet export or a roster list without typing every player. The importer currently **does not connect directly to GameChanger** or parse every proprietary export format.

## Recommended CSV format

Download the sample CSV inside **Setup → Download sample CSV**, or create a CSV with the following columns:

```csv
number,name,position,batting_order
12,Alex Rivera,SS,1
7,Jordan Brooks,CF,2
24,Taylor Lane,P,3
```

- `number`: a 1- to 3-digit jersey number.
- `name`: a player name, up to 60 characters.
- `position` (optional): `P`, `C`, `1B`, `2B`, `3B`, `SS`, `LF`, `CF`, `RF`, or baseball's defensive position number 1–9. `DH` and `BENCH` leave a defensive position unassigned.
- `batting_order` (optional): 1–30. Players with specified batting orders sort ahead of players without one.

CSV column headers can be reordered. Quoted names containing commas are supported. Headerless CSV rows may use `number,name,position,batting_order` in that order. Each team supports 1–30 players. At most one imported player may claim a specific defensive position.

## JSON format

Either an array of player objects:

```json
[
  {"number":"12","name":"Alex Rivera","position":"SS"},
  {"number":"7","name":"Jordan Brooks","position":"CF"}
]
```

Or an object containing a team name and roster:

```json
{
  "teamName": "Demo Tigers",
  "roster": [
    {"number":"12","name":"Alex Rivera","position":"SS","battingOrder":1},
    {"number":"7","name":"Jordan Brooks","position":"CF","battingOrder":2}
  ]
}
```

You can also import one team's roster from an OpenSideline game JSON export, which contains `teams.home.roster` and `teams.away.roster`. A game export does not currently restore separate in-game lineup events when imported *as a roster*; it is a roster extraction, not a whole-game import.

## Using imported roster and lineup data

1. Open the scorer and select **Setup**.
2. For **Away** or **Home**, choose **Import CSV/JSON roster**.
3. Review the player list and optional starting position count.
4. Press **Start new game**. This resets existing game events, including previous lineup changes; export the prior game first if needed.
5. Select **Defense** to inspect or edit which player is playing each fielding position. Save substitutions or position changes before the next batted-ball play.

To import a lineup after a game has already started, open **Defense**, select the relevant team, and import a CSV/JSON file. The names and jersey numbers must **match players already on that team's roster**. Only matching players with a recognized defensive position will be assigned; unknown player records are skipped rather than silently added to an in-progress roster.

## Privacy and limitations

The app's game data remains in your browser, not on a cross-device shared team account. Treat files containing youth athletes' names as private; don't publish real rosters or screenshots to public issues. Fielding annotations describe involved players but do not yet calculate official putouts, assists, or errors automatically.

Use generic fictional data for demos and contributions.
