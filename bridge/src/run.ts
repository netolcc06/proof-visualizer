import { spawn } from 'node:child_process';
import { HttpError } from './types.ts';
import type { ToolConfig } from './types.ts';
import { toWslPath } from './paths.ts';

export interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
    timedOut: boolean;
}

export class Semaphore {
    private active = 0;
    private waiters: (() => void)[] = [];
    private limit: number;
    constructor(limit: number) {
        this.limit = limit;
    }
    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiters.push(resolve));
        else this.active++;
        try {
            return await fn();
        } finally {
            const next = this.waiters.shift();
            if (next) next();
            else this.active--;
        }
    }
}

export function checkCommand(tool: ToolConfig): void {
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(tool.command))
        throw new HttpError(
            500,
            `"${tool.command}" is a .cmd/.bat script; configure a real executable (.exe) or run the tool via WSL`,
        );
}

export function toolPath(tool: ToolConfig, p: string): string {
    return tool.pathStyle === 'wsl' ? toWslPath(p) : p;
}

export function runTool(
    tool: ToolConfig,
    args: string[],
    opts: { timeoutMs: number; cwd: string; maxOutputBytes: number },
): Promise<RunResult> {
    checkCommand(tool);
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const child = spawn(tool.command, [...tool.args, ...args], {
            cwd: opts.cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            shell: false,
        });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        let size = 0;
        let timedOut = false;
        let overflow = false;
        const collect = (bucket: Buffer[]) => (chunk: Buffer) => {
            size += chunk.length;
            if (size > opts.maxOutputBytes) {
                overflow = true;
                child.kill('SIGKILL');
                return;
            }
            bucket.push(chunk);
        };
        child.stdout.on('data', collect(out));
        child.stderr.on('data', collect(err));
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, opts.timeoutMs);
        child.on('error', (e: NodeJS.ErrnoException) => {
            clearTimeout(timer);
            reject(new HttpError(500, `failed to start "${tool.command}": ${e.code ?? e.message}`));
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (overflow) return reject(new HttpError(500, 'tool output exceeded the size limit'));
            resolve({
                stdout: Buffer.concat(out).toString('utf8').replace(/\r\n/g, '\n'),
                stderr: Buffer.concat(err).toString('utf8').replace(/\r\n/g, '\n'),
                exitCode: timedOut ? null : code,
                durationMs: Date.now() - start,
                timedOut,
            });
        });
    });
}
