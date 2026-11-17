import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArgError, buildCarcaraArgs, buildSolverArgs, CVC5_DEFAULT_ARGS, validateUserArgs, VERIT_DEFAULT_ARGS } from '../src/args.ts';
import { loadConfig } from '../src/config.ts';
import { isHostAllowed, isOriginAllowed } from '../src/origin.ts';
import { parseCheckOutput, parseElaborateOutput, splitSolverOutput } from '../src/parse.ts';
import { toWslPath } from '../src/paths.ts';
import { Semaphore } from '../src/run.ts';

const noDetect = { detect: false, env: {} };

test('config: defaults', () => {
    const c = loadConfig(noDetect);
    assert.equal(c.port, 4000);
    assert.equal(c.host, '127.0.0.1');
    assert.ok(c.allowedOrigins.includes('https://ufmg-smite.github.io'));
    assert.ok(c.allowedOrigins.includes('http://localhost:8080'));
    assert.deepEqual(c.allowedHosts, ['localhost', '127.0.0.1', '[::1]']);
    assert.deepEqual(c.tools, {});
});

test('config: file + env overrides', () => {
    const fileText = JSON.stringify({
        port: 5000,
        allowedOrigins: ['http://localhost:5173/'],
        tools: { carcara: { command: 'wsl', args: ['carcara'], pathStyle: 'wsl' }, cvc5: 'cvc5-file' },
    });
    const c = loadConfig({
        fileText,
        detect: false,
        env: { PORT: '6000', HOST: '0.0.0.0', CVC5_PATH: '/opt/cvc5', BRIDGE_ALLOWED_ORIGINS: 'https://a.example, https://b.example', BRIDGE_ALLOWED_HOSTS: 'localhost, Bridge' },
    });
    assert.equal(c.port, 6000);
    assert.equal(c.host, '0.0.0.0');
    assert.equal(c.tools.cvc5?.command, '/opt/cvc5');
    assert.equal(c.tools.carcara?.command, 'wsl');
    assert.equal(c.tools.carcara?.pathStyle, 'wsl');
    assert.match(c.tools.carcara?.rareFile ?? '', /cvc5-rewrites.rare$/);
    assert.ok(c.allowedOrigins.includes('http://localhost:5173'));
    assert.ok(c.allowedOrigins.includes('https://b.example'));
    assert.deepEqual(c.allowedHosts, ['localhost', 'bridge']);
});

test('config: validation errors', () => {
    assert.throws(() => loadConfig({ fileText: '{', detect: false, env: {} }), /invalid JSON/);
    assert.throws(
        () => loadConfig({ fileText: '{"tools":{"cvc5":{"command":"x","pathStyle":"dos"}}}', detect: false, env: {} }),
        /pathStyle/,
    );
    assert.throws(() => loadConfig({ fileText: '{"maxConcurrent":0}', detect: false, env: {} }), /maxConcurrent/);
});

test('wsl path conversion', () => {
    assert.equal(toWslPath('C:\\Users\\me\\AppData\\Local\\Temp\\pv-1\\proof.alethe'), '/mnt/c/Users/me/AppData/Local/Temp/pv-1/proof.alethe');
    assert.equal(toWslPath('d:/x/y'), '/mnt/d/x/y');
    assert.equal(toWslPath('/tmp/a'), '/tmp/a');
    assert.equal(toWslPath('C:\\'), '/mnt/c');
});

test('arg validation: cvc5', () => {
    assert.deepEqual(validateUserArgs('cvc5', ['--tlimit=1000', '--produce-models']), ['--tlimit=1000', '--produce-models']);
    for (const bad of ['-o', '--output=x', '--proof-format=lfsc', '--dump-to=/etc/x', '--regular-output-channel=/tmp/x', 'file.smt2'])
        assert.throws(() => validateUserArgs('cvc5', [bad]), ArgError, bad);
    assert.throws(() => validateUserArgs('cvc5', 'x'), ArgError);
    assert.throws(() => validateUserArgs('cvc5', [1]), ArgError);
});

test('arg validation: verit and carcara', () => {
    assert.throws(() => validateUserArgs('verit', ['--proof=/tmp/x']), ArgError);
    assert.throws(() => validateUserArgs('verit', ['--proof']), ArgError);
    assert.deepEqual(validateUserArgs('verit', ['--max-time=5']), ['--max-time=5']);
    for (const bad of ['-x', '-ix', '--sat-solver=sh', '--rare-file=/etc/passwd', '--sliced-output', '--from=1'])
        assert.throws(() => validateUserArgs('carcara', [bad]), ArgError, bad);
    assert.deepEqual(validateUserArgs('carcara', ['-i', '--allowed-rules', 'foo', 'bar']), ['-i', '--allowed-rules', 'foo', 'bar']);
    assert.deepEqual(validateUserArgs('carcara', undefined), []);
});

