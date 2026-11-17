#!/usr/bin/env bash
# Builds Carcara for wasm32-unknown-emscripten. Run inside the Dockerfile's build stage, in the Carcara source tree.
# Env: GMP_WASM_PREFIX (GMP built with emcc), PROFILE (cargo profile, default release-lto), OUT (output dir).
set -euo pipefail
: "${GMP_WASM_PREFIX:?}" "${OUT:?}"
: "${PROFILE:=release-lto}"
export GMP_WASM_PREFIX

# The gmp-mpfr-sys build script runs a C probe with `$CC` (it ignores the per-target variable); the wrapper builds
# it with emcc and runs it with node.
export CC_wasm32_unknown_emscripten=/opt/carcara-build/emcc-run.sh
export CC="$CC_wasm32_unknown_emscripten"

# The default emscripten stack (64 KB) is far too small for the recursive parser, and an overflow corrupts memory
# silently. 8 MB is the Linux main-thread default; STACK_OVERFLOW_CHECK=1 catches some of the remaining overflows.
LINK=(-sSTACK_SIZE=8MB -sSTACK_OVERFLOW_CHECK=1 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB
      -sMODULARIZE=1 -sEXPORT_NAME=createCarcara -sINVOKE_RUN=0 -sEXIT_RUNTIME=1
      -sEXPORTED_RUNTIME_METHODS=FS,callMain -sENVIRONMENT=web,worker,node)
flags="-L native=$GMP_WASM_PREFIX/lib"
for f in "${LINK[@]}"; do flags+=" -C link-arg=$f"; done
export RUSTFLAGS="$flags"

cargo build --locked --profile "$PROFILE" --target wasm32-unknown-emscripten
dir="target/wasm32-unknown-emscripten/$PROFILE"
mkdir -p "$OUT"
cp "$dir/carcara.js" "$dir/carcara.wasm" "$OUT/"
