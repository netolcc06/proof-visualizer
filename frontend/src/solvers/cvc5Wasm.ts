import type { Cvc5WorkerMessage, Cvc5WorkerRequest } from './cvc5WorkerTypes';
import { splitSolverOutput } from './output';
import type { RunOptions, SolverRunResult } from './types';
import { runInWorker } from './workerRun';

export const CVC5_DEFAULT_ARGS = ['--dump-proofs', '--proof-format=alethe', '--proof-granularity=dsl-rewrite'];

/** Directory holding cvc5.js / cvc5.wasm (public/cvc5/), as an absolute URL ending in '/'. */
function baseUrl(): string {
    return new URL(`${import.meta.env.BASE_URL}cvc5/`, location.href).href;
}

let modulePromise: Promise<WebAssembly.Module> | null = null;

/** Compiles the wasm once; the module is structured-cloned into each worker. Failures are not cached. */
function compiledModule(): Promise<WebAssembly.Module> {
    modulePromise ??= WebAssembly.compileStreaming(fetch(`${baseUrl()}cvc5.wasm`)).catch((e) => {
        modulePromise = null;
        throw e;
    });
    return modulePromise;
}

export async function isCvc5WasmAvailable(): Promise<boolean> {
    try {
        const res = await fetch(`${baseUrl()}cvc5.wasm`, { method: 'HEAD' });
        const type = res.headers.get('content-type') ?? '';
        return res.ok && !type.includes('text/html');
    } catch {
        return false;
    }
}

function buildArgs(userArgs: string[]): string[] {
    const user = userArgs.filter((a) => !a.startsWith('--proof-format'));
    return [...CVC5_DEFAULT_ARGS, ...user];
}

export function runCvc5Wasm(
    problem: string,
    args: string[] = [],
    { signal, timeoutMs }: RunOptions = {},
): Promise<SolverRunResult> {
    return runInWorker<WebAssembly.Module, Cvc5WorkerMessage>({
        name: 'cvc5',
        signal,
        timeoutMs,
        load: compiledModule,
        createWorker: () => new Worker(new URL('./cvc5.worker.ts', import.meta.url), { type: 'classic' }),
        request: (wasmModule): Cvc5WorkerRequest => ({
            problem,
            args: buildArgs(args),
            baseUrl: baseUrl(),
            wasmModule,
        }),
        toResult: ({ exitCode, stdout, stderr, error }) => ({
            ...splitSolverOutput(stdout),
            stdout,
            stderr: error
                ? `${stderr}${error}
`
                : stderr,
            exitCode,
        }),
    });
}
