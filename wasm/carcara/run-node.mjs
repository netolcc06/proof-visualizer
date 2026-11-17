// Run the Carcara wasm build in Node with the same command lines the app (and the bridge) uses.
//   node run-node.mjs <check|elaborate|slice> <proof> <problem> [--rare FILE] [--from ID] [-d N] [--elaborate] [--warm N]
// Prints Carcara's stdout (for slice: the sliced proof, the sliced problem and the elaboration, labelled), stderr to
// stderr, and a JSON line with timings. Exit code = Carcara's exit code. Also importable: runCarcara().
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = process.env.CARCARA_DIST ?? join(here, 'dist');
const createCarcara = createRequire(import.meta.url)(join(dist, 'carcara.js'));
// The glue asks for the wasm under its link name; the build ships it as carcara.wasm
const locateFile = (p) => join(dist, p.endsWith('.wasm') ? 'carcara.wasm' : p);

// Same layout as the bridge (bridge/src/app.ts carcaraArgv) and frontend/src/solvers/carcaraCli.ts
export function argv(cmd, positional, rare) {
  const global = ['--no-color', ...(cmd === 'check' ? [] : ['--no-print-with-sharing'])];
  return [...global, cmd, ...positional, ...(rare ? ['--rare-file', rare] : []), '--allow-int-real-subtyping'];
}

// One fresh module instance per run (EXIT_RUNTIME=1 tears the runtime down when main returns).
export async function runCarcara(args, files, outputs = []) {
  let stdout = '', stderr = '';
  const t0 = performance.now();
  const m = await createCarcara({
    locateFile,
    print: (l) => { stdout += l + '\n'; },
    printErr: (l) => { stderr += l + '\n'; },
  });
  const tInst = performance.now() - t0;
  for (const [path, data] of Object.entries(files)) m.FS.writeFile(path, data);
  const t1 = performance.now();
  let code = 0;
  try { code = m.callMain(args) ?? 0; }
  catch (e) { code = e?.status ?? -1; if (e?.status === undefined) stderr += String(e) + '\n'; }
  const ms = performance.now() - t1;
  const out = {};
  for (const p of outputs) { try { out[p] = m.FS.readFile(p, { encoding: 'utf8' }); } catch { out[p] = null; } }
  return { stdout, stderr, code, outputs: out, instMs: tInst, ms };
}

const looksLikeProblem = (t) => /\(check-sat\)/.test(t) && !/\(step\s/.test(t);

// Same sequence as frontend/src/solvers/carcaraWasm.ts
export async function runCommand(cmd, opts) {
  const t0 = performance.now();
  const r = await runCommandInner(cmd, opts);
  return { ...r, wallMs: performance.now() - t0 };
}

async function runCommandInner(cmd, { proof, problem, rare, from, d, elaborate }) {
  const files = { '/proof.alethe': proof, '/problem.smt2': problem };
  const rareFiles = rare ? { '/rules.rare': rare } : {};
  const rarePath = rare ? '/rules.rare' : null;
  if (cmd !== 'slice') {
    const r = await runCarcara(argv(cmd, ['/proof.alethe', '/problem.smt2'], rarePath), { ...files, ...rareFiles });
    return { ...r, parts: {}, ms: r.ms };
  }
  const outs = ['/sliced-out-1.txt', '/sliced-out-2.txt'];
  const pos = ['/proof.alethe', '/problem.smt2', '--from', from, ...(d === undefined ? [] : ['-d', String(d)]), '--sliced-output', ...outs];
  const r = await runCarcara(argv('slice', pos, null), files, outs);
  const parts = {};
  if (r.code === 0) for (const t of outs.map((o) => r.outputs[o])) if (t !== null) parts[looksLikeProblem(t) ? 'slicedProblem' : 'slicedProof'] = t;
  let total = r.ms, stderr = r.stderr, code = r.code;
  if (elaborate && parts.slicedProof !== undefined && parts.slicedProblem !== undefined) {
    const e = await runCarcara(argv('elaborate', ['/proof.alethe', '/problem.smt2'], rarePath),
      { '/proof.alethe': parts.slicedProof, '/problem.smt2': parts.slicedProblem, ...rareFiles });
    parts.elaborated = e.stdout; total += e.ms; stderr += e.stderr; code = e.code;
  }
  return { ...r, stderr, code, parts, ms: total };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const cmd = a.shift();
  const opt = { elaborate: false };
  const pos = [];
  let warm = 0;
  while (a.length) {
    const x = a.shift();
    if (x === '--rare') opt.rare = readFileSync(a.shift());
    else if (x === '--from') opt.from = a.shift();
    else if (x === '-d') opt.d = Number(a.shift());
    else if (x === '--elaborate') opt.elaborate = true;
    else if (x === '--warm') warm = Number(a.shift());
    else pos.push(x);
  }
  if (!['check', 'elaborate', 'slice'].includes(cmd) || pos.length !== 2) {
    console.error('usage: node run-node.mjs <check|elaborate|slice> <proof> <problem> [--rare FILE] [--from ID] [-d N] [--elaborate] [--warm N]');
    process.exit(2);
  }
  opt.proof = readFileSync(pos[0]);
  opt.problem = readFileSync(pos[1]);
  const cold = await runCommand(cmd, opt);
  const warmMs = [];
  for (let i = 0; i < warm; i++) warmMs.push((await runCommand(cmd, opt)).ms);
  if (process.env.PV_QUIET !== '1') {
    process.stdout.write(cold.stdout);
    for (const [k, v] of Object.entries(cold.parts)) process.stdout.write(`;; ${k}\n${v}`);
  }
  process.stderr.write(cold.stderr);
  console.error(JSON.stringify({ code: cold.code, instMs: Math.round(cold.instMs), coldMs: Math.round(cold.ms), warmMs: warmMs.map(Math.round), maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024) }));
  process.exit(cold.code);
}
