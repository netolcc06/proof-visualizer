// @vitest-environment node
/// <reference types="node" />
// Runs the real Carcara wasm build (wasm/carcara/dist, from `make carcara-wasm`) in Node, with the factory directly
// and the same argument builders and parsers as the app.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAlethe, printAlethe, pruneUnreachable, spliceElaboratedSlice } from '../alethe';
import {
    buildCarcaraArgv,
    looksLikeProblem,
    needsExternalTool,
    parseCheckOutput,
    parseElaborateOutput,
} from './carcaraCli';

const dist = resolve(process.env.CARCARA_WASM_DIR ?? '../wasm/carcara/dist');
const rareFile = resolve(process.env.CARCARA_RARE_FILE ?? '../bridge/rare/cvc5-rewrites.rare');
const built = existsSync(resolve(dist, 'carcara.js')) && existsSync(resolve(dist, 'carcara.wasm'));
if (!built) console.warn(`Carcara wasm not built (${dist}): run \`make carcara-wasm\`; skipping the integration test`);

interface CarcaraModule {
    FS: { writeFile(path: string, data: string): void; readFile(path: string, opts: { encoding: 'utf8' }): string };
    callMain(args: string[]): number | undefined;
}

const fixture = (name: string) =>
    readFileSync(fileURLToPath(new URL(`../alethe/__fixtures__/${name}`, import.meta.url)), 'utf8');

async function run(argv: string[], files: Record<string, string>, outputs: string[] = []) {
    const createCarcara = createRequire(import.meta.url)(resolve(dist, 'carcara.js')) as (
        o: object,
    ) => Promise<CarcaraModule>;
    let stdout = '';
    let stderr = '';
    // A fresh instance per run: the runtime is torn down when main returns
    const m = await createCarcara({
        // The glue asks for its link name; the build ships carcara.wasm
        locateFile: (p: string) => resolve(dist, p.endsWith('.wasm') ? 'carcara.wasm' : p),
        print: (l: string) => (stdout += l + '\n'),
        printErr: (l: string) => (stderr += l + '\n'),
    });
    for (const [path, data] of Object.entries(files)) m.FS.writeFile(path, data);
    let code: number;
    try {
        code = m.callMain(argv) ?? 0;
    } catch (e) {
        code = (e as { status?: number }).status ?? -1;
    }
    // The files must still be readable after the runtime exited
    const out = Object.fromEntries(outputs.map((p) => [p, m.FS.readFile(p, { encoding: 'utf8' })]));
    return { stdout, stderr, code, out };
}

const P = '/proof.alethe';
const Q = '/problem.smt2';
const RARE = '/rules.rare';

describe.skipIf(!built)('Carcara wasm (real build)', () => {
    const rare = readFileSync(rareFile, 'utf8');
    const files = (proof: string, problem: string) => ({ [P]: proof, [Q]: problem, [RARE]: rare });

    it('checks the euf proof as valid', async () => {
        const argv = buildCarcaraArgv('check', [P, Q], { rarePath: RARE });
        const { stdout, code } = await run(argv, files(fixture('euf.alethe'), fixture('euf.smt2')));
        expect(code).toBe(0);
        expect(parseCheckOutput(stdout)).toEqual({ valid: true, holey: false });
    });

    it('rejects a wrong proof with exit 1', async () => {
        const argv = buildCarcaraArgv('check', [P, Q], { rarePath: RARE });
        const { stdout, code } = await run(argv, files(fixture('verit-style.alethe'), fixture('verit-style.smt2')));
        expect(code).toBe(1);
        expect(parseCheckOutput(stdout).valid).toBe(false);
    });

    it('leaves lia_generic as a hole: no external solver in the browser', async () => {
        const proof =
            '(assume a0 (> x 5))\n(assume a1 (< x 3))\n(step t1 (cl (not (> x 5)) (not (< x 3))) :rule lia_generic)\n' +
            '(step t2 (cl) :rule resolution :premises (t1 a0 a1))\n';
        const problem = '(set-logic QF_LIA)\n(declare-const x Int)\n(assert (> x 5))\n(assert (< x 3))\n(check-sat)\n';
        expect(needsExternalTool(proof)).toBe(true);
        const check = await run(buildCarcaraArgv('check', [P, Q]), files(proof, problem));
        expect(check.code).toBe(0);
        expect(parseCheckOutput(check.stdout)).toEqual({ valid: true, holey: true });
        expect(check.stderr).toContain('lia_generic');
        const elab = await run(buildCarcaraArgv('elaborate', [P, Q]), files(proof, problem));
        expect(elab.code).toBe(0);
        expect(parseElaborateOutput(elab.stdout, elab.code)).toContain(':rule lia_generic');
    });

    it('slices euf from t14, elaborates the slice, and the result splices into the proof', async () => {
        const proof = fixture('euf.alethe');
        const problem = fixture('euf.smt2');
        const outs = ['/sliced-out-1.txt', '/sliced-out-2.txt'];
        const slice = await run(
            buildCarcaraArgv('slice', [P, Q, '--from', 't14', '-d', '1000000', '--sliced-output', ...outs]),
            { [P]: proof, [Q]: problem },
            outs,
        );
        expect(slice.code).toBe(0);
        const texts = outs.map((o) => slice.out[o]);
        const slicedProblem = texts.find(looksLikeProblem);
        const slicedProof = texts.find((t) => !looksLikeProblem(t));
        expect(slicedProblem).toContain('(check-sat)');
        expect(slicedProof).toBeTruthy();

        const elab = await run(
            buildCarcaraArgv('elaborate', [P, Q], { rarePath: RARE }),
            files(slicedProof ?? '', slicedProblem ?? ''),
        );
        expect(elab.code).toBe(0);
        const elaborated = parseElaborateOutput(elab.stdout, elab.code);
        expect(elaborated).toBeTruthy();

        // Same splice the app does for the bridge result
        const original = parseAlethe(proof);
        const spliced = pruneUnreachable(spliceElaboratedSlice(original, 't14', parseAlethe(elaborated ?? '')));
        expect(spliced.commands.length).toBeGreaterThan(0);
        expect(printAlethe(spliced)).toContain('el1_');
        // Carcara's own output for this slice, as stored by the bridge-based fixture
        expect(parseAlethe(elaborated ?? '').commands).toEqual(
            parseAlethe(fixture('euf.slice-t14.elab.alethe')).commands,
        );
    });

    it('fails to start an external solver with a clear error', async () => {
        // Not reachable from the app (--smt-solver is denied); documents what the build does.
        const proof =
            '(assume a0 (> x 5))\n(assume a1 (< x 3))\n(step t1 (cl (not (> x 5)) (not (< x 3))) :rule lia_generic)\n' +
            '(step t2 (cl) :rule resolution :premises (t1 a0 a1))\n';
        const problem = '(set-logic QF_LIA)\n(declare-const x Int)\n(assert (> x 5))\n(assert (< x 3))\n(check-sat)\n';
        const argv = [...buildCarcaraArgv('elaborate', [P, Q]), '--smt-solver', 'cvc5'];
        const { code, stderr } = await run(argv, files(proof, problem));
        expect(code).not.toBe(0);
        expect(stderr).toContain('failed to spawn external tool process');
    });
});
