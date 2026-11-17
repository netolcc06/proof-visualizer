import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    ArgError,
    buildCarcaraArgs,
    buildSolverArgs,
    CARCARA_DEFAULT_ARGS,
    CVC5_DEFAULT_ARGS,
    validateUserArgs,
    VERIT_DEFAULT_ARGS,
} from './args.ts';
import { isHostAllowed, isOriginAllowed } from './origin.ts';
import {
    looksLikeProblem,
    parseCheckOutput,
    parseElaborateOutput,
    splitSolverOutput,
} from './parse.ts';
import { runTool, Semaphore, toolPath } from './run.ts';
import type { RunResult } from './run.ts';
import { HttpError } from './types.ts';
import type { BridgeConfig, ToolConfig, ToolName } from './types.ts';

const HEALTH_TTL_MS = 60_000;

interface ReqCtx {
    tool?: string;
    exitCode?: number | null;
}

type Body = Record<string, unknown>;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const declared = Number(req.headers['content-length']);
        if (declared > limit) return reject(new HttpError(413, `request body exceeds ${limit} bytes`));
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
            size += c.length;
            if (size > limit) {
                chunks.length = 0;
                reject(new HttpError(413, `request body exceeds ${limit} bytes`));
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function str(body: Body, key: string): string {
    const v = body[key];
    if (typeof v !== 'string' || v === '') throw new HttpError(400, `"${key}" must be a non-empty string`);
    return v;
}

export function createBridge(config: BridgeConfig, version = '0.0.0'): Server {
    const semaphore = new Semaphore(config.maxConcurrent);
    let healthCache: { at: number; value: unknown } | null = null;

    function getTool(name: ToolName): ToolConfig {
        const tool = config.tools[name];
        if (!tool) throw new HttpError(503, `${name} is not available: set its path in bridge.config.json or env`);
        return tool;
    }

    function timeoutOf(body: Body): number {
        const t = body.timeoutMs;
        if (t === undefined) return Math.min(config.defaultTimeoutMs, config.maxTimeoutMs);
        if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) throw new HttpError(400, '"timeoutMs" must be a positive number');
        return Math.min(Math.floor(t), config.maxTimeoutMs);
    }

    function userArgs(name: ToolName, body: Body): string[] {
        try {
            return validateUserArgs(name, body.args);
        } catch (e) {
            if (e instanceof ArgError) throw new HttpError(400, e.message);
            throw e;
        }
    }

    // Runs `fn` in a fresh temp dir, queued behind the concurrency limit.
    function withJob<T>(fn: (dir: string) => Promise<T>): Promise<T> {
        return semaphore.run(async () => {
            const dir = await mkdtemp(path.join(tmpdir(), 'pv-bridge-'));
            try {
                return await fn(dir);
            } finally {
                await rm(dir, { recursive: true, force: true }).catch(() => {});
            }
        });
    }

    const run = (tool: ToolConfig, args: string[], dir: string, timeoutMs: number): Promise<RunResult> =>
        runTool(tool, args, { timeoutMs, cwd: dir, maxOutputBytes: config.maxOutputBytes });

    // Global flags go before the subcommand; options (defaults, RARE file, user args) after the positionals.
    async function carcaraArgv(
        cmd: 'check' | 'elaborate' | 'slice',
        tool: ToolConfig,
        dir: string,
        body: Body,
        positional: string[],
        user: string[],
        opts: { rare: boolean },
    ): Promise<string[]> {
        const global = ['--no-color', ...(cmd === 'check' ? [] : ['--no-print-with-sharing'])];
        const extra: string[] = [];
        if (opts.rare) {
            let rare = tool.rareFile ?? null;
            if (body.rareFile !== undefined) {
                if (typeof body.rareFile !== 'string') throw new HttpError(400, '"rareFile" must be a string (file content)');
                rare = path.join(dir, 'rules.rare');
                await writeFile(rare, body.rareFile);
            }
            if (rare) extra.push('--rare-file', toolPath(tool, rare));
        }
        const defaults = tool.defaultArgs ?? CARCARA_DEFAULT_ARGS;
        return [...global, cmd, ...positional, ...extra, ...buildCarcaraArgs(defaults, user)];
    }

    let healthRefresh: Promise<unknown> | null = null;

    // Stale-while-revalidate: version probes can take seconds (e.g. WSL startup)
    async function health() {
        if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.value;
        healthRefresh ??= probeHealth().finally(() => (healthRefresh = null));
        return healthCache ? healthCache.value : healthRefresh;
    }

    async function probeHealth() {
        const tools: Record<string, { path: string; version: string; rareFile?: string | null } | null> = {};
        await Promise.all(
            (['cvc5', 'verit', 'carcara'] as ToolName[]).map(async (name) => {
                const tool = config.tools[name];
                tools[name] = null;
                if (!tool) return;
                try {
                    const r = await runTool(tool, ['--version'], { timeoutMs: 10_000, cwd: tmpdir(), maxOutputBytes: 1 << 20 });
                    if (r.exitCode !== 0) return;
                    const line = (r.stdout.trim() || r.stderr.trim()).split(/\r?\n/)[0] ?? '';
                    tools[name] = { path: [tool.command, ...tool.args].join(' '), version: line };
                    if (name === 'carcara') tools[name].rareFile = tool.rareFile ? path.basename(tool.rareFile) : null;
                } catch {
                    // not runnable: reported as null
                }
            }),
        );
        const value = { version, tools: { cvc5: tools.cvc5, verit: tools.verit, carcara: tools.carcara } };
        healthCache = { at: Date.now(), value };
        return value;
    }

    async function solve(body: Body, ctx: ReqCtx) {
        const solver = body.solver;
        if (solver !== 'cvc5' && solver !== 'verit') throw new HttpError(400, 'unknown solver (expected "cvc5" or "verit")');
        ctx.tool = solver;
        const problem = str(body, 'problem');
        const user = userArgs(solver, body);
        const timeoutMs = timeoutOf(body);
        const tool = getTool(solver);
        const defaults = tool.defaultArgs ?? (solver === 'cvc5' ? CVC5_DEFAULT_ARGS : VERIT_DEFAULT_ARGS);
        return withJob(async (dir) => {
            const file = path.join(dir, 'problem.smt2');
            await writeFile(file, problem);
            const r = await run(tool, [...buildSolverArgs(solver, defaults, user), toolPath(tool, file)], dir, timeoutMs);
            ctx.exitCode = r.exitCode;
            const split = splitSolverOutput(r.stdout);
            return {
                status: r.timedOut ? 'timeout' : split.status,
                proof: r.timedOut ? null : split.proof,
                stdout: r.stdout,
                stderr: r.stderr,
                exitCode: r.exitCode,
                durationMs: r.durationMs,
                timedOut: r.timedOut,
            };
        });
    }

    async function writeProofAndProblem(dir: string, body: Body) {
        const proofFile = path.join(dir, 'proof.alethe');
        const problemFile = path.join(dir, 'problem.smt2');
        await writeFile(proofFile, str(body, 'proof'));
        await writeFile(problemFile, str(body, 'problem'));
        return { proofFile, problemFile };
    }

    async function carcaraCheck(body: Body, ctx: ReqCtx) {
        ctx.tool = 'carcara';
        const tool = getTool('carcara');
        const user = userArgs('carcara', body);
        const timeoutMs = timeoutOf(body);
        str(body, 'proof');
        str(body, 'problem');
        return withJob(async (dir) => {
            const f = await writeProofAndProblem(dir, body);
            const argv = await carcaraArgv('check', tool, dir, body, [toolPath(tool, f.proofFile), toolPath(tool, f.problemFile)], user, { rare: true });
            const r = await run(tool, argv, dir, timeoutMs);
            ctx.exitCode = r.exitCode;
            const parsed = r.timedOut ? { valid: false, holey: false } : parseCheckOutput(r.stdout);
            return { ...parsed, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut };
        });
    }

    async function carcaraElaborate(body: Body, ctx: ReqCtx) {
        ctx.tool = 'carcara';
        const tool = getTool('carcara');
        const user = userArgs('carcara', body);
        const timeoutMs = timeoutOf(body);
        str(body, 'proof');
        str(body, 'problem');
        return withJob(async (dir) => {
            const f = await writeProofAndProblem(dir, body);
            const argv = await carcaraArgv('elaborate', tool, dir, body, [toolPath(tool, f.proofFile), toolPath(tool, f.problemFile)], user, { rare: true });
            const r = await run(tool, argv, dir, timeoutMs);
            ctx.exitCode = r.exitCode;
            return {
                proof: parseElaborateOutput(r.stdout, r.exitCode),
                stdout: r.stdout,
                stderr: r.stderr,
                exitCode: r.exitCode,
                durationMs: r.durationMs,
                timedOut: r.timedOut,
            };
        });
    }

    async function carcaraSlice(body: Body, ctx: ReqCtx) {
        ctx.tool = 'carcara';
        const tool = getTool('carcara');
        const user = userArgs('carcara', body);
        const timeoutMs = timeoutOf(body);
        str(body, 'proof');
        str(body, 'problem');
        const from = str(body, 'from');
        if (from.startsWith('-')) throw new HttpError(400, '"from" must be a step id');
        const maxDistance = body.maxDistance;
        if (maxDistance !== undefined && (typeof maxDistance !== 'number' || !Number.isInteger(maxDistance) || maxDistance < 0))
            throw new HttpError(400, '"maxDistance" must be a non-negative integer');
        const elaborate = body.elaborate === true;
        return withJob(async (dir) => {
            const f = await writeProofAndProblem(dir, body);
            const outA = path.join(dir, 'sliced-out-1.txt');
            const outB = path.join(dir, 'sliced-out-2.txt');
            const positional = [toolPath(tool, f.proofFile), toolPath(tool, f.problemFile), '--from', from];
            if (maxDistance !== undefined) positional.push('-d', String(maxDistance));
            positional.push('--sliced-output', toolPath(tool, outA), toolPath(tool, outB));
            const r = await run(tool, await carcaraArgv('slice', tool, dir, body, positional, user, { rare: false }), dir, timeoutMs);
            ctx.exitCode = r.exitCode;

            let slicedProof: string | null = null;
            let slicedProblem: string | null = null;
            if (r.exitCode === 0) {
                // Carcara's help names the outputs <problem> <proof> but the code writes <proof> <problem>; classify by content.
                const texts = await Promise.all([outA, outB].map((p) => readFile(p, 'utf8').catch(() => null)));
                for (const t of texts) {
                    if (t === null) continue;
                    if (looksLikeProblem(t)) slicedProblem = t;
                    else slicedProof = t;
                }
            }

            let result = { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut };
            let elaboratedProof: string | null = null;
            if (elaborate && slicedProof !== null && slicedProblem !== null) {
                const pf = path.join(dir, 'sliced.alethe');
                const pb = path.join(dir, 'sliced.smt2');
                await writeFile(pf, slicedProof);
                await writeFile(pb, slicedProblem);
                const eargv = await carcaraArgv('elaborate', tool, dir, body, [toolPath(tool, pf), toolPath(tool, pb)], user, { rare: true });
                const e = await run(tool, eargv, dir, timeoutMs);
                elaboratedProof = parseElaborateOutput(e.stdout, e.exitCode);
                ctx.exitCode = e.exitCode;
                result = {
                    stdout: r.stdout,
                    stderr: [r.stderr, e.stderr].filter(Boolean).join('\n'),
                    exitCode: e.exitCode,
                    durationMs: r.durationMs + e.durationMs,
                    timedOut: e.timedOut,
                };
            }
            return { slicedProof, slicedProblem, elaboratedProof, ...result };
        });
    }

    const routes: Record<string, (body: Body, ctx: ReqCtx) => Promise<unknown>> = {
        '/api/solve': solve,
        '/api/carcara/check': carcaraCheck,
        '/api/carcara/elaborate': carcaraElaborate,
        '/api/carcara/slice': carcaraSlice,
    };

    async function handle(req: IncomingMessage, res: ServerResponse, ctx: ReqCtx): Promise<void> {
        const origin = req.headers.origin;
        if (!isHostAllowed(req.headers.host, config.host, config.allowedHosts)) throw new HttpError(403, 'host not allowed');
        if (!isOriginAllowed(origin, config.allowedOrigins)) throw new HttpError(403, `origin not allowed: ${origin}`);
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }

        const url = new URL(req.url ?? '/', 'http://localhost');
        const route = url.pathname.replace(/\/+$/, '') || '/';

        if (req.method === 'OPTIONS') {
            const headers: Record<string, string> = {
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '600',
            };
            if (req.headers['access-control-request-private-network']) headers['Access-Control-Allow-Private-Network'] = 'true';
            res.writeHead(204, headers);
            res.end();
            return;
        }

        if (route === '/api/health') {
            if (req.method !== 'GET') throw new HttpError(405, 'use GET');
            ctx.tool = 'health';
            return sendJson(res, 200, await health());
        }

        const handler = routes[route];
        if (!handler) throw new HttpError(404, `unknown endpoint: ${route}`);
        if (req.method !== 'POST') throw new HttpError(405, 'use POST');
        const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
        if (type !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json');

        const raw = await readBody(req, config.maxBodyBytes);
        let body: unknown;
        try {
            body = JSON.parse(raw.toString('utf8'));
        } catch {
            throw new HttpError(400, 'invalid JSON body');
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'body must be a JSON object');
        sendJson(res, 200, await handler(body as Body, ctx));
    }

    return createServer((req, res) => {
        const start = Date.now();
        const ctx: ReqCtx = {};
        let status = 0;
        res.on('finish', () => {
            const p = (req.url ?? '').split('?')[0];
            console.log(
                `${req.method} ${p} tool=${ctx.tool ?? '-'} ${Date.now() - start}ms exit=${ctx.exitCode ?? '-'} status=${status || res.statusCode}`,
            );
        });
        handle(req, res, ctx).catch((e: unknown) => {
            const err = e instanceof HttpError ? e : new HttpError(500, `internal error: ${(e as Error).message}`);
            status = err.status;
            if (res.headersSent) return res.destroy();
            // Oversized bodies: answer and close instead of draining the upload.
            if (err.status === 413) res.setHeader('Connection', 'close');
            sendJson(res, err.status, { error: err.message });
        });
    });
}
