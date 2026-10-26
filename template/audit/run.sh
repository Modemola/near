#!/bin/sh
# One command: build the site (with pre-rendering), serve it, and audit it.
#   audit/run.sh [out-dir]         everything (about 15 minutes)
#   QUICK=1 audit/run.sh [out]     skip Lighthouse and use 5 screen sizes
# Needs: npm install in web/ and here. Chromium comes from Playwright
# (npx playwright install chromium), or set CHROME=/path/to/chrome.
set -e
cd "$(dirname "$0")"
OUT=$(cd .. && mkdir -p "${1:-audit-out}" && cd "${1:-audit-out}" && pwd)
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}"
(cd ../web && npm run build >"$OUT/build.log" 2>&1) || { echo "build failed: see $OUT/build.log"; exit 1; }
(cd ../web && exec npx vite preview --port 4179 --strictPort >"$OUT/preview.log" 2>&1) &
PREVIEW=$!
trap 'kill $PREVIEW 2>/dev/null || true' EXIT INT TERM
for _ in $(seq 1 30); do curl -s -o /dev/null http://localhost:4179/ && break; sleep 1; done
BASE=http://localhost:4179
if [ -n "$QUICK" ]; then
  node responsive.mjs "$BASE" "$OUT/responsive" se,iphone,ipad-mini,laptop-720,fhd
else
  node responsive.mjs "$BASE" "$OUT/responsive"
fi
node ui-audit.mjs "$BASE" "$OUT"
[ -n "$QUICK" ] || node lighthouse.mjs "$BASE" "$OUT"
echo
echo "Reports in $OUT: responsive/responsive.txt, ui-audit.txt, lighthouse.txt"
