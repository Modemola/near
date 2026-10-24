#!/bin/sh
# Run the contract's unit tests and its sandbox integration tests.
set -e
cd "$(dirname "$0")/.."
cargo test --lib
cargo test --test integration --no-run
# near-sandbox raises its open-file limit to 65535. Where the hard limit is
# lower (some containers), run it through a test-only shim that clamps the
# request instead of failing.
hard=$(ulimit -Hn)
if [ "$hard" != unlimited ] && [ "$hard" -lt 65535 ]; then
    gcc -shared -fPIC -O2 -o tools/sandbox-shim/rlimit_shim.so tools/sandbox-shim/rlimit_shim.c -ldl
    REAL_NEAR_SANDBOX=$(find target -name near-sandbox -type f -perm -u+x | head -1)
    NEAR_SANDBOX_BIN_PATH="$PWD/tools/sandbox-shim/run-sandbox.sh"
    export REAL_NEAR_SANDBOX NEAR_SANDBOX_BIN_PATH
fi
cargo test --test integration -- --test-threads=4
