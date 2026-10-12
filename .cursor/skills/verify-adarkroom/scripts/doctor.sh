#!/usr/bin/env bash
# Read-only: is this deployment worth driving? Usage: doctor.sh <base_url>
B=${1%/}; rc=0
for p in / "/classic/?lang=zh_cn" /engine.js /ui.js /telemetry.js /save-telemetry.js /adr.css /data/events.json; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$B$p"); echo "$c $p"; [ "$c" = 200 ] || rc=1
done
[ $rc = 1 ] && echo "non-200 (302 = Vercel Authentication on: disable ssoProtection or use a protection bypass)"
exit $rc
