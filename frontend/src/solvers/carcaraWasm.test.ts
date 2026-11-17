import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarcaraWorkerRequest } from './carcaraWorkerTypes';

class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: ErrorEvent) => void) | null = null;
    terminated = false;
    posted: CarcaraWorkerRequest[] = [];
    constructor() {
        FakeWorker.instances.push(this);
    }
    postMessage(m: CarcaraWorkerRequest) {
        this.posted.push(m);
    }
    terminate() {
        this.terminated = true;
    }
    reply(
        data: Partial<{
            exitCode: number | null;
            stdout: string;
            stderr: string;
            error: string;
            outputs: Record<string, string | null>;
        }> = {},
    ) {
        const msg = { type: 'done', exitCode: 0, stdout: '', stderr: '', outputs: {}, ...data };
        this.onmessage?.({ data: msg } as MessageEvent);
    }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const RARE = '(declare-rare-rule r ())';

describe('carcaraWasm', () => {
    let resolveCompile: (m: unknown) => void;
    let rejectCompile: (e: unknown) => void;
    let compile: ReturnType<typeof vi.fn>;
    let fetchMock: ReturnType<typeof vi.fn>;

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
        // The bundled RARE file is the only thing fetched with a path ending in .rare
        fetchMock = vi.fn((url: string) =>
            Promise.resolve(
                url.endsWith('.rare')
                    ? new Response(RARE, { headers: { 'content-type': 'text/plain' } })
                    : new Response(''),
            ),
        );
        vi.stubGlobal('WebAssembly', { compileStreaming: compile });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('Worker', FakeWorker);
    });
    afterEach(() => vi.unstubAllGlobals());

    const req = { proof: '(assume a0 true)', problem: '(check-sat)' };

    /** Starts a run and lets the (fake) compilation finish, so the first worker exists. */
    async function started<T>(start: (m: typeof import('./carcaraWasm')) => Promise<T>) {
        const m = await import('./carcaraWasm');
        const p = start(m);
        // The RARE file is fetched before the compilation starts
        await vi.waitFor(() => expect(compile).toHaveBeenCalled());
        resolveCompile({});
        await vi.waitFor(() => expect(FakeWorker.instances.length).toBeGreaterThan(0));
        return { p, worker: FakeWorker.instances[0] };
    }

    it('rejects on abort while compiling and never spawns a worker', async () => {
        const { carcaraCheckWasm } = await import('./carcaraWasm');
        const ac = new AbortController();
        const p = carcaraCheckWasm(req, { signal: ac.signal });
        await vi.waitFor(() => expect(compile).toHaveBeenCalled());
        ac.abort();
        await expect(p).rejects.toMatchObject({ name: 'AbortError' });
        resolveCompile({});
        await tick();
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('rejects immediately when already aborted', async () => {
        const { carcaraCheckWasm } = await import('./carcaraWasm');
        await expect(carcaraCheckWasm(req, { signal: AbortSignal.abort() })).rejects.toMatchObject({
            name: 'AbortError',
        });
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('reports a timeout while compiling without spawning a worker', async () => {
        const { carcaraCheckWasm } = await import('./carcaraWasm');
        const r = await carcaraCheckWasm({ ...req, timeoutMs: 5 });
        expect(r).toMatchObject({ valid: false, timedOut: true, exitCode: null });
        expect(r.stderr).toContain('timed out');
        resolveCompile({});
        await tick();
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('does not cache a failed compile', async () => {
        const { carcaraCheckWasm } = await import('./carcaraWasm');
        const p1 = carcaraCheckWasm(req);
        await vi.waitFor(() => expect(compile).toHaveBeenCalledTimes(1));
        rejectCompile(new Error('boom'));
        await expect(p1).rejects.toThrow('boom');
        const p2 = carcaraCheckWasm(req);
        await vi.waitFor(() => expect(compile).toHaveBeenCalledTimes(2));
        resolveCompile({});
        await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
        FakeWorker.instances[0].reply({ stdout: 'valid\n' });
        expect((await p2).valid).toBe(true);
        expect(FakeWorker.instances[0].terminated).toBe(true);
    });

    it('terminates the worker on timeout and reports it', async () => {
        const { p, worker } = await started((m) => m.carcaraCheckWasm({ ...req, timeoutMs: 400 }));
        const r = await p;
        expect(r).toMatchObject({ valid: false, holey: false, timedOut: true, exitCode: null });
        expect(worker.terminated).toBe(true);
    });

    it('terminates the worker on abort', async () => {
        const ac = new AbortController();
        const { p, worker } = await started((m) => m.carcaraCheckWasm(req, { signal: ac.signal }));
        ac.abort();
        await expect(p).rejects.toMatchObject({ name: 'AbortError' });
        expect(worker.terminated).toBe(true);
    });

    it('check: same argument layout as the bridge, files in memory, bundled RARE file', async () => {
        const { p, worker } = await started((m) => m.carcaraCheckWasm(req));
        const posted = worker.posted[0];
        expect(posted.argv).toEqual([
            '--no-color',
            'check',
            '/proof.alethe',
            '/problem.smt2',
            '--rare-file',
            '/rules.rare',
            '--allow-int-real-subtyping',
        ]);
        expect(posted.files).toEqual([
            { path: '/proof.alethe', data: req.proof },
            { path: '/problem.smt2', data: req.problem },
            { path: '/rules.rare', data: RARE },
        ]);
        expect(posted.baseUrl).toMatch(/\/carcara\/$/);
        worker.reply({ stdout: 'holey\n', stderr: 'warn: encountered "lia_generic" rule, ignoring\n' });
        expect(await p).toMatchObject({ valid: true, holey: true, exitCode: 0, timedOut: false });
        expect(worker.terminated).toBe(true);
    });

    it('check: a custom RARE file replaces the bundled one and is not fetched', async () => {
        const { p, worker } = await started((m) => m.carcaraCheckWasm({ ...req, rareFile: '(custom)' }));
        expect(worker.posted[0].files.find((f) => f.path === '/rules.rare')?.data).toBe('(custom)');
        expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('.rare'))).toBe(false);
        worker.reply({ stdout: 'valid\n' });
        await p;
    });

    it('check: no --rare-file when no RARE file is shipped', async () => {
        fetchMock.mockImplementation((url: string) =>
            Promise.resolve(
                url.endsWith('.rare')
                    ? new Response('<html>', { headers: { 'content-type': 'text/html' } })
                    : new Response(''),
            ),
        );
        const { p, worker } = await started((m) => m.carcaraCheckWasm(req));
        expect(worker.posted[0].argv).not.toContain('--rare-file');
        expect(worker.posted[0].files.map((f) => f.path)).toEqual(['/proof.alethe', '/problem.smt2']);
        worker.reply({ stdout: 'valid\n' });
        await p;
    });

    it('check: invalid proof (exit 1)', async () => {
        const { p, worker } = await started((m) => m.carcaraCheckWasm(req));
        worker.reply({ exitCode: 1, stdout: 'invalid\n', stderr: 'error: step t1\n' });
        expect(await p).toMatchObject({ valid: false, holey: false, exitCode: 1, stderr: 'error: step t1\n' });
    });

    it('check: a crash is reported in stderr with no exit code', async () => {
        const { p, worker } = await started((m) => m.carcaraCheckWasm(req));
        worker.reply({ exitCode: null, error: 'RuntimeError: unreachable' });
        const r = await p;
        expect(r.valid).toBe(false);
        expect(r.exitCode).toBeNull();
        expect(r.stderr).toContain('RuntimeError: unreachable');
    });

    it('rejects denied user args', async () => {
        const { carcaraCheckWasm } = await import('./carcaraWasm');
        await expect(carcaraCheckWasm({ ...req, args: ['--smt-solver=cvc5'] })).rejects.toThrow('not allowed');
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('elaborate: term sharing off, status line stripped', async () => {
        const { p, worker } = await started((m) => m.carcaraElaborateWasm(req));
        expect(worker.posted[0].argv.slice(0, 3)).toEqual(['--no-color', '--no-print-with-sharing', 'elaborate']);
        worker.reply({ stdout: 'valid\n(assume a0 true)\n' });
        expect(await p).toMatchObject({ proof: '(assume a0 true)\n', exitCode: 0 });
    });

    it('elaborate: no proof on a failure', async () => {
        const { p, worker } = await started((m) => m.carcaraElaborateWasm(req));
        worker.reply({ exitCode: 1, stdout: '', stderr: 'error: parse\n' });
        expect(await p).toMatchObject({ proof: null, exitCode: 1 });
    });

    it('slice: classifies the output files by content and elaborates the slice in a second run', async () => {
        const { p, worker } = await started((m) =>
            m.carcaraSliceWasm({ ...req, from: 't14', maxDistance: 5, elaborate: true }),
        );
        expect(worker.posted[0].argv).toEqual([
            '--no-color',
            '--no-print-with-sharing',
            'slice',
            '/proof.alethe',
            '/problem.smt2',
            '--from',
            't14',
            '-d',
            '5',
            '--sliced-output',
            '/sliced-out-1.txt',
            '/sliced-out-2.txt',
            '--allow-int-real-subtyping',
        ]);
        expect(worker.posted[0].outputs).toEqual(['/sliced-out-1.txt', '/sliced-out-2.txt']);
        expect(worker.posted[0].files.map((f) => f.path)).toEqual(['/proof.alethe', '/problem.smt2']);
        const slicedProof = '(assume a0 true)\n(step t1 (cl) :rule resolution :premises (a0))\n';
        const slicedProblem = '(set-logic QF_UF)\n(check-sat)\n';
        // The code writes <proof> <problem>, the help says the opposite: either order must work
        worker.reply({ outputs: { '/sliced-out-1.txt': slicedProblem, '/sliced-out-2.txt': slicedProof } });
        await tick();
        await tick();
        const second = FakeWorker.instances[1];
        expect(second).toBeDefined();
        expect(second.posted[0].argv.slice(0, 5)).toEqual([
            '--no-color',
            '--no-print-with-sharing',
            'elaborate',
            '/proof.alethe',
            '/problem.smt2',
        ]);
        expect(second.posted[0].files).toEqual([
            { path: '/proof.alethe', data: slicedProof },
            { path: '/problem.smt2', data: slicedProblem },
            { path: '/rules.rare', data: RARE },
        ]);
        second.reply({ stdout: 'valid\n(assume a0 true)\n', stderr: 'w\n' });
        const r = await p;
        expect(r).toMatchObject({
            slicedProof,
            slicedProblem,
            elaboratedProof: '(assume a0 true)\n',
            exitCode: 0,
            timedOut: false,
        });
        expect(worker.terminated && second.terminated).toBe(true);
    });

    it('slice without elaboration runs once and leaves elaboratedProof null', async () => {
        const { p, worker } = await started((m) => m.carcaraSliceWasm({ ...req, from: 't1' }));
        expect(worker.posted[0].argv).not.toContain('-d');
        worker.reply({
            outputs: { '/sliced-out-1.txt': '(assume a0 true)\n', '/sliced-out-2.txt': '(check-sat)\n' },
        });
        const r = await p;
        expect(r).toMatchObject({
            slicedProof: '(assume a0 true)\n',
            slicedProblem: '(check-sat)\n',
            elaboratedProof: null,
        });
        expect(FakeWorker.instances).toHaveLength(1);
    });

    it('slice: a failed slice returns no files and skips elaboration', async () => {
        const { p, worker } = await started((m) => m.carcaraSliceWasm({ ...req, from: 'nope', elaborate: true }));
        worker.reply({ exitCode: 1, stderr: 'error: no such step\n', outputs: {} });
        const r = await p;
        expect(r).toMatchObject({ slicedProof: null, slicedProblem: null, elaboratedProof: null, exitCode: 1 });
        expect(FakeWorker.instances).toHaveLength(1);
    });

    it('slice: validates the step id and the distance', async () => {
        const { carcaraSliceWasm } = await import('./carcaraWasm');
        await expect(carcaraSliceWasm({ ...req, from: '--x' })).rejects.toThrow('step id');
        await expect(carcaraSliceWasm({ ...req, from: 't1', maxDistance: -1 })).rejects.toThrow('non-negative');
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('rejects when the worker fails to load', async () => {
        const { p, worker } = await started((m) => m.carcaraCheckWasm(req));
        worker.onerror?.({ message: 'nope' } as ErrorEvent);
        await expect(p).rejects.toThrow('Carcara worker failed: nope');
    });
});

describe('isCarcaraWasmAvailable', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('is true for a wasm response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('', { headers: { 'content-type': 'application/wasm' } })),
        );
        const { isCarcaraWasmAvailable } = await import('./carcaraWasm');
        expect(await isCarcaraWasmAvailable()).toBe(true);
    });

    it('is false for an HTML fallback, an HTTP error or a network error', async () => {
        const { isCarcaraWasmAvailable } = await import('./carcaraWasm');
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('', { headers: { 'content-type': 'text/html' } })),
        );
        expect(await isCarcaraWasmAvailable()).toBe(false);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
        expect(await isCarcaraWasmAvailable()).toBe(false);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
        expect(await isCarcaraWasmAvailable()).toBe(false);
    });
});
