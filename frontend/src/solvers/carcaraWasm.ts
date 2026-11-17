import {
    buildCarcaraArgv,
    looksLikeProblem,
    parseCheckOutput,
    parseElaborateOutput,
    validateCarcaraUserArgs,
} from './carcaraCli';
import type { CarcaraWorkerMessage, CarcaraWorkerRequest } from './carcaraWorkerTypes';
import type {
    CarcaraCheckRequest,
    CarcaraCheckResponse,
    CarcaraElaborateRequest,
    CarcaraElaborateResponse,
    CarcaraSliceRequest,
    CarcaraSliceResponse,
    RunOptions,
} from './types';
import { runWorkerJob } from './workerRun';

const PROOF = '/proof.alethe';
const PROBLEM = '/problem.smt2';
const RARE = '/rules.rare';
const SLICE_OUT = ['/sliced-out-1.txt', '/sliced-out-2.txt'];
const RARE_FILE_NAME = 'cvc5-rewrites.rare';

/** Directory holding carcara.js / carcara.wasm (public/carcara/), as an absolute URL ending in '/'. */
function baseUrl(): string {
    return new URL(`${import.meta.env.BASE_URL}carcara/`, location.href).href;
}

let modulePromise: Promise<WebAssembly.Module> | null = null;

/** Compiles the wasm once; the module is structured-cloned into each worker. Failures are not cached. */
function compiledModule(): Promise<WebAssembly.Module> {
    modulePromise ??= WebAssembly.compileStreaming(fetch(`${baseUrl()}carcara.wasm`)).catch((e) => {
        modulePromise = null;
        throw e;
    });
    return modulePromise;
}

const isFile = (res: Response) => res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');

export async function isCarcaraWasmAvailable(): Promise<boolean> {
    try {
        return isFile(await fetch(`${baseUrl()}carcara.wasm`, { method: 'HEAD' }));
    } catch {
        return false;
    }
}

let bundledRare: Promise<string | null> | null = null;

/** The bundled cvc5 RARE rules (copied from bridge/rare by fetch-carcara.mjs), or null when not shipped. */
function bundledRareFile(): Promise<string | null> {
    bundledRare ??= fetch(`${baseUrl()}${RARE_FILE_NAME}`).then(
        (res) => (isFile(res) ? res.text() : null),
        () => null,
    );
    return bundledRare;
}

interface Exec {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    outputs: Record<string, string | null>;
    durationMs: number;
    timedOut: boolean;
}

/** One Carcara run in a fresh worker (fresh wasm instance). A timeout reports `timedOut` and no exit code. */
async function exec(
    argv: string[],
    files: CarcaraWorkerRequest['files'],
    outputs: string[],
    { signal, timeoutMs }: RunOptions,
): Promise<Exec> {
    const job = await runWorkerJob<WebAssembly.Module, CarcaraWorkerMessage>({
        name: 'Carcara',
        signal,
        timeoutMs,
        load: compiledModule,
        createWorker: () => new Worker(new URL('./carcara.worker.ts', import.meta.url), { type: 'classic' }),
        request: (wasmModule): CarcaraWorkerRequest => ({ argv, files, outputs, baseUrl: baseUrl(), wasmModule }),
    });
    const { durationMs } = job;
    if (job.timedOut) {
        return {
            exitCode: null,
            stdout: '',
            stderr: `Carcara timed out after ${timeoutMs} ms\n`,
            outputs: {},
            durationMs,
            timedOut: true,
        };
    }
    const msg = job.msg;
    return {
        exitCode: msg.exitCode,
        stdout: msg.stdout,
        stderr: msg.error ? `${msg.stderr}${msg.error}\n` : msg.stderr,
        outputs: msg.outputs,
        durationMs,
        timedOut: false,
    };
}

interface Prepared {
    userArgs: string[];
    /** Files for the in-memory filesystem and the RARE path to pass, if any. */
    rare: { files: CarcaraWorkerRequest['files']; path: string | null };
}

