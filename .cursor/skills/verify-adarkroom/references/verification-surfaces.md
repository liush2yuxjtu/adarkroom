# Project surface index

A surface is the actual runtime boundary a user or downstream program consumes. Following `dot-pi` verify, drive that boundary on the LIVE Vercel deployment and collect its observed behavior. Helpers (`scripts/*`), localStorage dumps and Vercel READY are evidence or drivers, not surfaces.

| Surface | Public caller boundary | Operational recipe |
| --- | --- | --- |
| `vercel-live-deploy` | The deployment for the candidate commit: Vercel deployment state, aliased URL, HTTP status/content-type of `/`, `/classic/` and every asset | [Vercel live deploy](vercel-live-deploy.md) |
| `browser-remake` | Real mouse clicks on the LIVE `/` page in headless Chromium (Playwright) plus DevTools/CDP inspection of the same page | [Browser: Playwright + CDP](browser-playwright-cdp.md) |
| `supabase-telemetry` | Live page events → anon `POST /rest/v1/playtest_events` → rows in `adarkroom-telemetry.public.playtest_events` read back on the service side | [Supabase telemetry end-to-end](supabase-telemetry.md) |
| `classic-subpath` | Real mouse click on the LIVE original game at `/classic/?lang=zh_cn` | [Classic sub-path](classic-subpath.md) |

`localStorage['adr.telemetry']` is a check inside `browser-remake`, not a backend proof. A local or VM build is not any of these surfaces.

## Maintain the index

For a new user-facing behavior, follow the changed code to its live caller and add or maintain the matching recipe. Persist only commands, readiness, drive, evidence and cleanup that actually worked.
