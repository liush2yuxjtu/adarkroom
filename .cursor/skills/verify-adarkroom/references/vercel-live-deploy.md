# Vercel live deploy surface

## Reference run (2026-10-12, PASS for reachability only)

| Item | Value |
|---|---|
| Deployment | `dpl_2nVj2PzELqQvVRrtsRpb3yYhfHXU`, project `adarkroom-zh` (`prj_1WsPEjMzI5vGzejo0gaFFx7Q4pR7`), team `team_1VUYYia3RReNLUn2r8ciX2Nb` |
| Commit | `fbdc4e1c513586ad6e6c03137afe76bf9b3198fe` on `cursor/godot-chinese-remake-5c3a` |
| URL | https://adarkroom-zh-git-cursor-godot-chi-149f09-nyn5255-8475s-projects.vercel.app/ |
| State | `get_deployment` → `readyState: READY`; build log `Prepared /vercel/path0/dist`, `Build Completed` |
| HTTP | `/`, `/classic/?lang=zh_cn`, `engine.js`, `ui.js`, `adr.css`, `data/*.json`, `sinks/supabase.js` all `200` with correct content-type (`application/javascript`, `text/css`, `application/json`); no 302, no HTML-for-JS rewrite |
| Headers | COOP `same-origin`, COEP `require-corp`, CORP `same-origin` from `vercel.json`; they do not block same-origin scripts |
| MCP gaps | `list_deployment_files` → 404 "File tree not found" and `get_runtime_logs` → team not authorized for this connection (static deploy, no functions) |

## Expected flow and pass criteria

1. Vercel MCP `get_deployment`: `readyState == READY`, `meta.githubCommitSha` == candidate, `alias` contains the URL under test.
2. `list_deployment_events`: the build log shows `dist` prepared and the build completed.
3. `list_deployment_files` / `get_runtime_logs` when authorized: JS assets present, no runtime errors.
4. `web_fetch_vercel_url` on `/ui.js`, `/engine.js`, `/data/config.json`, and `scripts/doctor.sh <url>`: every line `200`. `302` = Vercel Authentication on (disable `ssoProtection` or use a protection bypass).

PASS here only means the deployment is reachable. It is never a playability PASS.

## Reproduce

```bash
.cursor/skills/verify-adarkroom/scripts/doctor.sh <base_url>
```

## Known limitations

The MCP connection may lack access to the team. Report it and fall back to curl. Never conclude "works" from this surface alone (incident 2026-10-12).
