#!/usr/bin/env bash
# Export the Godot project to HTML5 (no threads) when the editor + templates
# are installed. The committed godot/build/web runtime is the playable fallback
# used by Vercel and local verification.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
GODOT="${GODOT_BIN:-godot}"
if ! command -v "$GODOT" >/dev/null 2>&1; then
  if [[ -x /opt/godot/godot ]]; then
    GODOT=/opt/godot/godot
  fi
fi
if ! command -v "$GODOT" >/dev/null 2>&1 && [[ ! -x "$GODOT" ]]; then
  echo "Godot editor not found. Using the committed HTML5 runtime in build/web."
  exit 0
fi
mkdir -p "$ROOT/build/web"
# Preserve the JS runtime if the export template is missing.
"$GODOT" --headless --path "$ROOT" --export-release "Web" "$ROOT/build/web/index.html" || {
  echo "Godot export failed; leaving committed web runtime in place."
  exit 0
}
