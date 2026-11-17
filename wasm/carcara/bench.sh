#!/bin/sh
# Parity and timing against native Carcara, inside the (read-only) bridge image, with this dir's dist/ mounted.
# Usage: ./bench.sh [image]    (run from wasm/carcara, in WSL/Linux; needs the image from `make dev`/`docker compose build bridge`)
IMG=${1:-proof-visualizer-bridge}
HERE=$(cd "$(dirname "$0")" && pwd)
FIX=$(cd "$HERE/../../frontend/src/alethe/__fixtures__" && pwd)
exec docker run --rm --read-only --tmpfs /tmp --network none -v "$HERE:/wasm:ro" -v "$FIX:/fixtures:ro" \
  -e CARCARA_DIST=/wasm/dist -e FIXTURES=/fixtures --entrypoint node "$IMG" /wasm/bench.mjs
