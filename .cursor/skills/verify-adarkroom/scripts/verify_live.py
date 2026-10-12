#!/usr/bin/env python3
"""Drive the LIVE adarkroom Vercel deployment with real mouse input.
Usage: verify_live.py <base_url> [out_dir]   (exit 0 = all PASS, 1 = any FAIL)"""
import json, sys, os, datetime, urllib.request
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
def run(pg, path, shot, before_sel, expect_text, after_sel, expect_after, telemetry):
    errs, bad = [], []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("response", lambda r: r.status >= 400 and bad.append(f"{r.status} {r.url}"))
    pg.on("requestfailed", lambda r: "google-analytics" not in r.url and bad.append(f"FAILED {r.url} {r.failure}"))
    url = BASE + path; resp = pg.goto(url, wait_until="networkidle", timeout=60000); pg.wait_for_timeout(1500)
    body = pg.inner_text("body"); r = {"url": url, "http": resp.status, "at": datetime.datetime.now().astimezone().isoformat()}
    r["text_ok"] = all(t in body or t in pg.title() for t in expect_text)
    r["before"] = pg.inner_text(before_sel)
    r["clicked"] = real_click(pg, "生火")
    r["after"] = pg.inner_text(after_sel); r["title_after"] = pg.title()
    r["state_changed"] = expect_after in r["after"] or expect_after in r["title_after"]
    if telemetry:
        ev = json.loads(pg.evaluate("localStorage.getItem('adr.telemetry')") or "[]")
        r["telemetry_events"] = sorted({e["event_name"] for e in ev}); r["telemetry_ok"] = "player_action" in r["telemetry_events"]
    pg.screenshot(path=os.path.join(OUT, shot), full_page=True); r["screenshot"] = os.path.join(OUT, shot)
    r["console_errors"], r["bad_requests"] = errs, bad
    r["PASS"] = r["http"] == 200 and r["text_ok"] and r["state_changed"] and not errs and not bad and r.get("telemetry_ok", True)
    return r
with sync_playwright() as p:
    b = p.chromium.launch(); res = []
    pg = b.new_page(); res.append(run(pg, "/", "live.png", "#panel-room h1", ["小黑屋", "醒来"], "#panel-room h1", "生火间", True)); pg.close()
    pg = b.new_page(); res.append(run(pg, "/classic/?lang=zh_cn", "classic.png", "body", ["小黑屋"], "body", "生火间", False)); pg.close()
    b.close()
json.dump(res, open(os.path.join(OUT, "result.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1)); sys.exit(0 if all(x["PASS"] for x in res) else 1)
