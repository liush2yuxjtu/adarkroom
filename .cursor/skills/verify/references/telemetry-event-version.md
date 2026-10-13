# Surface `telemetry-event-version`

Every outbound `playtest_events` row must carry a build identity. Historical rows may lack it. New client emits must include it. When analyzing PM telemetry, **filter out events from old versions (below the current release)** before drawing retention or bug conclusions — old-version bugs are not actionable.

This surface is **not** `pr-telemetry-required` (did this PR add the events that can verify a fix). It is **not** `<sink>-telemetry` / `supabase-telemetry` (did rows land). It is **not** `pm-telemetry-human-filter` (automated vs human-like sessions). Run those as well when they trigger. This one only answers: does every new payload name the deployed client, and did the analysis drop pre-current-release rows?

## Field (do not rename)

| jsonb key | value | injected at |
|---|---|---|
| `payload.client_version` | short git SHA of the deployed commit (7 chars), e.g. `938c319` | build time via `scripts/prepare-vercel.sh` → `godot/build/web/telemetry-config.js` `ADR_TELEMETRY.client_version`; stamped on every event in `telemetry.js` `log()` / `toRow()`, `engine.js` `Analytics.log()`, and `sinks/supabase.js` `rowFromEvent()` |

Local / unstamped fallbacks: `dev` (committed config), `unknown` (config missing), `godot-dev` (native Godot HTTP path). Treat those the same as **missing** for PM conclusions.

Query path: `payload->>'client_version'`. There is no `client_version` column. Do not add one as part of this check.

## Triggers

- Diff or claim touches `telemetry.js`, `engine.js` Analytics, `sinks/supabase.js`, `telemetry-config.js`, `scripts/prepare-vercel.sh`, Godot `Analytics.gd` / `SupabaseSink.gd`, or the verify telemetry suite.
- Any analysis of `playtest_events` used for retention, funnels, bug rates, or "players are…".
- Every `/verify` that includes the headless telemetry contract (`node tools/verify/telemetry.mjs`).

Skip only when the change cannot affect event payloads **and** no one is reading `playtest_events` for a product conclusion.

## Method

1. **Contract.** Confirm the live/export path stamps `payload.client_version` on every event. The repeatable gate is:

   ```bash
   node tools/verify/telemetry.mjs
   ```

   Check id `client-version-on-every-event` must PASS (engine path and `telemetry.js` path; posted rows included).

2. **Current release.** Read the SHA of the live remake branch `cursor/godot-chinese-remake-5c3a` HEAD, or the Vercel deployment SHA under test. Short form is the first 7 hex chars. That string **is** the current `client_version`.

3. **Filter before conclusions.** Drop rows whose `payload->>'client_version'` is null, empty, `dev`, `unknown`, `godot-dev`, or not equal to the current release. A bug that only appears on those rows is historical, not actionable.

## Sample SQL — keep only the current release

Replace `:current_release` with the live short SHA (example: `938c319`).

```sql
-- Current release = short SHA baked into ADR_TELEMETRY.client_version
-- by scripts/prepare-vercel.sh (VERCEL_GIT_COMMIT_SHA or git rev-parse HEAD).
-- Historical rows lack the key; treat them as pre-release and exclude.
SELECT
  session_id,
  event_name,
  occurred_at,
  game_time_sec,
  phase,
  payload->>'client_version' AS client_version,
  payload
FROM playtest_events
WHERE payload->>'client_version' = :current_release
ORDER BY occurred_at;
```

Count how much of the table is current vs old/missing:

```sql
SELECT
  CASE
    WHEN payload->>'client_version' IS NULL
      OR payload->>'client_version' IN ('', 'dev', 'unknown', 'godot-dev')
      THEN 'missing_or_unstamped'
    WHEN payload->>'client_version' = :current_release THEN 'current_release'
    ELSE 'older_release'
  END AS version_class,
  count(*) AS n_events,
  count(DISTINCT session_id) AS n_sessions
FROM playtest_events
GROUP BY 1
ORDER BY n_events DESC;
```

Sessions that mix versions (reload mid-deploy) belong with the **oldest** stamp they emitted if you need a single bucket; prefer excluding the session from current-release PM numbers.

## Pass / fail

- **PASS** — `client-version-on-every-event` is green; analysis SQL (if any) filters `payload->>'client_version' = :current_release`; the report names the SHA used as current.
- **FAIL** — a new emit lacks `payload.client_version`, the headless check fails, or a retention/bug conclusion was drawn from unfiltered / old-version rows.
- **SKIP** — no telemetry payload change and no `playtest_events` analysis.
- **INCONCLUSIVE** — sink unread (no service/read key) so live stamps cannot be confirmed. The headless check can still PASS on its own.

## Worked example

Before this surface, `playtest_events.payload` had `is_automation` and `event_id` but no build identity. A session from last week's export was indistinguishable from today's. After: every `log()` / flush row carries `client_version` from `ADR_TELEMETRY` (Vercel SHA). PM queries that omit `WHERE payload->>'client_version' = :current_release` fail this surface even if the median looks tidy.