/** The request's RARE text wins; otherwise the bundled rules (like the bridge's default file). */
async function prepare(req: { rareFile?: string; args?: string[] }): Promise<Prepared> {
    const userArgs = validateCarcaraUserArgs(req.args);
    const text = req.rareFile ?? (await bundledRareFile());
    return {
        userArgs,
        rare: text === null ? { files: [], path: null } : { files: [{ path: RARE, data: text }], path: RARE },
    };
}

function inputs(proof: string, problem: string, rare: Prepared['rare']): CarcaraWorkerRequest['files'] {
    return [{ path: PROOF, data: proof }, { path: PROBLEM, data: problem }, ...rare.files];
}

export async function carcaraCheckWasm(req: CarcaraCheckRequest, opts: RunOptions = {}): Promise<CarcaraCheckResponse> {
    const { userArgs, rare } = await prepare(req);
    const argv = buildCarcaraArgv('check', [PROOF, PROBLEM], { rarePath: rare.path, userArgs });
    const r = await exec(argv, inputs(req.proof, req.problem, rare), [], { timeoutMs: req.timeoutMs, ...opts });
    const parsed = r.timedOut ? { valid: false, holey: false } : parseCheckOutput(r.stdout);
    return {
        ...parsed,
        stdout: r.stdout,
        stderr: r.stderr,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        timedOut: r.timedOut,
    };
}

async function elaborate(
    proof: string,
    problem: string,
    prep: Prepared,
    opts: RunOptions,
): Promise<CarcaraElaborateResponse> {
    const argv = buildCarcaraArgv('elaborate', [PROOF, PROBLEM], { rarePath: prep.rare.path, userArgs: prep.userArgs });
    const r = await exec(argv, inputs(proof, problem, prep.rare), [], opts);
    return {
        proof: parseElaborateOutput(r.stdout, r.exitCode),
        stdout: r.stdout,
        stderr: r.stderr,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        timedOut: r.timedOut,
    };
}

export async function carcaraElaborateWasm(
    req: CarcaraElaborateRequest,
    opts: RunOptions = {},
): Promise<CarcaraElaborateResponse> {
    return elaborate(req.proof, req.problem, await prepare(req), { timeoutMs: req.timeoutMs, ...opts });
}

export async function carcaraSliceWasm(req: CarcaraSliceRequest, opts: RunOptions = {}): Promise<CarcaraSliceResponse> {
    if (!req.from || req.from.startsWith('-')) throw new Error('"from" must be a step id');
    if (req.maxDistance !== undefined && (!Number.isInteger(req.maxDistance) || req.maxDistance < 0))
        throw new Error('"maxDistance" must be a non-negative integer');
    const prep = await prepare(req);
    const run: RunOptions = { timeoutMs: req.timeoutMs, ...opts };

    const positional = [PROOF, PROBLEM, '--from', req.from];
    if (req.maxDistance !== undefined) positional.push('-d', String(req.maxDistance));
    positional.push('--sliced-output', ...SLICE_OUT);
    // The slice command does not take the RARE file
    const argv = buildCarcaraArgv('slice', positional, { userArgs: prep.userArgs });
    const r = await exec(argv, inputs(req.proof, req.problem, { files: [], path: null }), SLICE_OUT, run);

    let slicedProof: string | null = null;
    let slicedProblem: string | null = null;
    if (r.exitCode === 0) {
        // The help names the outputs <problem> <proof> but the code writes <proof> <problem>; classify by content.
        for (const t of SLICE_OUT.map((p) => r.outputs[p])) {
            if (t === null || t === undefined) continue;
            if (looksLikeProblem(t)) slicedProblem = t;
            else slicedProof = t;
        }
    }

    const base = {
        stdout: r.stdout,
        stderr: r.stderr,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        timedOut: r.timedOut,
    };
    if (!req.elaborate || slicedProof === null || slicedProblem === null) {
        return { slicedProof, slicedProblem, elaboratedProof: null, ...base };
    }
    const e = await elaborate(slicedProof, slicedProblem, prep, run);
    return {
        slicedProof,
        slicedProblem,
        elaboratedProof: e.proof,
        stdout: r.stdout,
        stderr: [r.stderr, e.stderr].filter(Boolean).join('\n'),
        exitCode: e.exitCode,
        durationMs: r.durationMs + e.durationMs,
        timedOut: e.timedOut,
    };
}
