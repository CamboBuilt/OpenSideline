-- OpenSideline v0.3: private cloud foundation
-- Supabase/PostgreSQL migration. Run only on a project you control.
-- Deny by default. No public or anonymous player data access.
begin;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists opensideline_teams_owner_idx on public.teams(owner_id);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('coach','scorer','viewer')),
  created_at timestamptz not null default now(),
  primary key (team_id,user_id)
);

create index if not exists opensideline_team_members_user_idx on public.team_members(user_id);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  local_game_id text not null check (char_length(local_game_id) between 5 and 120),
  snapshot jsonb not null,
  version bigint not null default 1 check (version between 1 and 9223372036854775806),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(owner_id,local_game_id)
);

create index if not exists opensideline_games_owner_updated_idx on public.games(owner_id,updated_at desc);
create index if not exists opensideline_games_team_idx on public.games(team_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.games enable row level security;

-- Remove grants that Supabase projects might provide to all new public tables.
revoke all on table public.teams,public.team_members,public.games from public,anon,authenticated;
grant select,insert,update,delete on public.teams to authenticated;
grant select on public.team_members to authenticated;
grant select on public.games to authenticated;

-- Signed-in coaches can manage only teams they own.
create policy opensideline_teams_select
  on public.teams for select to authenticated
  using (owner_id = (select auth.uid()));
create policy opensideline_teams_insert
  on public.teams for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy opensideline_teams_update
  on public.teams for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy opensideline_teams_delete
  on public.teams for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Membership is reserved for a reviewed invitation workflow. These rows are
-- read-only to the client; no arbitrary coach or viewer invitations yet.
create policy opensideline_team_members_select
  on public.team_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.teams t
      where t.id = team_members.team_id and t.owner_id = (select auth.uid())
    )
  );

-- Cloud games are private to their owner even when attached to a team. Future
-- spectator/membership access will require separate consent and policies.
create policy opensideline_games_select
  on public.games for select to authenticated
  using (owner_id = (select auth.uid()));

-- A single RPC handles owner-scoped compare-and-swap updates. Direct client
-- INSERT/UPDATE/DELETE grants on games are intentionally absent.
create or replace function public.save_game_snapshot(
  p_local_game_id text,
  p_snapshot jsonb,
  p_expected_version bigint default null,
  p_team_id uuid default null
)
returns table(new_version bigint,saved_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_current_version bigint;
  v_new_version bigint;
  v_saved_at timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in to save a cloud game.' using errcode = '42501';
  end if;
  if p_local_game_id is null or char_length(p_local_game_id) < 5
     or char_length(p_local_game_id) > 120
     or p_local_game_id not like 'game-%' then
    raise exception 'Invalid local game ID.' using errcode = '22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
     or p_snapshot->>'id' is distinct from p_local_game_id
     or p_snapshot->>'schemaVersion' is distinct from '1'
     or jsonb_typeof(p_snapshot->'teams') <> 'object'
     or jsonb_typeof(p_snapshot->'events') <> 'array'
     or octet_length(p_snapshot::text) > 1048576 then
    raise exception 'Invalid or oversized game snapshot.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_snapshot->'events') > 10000 then
    raise exception 'Game has too many events.' using errcode = '22023';
  end if;
  if p_expected_version is not null and p_expected_version < 1 then
    raise exception 'Invalid expected cloud version.' using errcode = '22023';
  end if;
  if p_team_id is not null and not exists (
    select 1 from public.teams t where t.id=p_team_id and t.owner_id=v_uid
  ) then
    raise exception 'You may only attach a game to a team you own.' using errcode = '42501';
  end if;

  select g.version into v_current_version
  from public.games g
  where g.owner_id=v_uid and g.local_game_id=p_local_game_id
  for update;

  if found then
    if p_expected_version is null or p_expected_version <> v_current_version then
      raise exception 'Cloud version conflict. Reload this game before saving.'
        using errcode = 'P0001';
    end if;

    update public.games g
      set snapshot=p_snapshot,version=g.version+1,updated_at=now(),
          team_id=coalesce(p_team_id,g.team_id)
    where g.owner_id=v_uid and g.local_game_id=p_local_game_id
    returning g.version,g.updated_at into v_new_version,v_saved_at;
  else
    if p_expected_version is not null then
      raise exception 'Cloud game missing. Reload before saving.'
        using errcode = 'P0001';
    end if;

    insert into public.games as g(owner_id,team_id,local_game_id,snapshot,version)
      values (v_uid,p_team_id,p_local_game_id,p_snapshot,1)
    returning g.version,g.updated_at into v_new_version,v_saved_at;
  end if;

  return query select v_new_version,v_saved_at;
end;
$$;

-- SQL functions are executable by PUBLIC unless explicitly revoked.
revoke all on function public.save_game_snapshot(text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.save_game_snapshot(text,jsonb,bigint,uuid) to authenticated;

commit;
