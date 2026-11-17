// Parity and timing: native Carcara vs the wasm build, with the bridge's exact flags. Run via bench.sh.
// Env: CARCARA_BIN (native, default carcara), FIXTURES (dir), RARE (file), CARCARA_DIST (wasm dist).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { argv, runCommand } from './run-node.mjs';

const BIN = process.env.CARCARA_BIN ?? 'carcara';
const FIX = process.env.FIXTURES ?? '/fixtures';
const RARE = process.env.RARE ?? '/app/bridge/rare/cvc5-rewrites.rare';
const rare = readFileSync(RARE);
const looksLikeProblem = (t) => /\(check-sat\)/.test(t) && !/\(step\s/.test(t);

const dir = mkdtempSync(join(tmpdir(), 'cbench-'));
const native = (args) => {
  const t = performance.now();
  const r = spawnSync(BIN, args, { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, ms: performance.now() - t };
};
const statusOf = (o) => o.trim().split(/\s+/)[0] ?? '';
const strip = (s) => s.replace(/^(valid|holey)\n/, '');

async function nativeCmd(cmd, f) {
  const p = join(f.dir ?? FIX, f.proof), q = join(f.dir ?? FIX, f.problem);
  if (cmd !== 'slice') {
    const r = native(argv(cmd, [p, q], RARE));
    return { ...r, parts: {} };
  }
  const outs = [join(dir, 'o1'), join(dir, 'o2')];
  const pos = [p, q, '--from', f.from, '-d', String(f.d), '--sliced-output', ...outs];
  const r = native(argv('slice', pos, null));
  const parts = {};
  if (r.code === 0) for (const o of outs) { const t = readFileSync(o, 'utf8'); parts[looksLikeProblem(t) ? 'slicedProblem' : 'slicedProof'] = t; }
  let ms = r.ms, code = r.code, stderr = r.stderr;
  if (f.elaborate && parts.slicedProof && parts.slicedProblem) {
    writeFileSync(join(dir, 's.alethe'), parts.slicedProof); writeFileSync(join(dir, 's.smt2'), parts.slicedProblem);
    const e = native(argv('elaborate', [join(dir, 's.alethe'), join(dir, 's.smt2')], RARE));
    parts.elaborated = e.stdout; ms += e.ms; code = e.code; stderr += e.stderr;
  }
  return { code, stdout: r.stdout, stderr, ms, parts };
}

const pairs = [
  ['euf', 'euf.alethe', 'euf.smt2'], ['lia', 'lia.alethe', 'lia.smt2'], ['q', 'q.alethe', 'q.smt2'], ['sko', 'sko.alethe', 'sko.smt2'],
  ['euf.verit', 'euf.verit.alethe', 'euf.smt2'], ['lia.verit', 'lia.verit.alethe', 'lia.smt2'], ['q.verit', 'q.verit.alethe', 'q.smt2'],
  ['ex1', 'ex1.alethe', 'ex1.smt2'], ['verit-style', 'verit-style.alethe', 'verit-style.smt2'],
].filter(([, p, q]) => existsSync(join(FIX, p)) && existsSync(join(FIX, q)));
const slices = [['euf', 't14'], ['euf', 't2.t4'], ['lia', 't28'], ['q', 't23']];
const D = [1000000, 1];

const rows = [];
const cell = (n) => `${Math.round(n)}ms`;
async function compare(label, cmd, f) {
  const n = await nativeCmd(cmd, f);
  const w = await runCommand(cmd, { proof: readFileSync(join(f.dir ?? FIX, f.proof)), problem: readFileSync(join(f.dir ?? FIX, f.problem)), rare, from: f.from, d: f.d, elaborate: f.elaborate });
  let same, detail = '';
  if (cmd === 'check') {
    const crash = (c) => c === null || c < 0; // killed by a signal / aborted
    same = (n.code === w.code && statusOf(n.stdout) === statusOf(w.stdout)) || (crash(n.code) && crash(w.code));
    detail = crash(n.code) ? 'both crash (stack overflow)' : statusOf(n.stdout);
  } else if (cmd === 'elaborate') {
    same = n.code === w.code && n.stdout === w.stdout;
    detail = `${statusOf(n.stdout)} ${n.stdout.length}B`;
  } else {
    same = n.code === w.code && JSON.stringify(n.parts) === JSON.stringify(w.parts);
    detail = `${Object.keys(n.parts).join('+') || '-'} ${Object.values(n.parts).reduce((a, s) => a + s.length, 0)}B`;
  }
  rows.push({ label, cmd, nCode: n.code, wCode: w.code, same, detail, nMs: n.ms, wMs: w.ms, wWall: w.wallMs, nStderr: n.stderr, wStderr: w.stderr });
  console.log(`${same ? 'SAME     ' : 'DIFFERENT'} ${label.padEnd(34)} ${cmd.padEnd(9)} native=${n.code} wasm=${w.code} ${detail.padEnd(22)} native ${cell(n.ms).padStart(7)} wasm ${cell(w.ms).padStart(7)} (with instantiation ${cell(w.wallMs)})`);
  if (!same) console.log(`   native stderr: ${n.stderr.trim().slice(0, 300)}\n   wasm   stderr: ${w.stderr.trim().slice(0, 300)}`);
  else if (w.stderr.trim() && process.env.VERBOSE) console.log(`   stderr: ${w.stderr.trim().slice(0, 300)}`);
}

for (const [name, p, q] of pairs) {
  await compare(name, 'check', { proof: p, problem: q });
  await compare(name, 'elaborate', { proof: p, problem: q });
}
for (const [name, id] of slices) for (const d of D) for (const elaborate of [false, true])
  await compare(`${name} --from ${id} -d ${d}${elaborate ? ' +elab' : ''}`, 'slice', { proof: `${name}.alethe`, problem: `${name}.smt2`, from: id, d, elaborate });

// lia_generic needs an external SMT solver (--smt-solver) to be elaborated, which neither the app nor wasm has:
// both leave the step as a hole ("holey", warning on stderr). Same result as native, listed to document it.
writeFileSync(join(dir, 'lg.smt2'), ['(set-logic QF_LIA)', '(declare-const x Int)', '(assert (> x 5))', '(assert (< x 3))', '(check-sat)', ''].join('\n'));
writeFileSync(
  join(dir, 'lg.alethe'),
  ['(assume a0 (> x 5))', '(assume a1 (< x 3))', '(step t1 (cl (not (> x 5)) (not (< x 3))) :rule lia_generic)', '(step t2 (cl) :rule resolution :premises (t1 a0 a1))', ''].join('\n'),
);
for (const cmd of ['check', 'elaborate']) await compare('lia_generic (synthetic)', cmd, { dir, proof: 'lg.alethe', problem: 'lg.smt2' });

// Deeply nested terms stress the recursive parser. Informational, not counted: the wasm recursion limit is the
// engine's call stack (about 1 MB in V8, not the 8 MB emscripten stack), so wasm gives up at a lower depth than native.
for (const depth of [1000, 2000, 3000, 5000, 10000]) {
  const t = (n) => `${'(f '.repeat(n)}x${')'.repeat(n)}`;
  const D = t(depth);
  writeFileSync(join(dir, 'deep.smt2'), `(set-logic QF_UF)\n(declare-sort U 0)\n(declare-fun f (U) U)\n(declare-const x U)\n(assert (not (= ${D} ${D})))\n(check-sat)\n`);
  writeFileSync(join(dir, 'deep.alethe'), `(assume a0 (not (= ${D} ${D})))\n(step t1 (cl (= ${D} ${D})) :rule refl)\n(step t2 (cl) :rule resolution :premises (a0 t1))\n`);
  await compare(`deep term, depth ${depth}`, 'check', { dir, proof: 'deep.alethe', problem: 'deep.smt2' });
}

// Throughput on a large synthetic proof: N independent refl steps plus the closing resolution.
for (const n of [50000, 300000]) {
  const decl = Array.from({ length: n }, (_, i) => `(declare-const c${i} U)`).join('\n');
  writeFileSync(join(dir, 'big.smt2'), `(set-logic QF_UF)\n(declare-sort U 0)\n(declare-fun f (U) U)\n${decl}\n(declare-const x U)\n(assert (not (= x x)))\n(check-sat)\n`);
  const steps = Array.from({ length: n }, (_, i) => `(step s${i} (cl (= (f c${i}) (f c${i}))) :rule refl)`).join('\n');
  writeFileSync(join(dir, 'big.alethe'), `(assume a0 (not (= x x)))\n${steps}\n(step t1 (cl (= x x)) :rule refl)\n(step t2 (cl) :rule resolution :premises (a0 t1))\n`);
  await compare(`large synthetic, ${n} steps`, 'check', { dir, proof: 'big.alethe', problem: 'big.smt2' });
}

rmSync(dir, { recursive: true, force: true });
const counted = rows.filter((r) => !r.label.startsWith('deep term'));
const bad = counted.filter((r) => !r.same).length;
console.log(`
${counted.length - bad}/${counted.length} identical to native (deep-term rows are informational)`);
process.exit(bad ? 1 : 0);
