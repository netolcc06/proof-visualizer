import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createBridge } from '../src/app.ts';
import { BUNDLED_RARE, loadConfig } from '../src/config.ts';
import type { BridgeConfig, ToolConfig } from '../src/types.ts';

const fakes = path.join(import.meta.dirname, 'fakes');
const fixtures = path.resolve(import.meta.dirname, '../../frontend/src/alethe/__fixtures__');
const CVC5 = process.env.PV_TEST_CVC5;
const hasCvc5 = !!CVC5 && existsSync(CVC5);
const VERIT = process.env.PV_TEST_VERIT;
const hasVerit = !!VERIT && existsSync(VERIT);

function fake(script: string) {
    return { command: process.execPath, args: [path.join(fakes, script)], pathStyle: 'native' as const };
}

function baseConfig(over: Partial<BridgeConfig> = {}): BridgeConfig {
    const c = loadConfig({ detect: false, env: {} });
    c.port = 0;
    c.tools = { verit: fake('fake-verit.mjs'), carcara: { ...fake('fake-carcara.mjs'), rareFile: BUNDLED_RARE } };
    if (hasCvc5) c.tools.cvc5 = { command: CVC5!, args: [], pathStyle: 'native' };
    return { ...c, ...over };
}

async function start(config: BridgeConfig) {
    const server = createBridge(config, 'test');
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(base + p, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: typeof body === 'string' ? body : JSON.stringify(body),
        });
    return { server, base, post, close: () => new Promise<void>((r) => server.close(() => r())) };
}

const quiet = console.log;
const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith('pv-bridge-')).length;

