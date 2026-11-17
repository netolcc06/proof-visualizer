import { splitSolverOutput } from './output';
import type { RunOptions, SolverRunResult } from './types';
import type { VeritWorkerMessage, VeritWorkerRequest } from './veritWorkerTypes';
import { runInWorker } from './workerRun';

export const VERIT_DEFAULT_ARGS = [
    '--disable-banner',
    '--disable-print-success',
    '--proof=-',
    '--proof-prune',
    '--proof-merge',
    '--proof-with-sharing',
];

// Same policy as the bridge (bridge/src/args.ts): enforced flags are always present, these may not be passed.
const ENFORCED = ['--disable-print-success', '--proof=-'];
const DENIED = ['--proof', '--output', '--proof-stats', '--proof-file-from-input'];

/** Directory holding verit.js / verit.wasm (public/verit/), as an absolute URL ending in '/'. */
function baseUrl(): string {
    return new URL(`${import.meta.env.BASE_URL}verit/`, location.href).href;
}

let modulePromise: Promise<WebAssembly.Module> | null = null;

/** Compiles the wasm once; the module is structured-cloned into each worker. Failures are not cached. */
function compiledModule(): Promise<WebAssembly.Module> {
    modulePromise ??= WebAssembly.compileStreaming(fetch(`${baseUrl()}verit.wasm`)).catch((e) => {
        modulePromise = null;
        throw e;
    });
    return modulePromise;
}

export async function isVeritWasmAvailable(): Promise<boolean> {
    try {
        const res = await fetch(`${baseUrl()}verit.wasm`, { method: 'HEAD' });
        const type = res.headers.get('content-type') ?? '';
        return res.ok && !type.includes('text/html');
    } catch {
        return false;
    }
}

const flagName = (arg: string) => arg.split('=', 1)[0];

/** Defaults first; a user flag with the same name replaces the default. Throws for denied or positional args. */
export function buildVeritArgs(userArgs: string[]): string[] {
    for (const arg of userArgs) {
        if (DENIED.includes(flagName(arg))) throw new Error(`argument not allowed: ${flagName(arg)}`);
        if (!arg.startsWith('-')) throw new Error(`positional argument not allowed: ${arg} (use --opt=value)`);
    }
    const userNames = new Set(userArgs.map(flagName));
    const kept = VERIT_DEFAULT_ARGS.filter((d) => !userNames.has(flagName(d)));
    const merged = [...kept, ...userArgs].filter((a) => !ENFORCED.includes(a));
    return [...ENFORCED, ...merged];
}

export function runVeritWasm(
    problem: string,
    args: string[] = [],
    { signal, timeoutMs }: RunOptions = {},
): Promise<SolverRunResult> {
    let argv: string[];
    try {
        argv = buildVeritArgs(args);
    } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
    return runInWorker<WebAssembly.Module, VeritWorkerMessage>({
        name: 'veriT',
        signal,
        timeoutMs,
        load: compiledModule,
        createWorker: () => new Worker(new URL('./verit.worker.ts', import.meta.url), { type: 'classic' }),
        request: (wasmModule): VeritWorkerRequest => ({ problem, args: argv, baseUrl: baseUrl(), wasmModule }),
        toResult: ({ exitCode, stdout, stderr, error }) => ({
            // veriT exits 0 for sat/unsat/unknown; a syntax error prints to stderr and exits 1
            ...(exitCode === 0 && !error ? splitSolverOutput(stdout) : { status: 'error' as const, proof: null }),
            stdout,
            stderr: error ? `${stderr}${error}\n` : stderr,
            exitCode,
        }),
    });
}
