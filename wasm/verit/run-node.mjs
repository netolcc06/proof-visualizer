// Run veriT wasm in Node with the app's flags. Usage: node run-node.mjs <problem.smt2> [--warm N] [extra veriT args]
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = process.env.VERIT_DIST ?? join(here, 'dist');
const createVeriT = createRequire(import.meta.url)(join(dist, 'verit.js'));
// The glue asks for its link name (veriT.wasm); the build ships it as verit.wasm
const locateFile = (p) => join(dist, p.endsWith('.wasm') ? 'verit.wasm' : p);

const FLAGS = ['--disable-banner', '--disable-print-success', '--proof=-', '--proof-prune', '--proof-merge', '--proof-with-sharing'];

// One fresh module instance per run (veriT keeps global state, so instances are not reusable).
export async function runVeriT(problem, extra = []) {
  let stdout = '', stderr = '';
  const t0 = performance.now();
  const m = await createVeriT({
    locateFile,
    print: (l) => { stdout += l + '\n'; },
    printErr: (l) => { stderr += l + '\n'; },
    noExitRuntime: false,
  });
  const tInst = performance.now() - t0;
  m.FS.writeFile('/problem.smt2', problem);
  let code = 0;
  try { code = m.callMain([...FLAGS, ...extra, '/problem.smt2']); }
  catch (e) { code = e?.status ?? -1; if (e?.status === undefined) stderr += String(e) + '\n'; }
  return { stdout, stderr, code, tInstMs: tInst, tTotalMs: performance.now() - t0 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.shift();
  let warm = 0;
  if (args[0] === '--warm') { args.shift(); warm = Number(args.shift()); }
  const problem = readFileSync(file);
  const cold = await runVeriT(problem, args);
  const warmMs = [];
  for (let i = 0; i < warm; i++) warmMs.push((await runVeriT(problem, args)).tTotalMs);
  if (process.env.PV_QUIET !== '1') process.stdout.write(cold.stdout);
  process.stderr.write(cold.stderr);
  console.error(JSON.stringify({ code: cold.code, coldMs: Math.round(cold.tTotalMs), instMs: Math.round(cold.tInstMs), warmMs: warmMs.map(Math.round), maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024) }));
  process.exit(cold.code);
}
