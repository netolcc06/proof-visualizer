#!/bin/sh
# Inside a container that has veriT (native), node and the dist/ dir. Usage: bench.sh <problems dir>
# Prints per problem: native/wasm exit codes, identical?, step counts, times (ms).
P=${1:-/problems}; F="--disable-banner --disable-print-success --proof=- --proof-prune --proof-merge --proof-with-sharing"
now() { date +%s%3N; }
for f in "$P"/*.smt2; do
  n=$(basename "$f" .smt2); T=${TLIMIT:-20}
  s=$(now); timeout $T veriT $F "$f" >/tmp/nat.out 2>/tmp/nat.err; nc=$?; e=$(now); nt=$((e-s))
  s=$(now); PV_QUIET=0 timeout $T node run-node.mjs "$f" >/tmp/wasm.out 2>/tmp/wasm.err; wc_=$?; e=$(now); wt=$((e-s))
  if cmp -s /tmp/nat.out /tmp/wasm.out; then same=identical; else same=DIFFERENT; fi
  ns=$(grep -c '^(step\|^(assume' /tmp/nat.out); ws=$(grep -c '^(step\|^(assume' /tmp/wasm.out)
  echo "$n native: exit=$nc first='$(head -1 /tmp/nat.out)' steps=$ns ${nt}ms | wasm: exit=$wc_ first='$(head -1 /tmp/wasm.out)' steps=$ws ${wt}ms(proc, incl node start) $same"
  tail -1 /tmp/wasm.err | grep '^{' 
done
