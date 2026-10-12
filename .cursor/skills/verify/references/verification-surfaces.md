# Verification surfaces

Each named surface is a separate check. Do not merge two surfaces into one verdict. The word is **surface**, never "service".

Surfaces are the **judgment** layer. The **execution** layer is the pre-merge checklist in [`concrete-verification-steps.md`](concrete-verification-steps.md). Do not add those steps as rows here.

| Surface | Public caller boundary | Operational recipe |
|---|---|---|
| `vercel-live-deploy` | LIVE deployment URL: real mouse input + visible state change | [`../SKILL.md`](../SKILL.md#vercel-deployment-playability-check-web-games--web-apps) |
| `<sink>-telemetry` | live client action + sink-side DB read-back by session marker | [`../SKILL.md`](../SKILL.md#backend-telemetry-end-to-end-check-eg-supabase) |
| `aesthetic-community-consensus` | community threads actually opened for a UI/font/visual-style choice | [`aesthetic-community-consensus.md`](aesthetic-community-consensus.md) |
| `pr-telemetry-required` | bug-fix or data-question PR must ship `playtest_events` instrumentation | [`pr-telemetry-required.md`](pr-telemetry-required.md) |
| `behavior-timeline-vs-mechanics` | unusual action frequency judged against code mechanic values | [`behavior-timeline-vs-mechanics.md`](behavior-timeline-vs-mechanics.md) |
| `verification-scope-mismatch` | UI/render/interaction issue checked on every code path, render layer, and deploy target | [`verification-scope-mismatch.md`](verification-scope-mismatch.md) |
| `game-pacing-intent` | verify auto-calls repo-root `tools/pacing_analyzer.py` on every `/verify`; intent question, never a bug | [`pacing-intent-check.md`](pacing-intent-check.md) |
| `art-style-boredom-mitigation` | same early-wait as the analyzer: can the active art style carry Rajan timed text? | [`art-style-boredom-mitigation.md`](art-style-boredom-mitigation.md) |
| `wrong-repo-pr` | game-code / game-verification PR must target `liush2yuxjtu/adarkroom`, not `dot-pi` | [`wrong-repo-pr.md`](wrong-repo-pr.md) |
| `original-intent-check` | UI/art/interaction proposal checked against the original's implementation and design intent | [`original-intent-check.md`](original-intent-check.md) |

The eight judgment-layer surfaces are the last eight rows. `vercel-live-deploy` and `<sink>-telemetry` are operational surfaces; their Drive recipes for this remake live in [`.cursor/skills/verify-adarkroom/`](../../verify-adarkroom/SKILL.md). Project verifiers add one row per extra public boundary (`browser-<app>`, one per sub-path app) and one recipe file per row.
