import type { SolverRunResult } from './types';

type RunResult = Omit<SolverRunResult, 'durationMs'>;

export interface WorkerJobSpec<Loaded> {
    /** Tool name used in messages. */
    name: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    /** Slow one-time setup (wasm compilation); covered by the timer and the abort signal. */
    load: () => Promise<Loaded>;
    /** The `new Worker(new URL(...))` call must stay in the tool file so the bundler sees it. */
    createWorker: () => Worker;
    request: (loaded: Loaded) => unknown;
}

export interface WorkerRunSpec<Loaded, Msg> extends WorkerJobSpec<Loaded> {
    toResult: (msg: Msg) => RunResult;
}

/**
 * Runs one job in a fresh worker and resolves with its first message (none on timeout). Timeout and abort
 * terminate the worker; the worker never outlives the promise. Abort rejects, load and worker failures reject.
 */
export function runWorkerJob<Loaded, Msg>(
    spec: WorkerJobSpec<Loaded>,
): Promise<{ timedOut: false; msg: Msg; durationMs: number } | { timedOut: true; durationMs: number }> {
    const { name, signal, timeoutMs } = spec;
    const start = performance.now();
    const durationMs = () => Math.round(performance.now() - start);

    return new Promise((resolve, reject) => {
        let worker: Worker | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        // Settles exactly once and releases timer, listener and worker.
        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            worker?.terminate();
            fn();
        };
        const onAbort = () => settle(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')));

        // Timer and abort listener come first, so they also cover the (slow) wasm compilation.
        if (signal?.aborted) return onAbort();
        signal?.addEventListener('abort', onAbort);
        if (timeoutMs !== undefined && timeoutMs > 0) {
            timer = setTimeout(() => settle(() => resolve({ timedOut: true, durationMs: durationMs() })), timeoutMs);
        }

        spec.load().then(
            (loaded) => {
                if (settled) return; // aborted or timed out meanwhile: never spawn
                const w = spec.createWorker();
                worker = w;
                w.onmessage = (ev: MessageEvent<Msg>) =>
                    settle(() => resolve({ timedOut: false, msg: ev.data, durationMs: durationMs() }));
                w.onerror = (ev) =>
                    settle(() => reject(new Error(`${name} worker failed: ${ev.message || 'unknown error'}`)));
                w.postMessage(spec.request(loaded));
            },
            (err) => settle(() => reject(err)),
        );
    });
}

/** Solver flavour of `runWorkerJob`: a timeout becomes a `timeout` result. */
export async function runInWorker<Loaded, Msg>(spec: WorkerRunSpec<Loaded, Msg>): Promise<SolverRunResult> {
    const job = await runWorkerJob<Loaded, Msg>(spec);
    const { durationMs } = job;
    if (job.timedOut) {
        return {
            status: 'timeout',
            proof: null,
            stdout: '',
            stderr: `${spec.name} timed out after ${spec.timeoutMs} ms`,
            exitCode: null,
            durationMs,
        };
    }
    return { ...spec.toResult(job.msg), durationMs };
}