describe('bridge', () => {
    let ctx: Awaited<ReturnType<typeof start>>;
    const logs: string[] = [];
    const before0 = leftovers();
    before(async () => {
        console.log = (...a: unknown[]) => void logs.push(a.join(' '));
        ctx = await start(baseConfig());
    });
    after(async () => {
        console.log = quiet;
        await ctx.close();
        assert.equal(leftovers(), before0, 'temp dirs are removed');
    });

    test('health reports tools and logs requests', async () => {
        const r = await fetch(ctx.base + '/api/health');
        assert.equal(r.status, 200);
        const j = (await r.json()) as { version: string; tools: Record<string, { version: string } | null> };
        assert.equal(j.version, 'test');
        assert.match(j.tools.verit!.version, /veriT/);
        assert.match(j.tools.carcara!.version, /carcara/);
        assert.ok(logs.some((l) => l.startsWith('GET /api/health') && l.includes('status=200')));
    });

    test('verit solve: unsat with proof, sat without', async () => {
        const r = await ctx.post('/api/solve', { solver: 'verit', problem: '(assert false)\n(check-sat)' });
        const j = (await r.json()) as Record<string, unknown>;
        assert.equal(j.status, 'unsat');
        assert.match(j.proof as string, /^\(assume h1 false\)/);
        assert.equal(j.exitCode, 0);
        assert.equal(typeof j.durationMs, 'number');
        const s = (await (await ctx.post('/api/solve', { solver: 'verit', problem: '(assert true)' })).json()) as Record<string, unknown>;
        assert.equal(s.status, 'sat');
        assert.equal(s.proof, null);
    });

    test('solve merges user args after the defaults', async () => {
        const r = await ctx.post('/api/solve', { solver: 'verit', problem: ';args', args: ['--max-time=3'] });
        const j = (await r.json()) as { proof: string };
        assert.match(j.proof, /--proof=-/);
        assert.match(j.proof, /--max-time=3/);
    });

    test('solve timeout kills the process', async () => {
        const t = Date.now();
        const r = await ctx.post('/api/solve', { solver: 'verit', problem: ';sleep', timeoutMs: 300 });
        const j = (await r.json()) as Record<string, unknown>;
        assert.equal(j.status, 'timeout');
        assert.equal(j.exitCode, null);
        assert.ok(Date.now() - t < 5000);
    });

    test('carcara check: valid, holey, invalid', async () => {
        const check = async (proof: string) => (await (await ctx.post('/api/carcara/check', { proof, problem: '(check-sat)' })).json()) as Record<string, unknown>;
        const ok = await check('(assume a0 true)');
        assert.deepEqual([ok.valid, ok.holey, ok.exitCode], [true, false, 0]);
        const holey = await check('(step t1 (cl) :rule hole)');
        assert.deepEqual([holey.valid, holey.holey], [true, true]);
        const bad = await check('(step t1 (cl) :rule bad-rule)');
        assert.deepEqual([bad.valid, bad.exitCode], [false, 1]);
        assert.match(bad.stderr as string, /unknown rule/);
    });

    test('carcara argv: global flags, defaults, RARE file', async () => {
        const run = async (extra: Record<string, unknown> = {}) => {
            const r = await ctx.post('/api/carcara/check', { proof: ';args', problem: '(check-sat)', ...extra });
            return JSON.parse(((await r.json()) as { stdout: string }).stdout) as string[];
        };
        const argv = await run();
        assert.equal(argv[0], '--no-color');
        assert.equal(argv[1], 'check');
        assert.ok(argv.includes('--allow-int-real-subtyping'));
        const i = argv.indexOf('--rare-file');
        assert.ok(i > 0 && /cvc5-rewrites.rare$/.test(argv[i + 1]!));
        const custom = await run({ rareFile: '(declare-rare-rule x ())' });
        assert.match(custom[custom.indexOf('--rare-file') + 1]!, /rules.rare$/);
        const bad = await ctx.post('/api/carcara/check', { proof: 'x', problem: 'y', args: ['--rare-file=/etc/passwd'] });
        assert.equal(bad.status, 400);
        const h = (await (await fetch(ctx.base + '/api/health')).json()) as { tools: { carcara: { rareFile: string | null } } };
        assert.equal(h.tools.carcara.rareFile, 'cvc5-rewrites.rare');
    });

    test('carcara elaborate/slice disable term sharing', async () => {
        const r = await ctx.post('/api/carcara/elaborate', { proof: ';args', problem: '(check-sat)' });
        const argv = JSON.parse(((await r.json()) as { stdout: string }).stdout) as string[];
        assert.deepEqual(argv.slice(0, 3), ['--no-color', '--no-print-with-sharing', 'elaborate']);
    });

    test('carcara elaborate strips the status line', async () => {
        const r = await ctx.post('/api/carcara/elaborate', { proof: '(step t1 (cl) :rule resolution)', problem: '(check-sat)' });
        const j = (await r.json()) as { proof: string | null; stdout: string };
        assert.equal(j.proof, '(step t1 (cl) :rule th_resolution)\n');
        assert.match(j.stdout, /^valid\n/);
    });

    test('carcara slice (+ elaborate) returns sliced files', async () => {
        const proof = '(assume a0 true)\n(step t1 (cl) :rule resolution :premises (a0))\n(step t2 (cl) :rule resolution)\n';
        const problem = '(assert true)\n(check-sat)\n';
        const r = await ctx.post('/api/carcara/slice', { proof, problem, from: 't1', maxDistance: 2, elaborate: true });
        const j = (await r.json()) as Record<string, string | number | null>;
        assert.equal(j.exitCode, 0);
        assert.match(j.slicedProof as string, /\(step t1 /);
        assert.doesNotMatch(j.slicedProof as string, /\(step t2 /);
        assert.match(j.slicedProblem as string, /\(check-sat\)\n\(exit\)/);
        assert.match(j.elaboratedProof as string, /th_resolution/);

        const plain = (await (await ctx.post('/api/carcara/slice', { proof, problem, from: 't1' })).json()) as Record<string, unknown>;
        assert.equal(plain.elaboratedProof, null);
        assert.ok(plain.slicedProof);

        const bad = (await (await ctx.post('/api/carcara/slice', { proof, problem, from: 'nope' })).json()) as Record<string, unknown>;
        assert.equal(bad.exitCode, 1);
        assert.equal(bad.slicedProof, null);
    });

    test('errors: unknown solver, bad args, bad fields', async () => {
        let r = await ctx.post('/api/solve', { solver: 'z3', problem: 'x' });
        assert.equal(r.status, 400);
        assert.match(((await r.json()) as { error: string }).error, /unknown solver/);
        r = await ctx.post('/api/solve', { solver: 'verit', problem: 'x', args: ['--proof=/tmp/evil'] });
        assert.equal(r.status, 400);
        r = await ctx.post('/api/carcara/check', { proof: 'x', problem: 'y', args: ['-x', 'a=b'] });
        assert.equal(r.status, 400);
        r = await ctx.post('/api/solve', { solver: 'verit' });
        assert.equal(r.status, 400);
        r = await ctx.post('/api/solve', '{nope');
        assert.equal(r.status, 400);
        r = await ctx.post('/api/nothing', {});
        assert.equal(r.status, 404);
        r = await fetch(ctx.base + '/api/solve');
        assert.equal(r.status, 405);
    });

    test('content type is required', async () => {
        const r = await fetch(ctx.base + '/api/solve', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
        assert.equal(r.status, 415);
        assert.match(((await r.json()) as { error: string }).error, /application\/json/);
        const r2 = await fetch(ctx.base + '/api/solve', { method: 'POST', body: '{}' });
        assert.equal(r2.status, 415);
    });

    test('origin allowlist and CORS', async () => {
        const bad = await ctx.post('/api/solve', { solver: 'verit', problem: 'x' }, { Origin: 'http://evil.example' });
        assert.equal(bad.status, 403);
        assert.equal(bad.headers.get('access-control-allow-origin'), null);

        const good = await fetch(ctx.base + '/api/health', { headers: { Origin: 'http://localhost:3000' } });
        assert.equal(good.status, 200);
        assert.equal(good.headers.get('access-control-allow-origin'), 'http://localhost:3000');

        const pre = await fetch(ctx.base + '/api/solve', {
            method: 'OPTIONS',
            headers: { Origin: 'https://ufmg-smite.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type', 'Access-Control-Request-Private-Network': 'true' },
        });
        assert.equal(pre.status, 204);
        assert.equal(pre.headers.get('access-control-allow-origin'), 'https://ufmg-smite.github.io');
        assert.match(pre.headers.get('access-control-allow-headers') ?? '', /Content-Type/i);
        assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');

        const preBad = await fetch(ctx.base + '/api/solve', { method: 'OPTIONS', headers: { Origin: 'http://evil.example' } });
        assert.equal(preBad.status, 403);
    });

    test('rejects foreign Host headers (DNS rebinding)', async () => {
        const { request } = await import('node:http');
        const status = await new Promise<number>((resolve, reject) => {
            const req = request(ctx.base + '/api/health', { headers: { Host: 'evil.example' } }, (res) => {
                res.resume();
                resolve(res.statusCode ?? 0);
            });
            req.on('error', reject);
            req.end();
        });
        assert.equal(status, 403);
    });

    test('unconfigured tool gives a clear 503', async () => {
        const c = await start(baseConfig({ tools: {} }));
        try {
            const r = await c.post('/api/solve', { solver: 'cvc5', problem: 'x' });
            assert.equal(r.status, 503);
            assert.match(((await r.json()) as { error: string }).error, /cvc5 is not available/);
            const h = (await (await fetch(c.base + '/api/health')).json()) as { tools: Record<string, unknown> };
            assert.deepEqual(h.tools, { cvc5: null, verit: null, carcara: null });
        } finally {
            await c.close();
        }
    });

    test('missing executable gives a clear 500', async () => {
        const c = await start(baseConfig({ tools: { verit: { command: path.join(fakes, 'does-not-exist'), args: [], pathStyle: 'native' } } }));
        try {
            const r = await c.post('/api/solve', { solver: 'verit', problem: 'x' });
            assert.equal(r.status, 500);
            assert.match(((await r.json()) as { error: string }).error, /failed to start/);
        } finally {
            await c.close();
        }
    });

    test('oversized body is rejected with 413', async () => {
        const c = await start(baseConfig({ maxBodyBytes: 1000 }));
        try {
            const r = await c.post('/api/solve', { solver: 'verit', problem: 'x'.repeat(5000) });
            assert.equal(r.status, 413);
            assert.match(((await r.json()) as { error: string }).error, /exceeds/);
        } finally {
            await c.close();
        }
    });

    test('jobs beyond maxConcurrent are queued', async () => {
        const c = await start(baseConfig({ maxConcurrent: 1 }));
        try {
            const t = Date.now();
            const reqs = [1, 2].map(() => c.post('/api/solve', { solver: 'verit', problem: ';sleep', timeoutMs: 400 }));
            await Promise.all(reqs.map(async (p) => (await p).json()));
            assert.ok(Date.now() - t >= 750, 'second job waited for the first');
        } finally {
            await c.close();
        }
    });
});

describe('real cvc5', { skip: hasCvc5 ? false : 'set PV_TEST_CVC5 to a cvc5 binary' }, () => {
    let ctx: Awaited<ReturnType<typeof start>>;
    before(async () => {
        ctx = await start(baseConfig());
    });
    after(() => ctx.close());

    test('health shows the cvc5 version', async () => {
        const j = (await (await fetch(ctx.base + '/api/health')).json()) as { tools: { cvc5: { version: string } } };
        assert.match(j.tools.cvc5.version, /cvc5/);
    });

    for (const name of ['ex1', 'euf']) {
        test(`solve ${name}: unsat + Alethe proof`, async () => {
            const problem = readFileSync(path.join(fixtures, `${name}.smt2`), 'utf8');
            const j = (await (await ctx.post('/api/solve', { solver: 'cvc5', problem })).json()) as Record<string, unknown>;
            assert.equal(j.status, 'unsat', String(j.stderr));
            assert.match(j.proof as string, /\(step /);
            assert.match(j.proof as string, /\(assume /);
            assert.doesNotMatch(j.proof as string, /^unsat/);
            assert.ok(!(j.proof as string).includes(String.fromCharCode(13)));
        });
    }

    test('solve sat problem has no proof', async () => {
        const j = (await (await ctx.post('/api/solve', { solver: 'cvc5', problem: '(set-logic QF_UF)(declare-fun p () Bool)(assert p)(check-sat)' })).json()) as Record<string, unknown>;
        assert.equal(j.status, 'sat');
        assert.equal(j.proof, null);
    });

    test('user cannot redirect output', async () => {
        const r = await ctx.post('/api/solve', { solver: 'cvc5', problem: '(check-sat)', args: ['--dump-to=x'] });
        assert.equal(r.status, 400);
    });
});

describe('real veriT', { skip: hasVerit ? false : 'set PV_TEST_VERIT to a veriT binary' }, () => {
    let ctx: Awaited<ReturnType<typeof start>>;
    before(async () => {
        ctx = await start(baseConfig({ tools: { verit: { command: VERIT!, args: [], pathStyle: 'native' } } }));
    });
    after(() => ctx.close());

    test('health and solve ex1', async () => {
        const h = (await (await fetch(ctx.base + '/api/health')).json()) as { tools: { verit: { version: string } } };
        assert.match(h.tools.verit.version, /veriT/);
        const problem = readFileSync(path.join(fixtures, 'ex1.smt2'), 'utf8');
        const j = (await (await ctx.post('/api/solve', { solver: 'verit', problem })).json()) as Record<string, unknown>;
        assert.equal(j.status, 'unsat', String(j.stderr));
        assert.match(j.proof as string, /^\(assume /);
        assert.match(j.proof as string, /:rule /);
        assert.doesNotMatch(j.proof as string, /^success/m);
    });
});

const WSL = process.env.PV_TEST_CARCARA_WSL === '1';
const CARCARA = process.env.PV_TEST_CARCARA;
const hasCarcara = !!CARCARA && existsSync(CARCARA);

// Same checks for a native binary (PV_TEST_CARCARA) and for WSL from Windows (PV_TEST_CARCARA_WSL)
const carcaraSuites: { name: string; skip: string | false; carcara: () => ToolConfig }[] = [
    {
        name: 'native',
        skip: hasCarcara ? false : 'set PV_TEST_CARCARA to a carcara binary',
        carcara: () => ({ command: CARCARA!, args: [], pathStyle: 'native' }),
    },
    {
        name: 'via WSL',
        skip: WSL ? false : 'set PV_TEST_CARCARA_WSL=1',
        // Absolute path inside WSL: non-login shells don't have ~/.cargo/bin on PATH
        carcara: () => ({ command: 'wsl', args: ['-d', 'Ubuntu', '--', process.env.PV_TEST_CARCARA_WSL_BIN ?? 'carcara'], pathStyle: 'wsl' }),
    },
];

for (const suite of carcaraSuites)
describe(`real Carcara ${suite.name}`, { skip: suite.skip }, () => {
    let ctx: Awaited<ReturnType<typeof start>>;
    const fx = (n: string) => readFileSync(path.join(fixtures, n), 'utf8');
    before(async () => {
        const carcara = suite.carcara();
        const cfg = baseConfig({ tools: { carcara } });
        cfg.tools.carcara!.rareFile = path.resolve(import.meta.dirname, '../rare/cvc5-rewrites.rare');
        ctx = await start(cfg);
    });
    after(() => ctx.close());

    test('check euf is valid', async () => {
        const j = (await (await ctx.post('/api/carcara/check', { proof: fx('euf.alethe'), problem: fx('euf.smt2') })).json()) as Record<string, unknown>;
        assert.equal(j.valid, true, String(j.stderr));
        assert.ok(!String(j.stderr).includes(String.fromCharCode(27)));
    });

    test('elaborate euf', async () => {
        const j = (await (await ctx.post('/api/carcara/elaborate', { proof: fx('euf.alethe'), problem: fx('euf.smt2') })).json()) as { proof: string | null; stderr: string };
        assert.ok(j.proof?.trimStart().startsWith('(assume'), j.stderr);
    });

    test('slice lia from t28 with elaboration', async () => {
        const j = (await (await ctx.post('/api/carcara/slice', { proof: fx('lia.alethe'), problem: fx('lia.smt2'), from: 't28', maxDistance: 2, elaborate: true })).json()) as Record<string, string | null>;
        assert.ok(j.slicedProof && j.slicedProblem, String(j.stderr));
        assert.match(j.elaboratedProof ?? '', /\(step t28/);
    });
});