test('arg building: enforced flags and overrides', () => {
    assert.deepEqual(buildSolverArgs('cvc5', CVC5_DEFAULT_ARGS, []), CVC5_DEFAULT_ARGS);
    const a = buildSolverArgs('cvc5', CVC5_DEFAULT_ARGS, ['--proof-granularity=theory-rewrite', '--dump-proofs']);
    assert.deepEqual(a, ['--dump-proofs', '--proof-format=alethe', '--proof-granularity=theory-rewrite']);
    // a user-supplied defaultArgs list that forgets the enforced flag still gets it
    assert.ok(buildSolverArgs('verit', ['--disable-banner'], []).includes('--proof=-'));
    assert.deepEqual(buildSolverArgs('verit', VERIT_DEFAULT_ARGS, ['--max-time=3']).slice(-1), ['--max-time=3']);
});

test('origin and host checks', () => {
    const allowed = ['http://localhost:3000'];
    assert.equal(isOriginAllowed(undefined, allowed), true);
    assert.equal(isOriginAllowed('http://localhost:3000', allowed), true);
    assert.equal(isOriginAllowed('http://localhost:3000/', allowed), true);
    assert.equal(isOriginAllowed('http://evil.example', allowed), false);
    assert.equal(isOriginAllowed('null', allowed), false);
    assert.equal(isHostAllowed('localhost:4000', '127.0.0.1'), true);
    assert.equal(isHostAllowed('127.0.0.1:4000', '127.0.0.1'), true);
    assert.equal(isHostAllowed('[::1]:4000', '127.0.0.1'), true);
    assert.equal(isHostAllowed('evil.example:4000', '127.0.0.1'), false);
    assert.equal(isHostAllowed(undefined, '127.0.0.1'), false);
    // non-loopback bind: allowlist (default = loopback names)
    assert.equal(isHostAllowed('localhost:4000', '0.0.0.0'), true);
    assert.equal(isHostAllowed('evil.example', '0.0.0.0'), false);
    assert.equal(isHostAllowed('Bridge:4000', '0.0.0.0', ['bridge']), true);
    assert.equal(isHostAllowed('localhost', '0.0.0.0', ['bridge']), false);
});

test('output parsing', () => {
    assert.deepEqual(splitSolverOutput('unsat\n(\n(step t1 (cl) :rule false)\n)\n'), {
        status: 'unsat',
        proof: '(\n(step t1 (cl) :rule false)\n)\n',
    });
    assert.deepEqual(splitSolverOutput('unsat\r\n(step t1 (cl) :rule false)\r\n').status, 'unsat');
    assert.deepEqual(splitSolverOutput('success\nsuccess\nunsat\n(assume a true)\n'), {
        status: 'unsat',
        proof: '(assume a true)\n',
    });
    assert.deepEqual(splitSolverOutput('unsat\n'), { status: 'unsat', proof: null });
    assert.deepEqual(splitSolverOutput('sat\n'), { status: 'sat', proof: null });
    assert.deepEqual(splitSolverOutput('unknown'), { status: 'unknown', proof: null });
    assert.deepEqual(splitSolverOutput('(error "boom")\n'), { status: 'error', proof: null });
    assert.deepEqual(splitSolverOutput(''), { status: 'error', proof: null });

    assert.deepEqual(parseCheckOutput('valid\n'), { valid: true, holey: false });
    assert.deepEqual(parseCheckOutput('holey\n'), { valid: true, holey: true });
    assert.deepEqual(parseCheckOutput('invalid\n'), { valid: false, holey: false });
    assert.deepEqual(parseCheckOutput(''), { valid: false, holey: false });

    assert.equal(parseElaborateOutput('valid\n(assume a0 true)\n', 0), '(assume a0 true)\n');
    assert.equal(parseElaborateOutput('holey\n(assume a0 true)\n', 0), '(assume a0 true)\n');
    assert.equal(parseElaborateOutput('valid\n(assume a0 true)\n', 1), null);
    assert.equal(parseElaborateOutput('valid\n', 0), null);
});

test('semaphore limits concurrency', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
        Array.from({ length: 6 }, () =>
            sem.run(async () => {
                peak = Math.max(peak, ++active);
                await new Promise((r) => setTimeout(r, 10));
                active--;
            }),
        ),
    );
    assert.equal(peak, 2);
});

test('carcara args: defaults can be overridden', () => {
    assert.deepEqual(buildCarcaraArgs(['--allow-int-real-subtyping'], ['-i']), ['--allow-int-real-subtyping', '-i']);
    assert.deepEqual(buildCarcaraArgs(['--allow-int-real-subtyping'], ['--allow-int-real-subtyping']), ['--allow-int-real-subtyping']);
});

test('config: rareFile can be disabled or relocated', () => {
    const off = loadConfig({ fileText: '{"tools":{"carcara":{"command":"c","rareFile":null}}}', detect: false, env: {} });
    assert.equal(off.tools.carcara?.rareFile, null);
    const custom = loadConfig({ fileText: '{"tools":{"carcara":{"command":"c","rareFile":"x/y.rare"}}}', detect: false, env: {} });
    assert.match(custom.tools.carcara?.rareFile ?? '', /x[\\/]y\.rare$/);
});
