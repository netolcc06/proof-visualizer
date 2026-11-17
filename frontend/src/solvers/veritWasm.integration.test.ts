// @vitest-environment node
/// <reference types="node" />
// Runs the real veriT wasm build (wasm/verit/dist, from `make verit-wasm`) in Node, with the factory directly.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAlethe } from '../alethe';
import { buildVeritArgs } from './veritWasm';
import { splitSolverOutput } from './output';

const dist = resolve(process.env.VERIT_WASM_DIR ?? '../wasm/verit/dist');
const built = existsSync(resolve(dist, 'verit.js')) && existsSync(resolve(dist, 'verit.wasm'));
if (!built) console.warn(`veriT wasm not built (${dist}): run \`make verit-wasm\`; skipping the integration test`);

interface VeritModule {
    FS: { writeFile(path: string, data: string): void };
    callMain(args: string[]): number | undefined;
}

async function run(problem: string, args: string[]) {
    const createVeriT = createRequire(import.meta.url)(resolve(dist, 'verit.js')) as (
        o: object,
    ) => Promise<VeritModule>;
    let stdout = '';
    let stderr = '';
    const m = await createVeriT({
        wasmBinary: readFileSync(resolve(dist, 'verit.wasm')),
        print: (l: string) => (stdout += l + '\n'),
        printErr: (l: string) => (stderr += l + '\n'),
    });
    m.FS.writeFile('/input.smt2', problem);
    let code = 0;
    try {
        code = m.callMain([...args, '/input.smt2']) ?? 0;
    } catch (e) {
        code = (e as { status?: number }).status ?? -1;
    }
    return { stdout, stderr, code };
}

describe.skipIf(!built)('veriT wasm (real build)', () => {
    it('proves an EUF problem unsat with an Alethe proof that parses', async () => {
        const problem = readFileSync(
            fileURLToPath(new URL('../alethe/__fixtures__/euf.smt2', import.meta.url)),
            'utf8',
        );
        const { stdout, code } = await run(problem, buildVeritArgs([]));
        expect(code).toBe(0);
        const { status, proof } = splitSolverOutput(stdout);
        expect(status).toBe('unsat');
        expect(proof).toBeTruthy();
        expect(parseAlethe(proof ?? '').commands.length).toBeGreaterThan(0);
    });

    it('reports a syntax error on stderr with exit 1', async () => {
        const { stdout, stderr, code } = await run('(set-logic QF_UF', buildVeritArgs([]));
        expect(code).toBe(1);
        expect(stderr).toContain('syntax error');
        expect(splitSolverOutput(stdout).status).toBe('error');
    });

    it('answers sat without a proof', async () => {
        const { stdout, code } = await run(
            '(set-logic QF_UF)(declare-const p Bool)(assert p)(check-sat)',
            buildVeritArgs([]),
        );
        expect(code).toBe(0);
        expect(splitSolverOutput(stdout)).toEqual({ status: 'sat', proof: null });
    });
});
