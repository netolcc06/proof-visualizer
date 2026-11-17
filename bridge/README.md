# Proof Visualizer bridge

A small local HTTP server that lets the browser app run native `cvc5`, `veriT` and `Carcara`.
Zero runtime dependencies; Node runs the TypeScript sources directly.

## Docker (recommended)

`Dockerfile` builds an image with pinned, hash-verified tools: cvc5 1.4.2 (static release, SHA256 checked), veriT 2026.05
(built from the checked source tarball) and Carcara (built with `cargo install --locked` from a pinned commit, Rust 1.93).
From the repo root, `make dev` starts it with the frontend (`docker-compose.yml`), `make test` runs the tests against the
real tools. Standalone:

```
docker build -t pv-bridge --target runtime .
docker run --rm -p 127.0.0.1:4000:4000 pv-bridge
```

The image sets `HOST=0.0.0.0`; with a non-loopback bind the `Host` header must be in `BRIDGE_ALLOWED_HOSTS`
(compose: `localhost,127.0.0.1,bridge`). Publish the port on `127.0.0.1` only. To bump a tool, change the `ARG`s
(version and SHA256 / commit) at the top of each stage.

## Install and run (without Docker)

Requires Node >= 22.18.

```
cd bridge
npm install        # dev dependencies only (typescript, @types/node)
npm start          # node src/server.ts  (npm run dev = --watch)
```

It listens on `http://127.0.0.1:4000`. The frontend dev server proxies `/api` to it; the hosted app uses
`http://localhost:4000` by default (setting `pv.bridgeUrl` in localStorage changes it).

## Configuration

Optional `bridge.config.json` (copy `bridge.config.example.json`; set `BRIDGE_CONFIG` for another path).
Env overrides: `PORT`, `HOST`, `CVC5_PATH`, `VERIT_PATH`, `CARCARA_PATH`, `BRIDGE_ALLOWED_ORIGINS` (comma separated, added to the allowlist), `BRIDGE_ALLOWED_HOSTS` (comma separated, replaces the Host allowlist used on a non-loopback bind).
Tools that are not configured are auto-detected on `PATH` (`cvc5`, `veriT`/`verit`, `carcara`).

Each tool: `{ "command": "...", "args": ["prefix", "args"], "pathStyle": "native" | "wsl", "defaultArgs": [...] }`.

Linux / macOS:

```json
{ "tools": { "cvc5": { "command": "/usr/local/bin/cvc5" }, "carcara": { "command": "/home/me/.cargo/bin/carcara" } } }
```

Alternative on Windows without Docker, with veriT and Carcara inside WSL (temp paths are converted `C:\Users\..` -> `/mnt/c/Users/..`):

```json
{
    "tools": {
        "cvc5": { "command": "C:\\tools\\cvc5\\bin\\cvc5.exe" },
        "verit": { "command": "wsl", "args": ["-d", "Ubuntu", "--", "veriT"], "pathStyle": "wsl" },
        "carcara": { "command": "wsl", "args": ["-d", "Ubuntu", "--", "/home/me/.cargo/bin/carcara"], "pathStyle": "wsl" }
    }
}
```

Use the absolute path inside WSL: a non-login `wsl carcara` often has no `~/.cargo/bin` on PATH.

Other keys: `allowedOrigins`, `allowedHosts`, `maxConcurrent` (2), `defaultTimeoutMs` (60000), `maxTimeoutMs` (600000), `maxBodyBytes` (64 MB), `maxOutputBytes`.

Windows note: `command` must be a real executable. `.cmd`/`.bat` files cannot be spawned without a shell (the bridge never uses one) and are rejected with an error. Use the `.exe`, or `wsl`.

### Installing the tools

- cvc5: <https://github.com/cvc5/cvc5/releases> (1.4+ for `--proof-format=alethe`).
- Carcara: `cargo install --git https://github.com/ufmg-smite/carcara.git`.
- veriT: <https://verit-solver.org/> (build from source or use a distribution package; no official Windows build, use WSL).

### Carcara defaults and RARE rules

- Every Carcara call gets `--no-color` (clean stderr). `elaborate` and `slice` also get `--no-print-with-sharing` (otherwise Carcara renumbers `@p_N` names, which breaks splicing back into the original proof). Both are global flags placed before the subcommand.
- Default options `--allow-int-real-subtyping` (needed by the cvc5 RARE file and veriT LIA proofs). Configurable via `tools.carcara.defaultArgs`; a user flag of the same name replaces it.
- cvc5 proofs with `rare_rewrite` steps need `--rare-file`. The bridge ships `rare/cvc5-rewrites.rare` (cvc5 `proofs/alethe/rewrites.eo`, pinned commit in its header) and passes it to `check` and `elaborate` (and the elaboration of `slice`). Config `tools.carcara.rareFile` (path relative to `bridge/`, or `null` to disable) changes the default; a request may send `rareFile` (file content) to override it. `--rare-file` in user `args` stays denied.
- Refresh the bundled file: `npm run fetch:rare` (optionally `-- --ref <sha>`).
- `/api/health` reports `rareFile` (basename or `null`) for Carcara.

### Default solver arguments

| Tool  | Defaults                                                                                  | Enforced (always present) |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------- |
| cvc5  | `--dump-proofs --proof-format=alethe --proof-granularity=dsl-rewrite`                     | `--dump-proofs --proof-format=alethe` |
| veriT | `--disable-banner --disable-print-success --proof=- --proof-prune --proof-merge --proof-with-sharing` | `--disable-print-success --proof=-` |

