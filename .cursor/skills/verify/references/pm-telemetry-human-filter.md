# Surface `pm-telemetry-human-filter`

**Before any PM telemetry analysis** (retention, session duration, funnels, "players quit after X seconds"), classify every session as automated vs human-like. Do not treat a raw median as a product fact.

This surface is **not** `telemetry-event-version` (does every payload carry a build SHA; drop old builds). Run that filter **inside** this classification: missing `client_version` is one automation/old-build signal. This surface is also **not** `pr-telemetry-required` and **not** the sink read-back check.

## Finding this surface exists to prevent (guidance, not frozen KPIs)

A "~2.6s median retention" for "non-automated" sessions was polluted:

| slice | n sessions | median duration | what it actually was |
|---|---|---|---|
| `is_automation ≠ true` (trusted as human) | 265 | ~2.6s | almost all test traffic |
| of those, untagged HeadlessChrome UA | 235 / 265 | 2.60s | headless verify / agent runs that never set `is_automation` |
| remaining browser-like UAs | ~16 | ~5.86s | the only plausible humans in that pull |
| sessions &gt; 2 min | 6 | — | **all** the same Windows Edge/155 UA (developer self-test) |

There was **no external long-retention evidence**. `payload.is_automation` alone is not enough: older clients and some harnesses omit it. Do not hard-code 2.6s / 235 / 16 as forever-true numbers; re-run the classification query on the current table. The **method** is the gate.

## Triggers

- Any retention, session-duration, funnel, "time-to-first-X", or "players bounce" claim that uses `playtest_events`.
- A PR or `/verify` that cites those metrics, including `game-pacing-intent` when it is used for PM storytelling rather than the tagged curve.
- Skip only when no one is computing a session-level product metric from the sink.

## Classify each session (required signals)

Honor **all** of these. A session is automated / non-actionable if **any** fire.

1. **`payload.is_automation = true`** on any event in the session. Honor it when present. Absence is **not** proof of a human.
2. **User-Agent** (column `playtest_events.user_agent`, **not** inside payload):
   - `Headless`, `Playwright`, `Puppeteer`, `PhantomJS`, `Lighthouse` → automated
   - missing, empty, or a fake short UA (roughly `length < 20`) → automated
3. **Event timing / shape:**
   - uniform sub-second gaps across many events
   - `director_think` / `director_tool` / `save_write` floods with **no** `button_hover_enter` / mouse events
   - zero hover/mouse plus a scripted action ladder → automated
4. **Version field** (`payload.client_version`, see [`telemetry-event-version`](telemetry-event-version.md)):
   - missing / `dev` / `unknown` / `godot-dev` → likely old or test build; exclude from current-release PM
   - present but **below / not equal to** the current live SHA → old release; exclude. Old-version bugs are not actionable.
5. **IP diversity:** the current `playtest_events` table **does not have an IP column** (`id, session_id, event_name, occurred_at, game_time_sec, phase, payload jsonb, user_agent, inserted_at`). You cannot use IP diversity until a column exists. Say so in the report; do not invent IPs.

Developer self-tests (one repeated desktop UA, long sessions, same machine pattern) are **not** external players. Call them `self_test` and exclude them from product medians.

## What to exclude

Exclude `automated`, `old_or_test`, and `self_test` from the median and funnel numbers used for product conclusions. You may still show them as a traffic-mix table.

## What to report (required)

Always report **both**:

| number | definition |
|---|---|
| **raw median** | every session, no class filter |
| **human-only median** | `session_class = 'human_like'` only |

Plus session **counts** for each class (`automated`, `old_or_test`, `self_test`, `human_like`). A single "median retention = …" with no class split is **FAIL**.

Duration = `max(occurred_at) - min(occurred_at)` per `session_id` (wall clock). Game time can pause; do not use `max(game_time_sec)` as retention unless you label it as in-game time.

## Sample SQL

```sql
-- Session duration + automation / old-build classification.
-- Duration = max(occurred_at) - min(occurred_at).
-- UA is the table column user_agent (not payload).
-- playtest_events has NO ip column — IP diversity cannot be applied.
-- Replace :current_release with the live short SHA (payload->>'client_version').

WITH sessions AS (
  SELECT
    session_id,
    min(occurred_at) AS started_at,
    max(occurred_at) AS ended_at,
    extract(epoch FROM (max(occurred_at) - min(occurred_at))) AS duration_sec,
    count(*) AS n_events,
    max(user_agent) AS user_agent,
    bool_or(coalesce((payload->>'is_automation')::boolean, false)) AS flagged_automation,
    max(payload->>'client_version') AS client_version,
    count(*) FILTER (WHERE event_name IN ('button_hover_enter', 'mouse_move', 'mouse_batch')) AS hover_n,
    count(*) FILTER (WHERE event_name IN ('director_think', 'director_tool', 'save_write')) AS flood_n,
    count(*) FILTER (WHERE event_name = 'player_action') AS action_n
  FROM playtest_events
  GROUP BY session_id
),
classified AS (
  SELECT
    *,
    CASE
      WHEN flagged_automation THEN 'automated'
      WHEN user_agent ~* 'Headless|Playwright|Puppeteer|PhantomJS|Lighthouse'
        OR user_agent IS NULL
        OR length(coalesce(user_agent, '')) < 20
        THEN 'automated'
      WHEN client_version IS NULL
        OR client_version IN ('', 'dev', 'unknown', 'godot-dev')
        OR client_version IS DISTINCT FROM :current_release
        THEN 'old_or_test'
      WHEN duration_sec >= 120
        AND user_agent ~* 'Edg/155'
        THEN 'self_test'  -- tighten if a new self-test UA appears; do not treat as external
      WHEN n_events >= 20
        AND hover_n = 0
        AND flood_n >= 10
        THEN 'automated'
      ELSE 'human_like'
    END AS session_class,
    CASE
      WHEN duration_sec < 1 THEN '<1s'
      WHEN duration_sec < 5 THEN '1–5s'
      WHEN duration_sec < 15 THEN '5–15s'
      WHEN duration_sec < 60 THEN '15–60s'
      WHEN duration_sec < 120 THEN '1–2min'
      ELSE '>2min'
    END AS duration_bucket
  FROM sessions
)
SELECT
  session_class,
  count(*) AS n_sessions,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_sec) AS median_sec,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_sec)
    FILTER (WHERE session_class = 'human_like') AS human_only_median_sec
FROM classified
GROUP BY session_class
ORDER BY n_sessions DESC;

-- Headline pair (always quote both):
--   raw median     = percentile_cont(0.5) OVER all classified.duration_sec
--   human-only     = same FILTER (session_class = 'human_like')
```

Histogram (optional, useful when a 2–3s spike is all HeadlessChrome):

```sql
SELECT duration_bucket, session_class, count(*) AS n
FROM classified   -- same CTE as above
GROUP BY 1, 2
ORDER BY 1, 2;
```

## Pass / fail

- **PASS** — classification query run; raw median **and** human-only median reported; class counts listed; automated / old / self-test excluded from the product conclusion; IP limitation stated if IPs were requested.
- **FAIL** — a retention/funnel number is published from unfiltered rows, from `is_automation ≠ true` alone, or without the raw vs human-only pair.
- **SKIP** — no session-level PM metric is being computed.
- **INCONCLUSIVE** — no readable `playtest_events` rows (missing service/read key, empty table).

## Rule

`is_automation ≠ true` is a **weak** human filter. HeadlessChrome sessions in the 2026-10 finding had the same ~2.6s median as the "non-automated" set. Product conclusions need UA + timing + version (+ IP only if a column exists).
