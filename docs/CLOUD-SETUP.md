# OpenSideline v0.3 — Private cloud foundation (alpha)

The scorer remains **fully usable without an account**. Cloud features are optional and are disabled until a Supabase project is configured and tested. Do not insert real youth-player data before checking the authorization policies below.

## What has been implemented

- An optional **My OpenSideline** panel in the scorer, providing passwordless email sign-in, account sign-out, private team creation, and private game lists.
- Explicit **Save current game to cloud** and **Open** actions. There is **no automatic upload** of a coach's local data. Opening a different game backs up the current one to the local season archive first.
- A Supabase migration for `teams`, reserved/read-only `team_members`, and `games` with row-level security (RLS), least-privilege grants, and a server-side `save_game_snapshot` function.
- Compare-and-swap (optimistic concurrency): the browser supplies the revision it last loaded or saved. A different revision **fails with a conflict**, rather than overwriting another device.
- Existing event journals are validated with `replayGame` before upload and after download. Legacy saves and the local scoring engine remain unchanged.
- Local-first fallback: if the cloud is not configured, signed out, offline, or returning an error, scoring continues to work in the browser.

**The migration and real Supabase sign-in have not been exercised against a live project yet.** GitHub tests use a fake client and do not prove that a remote database's RLS is configured correctly.

## Connect a Supabase project

1. Create or connect a project at [Supabase](https://supabase.com) that you own. Leave any existing production databases untouched.
2. In your project's SQL editor, review and apply:
   `supabase/migrations/202611050001_cloud_foundation.sql`
3. Inspect **Authentication → Providers → Email** and enable email authentication. Configure the site's URL and permitted redirect URL(s), including the exact OpenSideline site that should receive the magic link (e.g. `https://opensideline-preview.vercel.app`). Supabase may require custom SMTP/email settings for production email delivery.
4. From the project's API/connect settings, copy only the **Project URL** and the **publishable key** (`sb_publishable_...`, or legacy anon key). **Do not copy a service-role or secret key.**
5. Set `url` and `publishableKey` inside `apps/web/cloud-config.mjs` for the frontend build/deployment. Publishable keys are intentionally public, but secrets must never be committed or placed in frontend HTML/JS.
6. Deploy those files with the existing OpenSideline web app. The optional frontend loads the official Supabase JS v2 browser library only if configured.
7. On the site, select **Cloud** or **My OpenSideline**, sign in via email, create a private team, save a fictional test game and open it on another signed-in device. The same user's cloud games are listed by most recent update.
8. Export a JSON backup before replacing or clearing your browser's local game.

For a production application, pin and bundle the Supabase JS library locally (the current alpha uses the official CDN's `@2` major tag) and run full browser/real-database security tests.

## RLS and concurrency verification — required before real teams

Use **two separate test accounts**, A and B, plus an anonymous browser. Do not test using a server-side service-role key, which bypasses RLS.

- Anonymous: `teams` and `games` reads/writes must fail or return no rows. The cloud save function must reject anonymous calls.
- Account A: can create its own team, save a fictional game, load its game and update with the correct expected revision.
- Account B: cannot list or read A's team, members or game (including by guessing a UUID or game ID), cannot attach a game to A's team, and cannot update A's game.
- Account A: tries to update its game with a stale expected revision; the RPC must return a conflict and leave the previous snapshot unchanged.
- Account A: using a direct database API update/insert/delete on `games` must be denied; only `save_game_snapshot` should write games.
- Account A: team member creation must be denied through the client until the private invitation workflow is implemented.
- Corrupt/oversized snapshots must be rejected by the database function; browser replay also rejects invalid event journals.

Supabase's current RLS guidance recommends testing both database grants and policies. A passing front-end unit test is **not** a substitute for this live integration test.

## Current limitations and next production requirements

- No remote database exists in this repository. Without a connected Supabase project and applied migration, the **Cloud** panel shows that it is not configured. That is intentional.
- Team membership/invitations, scoped coach/scorer access, remote spectators, and secure QR lineup exchange are not enabled. Only a game's owner can read it through the RLS policies; account teams are private.
- No background auto-sync: users explicitly save and refresh/open cloud games. This reduces accidental overwrites but means local changes remain local until saved.
- No automatic conflict merging. If the same game was edited on another device, back up the local file, refresh, and open the current cloud version before making new edits. Do not silently retry a conflicting update.
- Auth uses passwordless email links; the browser persists the session as managed by the Supabase client. Signing out **does not delete the local game** on a shared device; export/clear local browser storage separately if appropriate.
- The RPC checks the basic snapshot schema, size and authorization, not the full baseball event journal. Server-side replay validation is a prerequisite for multiwriter/public scoring.
- No account deletion flow, privacy notice, age-related consent controls, abuse reporting or data retention policy yet. These must be addressed before inviting youth teams.
- No bundled mobile app/PWA yet; mobile browser scoring continues to work.

## Architecture

```text
Browser scorer (localStorage + immutable scoring journal)
  ├─ optional Cloud panel (disabled until configured)
  ├─ Supabase Auth — email sign-in and managed session
  ├─ Private teams SELECT/INSERT (owner-only RLS)
  ├─ Private games SELECT (owner-only RLS)
  └─ save_game_snapshot RPC (auth.uid + CAS version check)
                 ↓
Supabase PostgreSQL: teams / team_members / games
```

Every saved game carries its local `game-...` identifier and a cloud revision. First save expects no remote revision; subsequent saves send the last confirmed revision. If another client writes meanwhile, the server refuses the stale save.

See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), [secure frontend data API](https://supabase.com/docs/guides/database/secure-data), and [JavaScript email OTP API](https://supabase.com/docs/reference/javascript/auth-signinwithotp).
