#!/usr/bin/env bash
# Run the migration review gate. Exit 0 = REVIEW PASS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
exec node tools/verify/run.mjs --only migration "$@"
