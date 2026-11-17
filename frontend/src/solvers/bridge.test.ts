import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { carcaraCheck, carcaraSlice, getBridgeHealth, getBridgeUrl, runSolverViaBridge, setBridgeUrl } from './bridge';

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('bridge client', () => {
    beforeEach(() => {
        localStorage.clear();
        setBridgeUrl('http://bridge.test/');
    });
    afterEach(() => vi.unstubAllGlobals());

    it('stores the url without trailing slash', () => {
        expect(getBridgeUrl()).toBe('http://bridge.test');
    });

    it('posts JSON to /api/solve', async () => {
        const result = { status: 'unsat', proof: '(x)', stdout: '', stderr: '', exitCode: 0, durationMs: 1 };
        const fetchMock = vi.fn().mockResolvedValue(json(result));
        vi.stubGlobal('fetch', fetchMock);
        const ac = new AbortController();
        const r = await runSolverViaBridge({ solver: 'cvc5', problem: '(check-sat)' }, ac.signal);
        expect(r).toEqual(result);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://bridge.test/api/solve');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(init.body)).toEqual({ solver: 'cvc5', problem: '(check-sat)' });
        expect(init.signal).toBe(ac.signal);
    });

    it('surfaces the server error message', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'cvc5 not installed' }, 503)));
        await expect(runSolverViaBridge({ solver: 'cvc5', problem: '' })).rejects.toThrow('cvc5 not installed');
    });

    it('falls back to the HTTP status when the body is not JSON', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })));
        await expect(carcaraCheck({ proof: '', problem: '' })).rejects.toThrow('HTTP 500');
    });

    it('reports an unreachable bridge', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
        await expect(carcaraSlice({ proof: '', problem: '', from: 't1' })).rejects.toThrow(/Cannot reach/);
    });

    it('health returns null when unreachable or not ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
        expect(await getBridgeHealth()).toBeNull();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 500)));
        expect(await getBridgeHealth()).toBeNull();
    });

    it('health returns the payload', async () => {
        const health = { version: '1', tools: { cvc5: null, verit: null, carcara: null } };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(health)));
        expect(await getBridgeHealth()).toEqual(health);
    });

    it('passes timeouts and non-zero exits through as normal results', async () => {
        const timeout = {
            status: 'timeout',
            proof: null,
            stdout: '',
            stderr: '',
            exitCode: null,
            durationMs: 5,
            timedOut: true,
        };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(timeout)));
        const r = await runSolverViaBridge({ solver: 'verit', problem: '', timeoutMs: 5 });
        expect(r.status).toBe('timeout');
        expect(r.timedOut).toBe(true);
        const check = {
            valid: false,
            holey: false,
            stdout: '',
            stderr: 'bad',
            exitCode: 1,
            durationMs: 2,
            timedOut: false,
        };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(check)));
        expect(await carcaraCheck({ proof: '', problem: '' })).toEqual(check);
    });

    it('forwards rareFile to carcara', async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ valid: true, holey: false }));
        vi.stubGlobal('fetch', fetchMock);
        await carcaraCheck({ proof: 'p', problem: 'q', rareFile: '(define-rule x)' });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).rareFile).toBe('(define-rule x)');
    });

    it('rethrows aborts unchanged', async () => {
        const ac = new AbortController();
        ac.abort();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
        await expect(runSolverViaBridge({ solver: 'cvc5', problem: '' }, ac.signal)).rejects.toThrow('Aborted');
    });
});
