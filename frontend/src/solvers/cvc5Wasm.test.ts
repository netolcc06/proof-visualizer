import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: ErrorEvent) => void) | null = null;
    terminated = false;
    constructor() {
        FakeWorker.instances.push(this);
    }
    postMessage() {}
    terminate() {
        this.terminated = true;
    }
}

describe('runCvc5Wasm during wasm compilation', () => {
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

    it('rejects on abort while compiling and never spawns a worker', async () => {
        const { runCvc5Wasm } = await import('./cvc5Wasm');
        const ac = new AbortController();
        const p = runCvc5Wasm('(check-sat)', [], { signal: ac.signal });
        ac.abort();
        await expect(p).rejects.toMatchObject({ name: 'AbortError' });
        resolveCompile({});
        await new Promise((r) => setTimeout(r, 0));
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('rejects immediately when already aborted', async () => {
        const { runCvc5Wasm } = await import('./cvc5Wasm');
        await expect(runCvc5Wasm('', [], { signal: AbortSignal.abort() })).rejects.toMatchObject({
            name: 'AbortError',
        });
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('times out while compiling and never spawns a worker', async () => {
        const { runCvc5Wasm } = await import('./cvc5Wasm');
        const r = await runCvc5Wasm('(check-sat)', [], { timeoutMs: 5 });
        expect(r.status).toBe('timeout');
        resolveCompile({});
        await new Promise((r) => setTimeout(r, 0));
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('does not cache a failed compile', async () => {
        const { runCvc5Wasm } = await import('./cvc5Wasm');
        const p1 = runCvc5Wasm('', []);
        rejectCompile(new Error('boom'));
        await expect(p1).rejects.toThrow('boom');
        const p2 = runCvc5Wasm('', []);
        expect(compile).toHaveBeenCalledTimes(2);
        resolveCompile({});
        await new Promise((r) => setTimeout(r, 0));
        expect(FakeWorker.instances).toHaveLength(1);
        const done = { type: 'done', exitCode: 0, stdout: 'sat\n', stderr: '' };
        FakeWorker.instances[0].onmessage?.({ data: done } as MessageEvent);
        const r = await p2;
        expect(r.status).toBe('sat');
        expect(FakeWorker.instances[0].terminated).toBe(true);
    });
});
