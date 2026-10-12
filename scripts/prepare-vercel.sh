#!/usr/bin/env bash
# Assemble the static site: remake at / and the original JS game at /classic/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
rm -rf "$DIST"
mkdir -p "$DIST" "$DIST/classic"

cp -a "$ROOT/godot/build/web/." "$DIST/"
mkdir -p "$DIST/data"
if [[ -d "$ROOT/godot/data" ]]; then
  cp -a "$ROOT/godot/data/." "$DIST/data/"
  mkdir -p "$DIST/godot/data"
  cp -a "$ROOT/godot/data/." "$DIST/godot/data/"
fi

# Original game, intact, under /classic/
cp "$ROOT/index.html" "$DIST/classic/index.html"
for d in script css lib lang img audio; do
  if [[ -d "$ROOT/$d" ]]; then
    cp -a "$ROOT/$d" "$DIST/classic/"
  fi
done
for f in favicon.ico mobileWarning.html browserWarning.html; do
  if [[ -f "$ROOT/$f" ]]; then
    cp "$ROOT/$f" "$DIST/classic/"
  fi
done

# Static site: inject Vercel SUPABASE_* at build time (empty = localStorage-only).
python3 - "$DIST/telemetry-config.js" "${SUPABASE_URL:-}" "${SUPABASE_ANON_KEY:-}" "${TELEMETRY_DEBUG:-}" <<'PY'
import json, sys
dest, raw_url, key, debug_raw = sys.argv[1], sys.argv[2].strip(), sys.argv[3].strip(), sys.argv[4].strip().lower()
url = ""
if raw_url and key:
    base = raw_url.rstrip("/")
    url = base if base.endswith("/rest/v1/playtest_events") else base + "/rest/v1/playtest_events"
debug = debug_raw in ("1", "true", "yes")
with open(dest, "w", encoding="utf-8") as f:
    f.write("self.ADR_TELEMETRY = { url: %s, anonKey: %s, debug: %s };\n" % (
        json.dumps(url), json.dumps(key), "true" if debug else "false"))
print("Wrote telemetry-config.js (%s, debug=%s)" % ("Supabase REST sink enabled" if url else "localStorage-only; SUPABASE_* unset", debug))
PY

echo "Prepared $DIST"
