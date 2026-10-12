# Surface `pr-telemetry-required`

Every PR must come with matching telemetry. Mandatory for (a) bug-fix PRs and (b) PRs that address a question existing data could not answer.

This surface is **not** the backend telemetry end-to-end sink check in `SKILL.md`. That check proves an existing sink works. This surface requires the PR itself to add the event types that can verify the fix or answer the question.

## Triggers

Run this surface when any of these hold:

- PR title, labels, or commits contain `fix`, `bug`, or `修复`
- a linked issue is marked as a data question (existing `playtest_events` rows could not answer it)

Skip only when the PR is neither a bug fix nor a data-question change.

## Required instrumentation

Use the project's existing telemetry pipeline. Write to the Supabase `playtest_events` table:

| column | role |
|---|---|
| `session_id` | session marker |
| `event_name` | event type |
| `occurred_at` | wall-clock timestamp |
| `game_time_sec` | in-game time (pauses independently of wall clock) |
| `phase` | game phase |
| `payload` | jsonb fields for this event type |

Do not create a parallel pipeline. Do not invent `event_name`s that are not in the diff.

## Output

All three are required. If any is missing, **FAIL**:

1. **Problem or question** linked to the PR (issue/PR URL plus one-sentence claim).
2. **New event type(s)** with payload fields (each `event_name` and the jsonb keys it writes).
3. **Verification method**: the SQL query or test, and evidence that rows landed (result for a real session marker, or an equivalent test log).

`localStorage` alone is not landed-row evidence.

## Pass / fail

- **PASS** — all three outputs present; event types exist in the PR diff; query/test evidence shows rows landed.
- **FAIL** — any of the three outputs is missing, the events are not in the diff, or no rows landed.
- **SKIP** — the PR is neither a bug fix nor a data-question change.

## Worked example: A Dark Room save loss on refresh

**Problem.** Refreshing the tab dropped the save; existing events could not tell write vs load vs corrupt vs a new game.

**New event types.**

| event_name | payload fields |
|---|---|
| `save_write` | slot, bytes, ok |
| `save_load` | slot, ok, missing |
| `save_corrupt` | slot, reason |
| `new_game_start` | source (`refresh` / `explicit`) |

**Verification query.** Sessions that restart within seconds of a `save_load`, or that emit `save_corrupt` after refresh:

```sql
SELECT
  a.session_id,
  a.event_name AS first_event,
  a.occurred_at AS first_at,
  b.event_name AS next_event,
  b.occurred_at AS next_at,
  EXTRACT(EPOCH FROM (b.occurred_at - a.occurred_at)) AS gap_sec
FROM playtest_events a
JOIN playtest_events b
  ON a.session_id = b.session_id
 AND b.occurred_at > a.occurred_at
WHERE a.event_name IN ('save_load', 'save_corrupt')
  AND b.event_name IN ('new_game_start', 'save_load', 'save_corrupt')
  AND EXTRACT(EPOCH FROM (b.occurred_at - a.occurred_at)) <= 5
ORDER BY a.occurred_at;
```

**Evidence.** PASS needs this query (or an equivalent test) plus rows for a real refresh session on the candidate.
