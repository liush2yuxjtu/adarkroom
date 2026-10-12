-- Abandoned long-run analysis. Apply after 001_playtest_events.sql.
-- A "long run" is a save / session with play time over 30 minutes that is
-- followed by new_game_start (player started over, possibly after frustration
-- or a broken save).

create or replace view abandoned_long_runs as
with starts as (
  select
    session_id,
    occurred_at as started_at,
    payload->>'previous_save_id' as previous_save_id,
    payload->>'previous_phase' as previous_phase,
    coalesce((payload->>'previous_play_time_sec')::double precision, 0) as previous_play_time_sec,
    payload->>'previous_last_save_at' as previous_last_save_at,
    payload->'previous_last_action' as previous_last_action,
    payload->'recent_actions' as recent_actions,
    payload->>'last_phase' as last_phase,
    coalesce((payload->>'overwritten')::boolean, false) as overwritten
  from playtest_events
  where event_name = 'new_game_start'
),
saves as (
  select
    payload->>'save_id' as save_id,
    max(occurred_at) as last_save_at,
    max(game_time_sec) as max_game_time_sec,
    (array_agg(phase order by occurred_at desc))[1] as last_save_phase
  from playtest_events
  where event_name = 'save_write' and payload ? 'save_id'
  group by 1
)
select
  s.session_id,
  s.started_at,
  s.previous_save_id,
  s.previous_phase,
  s.previous_play_time_sec,
  s.previous_last_save_at,
  s.previous_last_action,
  s.recent_actions,
  s.last_phase,
  s.overwritten,
  sv.last_save_at,
  sv.last_save_phase,
  case
    when s.previous_play_time_sec >= 3600 then '60m+'
    when s.previous_play_time_sec >= 1800 then '30m+'
    else 'short'
  end as abandonment_bucket
from starts s
left join saves sv on sv.save_id = s.previous_save_id
where s.previous_play_time_sec >= 1800
   or coalesce(sv.max_game_time_sec, 0) >= 1800;

comment on view abandoned_long_runs is
  'new_game_start after a previous run of 30+ minutes (or 60+). Use abandonment_bucket to split 30m/60m.';
