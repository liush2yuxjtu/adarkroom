# Supabase telemetry end-to-end surface

## Status (2026-10-12)

NOT YET RUNNABLE. Deployed `data/config.json` has `analytics_endpoint: ""`, `analytics_http_enabled: false` and no `telemetry-config.js`, so the live site writes only to localStorage. Do not create a DB during verification.

## Expected flow and pass criteria

Backend: Supabase project `adarkroom-telemetry` (ref `ywwguestvujaoimlqznq`), table `public.playtest_events` (`id, session_id, event_name, occurred_at, game_time_sec, phase, payload jsonb, user_agent, inserted_at`). RLS allows anon INSERT only. The Vercel env vars `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected at build time (static site, so a redeploy is needed to pick them up). Details: `/workspace/adr-telemetry/handoff.md`. Not yet runnable: as of 2026-10-12 the frontend wiring is not deployed.

1. Open the LIVE URL in headless Playwright and record `session_id` from `JSON.parse(localStorage['adr.telemetry'])[0].session_id`. This is the unique marker for the run. Confirm the deployed build has a non-empty `self.ADR_TELEMETRY` (`telemetry-config.js`) and a `POST …/rest/v1/playtest_events` request answering `201`.
2. Click `生火` with the real mouse, plus 2–3 other buttons (e.g. `添柴`, `加速.`, `设置.`).
3. Wait about 4 s for the 3-second batch flush (or hide the tab / reload to force `pagehide`).
4. Supabase MCP `execute_sql` (project `ywwguestvujaoimlqznq`):
   ```sql
   select event_name, count(*), min(occurred_at), max(occurred_at),
          jsonb_agg(payload) filter (where event_name='player_action') as actions
   from public.playtest_events where session_id = '<session_id>' group by 1;
   ```
   Assert rows for `session_start`, `player_action` and `director_tool`, a non-null `occurred_at`, and a `player_action` payload that names the clicked action (e.g. light fire / stoke).
5. Confirm anon cannot read: `curl -s "$SUPABASE_URL/rest/v1/playtest_events?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"` must return an error / permission denied (or `[]`), never rows.
6. Optional: open the Table Editor at https://supabase.com/dashboard/project/ywwguestvujaoimlqznq/editor and filter by the session_id for a screenshot.
7. Lesson: events in localStorage alone do not prove the backend works. PASS needs rows in `playtest_events` for this run's session_id.

## Known limitations

The frontend wiring needs a redeploy (user approval) before this surface can PASS.
