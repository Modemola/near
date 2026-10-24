#!/bin/sh
# One command for the end-to-end test: a fresh local NEAR sandbox with the real
# Proctor contract and the mock OutLayer, the keeper answering grading jobs,
# the web app in e2e mode, and a browser clicking through every flow.
# Everything runs locally and is removed afterwards.
#
# Needs: contract/scripts/test.sh run once (builds the wasm and downloads
# near-sandbox), npm install in web/ and here, and Playwright with Chromium.
set -e
cd "$(dirname "$0")"
REPO=$(cd ../.. && pwd)
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}"
WORK=$(mktemp -d)
SANDBOX=$(find "$REPO/contract/target" -name near-sandbox -type f -perm -u+x | head -1)
[ -n "$SANDBOX" ] || { echo "near-sandbox not found: run contract/scripts/test.sh once"; exit 1; }
[ -f "$REPO/contract/target/near/proctor.wasm" ] || { echo "contract wasm not found: run contract/scripts/test.sh once"; exit 1; }

# Containers with a low open-file limit need the test shim (see contract/tools).
RUN_SANDBOX="$SANDBOX"
hard=$(ulimit -Hn)
if [ "$hard" != unlimited ] && [ "$hard" -lt 65535 ]; then
  gcc -shared -fPIC -O2 -o "$REPO/contract/tools/sandbox-shim/rlimit_shim.so" "$REPO/contract/tools/sandbox-shim/rlimit_shim.c" -ldl
  export REAL_NEAR_SANDBOX="$SANDBOX"
  RUN_SANDBOX="$REPO/contract/tools/sandbox-shim/run-sandbox.sh"
fi

cleanup() {
  kill "$SBX" "$KEEPER" "$VITE" 2>/dev/null || true
  rm -f "$REPO/web/.env.e2e.local"
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

"$RUN_SANDBOX" --home "$WORK/chain" init >"$WORK/init.log" 2>&1
"$RUN_SANDBOX" --home "$WORK/chain" run >"$WORK/sandbox.log" 2>&1 &
SBX=$!
for _ in $(seq 1 60); do
  curl -s -o /dev/null -X POST http://127.0.0.1:3030 -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"status","params":[]}' && break
  sleep 1
done

node chain.mjs "$WORK/chain" "$WORK/env.json"
node keeper.mjs "$WORK/env.json" >"$WORK/keeper.log" 2>&1 &
KEEPER=$!
VITE_BIN="$REPO/web/node_modules/.bin/vite"
(cd "$REPO/web" && exec "$VITE_BIN" --mode e2e --port 5174 --strictPort >"$WORK/vite.log" 2>&1) &
VITE=$!
for _ in $(seq 1 60); do curl -s -o /dev/null http://localhost:5174/ && break; sleep 1; done

node browser.mjs http://localhost:5174
