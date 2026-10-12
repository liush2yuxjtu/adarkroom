# Classic sub-path surface

## Reference run (2026-10-12, PASS)

| Item | Value |
|---|---|
| URL | https://adarkroom-zh-git-cursor-godot-chi-149f09-nyn5255-8475s-projects.vercel.app/classic/?lang=zh_cn |
| HTTP | `200` |
| Drive | `scripts/verify_live.py`: real mouse click on the `生火` element |
| Result | `document.title` `小黑屋` → `生火间`; notification `火光映出窗外，投入黑暗之中.` / `火堆燃烧着.` |
| Console / network | No errors. Only an aborted google-analytics beacon (`net::ERR_ABORTED`), ignored |
| localStorage | `lang`, `gameState` (no `adr.telemetry` here) |
| Evidence | `/workspace/adr-verify/classic.png`, `result.json` |

## Expected flow and pass criteria

Open the URL, assert `小黑屋`, real-mouse click `生火`, and assert the title is `生火间`. No console errors and no 4xx/5xx.

## Reproduce

Part of `scripts/verify_live.py <base_url>`.

## Known limitations

This surface working does not imply the remake at `/` works. They are separate codebases.
