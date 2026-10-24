#!/bin/sh
# Test-only wrapper: runs the real near-sandbox with the rlimit shim.
# Usage: NEAR_SANDBOX_BIN_PATH=tools/sandbox-shim/run-sandbox.sh with
# REAL_NEAR_SANDBOX pointing at the downloaded binary.
DIR=$(cd "$(dirname "$0")" && pwd)
LD_PRELOAD="$DIR/rlimit_shim.so${LD_PRELOAD:+:$LD_PRELOAD}" exec "$REAL_NEAR_SANDBOX" "$@"
