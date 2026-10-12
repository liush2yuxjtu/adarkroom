-- Playtest telemetry for the A Dark Room Godot remake.
-- Apply in the Supabase SQL editor or via supabase db push.
-- No secrets are required to build the game.

create extension if not exists pgcrypto;

create table if not exists playtest_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  event_name text not null,
  occurred_at timestamptz not null default now(),
  game_time_sec double precision,
  phase text,
  payload jsonb not null default '{}'::jsonb,
  user_agent text,
  inserted_at timestamptz not null default now()
);

create index if not exists playtest_events_session_idx
  on playtest_events (session_id, occurred_at);

create index if not exists playtest_events_name_idx
  on playtest_events (event_name, occurred_at desc);

create index if not exists playtest_events_phase_idx
  on playtest_events (phase, occurred_at desc);

-- Optional: allow anonymous inserts from the static web build.
-- Tighten this before a public launch (add a write-only role / RLS policy).
alter table playtest_events enable row level security;

drop policy if exists playtest_events_insert_anon on playtest_events;
create policy playtest_events_insert_anon
  on playtest_events
  for insert
  to anon
  with check (true);

drop policy if exists playtest_events_select_service on playtest_events;
create policy playtest_events_select_service
  on playtest_events
  for select
  to authenticated
  using (true);

-- Convenience view: one row per session.
create or replace view playtest_sessions as
select
  session_id,
  min(occurred_at) filter (where event_name = 'session_start') as started_at,
  max(occurred_at) filter (where event_name in ('session_end', 'quit', 'death')) as ended_at,
  max(phase) filter (where occurred_at = (
    select max(p2.occurred_at) from playtest_events p2 where p2.session_id = playtest_events.session_id
  )) as last_phase,
  count(*) as event_count,
  count(*) filter (where event_name = 'stuck') as stuck_count,
  count(*) filter (where event_name = 'death') as death_count,
  max(game_time_sec) as max_game_time_sec
from playtest_events
group by session_id;
