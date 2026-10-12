#!/usr/bin/env python3
"""Drive the remake preview and exercise detailed telemetry (mouse, hover, visibility, reload, save)."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


NEED = [
    "session_start",
    "player_action",
    "director_think",
    "director_tool",
    "dialogue",
    "resource_snapshot",
    "tab_hidden",
    "tab_visible",
    "mouse_trajectory",
    "button_hover_enter",
    "button_hover_exit",
    "click_heat",
    "scroll",
    "js_error",
    "load_performance",
    "audio_play",
    "page_unload",
    "page_reload",
]


def names_from(page):
    return page.evaluate(
        """() => {
          try {
            const raw = localStorage.getItem('adr.telemetry') || '[]';
            return JSON.parse(raw).map(e => e.event_name);
          } catch (e) { return []; }
        }"""
    )


def session_id(page):
    return page.evaluate(
        """() => {
          const g = window.__ADR_GAME;
          if (g && g.state && g.state.session_id) return g.state.session_id;
          if (window.ADRTelemetry && ADRTelemetry.sessionId) return ADRTelemetry.sessionId();
          return null;
        }"""
    )


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: verify_detailed_telemetry.py <base_url> [outdir]")
        return 2
    url = sys.argv[1].rstrip("/") + "/?fast=1"
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "/workspace/adr-verify")
    out.mkdir(parents=True, exist_ok=True)
    result = {"url": url, "ok": False}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_function("() => window.__ADR_GAME && window.__ADR_GAME.state", timeout=15000)
        sid1 = session_id(page)
        result["session_id_1"] = sid1

        fire = page.locator('button.adr[data-key="fire"]')
        fire.wait_for(timeout=10000)
        box = fire.bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        time.sleep(0.35)
        page.mouse.move(box["x"] + 8, box["y"] + 8)
        time.sleep(0.2)
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down()
        time.sleep(0.08)
        page.mouse.up()
        page.wait_for_timeout(400)

        hyper = page.locator("#btn-hyper")
        hb = hyper.bounding_box()
        page.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2)
        time.sleep(0.25)
        page.mouse.move(20, 20)

        page.evaluate(
            """() => {
              const n = document.getElementById('notifications');
              if (n) { n.scrollTop = 40; n.dispatchEvent(new Event('scroll', {bubbles:true})); }
              window.scrollTo(0, 80);
              window.dispatchEvent(new Event('scroll'));
            }"""
        )
        page.evaluate("() => { throw new Error('telemetry-probe-error'); }")
        page.evaluate(
            """() => {
              window.dispatchEvent(new Event('unhandledrejection'));
              Promise.reject(new Error('telemetry-probe-rejection'));
            }"""
        )

        page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
        page.evaluate(
            """() => {
              Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => 'hidden'});
              document.dispatchEvent(new Event('visibilitychange'));
            }"""
        )
        page.evaluate(
            """() => {
              Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => 'visible'});
              document.dispatchEvent(new Event('visibilitychange'));
            }"""
        )

        # Give the batcher a moment; then reload to emit page_unload + page_reload.
        page.wait_for_timeout(3500)
        page.reload(wait_until="networkidle")
        page.wait_for_function("() => window.__ADR_GAME && window.__ADR_GAME.state", timeout=15000)
        sid2 = session_id(page)
        result["session_id_2"] = sid2

        save_info = page.evaluate(
            """() => {
              const keys = [];
              for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
              const saveKeys = keys.filter(k => /save|adr\\.game|game_state/i.test(k || ''));
              const g = window.__ADR_GAME;
              return {
                keys,
                saveKeys,
                hasSave: !!(g && (g.save || g.persist || g.writeSave || (g.saveSystem && g.saveSystem.write))),
                hasADRSave: !!(window.ADRSave || (window.ADR && ADR.Save)),
                saveId: g && g.state && g.state.save_id || null
              };
            }"""
        )
        result["save_probe"] = save_info

        if save_info.get("hasSave") or save_info.get("hasADRSave") or save_info.get("saveKeys"):
            page.evaluate(
                """() => {
                  const g = window.__ADR_GAME;
                  if (g && typeof g.save === 'function') g.save();
                  else if (g && typeof g.persist === 'function') g.persist();
                  else if (window.ADRSave && typeof ADRSave.write === 'function') ADRSave.write(g && g.state);
                }"""
            )
            page.wait_for_timeout(400)
            page.reload(wait_until="networkidle")
            page.wait_for_function("() => window.__ADR_GAME && window.__ADR_GAME.state", timeout=15000)
            page.evaluate(
                """() => {
                  const keys = [];
                  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
                  const sk = keys.find(k => /save/i.test(k || '') && !/corrupt|telemetry|config/.test(k || ''));
                  if (!sk) return false;
                  const raw = localStorage.getItem(sk);
                  localStorage.setItem(sk, raw ? raw.slice(0, Math.max(10, raw.length/2)) + '{broken' : '{');
                  if (window.ADRSaveTelemetry) {
                    ADRSaveTelemetry.onSaveCorrupt({reason:'schema', raw: localStorage.getItem(sk), backend:'localStorage'});
                  }
                  return true;
                }"""
            )
            page.locator("#btn-restart").click()
            page.once("dialog", lambda d: d.accept())
            page.wait_for_timeout(500)
            if page.locator("#btn-restart").count():
                page.evaluate("() => { if (window.__ADR_GAME) window.__ADR_GAME.act('restart'); }")

        page.wait_for_timeout(4000)
        result["local_names"] = sorted(set(names_from(page)))
        result["session_id_final"] = session_id(page)
        page.screenshot(path=str(out / "telemetry.png"))
        browser.close()

    result["ok"] = True
    (out / "telemetry_result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
