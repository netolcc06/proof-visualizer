#!/usr/bin/env bash
# CC wrapper for the gmp-mpfr-sys build script (feature use-system-libs). The script compiles a C probe that reads
# gmp.h and then runs it. Here the probe is compiled with emcc to JS, and the "executable" is a shell script that
# runs it with node. Everything else is passed through to emcc.
# Needs GMP_WASM_PREFIX (a prefix with include/gmp.h and lib/libgmp.a built with emcc).
args=(); out=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -fPIC) shift ;;
    *) args+=("$1"); shift ;;
  esac
done
[ -z "$out" ] && exec emcc "${args[@]}"
emcc "${args[@]}" -I"$GMP_WASM_PREFIX/include" -L"$GMP_WASM_PREFIX/lib" -sNODERAWFS=1 -o "$out.js" || exit $?
printf '#!/bin/sh\nexec node "%s" "$@"\n' "$out.js" > "$out"
chmod +x "$out"
