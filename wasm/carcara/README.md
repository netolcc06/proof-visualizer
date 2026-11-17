# Carcara in WebAssembly

Builds [Carcara](https://github.com/ufmg-smite/carcara) for the browser with emscripten, in Docker. The frontend uses it
as "In browser (wasm)" for the Carcara menu (check, elaborate, slice): `frontend/scripts/fetch-carcara.mjs` copies `dist/`
to `frontend/public/carcara/`, and `frontend/src/solvers/carcaraWasm.ts` runs it in a Worker (see the root README).

The approach (Rust target `wasm32-unknown-emscripten`, GMP compiled with `emcc`, a 3-line `Cargo.toml` change) comes from
[netolcc06/carcara-wasm](https://github.com/netolcc06/carcara-wasm) and
[ufmg-smite/carcara#149](https://github.com/ufmg-smite/carcara/issues/149); this directory makes it reproducible and pinned.
No change to Carcara's Rust code is needed.

## Build

    make carcara-wasm                         # from the repo root; same as the line below
    docker build -o dist --target dist .      # writes dist/carcara.js, dist/carcara.wasm and the licence texts

`make dev`, `web`, `test` and `build` run `make carcara-wasm` first. To deploy to GitHub Pages by hand, build it (or set
`CARCARA_WASM_DIR`) before `npm run deploy`.

Pinned in the `Dockerfile`: `emscripten/emsdk:6.0.8`; Rust 1.93.1 (Carcara's `rust-toolchain.toml` asks for 1.93) via
rustup 1.28.2 (SHA256-checked) with the `wasm32-unknown-emscripten` target; GMP 6.3.0 (SHA256-checked, static, no assembly,
same recipe as `wasm/verit`); Carcara commit `20bf49c5ce31089ac83118574c888669355aaae1`, the same one as `CARCARA_REV` in
`bridge/Dockerfile`, so the native bridge and the wasm build behave alike. The build is `cargo build --locked
--profile release-lto` (Carcara's own LTO profile).

Measured here (WSL2, 20 threads): cold build without Docker layer cache about 1m50s (GMP, then Carcara; the cargo
registry cache mount was warm); unchanged rebuild 1.5 s; rebuild after touching a build input, with the cargo `target`
cache mount warm, a few seconds; the `.wasm` is byte-identical between builds. Carcara compiles in about 30 s.

| file | raw | gzip -9 | brotli -q11 |
| --- | ---: | ---: | ---: |
| `carcara.wasm` | 2,740,452 | 982,136 | 680,273 |
| `carcara.js` | 71,467 | 20,210 | 17,883 |

The Docker cache mounts (`/opt/cargo/registry`, `/opt/cargo/git`, `target/`) only speed rebuilds up; the artifacts are
copied out in the same `RUN` and leave through the `dist` stage.

### What is patched, and why

- `patches/0001-emscripten-gmp-mpfr-sys.patch` (`Cargo.toml`): for `target_os = "emscripten"` only, depend on
  `gmp-mpfr-sys` with `use-system-libs` and `force-cross`, so `rug` links the GMP built with `emcc` instead of trying to
  build GMP itself. It applies unchanged to the pinned commit (and to the issue's `96c00843`).
- `patches/0002-Cargo.lock-gmp-mpfr-sys.patch` (`Cargo.lock`): the new target-specific dependency adds one line to
  `carcara`'s entry in the lock file. Without it `cargo build --locked` refuses to run. No versions change
  (`gmp-mpfr-sys` stays 1.7.1).
- `emcc-run.sh`: the `gmp-mpfr-sys` build script compiles a C probe with `$CC` and runs it. The wrapper compiles it with
  `emcc` to JS and writes a stub that runs it with `node`. Everything else goes straight to `emcc`.
  (`build.sh` sets both `CC` and `CC_wasm32_unknown_emscripten`: the build script reads plain `CC`.)

### Link flags (`build.sh`)

`-sSTACK_SIZE=8MB -sSTACK_OVERFLOW_CHECK=1 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB -sMODULARIZE=1
-sEXPORT_NAME=createCarcara -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain
-sENVIRONMENT=web,worker,node`. The default emscripten stack is 64 KB, which the recursive parser overflows silently
(memory corruption, nonsense errors); 8 MB is the Linux default, and `STACK_OVERFLOW_CHECK=1` is the cheap check the
issue recommends. The glue is used unmodified. No threads, no `SharedArrayBuffer`, so no COOP/COEP headers are needed.

## Use

    const m = await createCarcara({ print, printErr, locateFile });   // new instance per run (EXIT_RUNTIME=1)
    m.FS.writeFile('/proof.alethe', proof);
    m.FS.writeFile('/problem.smt2', problem);
    const code = m.callMain(['--no-color', 'check', '/proof.alethe', '/problem.smt2', '--allow-int-real-subtyping']);
    // exit(n) is thrown as {status: n}; the in-memory files can still be read after it (slice --sliced-output)

The glue asks for the wasm under its link name; the build ships it as `carcara.wasm`, so pass a `locateFile` that maps
any `*.wasm` to it (the app does; `wasmBinary` was not honoured).

`run-node.mjs <check|elaborate|slice> <proof> <problem> [--rare FILE] [--from ID] [-d N] [--elaborate]` runs it in Node
with the same command lines as the app and the bridge. `bench.sh` compares it with the native Carcara of the bridge
image (read-only container, no network) on the frontend fixtures: `check` verdict and exit code, `elaborate` output and
`slice` files must be identical, with and without elaboration (step ids `euf` t14 and t2.t4, `lia` t28, `q` t23), plus
timings and a few stress cases. Run `./bench.sh [image]` in WSL/Linux after `docker compose build bridge`.

## Limitations

- **No external tools.** `--smt-solver`, `--sat-solver`, `--drat-checker` need processes. The app denies those flags
  (like the bridge) and never passes them; if they were passed the build fails with `failed to spawn external tool
  process`. `lia_generic` steps stay holes: `check` says `holey` and `elaborate` leaves the step as is, with the warning
  `encountered "lia_generic" rule, ignoring`. The app's bridge calls behave the same way (it passes no solver either), but
  a bridge can be configured with extra default arguments; in the browser it cannot.
- **No threads.** `--num-threads` greater than 1 and `bench` panic in `checker/parallel.rs`. Do not pass them.
- **4 GB memory limit** (wasm32). Input files are copied into the in-memory filesystem, so a large proof counts twice.
- **Recursion depth.** The wasm call stack is the engine's (about 1 MB in V8), not the 8 MB emscripten stack, so deeply
  nested terms hit `RangeError: Maximum call stack size exceeded` earlier than natively: with the bench's term
  `(f (f ... x))`, nesting 2000 is fine in both, 3000 fails in wasm only, 5000 fails in both (native aborts with a stack
  overflow). The error is reported, not silent.
- **Speed.** About native speed in Node (a 300,000-step synthetic proof checks in 1.26 s vs 1.21 s native); the issue
  measured about 3x slower than native in Chrome on a very large proof.
- **Fragile build.** It depends on a GMP built outside Cargo, `force-cross` and the `CC` wrapper.

## Licences

Carcara is Apache-2.0 (`LICENSE-Carcara.txt`; the repository has no `NOTICE` file, the Dockerfile copies one if it
appears). GMP is LGPLv3 / GPLv2 dual licensed: its texts are shipped as `GMP-COPYING*.txt`, and this `Dockerfile`
(pinned sources, SHA256) is the means to rebuild with another GMP. `fetch-carcara.mjs` ships all of them in
`public/carcara/`. The Rust crates linked into the binary carry their own permissive licences; `cargo` can list them from
the locked dependency tree.
