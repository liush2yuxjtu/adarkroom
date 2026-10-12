#!/usr/bin/env bash
# Chrome DevTools Protocol inspection of the LIVE remake. Usage: cdp_inspect.sh <base_url> [out_dir]
set -u; B=${1%/}; OUT=${2:-/workspace/adr-verify}; PORT=9333; mkdir -p "$OUT"
CH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome | tail -1)
"$CH" --headless=new --remote-debugging-port=$PORT --no-sandbox --user-data-dir=$(mktemp -d) about:blank >/dev/null 2>&1 & CPID=$!
trap 'kill $CPID 2>/dev/null' EXIT
for i in $(seq 20); do curl -s localhost:$PORT/json/version >/dev/null && break; sleep 0.3; done
/workspace/.pwvenv/bin/python - "$B/" "$PORT" "$OUT" <<'PY'
import json,sys
from playwright.sync_api import sync_playwright
U,PORT,OUT=sys.argv[1],sys.argv[2],sys.argv[3]
with sync_playwright() as p:
    b=p.chromium.connect_over_cdp(f"http://localhost:{PORT}"); ctx=b.contexts[0]; pg=ctx.new_page(); s=ctx.new_cdp_session(pg)
    ex,fail,bad,logs=[],[],[],[]
    for d in ("Runtime.enable","Network.enable","Log.enable"): s.send(d)
    s.on("Runtime.exceptionThrown",lambda e: ex.append(e["exceptionDetails"].get("text")))
    s.on("Network.loadingFailed",lambda e: fail.append(e.get("errorText")))
    s.on("Network.responseReceived",lambda e: e["response"]["status"]>=400 and bad.append((e["response"]["status"],e["response"]["url"])))
    s.on("Log.entryAdded",lambda e: logs.append((e["entry"]["level"],e["entry"]["text"][:160])))
    pg.goto(U,wait_until="networkidle"); pg.wait_for_timeout(1500)
    hit=pg.evaluate("""()=>[...document.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect(),t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:b.textContent.trim(),disabled:b.disabled,top:t===b?'self':(t?t.tagName+'#'+t.id:null)}})""")
    o=s.send("Runtime.evaluate",{"expression":"[...document.querySelectorAll('button.adr')].find(b=>b.textContent.startsWith('生火'))"})["result"]
    lst=[l["type"] for l in s.send("DOMDebugger.getEventListeners",{"objectId":o["objectId"]})["listeners"]] if "objectId" in o else None
    alive=pg.evaluate("""()=>new Promise(r=>{const a=[...document.querySelectorAll('button.adr')].find(b=>b.textContent.startsWith('生火'));requestAnimationFrame(()=>requestAnimationFrame(()=>r(a.isConnected)))})""")
    rebuilds=pg.evaluate("""()=>new Promise(r=>{let c=0;const o=new MutationObserver(m=>c+=m.length);o.observe(document.getElementById('panel-room'),{childList:true});setTimeout(()=>{o.disconnect();r(c)},1000)})""")
    res=dict(url=U,runtime_exceptions=ex,loading_failed=fail,http_4xx_5xx=bad,log_entries=logs,buttons_hit_test=hit,stoke_listeners=lst,stoke_button_survives_2_frames=alive,panel_room_mutations_per_sec=rebuilds)
    res["PASS"]=not ex and not bad and alive and rebuilds<5
    json.dump(res,open(f"{OUT}/cdp.json","w"),ensure_ascii=False,indent=1); print(json.dumps(res,ensure_ascii=False,indent=1)); pg.close()
    sys.exit(0 if res["PASS"] else 1)
PY