veriT (verified with veriT 2026.05): without `--disable-print-success` it prints a `success` line per command, so it is enforced (the parser also drops stray `success` lines). Flags (from the flags used by SMTCoq, Isabelle and Carcara's `scripts/solve.sh`): `--proof=-` writes the Alethe proof to stdout after the `unsat` line; the other flags prune and share the proof. Override with `defaultArgs` in the config if your build differs. A user flag with the same name as a default replaces it.

## API

All POST bodies are JSON and need `Content-Type: application/json`. Errors are `{ "error": string }` with a 4xx/5xx status.
Every tool result also carries `timedOut: boolean`; on timeout the process is killed and `exitCode` is `null`.

| Endpoint                         | Body                                                                          | Response                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/health`                | -                                                                             | `{ version, tools: { cvc5, verit, carcara } }`, each `{ path, version }` or `null` (cached 60 s) |
| `POST /api/solve`                | `{ solver: 'cvc5'\|'verit', problem, args?, timeoutMs? }`                     | `{ status, proof, stdout, stderr, exitCode, durationMs }`                   |
| `POST /api/carcara/check`        | `{ proof, problem, rareFile?, args?, timeoutMs? }`                                       | `{ valid, holey, stdout, stderr, exitCode, durationMs }`                    |
| `POST /api/carcara/elaborate`    | `{ proof, problem, rareFile?, args?, timeoutMs? }`                                       | `{ proof, stdout, stderr, exitCode, durationMs }`                           |
| `POST /api/carcara/slice`        | `{ proof, problem, from, maxDistance?, elaborate?, rareFile?, args?, timeoutMs? }`       | `{ slicedProof, slicedProblem, elaboratedProof, stdout, stderr, exitCode, durationMs }` |

- `solve`: the first stdout line is the status (`unsat`/`sat`/`unknown`, otherwise `error`; `timeout` when killed). `proof` is the rest of stdout when unsat (CRLF normalized to LF), else `null`.
- `check`: Carcara prints `valid`, `holey` or `invalid` (exit 1 on invalid). `valid` is true for `valid` and `holey`; `holey` flags holes.
- `elaborate`: Carcara prints a `valid`/`holey` status line followed by the elaborated proof; `proof` is the proof without the status line (`null` when exit code is not 0).
- `slice`: runs `carcara slice <proof> <problem> --from <id> [-d N] --sliced-output <a> <b>`. With `elaborate: true` it then elaborates the slice and returns `elaboratedProof` (status line stripped). `stdout`/`stderr`/`exitCode` then cover both steps (exit code of the elaboration, stderr concatenated).
- `timeoutMs` is clamped to `maxTimeoutMs`.

## Security

- Binds to `127.0.0.1`; with a loopback bind the `Host` header must be loopback too (DNS rebinding guard). With a non-loopback bind it must be in `allowedHosts` (default: loopback names).
- `Origin` must be in the allowlist when present (defaults: localhost/127.0.0.1 on ports 3000, 4173 and 8080, `https://ufmg-smite.github.io`, plus config). Requests without `Origin` (curl) are allowed. Preflight answers include `Access-Control-Allow-Private-Network` when asked.
- POST requires `application/json`, which forces a CORS preflight for browser clients. Body limit 64 MB (413).
- Tools are spawned with argument arrays, never through a shell. Each request gets its own temp dir under `os.tmpdir()`, removed afterwards.
- Timeouts kill the process; at most `maxConcurrent` jobs run at once, the rest are queued.
- User `args` deny list (HTTP 400):
    - cvc5: `-o`, `--output`, `--proof-format[-mode]`, `--dump-to`, `--regular-output-channel`, `--diagnostic-output-channel`, `--replay-log`, `--in`, and any bare (positional) argument.
    - veriT: `--proof` (only `-` is useful and it is enforced), `--output`, `--proof-stats`, `--proof-file-from-input`, and any bare argument.
    - Carcara: `-x`, `--sat-ref-checker`, `--sat-solver`, `--drat-checker`, `--smt-solver` (all execute external programs), `--rare-file`, `--sliced-output`, `--from`, `-d`/`--max-distance`, `--eunoia-mech`.
- If you set `HOST` to a non-loopback address, anyone who can reach the port can run your solvers; keep it on loopback or publish only on `127.0.0.1` (Docker).

## Carcara CLI facts used (from `src/bin/cli/main.rs` and `app.rs`)

- `check` prints `valid`/`holey`/`invalid` on stdout; on error logs to stderr, prints `invalid`, exits 1.
- `elaborate` prints the status then the proof; `slice` prints the sliced proof to stdout and, with `--sliced-output`, writes files. The help names them `<problem> <proof>` but the code writes the proof to the first path and the problem to the second, so the bridge classifies the two files by content.
- Unlike `check`, `slice` accepts only a subset of check options (parsing options such as `-i`), applied to both slice and elaborate steps here.

## Tests

```
make test           # (repo root) all of this in Docker, against the real tools
npm test            # unit + integration (fake veriT/Carcara in test/fakes)
npm run typecheck
PV_TEST_CVC5=/path/to/cvc5 PV_TEST_VERIT=/path/to/veriT npm test   # also runs the real solver tests
PV_TEST_CARCARA=/path/to/carcara npm test   # real Carcara, native
PV_TEST_CARCARA_WSL=1 PV_TEST_CARCARA_WSL_BIN=/home/<user>/.cargo/bin/carcara npm test   # real Carcara in WSL Ubuntu
```
