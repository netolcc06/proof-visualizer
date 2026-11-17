# Proof Visualizer

A web app that visualizes [Alethe](https://verit.loria.fr/documentation/alethe-spec.pdf) proofs produced by
[cvc5](https://github.com/cvc5/cvc5) and [veriT](https://verit-solver.org/). Paste or load a proof, or run a solver
and get one, then explore it as an interactive graph and tables.

- **Components.** Every step is assigned to a component, like the clusters of cvc5's DOT proof output: SAT, CNF,
  theory lemmas, preprocessing, input and rewriting (see H. Barbosa, "Proof logging for satisfiability modulo
  theories solving", WHOOPS'26, slide 21 "Resulting proofs"). Inference is described [below](#how-component-inference-works).
- **Let map.** Terms named with `:named` and the definitions from `define-fun` / `define-const` are collected into a
  let map, shown abbreviated in the graph and listed in the let drawer.
- **Solvers.** cvc5 and veriT run in the browser (WebAssembly). Native cvc5, veriT and [Carcara](https://github.com/ufmg-smite/carcara)
  run through the [local bridge](bridge/README.md).
- **Carcara.** Check or elaborate the current proof. "Elaborate slice from this node" (node context menu) slices the
  proof from a step, elaborates the slice and splices the result back into the original proof. Carcara runs in the
  browser (WebAssembly, the default when deployed) or on the local bridge; choose in Carcara > Carcara settings.
  In the browser, steps that need an external solver (`lia_generic`) cannot be elaborated or checked.
- **Image export.** In the graph style, Download saves the whole visible graph as PNG (2x resolution, white
  background) or SVG, regardless of pan and zoom. "Select region…" lets you drag a rectangle on the canvas and save
  just that area as PNG or SVG.

## Quick start (Docker)

Docker is the primary way to develop, test and run. You only need Docker with Compose v2 (on Windows: Docker inside WSL;
run `make` from the WSL shell in the repo directory). Nothing else is installed on the host: Node, cvc5, veriT and
Carcara all come from the images (`make dev`/`web`/`test` first build the veriT and Carcara wasm with `make verit-wasm`
and `make carcara-wasm`; the first Carcara build takes a couple of minutes, repeats take seconds).

```
make dev     # bridge + Vite dev server with hot reload: http://localhost:3000 (bridge: http://localhost:4000)
make web     # production build behind nginx: http://localhost:8080 (+ bridge)
make verit-wasm  # build veriT for the browser into wasm/verit/dist (cached by Docker; run by dev, web and test)
make carcara-wasm  # build Carcara for the browser into wasm/carcara/dist (same)
make test    # bridge tests against the real cvc5/veriT/Carcara, then frontend typecheck, eslint, tests and build
make logs    # follow the logs
make down    # stop everything (the node_modules volume is kept)
make build   # build the bridge and web images
```

- Ports are published on `127.0.0.1` only. From a Windows browser use `http://localhost:3000` (WSL forwards localhost).
- The dev server runs `npm ci` into a named Docker volume, so the Linux `node_modules` never mixes with a host one.
  The first `make dev` takes a while; file watching uses polling because inotify does not work through the bind mount.
- A repo under `/mnt/c` works but is slower; cloning inside the WSL filesystem (`~/proof-visualizer`) is faster.
- The bridge image pins cvc5 1.4.2, veriT 2026.05 and a Carcara commit, all checked in the Dockerfile
  (see [`bridge/README.md`](bridge/README.md)).

## Without Docker

Requires Node >= 22.

```
cd frontend
npm install
npm run dev        # http://localhost:3000
```

`npm run dev` and `npm run build` first download the cvc5 wasm and copy the veriT and Carcara wasm (see
[In-browser solvers](#in-browser-solvers-wasm)), so they need network access once per cvc5 version. Without a veriT
or Carcara build (`make verit-wasm`, `make carcara-wasm`) they only print a warning and that wasm option shows as unavailable (Carcara then falls back to the bridge). For the native solvers, run the [bridge](#local-bridge-native-cvc5-verit-carcara)
on the host as well.

## Build and deploy

```
cd frontend
npm run build      # type-check + production build into frontend/dist
npm run deploy     # build, then publish dist to GitHub Pages (gh-pages branch)
npm run preview    # serve dist locally
```

The build uses relative asset paths (`base: './'`), so `dist` can be served from any path. `homepage` in
`package.json` is the GitHub Pages URL.

The static image (`frontend/Dockerfile`, nginx) is what `make web` builds; standalone: `cd frontend && make build run`
(http://localhost:8080). The image build downloads the cvc5 wasm from GitHub. Offline: put `cvc5.js` and `cvc5.wasm`
in a folder inside `frontend/` (for example `cvc5-local/`) and build with
`docker build --build-arg CVC5_WASM_DIR=/app/cvc5-local .`.
`make web` also passes `wasm/verit/dist` to the image as the named build context `verit-dist` (compose
`additional_contexts`), so the build context stays `frontend/`. A standalone `docker build` of `frontend/` has no veriT
wasm (the option shows as unavailable); add it with `--build-context verit-dist=../wasm/verit/dist`.
Likewise the Carcara wasm comes in as `carcara-dist` (`wasm/carcara/dist`) and the bundled RARE rules as `carcara-rare`
(`bridge/rare`); standalone: `--build-context carcara-dist=../wasm/carcara/dist --build-context carcara-rare=../bridge/rare`.

To deploy to GitHub Pages by hand, run `make verit-wasm carcara-wasm` (or set `VERIT_WASM_DIR` / `CARCARA_WASM_DIR` to
directories with the built files) before `npm run deploy`; otherwise the published app has no veriT wasm option and
Carcara only works through a local bridge.

CI deploy: `.github/workflows/pages.yml` builds the veriT and Carcara wasm (each with its own Docker layer cache scope;
the Carcara build compiles GMP and Rust, so a cold run adds a couple of minutes), type-checks, lints, tests and builds the frontend, and
deploys it on every push to `main` or `improvements`. In the repository settings, set Pages to use "GitHub Actions" as
its source and let the `github-pages` environment deploy from those branches.

## Architecture

```
frontend/
  src/alethe/      pure TypeScript (no React/Redux): S-expression + Alethe parser/printer, let map,
                   proof graph, component inference, splicing of elaborated slices
  src/solvers/     cvc5, veriT and Carcara wasm workers, bridge HTTP client, solver output parsing
wasm/verit/        Docker build of veriT 2026.05 for WebAssembly (see wasm/verit/README.md)
wasm/carcara/      Docker build of Carcara for WebAssembly (see wasm/carcara/README.md)
  src/store/       Redux Toolkit store (proof, graph view, solver state, ...)
  src/components/  React UI (Blueprint): canvas (react-konva), drawers, dialogs, Carcara dialogs
  scripts/         fetch-cvc5.mjs, fetch-verit.mjs, fetch-carcara.mjs
bridge/            local Node HTTP server that spawns native cvc5 / veriT / Carcara
```

The Vite dev server proxies `/api` to the bridge (`http://localhost:4000`, override with `BRIDGE_URL`).

## In-browser solvers (wasm)

### cvc5

The app runs the official cvc5 WebAssembly release, unmodified:

- `scripts/fetch-cvc5.mjs` downloads `cvc5-Wasm.zip` from the cvc5 GitHub release matching `config.cvc5Version` in
  `frontend/package.json` and extracts `cvc5.js` and `cvc5.wasm` to `frontend/public/cvc5/`. It skips the download when
  that version is already there. `CVC5_WASM_DIR=<dir>` copies the two files from a local directory instead.
- To upgrade cvc5, bump `config.cvc5Version` and run `npm run fetch:cvc5`. The emscripten glue is never edited.
- `src/solvers/cvc5.worker.ts` runs each solve in a fresh classic Web Worker. It relies on these glue hooks (check them
  when upgrading): `Module.arguments`, `print`, `printErr`, `locateFile`, `preRun`, `FS.writeFile`, `instantiateWasm`,
  `onRuntimeInitialized`, `onAbort`. The glue has no `onExit`/`postRun` hook, so completion is detected by wrapping the
  wasm `main` export inside `instantiateWasm`, with a `setTimeout(0)` fallback from `onRuntimeInitialized`. Because the
  official build only targets the `web` environment, the worker hides `WorkerGlobalScope` and aliases `window` to `self`
  before loading the glue.

### veriT

veriT 2026.05 is built to WebAssembly by [`wasm/verit/`](wasm/verit/README.md) (emscripten + GMP, in Docker; `make verit-wasm`
writes `verit.js`, `verit.wasm` and the licence texts to `wasm/verit/dist/`).

- `scripts/fetch-verit.mjs` (run by `predev` and `prebuild`) copies them to `frontend/public/verit/`. `VERIT_WASM_DIR=<dir>`
  overrides the source (default `../wasm/verit/dist`). If the build is missing it prints a warning and the app shows
  "veriT (in browser, wasm)" as unavailable; it never fails the dev server or the build.
- `src/solvers/veritWasm.ts` compiles the wasm once on the main thread and runs each solve in a fresh classic Worker
  (`verit.worker.ts`). The glue is modular and unmodified, so unlike cvc5 it needs no worker-environment shims.
  Timeout and abort terminate the worker, because `--max-time` does nothing in wasm.
- The flags mirror the bridge: defaults `--disable-banner --disable-print-success --proof=- --proof-prune --proof-merge
  --proof-with-sharing`; `--proof`, `--output` and positional arguments are rejected.
- `src/solvers/veritWasm.integration.test.ts` runs the real build in Node and is skipped when `wasm/verit/dist` is missing.

### Carcara

Carcara is built to WebAssembly by [`wasm/carcara/`](wasm/carcara/README.md) (emscripten + GMP + Rust, in Docker;
`make carcara-wasm` writes `carcara.js`, `carcara.wasm` and the licence texts to `wasm/carcara/dist/`). The approach is
from [netolcc06/carcara-wasm](https://github.com/netolcc06/carcara-wasm) and
[ufmg-smite/carcara#149](https://github.com/ufmg-smite/carcara/issues/149); the commit is the same as the bridge's.

- `scripts/fetch-carcara.mjs` (run by `predev` and `prebuild`) copies the build to `frontend/public/carcara/`, together
  with `bridge/rare/cvc5-rewrites.rare`, which is the default RARE file in the browser (as it is on the bridge, so it
  is not duplicated in git). `CARCARA_WASM_DIR` / `CARCARA_RARE_FILE` override the sources. A missing build only prints a
  warning; the app then uses the bridge.
- `src/solvers/carcaraWasm.ts` returns the same result types as the bridge client (`carcaraCheck`, `carcaraElaborate`,
  `carcaraSlice`), so the Carcara actions do not care which backend ran. Each run (and the elaboration step of a slice)
  is a fresh classic Worker (`carcara.worker.ts`) with a fresh wasm instance; the wasm is compiled once. The proof,
  the problem and the RARE file go into the in-memory filesystem, `callMain` gets the argument layout the bridge builds,
  and the slice files are read back from it. Timeout and abort terminate the worker. `src/solvers/carcaraCli.ts` holds
  the argument building and output parsing, mirroring `bridge/src/args.ts` and `parse.ts` (the bridge is a separate
  package that cannot import frontend code); `carcaraCli.test.ts` pins the same cases as the bridge unit tests.
- Backend choice: Carcara > Carcara settings, stored in `localStorage` (`pv.carcaraBackend`). Unset means in the browser
  when the wasm build is deployed, else the bridge. Your custom RARE text (same dialog) is used by both.
- Limits of the browser build: no external tools (so `lia_generic` steps stay holes, and the result says so), no
  threads, 4 GB of memory. Details in [`wasm/carcara/README.md`](wasm/carcara/README.md).
- `src/solvers/carcaraWasm.integration.test.ts` runs the real build in Node (check, slice, elaborate and splice) and is
  skipped when `wasm/carcara/dist` is missing.

## Third-party licences

The in-browser solvers ship third-party code statically linked into their wasm binaries:

- veriT (BSD-3-Clause) and its bundled NetBSD `qsort` (BSD 3-clause), plus GMP 6.3.0 (LGPLv3 / GPLv2 dual licence).
  The licence texts are copied to `public/verit/` (and so to the deployed site) next to `verit.wasm`. To rebuild or
  relink with another GMP, use the recipe in [`wasm/verit/`](wasm/verit/README.md) (`Dockerfile`, pinned sources).
- Carcara (Apache-2.0) plus GMP 6.3.0, statically linked into `carcara.wasm`. Carcara's licence text and GMP's are copied
  to `public/carcara/` next to it; rebuild or relink with the recipe in [`wasm/carcara/`](wasm/carcara/README.md).
- The official cvc5 wasm release (BSD-3-Clause) also bundles GMP; see the cvc5 release and its licence files.

## Local bridge (native cvc5, veriT, Carcara)

[`bridge/`](bridge/README.md) is a zero-dependency Node (>= 22.18) server on `127.0.0.1:4000`. `make dev` runs it
in Docker with all three tools. To run it on the host instead:

```
cd bridge
npm install
cp bridge.config.example.json bridge.config.json   # optional; tools on PATH are auto-detected
npm start
```

In the app, pick the bridge backend in the solver panel. The hosted (GitHub Pages) app talks to
`http://localhost:4000` by default; change it in the app or with the `pv.bridgeUrl` localStorage key.

Windows (host setup): native cvc5 works as an `.exe`; veriT and Carcara are usually run inside WSL by configuring `command: "wsl"`
with `pathStyle: "wsl"` (temp paths are converted to `/mnt/c/...`) and the absolute tool path inside WSL. See
[`bridge/bridge.config.example.json`](bridge/bridge.config.example.json) and the Windows section of
[`bridge/README.md`](bridge/README.md).

cvc5 proofs that contain `rare_rewrite` steps need a RARE rules file for Carcara. The bridge bundles
[`bridge/rare/cvc5-rewrites.rare`](bridge/rare/cvc5-rewrites.rare) and passes it automatically; refresh it with
`npm run fetch:rare` in `bridge/`.

## How component inference works

Implemented in [`frontend/src/alethe/components.ts`](frontend/src/alethe/components.ts); all rule tables live there.
It adapts cvc5's `DotPrinter` walk: starting at the root (the final `(cl)` step), the type of a node is derived from its
rule and the type of the node that consumes it (first visit wins in a DAG; order SAT < CNF < TL < PP < IN).

- A top-level `assume` is input (IN).
- Resolution-like rules (`resolution`, `th_resolution`, `contraction`, ...) near the root are SAT, as long as they
  depend on an input assumption.
- Below SAT, Boolean-structure rules (`and`, `or_pos`, `equiv_pos1`, ...) are CNF.
- A closed derivation (one that depends on no input assumption) is a theory lemma (TL). This replaces cvc5's
  rule-based criterion, because cvc5's Alethe output encodes lemmas as subproofs closed with
  `and_neg`/`resolution`/`contraction`, which a purely rule-based walk would mislabel as SAT.
- Anything else below CNF is preprocessing (PP).
- A second pass marks rewriting rules (`evaluate`, `cong`, `trans`, `rare_rewrite`, `*_simplify`, ...) inside TL and
  PP regions as rewriting (RW).

## Scripts

Run in `frontend/` unless noted.

| Script | What it does |
| --- | --- |
| `npm run dev` / `npm start` | Vite dev server on port 3000 (`dev` fetches cvc5 and copies veriT and Carcara first) |
| `npm run build` | Fetch cvc5, copy veriT and Carcara, type-check, production build into `dist` |
| `npm run preview` | Serve `dist` locally |
| `npm test` / `npm run test:watch` | Vitest (once / watch) |
| `npm run lint` | ESLint with `--fix` |
| `npm run format` | Prettier on `src` |
| `npm run typecheck` | `tsc -b` |
| `npm run fetch:cvc5` | Download the cvc5 wasm for `config.cvc5Version` |
| `npm run fetch:verit` | Copy the veriT wasm build from `VERIT_WASM_DIR` (default `../wasm/verit/dist`) |
| `npm run fetch:carcara` | Copy the Carcara wasm build from `CARCARA_WASM_DIR` (default `../wasm/carcara/dist`) and the bundled RARE file |
| `npm run deploy` | Build and publish `dist` to GitHub Pages |
| `make dev` / `web` / `test` / `verit-wasm` / `carcara-wasm` / `logs` / `down` / `build` (repo root) | Docker workflow, see [Quick start](#quick-start-docker) |
| `npm start` (in `bridge/`) | Run the bridge (`npm run dev` for watch mode) |
| `npm test` (in `bridge/`) | Bridge tests (also `npm run typecheck`) |
| `npm run fetch:rare` (in `bridge/`) | Refresh the bundled RARE rules file |

## Authors

* [Vinícius Braga Freire](https://github.com/vinciusb)
* [Diego Della Rocca](https://github.com/diegodrc)
* [Haniel Barbosa](https://homepages.dcc.ufmg.br/~hbarbosa/)
