import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: ErrorEvent) => void) | null = null;
    terminated = false;
    posted: unknown[] = [];
    constructor() {
        FakeWorker.instances.push(this);
    }
    postMessage(m: unknown) {
        this.posted.push(m);
    }
    terminate() {
        this.terminated = true;
    }
    reply(data: Partial<{ exitCode: number | null; stdout: string; stderr: string; error: string }>) {
        const msg = { type: 'done', exitCode: 0, stdout: '', stderr: '', ...data };
        this.onmessage?.({ data: msg } as MessageEvent);
    }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('runVeritWasm', () => {
    let resolveCompile: (m: unknown) => void;
    let rejectCompile: (e: unknown) => void;
    let compile: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.resetModules();
        FakeWorker.instances = [];
        compile = vi.fn(
            () =>
                new Promise((res, rej) => {
                    resolveCompile = res;
                    rejectCompile = rej;
                }),
        );
        vi.stubGlobal('WebAssembly', { compileStreaming: compile });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')));
        vi.stubGlobal('Worker', FakeWorker);
    });
    afterEach(() => vi.unstubAllGlobals());

    /** Starts a run and lets the (fake) compilation finish, so the worker exists. */
    async function started(args: string[] = [], opts: { timeoutMs?: number; signal?: AbortSignal } = {}) {
        const { runVeritWasm } = await import('./veritWasm');
        const p = runVeritWasm('(check-sat)', args, opts);
        resolveCompile({});
        await tick();
        return { p, worker: FakeWorker.instances[0] };
    }

    it('rejects on abort while compiling and never spawns a worker', async () => {
        const { runVeritWasm } = await import('./veritWasm');
        const ac = new AbortController();
        const p = runVeritWasm('(check-sat)', [], { signal: ac.signal });
        ac.abort();
        await expect(p).rejects.toMatchObject({ name: 'AbortError' });
        resolveCompile({});
        await tick();
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('rejects immediately when already aborted', async () => {
        const { runVeritWasm } = await import('./veritWasm');
        await expect(runVeritWasm('', [], { signal: AbortSignal.abort() })).rejects.toMatchObject({
            name: 'AbortError',
        });
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('times out while compiling and never spawns a worker', async () => {
        const { runVeritWasm } = await import('./veritWasm');
        const r = await runVeritWasm('(check-sat)', [], { timeoutMs: 5 });
        expect(r.status).toBe('timeout');
        resolveCompile({});
        await tick();
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('does not cache a failed compile', async () => {
        const { runVeritWasm } = await import('./veritWasm');
        const p1 = runVeritWasm('', []);
        rejectCompile(new Error('boom'));
        await expect(p1).rejects.toThrow('boom');
        const p2 = runVeritWasm('', []);
        expect(compile).toHaveBeenCalledTimes(2);
        resolveCompile({});
        await tick();
        FakeWorker.instances[0].reply({ stdout: 'sat\n' });
        expect((await p2).status).toBe('sat');
        expect(FakeWorker.instances[0].terminated).toBe(true);
    });

    it('terminates the worker on timeout and reports it', async () => {
        const { p, worker } = await started([], { timeoutMs: 10 });
        const r = await p;
        expect(r.status).toBe('timeout');
        expect(r.exitCode).toBeNull();
        expect(worker.terminated).toBe(true);
    });

    it('terminates the worker on abort', async () => {
        const ac = new AbortController();
        const { p, worker } = await started([], { signal: ac.signal });
        ac.abort();
        await expect(p).rejects.toMatchObject({ name: 'AbortError' });
        expect(worker.terminated).toBe(true);
    });

    it('posts the default args, the problem and the wasm module; no --max-time', async () => {
        const { p, worker } = await started();
        const req = worker.posted[0] as { problem: string; args: string[]; baseUrl: string };
        expect(req.problem).toBe('(check-sat)');
        expect(req.args).toEqual([
            '--disable-print-success',
            '--proof=-',
            '--disable-banner',
            '--proof-prune',
            '--proof-merge',
            '--proof-with-sharing',
        ]);
        expect(req.args.some((a) => a.startsWith('--max-time'))).toBe(false);
        expect(req.baseUrl).toMatch(/\/verit\/$/);
        worker.reply({ stdout: 'sat\n' });
        await p;
    });

    it('maps unsat + proof', async () => {
        const { p, worker } = await started();
        worker.reply({ stdout: 'unsat\n(assume h1 false)\n(step t2 (cl) :rule resolution :premises (h1))\n' });
        const r = await p;
        expect(r.status).toBe('unsat');
        expect(r.proof).toContain('(assume h1 false)');
        expect(worker.terminated).toBe(true);
    });

    it('maps sat and unknown without a proof', async () => {
        for (const out of ['sat', 'unknown']) {
            FakeWorker.instances = [];
            const { p, worker } = await started();
            worker.reply({ stdout: `${out}\nFormula is Satisfiable\n` });
            const r = await p;
            expect(r.status).toBe(out);
            expect(r.proof).toBeNull();
            vi.resetModules();
        }
    });

    it('maps a syntax error (exit 1, stderr only) to error', async () => {
        const { p, worker } = await started();
        worker.reply({ exitCode: 1, stderr: 'error : syntax error on line 1\n' });
        const r = await p;
        expect(r.status).toBe('error');
        expect(r.exitCode).toBe(1);
        expect(r.stderr).toContain('syntax error');
    });

    it('maps a non-zero exit with stdout to error and appends a crash message', async () => {
        const { p, worker } = await started();
        worker.reply({ exitCode: null, stdout: 'unsat\n', error: 'Aborted(OOM)' });
        const r = await p;
        expect(r.status).toBe('error');
        expect(r.stderr).toContain('Aborted(OOM)');
    });

    it('rejects when the worker fails to load', async () => {
        const { p, worker } = await started();
        worker.onerror?.({ message: 'nope' } as ErrorEvent);
        await expect(p).rejects.toThrow('veriT worker failed: nope');
    });
});

describe('buildVeritArgs', () => {
    it('enforces the bridge flags and lets user flags replace defaults', async () => {
        const { buildVeritArgs } = await import('./veritWasm');
        const args = buildVeritArgs(['--proof-prune=false', '--disable-print-success', '--max-time=5']);
        expect(args.slice(0, 2)).toEqual(['--disable-print-success', '--proof=-']);
        expect(args).toContain('--proof-prune=false');
        expect(args).not.toContain('--proof-prune');
        expect(args.filter((a) => a === '--proof=-')).toHaveLength(1);
        expect(args).toContain('--max-time=5');
    });

    it('rejects denied flags and positional args', async () => {
        const { buildVeritArgs } = await import('./veritWasm');
        expect(() => buildVeritArgs(['--proof=out.alethe'])).toThrow('not allowed');
        expect(() => buildVeritArgs(['--output=x'])).toThrow('not allowed');
        expect(() => buildVeritArgs(['file.smt2'])).toThrow('positional');
    });
});

describe('isVeritWasmAvailable', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('is true for a wasm response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('', { headers: { 'content-type': 'application/wasm' } })),
        );
        const { isVeritWasmAvailable } = await import('./veritWasm');
        expect(await isVeritWasmAvailable()).toBe(true);
    });

    it('is false for an HTML fallback, an HTTP error or a network error', async () => {
        const { isVeritWasmAvailable } = await import('./veritWasm');
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('', { headers: { 'content-type': 'text/html' } })),
        );
        expect(await isVeritWasmAvailable()).toBe(false);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
        expect(await isVeritWasmAvailable()).toBe(false);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
        expect(await isVeritWasmAvailable()).toBe(false);
    });
});
