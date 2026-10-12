#!/usr/bin/env python3
"""Regression: real mouse down/up (not element.click()) must light the fire.

Usage:
  test_real_mouse.py [base_url] [out_dir]
If base_url is omitted, serves godot/build/web on an ephemeral port.
"""
from __future__ import annotations

import http.server
import json
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "godot" / "build" / "web"
def real_click(page, text):
    loc = page.evaluate(
        """t => {
          const b = [...document.querySelectorAll('button,.button,[role=button]')]
            .find(el => el.textContent.trim().startsWith(t) && el.offsetParent);
          if (!b) return null;
          const r = b.getBoundingClientRect();
          return [r.x + r.width / 2, r.y + r.height / 2];
        }""",
        text,
    )
    if not loc:
        return False
    page.mouse.move(loc[0], loc[1])
    page.mouse.down()
    page.wait_for_timeout(80)
    page.mouse.up()
    page.wait_for_timeout(400)
    return True


def serve_local():
    os.chdir(WEB)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, fmt, *args):
            return

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    port = httpd.server_address[1]
    return httpd, f"http://127.0.0.1:{port}"


def main():
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/adr-real-mouse")
    out.mkdir(parents=True, exist_ok=True)
    httpd = None
    if len(sys.argv) > 1 and sys.argv[1].startswith("http"):
        base = sys.argv[1].rstrip("/")
    else:
        httpd, base = serve_local()

    result = {"url": base + "/", "PASS": False}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            errs, bad = [], []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("console", lambda m: m.type == "error" and errs.append(m.text))
            page.on("response", lambda r: r.status >= 400 and bad.append(f"{r.status} {r.url}"))
            page.goto(base + "/", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(800)

            title0 = page.inner_text("#panel-room h1")
            body = page.inner_text("body")
            result["title_before"] = title0
            result["has_wake"] = "醒来" in body
            assert title0.strip() == "小黑屋", title0
            assert "醒来" in body

            rebuilds = page.evaluate(
                """() => new Promise(r => {
                  let c = 0;
                  const o = new MutationObserver(m => { c += m.length; });
                  o.observe(document.getElementById('panel-room'), { childList: true });
                  setTimeout(() => { o.disconnect(); r(c); }, 1000);
                })"""
            )
            result["panel_room_mutations_per_sec"] = rebuilds
            assert rebuilds < 5, rebuilds

            alive = page.evaluate(
                """() => new Promise(r => {
                  const a = [...document.querySelectorAll('button.adr')]
                    .find(b => b.textContent.includes('生火'));
                  requestAnimationFrame(() => requestAnimationFrame(() => r(!!a && a.isConnected)));
                })"""
            )
            result["button_survives_2_frames"] = alive
            assert alive

            assert real_click(page, "生火"), "生火 not found"
            page.wait_for_timeout(600)
            title1 = page.inner_text("#panel-room h1")
            result["title_after_light"] = title1
            assert title1.strip() == "生火间", title1

            fire_label = page.evaluate(
                """() => {
                  const b = [...document.querySelectorAll('button.adr')]
                    .find(el => el.dataset.key === 'fire');
                  return b ? b.textContent.trim() : '';
                }"""
            )
            result["fire_label"] = fire_label
            assert "添柴" in fire_label

            assert real_click(page, "加速."), "加速. not found"
            hyper = page.inner_text("#btn-hyper")
            result["hyper_after"] = hyper
            assert "原速" in hyper

            assert real_click(page, "设置."), "设置. not found"
            page.wait_for_timeout(1500)
            settings = page.evaluate(
                """() => {
                  const ov = document.getElementById('overlay');
                  return {
                    mode: ov.dataset.mode,
                    shown: ov.classList.contains('show'),
                    heading: (ov.querySelector('h2') || {}).textContent || ''
                  };
                }"""
            )
            result["settings"] = settings
            assert settings["mode"] == "settings" and settings["shown"]
            assert "设置" in settings["heading"]

            page.evaluate(
                """() => {
                  const ov = document.getElementById('overlay');
                  ov.className = '';
                  ov.dataset.mode = '';
                  ov.innerHTML = '';
                }"""
            )
            page.wait_for_function(
                """() => {
                  const b = [...document.querySelectorAll('button.adr')]
                    .find(el => el.dataset.key === 'fire');
                  return b && !b.disabled && b.textContent.includes('添柴');
                }""",
                timeout=20000,
            )
            assert real_click(page, "添柴"), "添柴 not found"
            fire = page.evaluate("() => window.__ADR_GAME.state.fire")
            result["fire_after_stoke"] = fire
            assert fire >= 3

            ev = json.loads(page.evaluate("localStorage.getItem('adr.telemetry')") or "[]")
            names = sorted({e["event_name"] for e in ev})
            actions = [e["payload"].get("action") for e in ev if e["event_name"] == "player_action"]
            result["telemetry_events"] = names
            result["player_actions"] = actions
            assert "player_action" in names
            assert "light_fire" in actions
            assert "stoke_fire" in actions
            assert "set_timescale" in actions

            result["console_errors"] = errs
            result["bad_requests"] = [x for x in bad if "google-analytics" not in x]
            assert not result["console_errors"], result["console_errors"]

            page.screenshot(path=str(out / "real_mouse.png"), full_page=True)
            browser.close()
            result["PASS"] = True
    finally:
        if httpd:
            httpd.shutdown()

    (out / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["PASS"] else 1)


if __name__ == "__main__":
    main()
