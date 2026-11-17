# veriT in WebAssembly

Builds veriT 2026.05 (same tarball and SHA256 as `bridge/Dockerfile`) with emscripten 6.0.8
and GMP 6.3.0 (SHA256-checked, static, no assembly). The frontend uses it as the "veriT (in browser, wasm)" solver:
`frontend/scripts/fetch-verit.mjs` copies `dist/` to `frontend/public/verit/`, and `frontend/src/solvers/veritWasm.ts`
runs it in a Worker (see the root README).

## Build

    make verit-wasm                           # from the repo root; same as the line below
    docker build -o dist --target dist .      # writes dist/verit.js, dist/verit.wasm and the licence texts

`make dev`, `web` and `test` run `make verit-wasm` first; the Docker cache makes repeat runs take seconds. To deploy to
GitHub Pages, build it (or set `VERIT_WASM_DIR`) before `npm run deploy`.

`verit.js` is a MODULARIZE'd factory (`createVeriT`), `ENVIRONMENT=web,worker,node`, `INVOKE_RUN=0`,
exports `callMain` and `FS`, `ALLOW_MEMORY_GROWTH`, 4 GB max, `EXIT_RUNTIME=1`. No threads, no
SharedArrayBuffer, so no COOP/COEP headers are needed. The glue is used unmodified.

`patches/0001-qsort-no-cdefs.patch`: veriT's bundled BSD `qsort` includes `<sys/cdefs.h>`, which
emscripten does not ship. Nothing from it is used, so the include is dropped. This keeps veriT's own
qsort (which makes the output independent of libc), same as the native build.

## Use

    const m = await createVeriT({ print, printErr });   // new instance per run (EXIT_RUNTIME=1)
    m.FS.writeFile('/problem.smt2', text);
    const code = m.callMain([...flags, '/problem.smt2']); // throws ExitStatus-like {status} on exit(n)

`run-node.mjs <problem.smt2> [--warm N] [extra args]` runs it in Node; `bench.sh <dir>` compares it
with a native `veriT` (run both inside the bridge image with `dist/` mounted).

## Caveats

- `--max-time` / `--max-virtual-time` do nothing in wasm (they use `setitimer`/SIGALRM, and a
  synchronous `callMain` never yields to the JS event loop). Terminate the Worker instead.
- Licence: veriT is BSD-3-clause (keep the LICENSE text with the binary). GMP is LGPLv3/GPLv2 dual:
  ship the GMP licence notice and offer the means to relink (the Dockerfile and sources are public).
  `dist/` therefore also holds `LICENSE-veriT.txt`, `LICENSE-veriT-qsort-BSD.txt` (the bundled NetBSD qsort notice)
  and `GMP-COPYING*.txt`; `fetch-verit.mjs` ships them in `public/verit/`.
