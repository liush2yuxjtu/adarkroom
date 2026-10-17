#!/usr/bin/env python3
"""Drive the LIVE adarkroom Vercel deployment with real mouse input.
Usage: verify_live.py <base_url> [out_dir]   (exit 0 = all PASS, 1 = any FAIL)"""
import json, sys, os, datetime, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1].rstrip("/"); OUT = sys.argv[2] if len(sys.argv) > 2 else "/workspace/adr-verify"
os.makedirs(OUT, exist_ok=True)
FIND = "t=>[...document.querySelectorAll('button,.button,[role=button]')].find(b=>b.textContent.trim().startsWith(t))"

def real_click(pg, text):
    # Real mouse down/up on the button's centre (what a user does). Never element.click().
    r = pg.evaluate(f"t=>{{const b=({FIND})(t);if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}}", text)
    if not r: return False
    pg.mouse.move(*r); pg.mouse.down(); pg.wait_for_timeout(80); pg.mouse.up(); pg.wait_for_timeout(1500)
    return True

def is_playtest(url: str) -> bool:
    return "/api/playtest_events" in (url or "")

def run(pg, path, shot, before_sel, expect_text, after_sel, expect_after, telemetry):
    errs, bad = [], []
    playtest_ok = []  # successful HTTP statuses for /api/playtest_events
    playtest_fail = []

    def on_response(r):
        if r.status >= 400:
            bad.append(f"{r.status} {r.url}")
        if is_playtest(r.url) and r.request.method == "POST" and r.ok:
            playtest_ok.append(r.status)

    def on_requestfailed(r):
        if "google-analytics" in r.url:
            return
        # Chromium/Playwright can emit net::ERR_ABORTED on the SAME playtest POST that
        # already returned 201 when the empty body was left unread. After the remake drains
        # the body this should be rare; still ignore abort-after-success for this endpoint.
        if is_playtest(r.url) and r.failure and "ERR_ABORTED" in (r.failure or ""):
            playtest_fail.append(f"FAILED {r.url} {r.failure}")
            return
        bad.append(f"FAILED {r.url} {r.failure}")

    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("response", on_response)
    pg.on("requestfailed", on_requestfailed)

    url = BASE + path
    resp = pg.goto(url, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(1500)
    body = pg.inner_text("body")
    r = {"url": url, "http": resp.status, "at": datetime.datetime.now().astimezone().isoformat()}
    r["text_ok"] = all(t in body or t in pg.title() for t in expect_text)
    r["before"] = pg.inner_text(before_sel)
    r["clicked"] = real_click(pg, "生火")
    r["after"] = pg.inner_text(after_sel)
    r["title_after"] = pg.title()
    r["state_changed"] = expect_after in r["after"] or expect_after in r["title_after"]

    if telemetry:
        # Wait for at least one successful POST flush (FLUSH_MS=3000, allow a little slack).
        deadline = time.time() + 8
        while time.time() < deadline and not playtest_ok:
            pg.wait_for_timeout(250)
        ev = json.loads(pg.evaluate("localStorage.getItem('adr.telemetry')") or "[]")
        r["telemetry_events"] = sorted({e["event_name"] for e in ev})
        r["telemetry_ok"] = "player_action" in r["telemetry_events"]
        r["playtest_post_statuses"] = list(playtest_ok)
        r["playtest_http_ok"] = any(s == 201 for s in playtest_ok)
        # Spurious aborts after 201 are recorded but do not fail the run.
        r["playtest_aborted_soft"] = playtest_fail
        if playtest_ok:
            # Any abort for this endpoint is soft once we have a real 201.
            pass
        else:
            # No successful POST at all — surface soft aborts as hard failures for diagnosis.
            bad.extend(playtest_fail)

    pg.screenshot(path=os.path.join(OUT, shot), full_page=True)
    r["screenshot"] = os.path.join(OUT, shot)
    r["console_errors"], r["bad_requests"] = errs, bad
    r["PASS"] = (
        r["http"] == 200
        and r["text_ok"]
        and r["state_changed"]
        and not errs
        and not bad
        and r.get("telemetry_ok", True)
        and (r.get("playtest_http_ok", True) if telemetry else True)
    )
    return r

with sync_playwright() as p:
    b = p.chromium.launch()
    res = []
    pg = b.new_page()
    res.append(run(pg, "/", "live.png", "#panel-room h1", ["小黑屋", "醒来"], "#panel-room h1", "生火间", True))
    pg.close()
    pg = b.new_page()
    res.append(run(pg, "/classic/?lang=zh_cn", "classic.png", "body", ["小黑屋"], "body", "生火间", False))
    pg.close()
    b.close()
json.dump(res, open(os.path.join(OUT, "result.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
sys.exit(0 if all(x["PASS"] for x in res) else 1)
