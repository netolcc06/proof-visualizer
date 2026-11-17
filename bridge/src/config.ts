import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_HOSTS, DEFAULT_ORIGINS } from './origin.ts';
import type { BridgeConfig, PathStyle, ToolConfig, ToolName } from './types.ts';

const BRIDGE_DIR = path.resolve(import.meta.dirname, '..');
export const BUNDLED_RARE = path.join(BRIDGE_DIR, 'rare', 'cvc5-rewrites.rare');

const TOOL_NAMES: ToolName[] = ['cvc5', 'verit', 'carcara'];
const ENV_TOOL: Record<ToolName, string> = { cvc5: 'CVC5_PATH', verit: 'VERIT_PATH', carcara: 'CARCARA_PATH' };
const PATH_BINARIES: Record<ToolName, string[]> = { cvc5: ['cvc5'], verit: ['veriT', 'verit'], carcara: ['carcara'] };

export const DEFAULTS = {
    port: 4000,
    host: '127.0.0.1',
    maxBodyBytes: 64 * 1024 * 1024,
    maxConcurrent: 2,
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 600_000,
    maxOutputBytes: 256 * 1024 * 1024,
};

function isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function posInt(v: unknown, fallback: number, what: string): number {
    if (v === undefined) return fallback;
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0)
        throw new Error(`config: ${what} must be a positive integer`);
    return v;
}

function parseTool(name: string, raw: unknown): ToolConfig {
    if (typeof raw === 'string') raw = { command: raw };
    if (typeof raw !== 'object' || raw === null) throw new Error(`config: tools.${name} must be an object`);
    const o = raw as Record<string, unknown>;
    if (typeof o.command !== 'string' || !o.command) throw new Error(`config: tools.${name}.command must be a string`);
    if (o.args !== undefined && !isStringArray(o.args))
        throw new Error(`config: tools.${name}.args must be a string array`);
    if (o.defaultArgs !== undefined && !isStringArray(o.defaultArgs))
        throw new Error(`config: tools.${name}.defaultArgs must be a string array`);
    if (o.rareFile !== undefined && o.rareFile !== null && typeof o.rareFile !== 'string')
        throw new Error(`config: tools.${name}.rareFile must be a string or null`);
    if (o.pathStyle !== undefined && o.pathStyle !== 'native' && o.pathStyle !== 'wsl')
        throw new Error(`config: tools.${name}.pathStyle must be "native" or "wsl"`);
    const tool: ToolConfig = {
        command: o.command,
        args: (o.args as string[] | undefined) ?? [],
        pathStyle: (o.pathStyle as PathStyle | undefined) ?? 'native',
    };
    if (o.defaultArgs) tool.defaultArgs = o.defaultArgs as string[];
    if (o.rareFile !== undefined) tool.rareFile = o.rareFile === null || o.rareFile === '' ? null : path.resolve(BRIDGE_DIR, o.rareFile as string);
    return tool;
}

// Find an executable on PATH. On Windows only real executables (.exe/.com) are considered.
export function findOnPath(
    names: string[],
    env: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): string | null {
    const dirs = (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
    const exts = platform === 'win32' ? ['.exe', '.com'] : [''];
    for (const dir of dirs) {
        for (const name of names) {
            for (const ext of exts) {
                const full = path.join(dir, name + ext);
                try {
                    if (!statSync(full).isFile()) continue;
                    if (platform !== 'win32') accessSync(full, constants.X_OK);
                    return full;
                } catch {
                    // not here
                }
            }
        }
    }
    return null;
}

export interface LoadOptions {
    fileText?: string | null;
    env?: NodeJS.ProcessEnv;
    detect?: boolean;
}

export function loadConfig(opts: LoadOptions = {}): BridgeConfig {
    const env = opts.env ?? process.env;
    let file: Record<string, unknown> = {};
    if (opts.fileText) {
        try {
            file = JSON.parse(opts.fileText) as Record<string, unknown>;
        } catch (e) {
            throw new Error(`config: invalid JSON (${(e as Error).message})`);
        }
        if (typeof file !== 'object' || file === null || Array.isArray(file))
            throw new Error('config: root must be an object');
    }

    const port = env.PORT ? Number(env.PORT) : file.port === 0 ? 0 : posInt(file.port, DEFAULTS.port, 'port');
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('config: invalid port');
    const host = env.HOST || (typeof file.host === 'string' ? file.host : DEFAULTS.host);

    const origins = [...DEFAULT_ORIGINS];
    if (file.allowedOrigins !== undefined) {
        if (!isStringArray(file.allowedOrigins)) throw new Error('config: allowedOrigins must be a string array');
        origins.push(...file.allowedOrigins);
    }
    if (env.BRIDGE_ALLOWED_ORIGINS) origins.push(...env.BRIDGE_ALLOWED_ORIGINS.split(',').map((s) => s.trim()));
    const allowedOrigins = [...new Set(origins.filter(Boolean).map((o) => o.replace(/\/$/, '')))];

    let hosts = DEFAULT_HOSTS;
    if (file.allowedHosts !== undefined) {
        if (!isStringArray(file.allowedHosts)) throw new Error('config: allowedHosts must be a string array');
        hosts = file.allowedHosts;
    }
    if (env.BRIDGE_ALLOWED_HOSTS) hosts = env.BRIDGE_ALLOWED_HOSTS.split(',');
    const allowedHosts = [...new Set(hosts.map((h) => h.trim().toLowerCase()).filter(Boolean))];

    const tools: BridgeConfig['tools'] = {};
    const rawTools = (file.tools ?? {}) as Record<string, unknown>;
    for (const name of TOOL_NAMES) {
        let tool = rawTools[name] !== undefined ? parseTool(name, rawTools[name]) : undefined;
        const envPath = env[ENV_TOOL[name]];
        if (envPath) tool = { args: [], pathStyle: 'native', ...tool, command: envPath };
        if (!tool && opts.detect !== false) {
            const found = findOnPath(PATH_BINARIES[name], env);
            if (found) tool = { command: found, args: [], pathStyle: 'native' };
        }
        if (tool && name === 'carcara' && tool.rareFile === undefined) tool.rareFile = existsSync(BUNDLED_RARE) ? BUNDLED_RARE : null;
        if (tool) tools[name] = tool;
    }

    return {
        port,
        host,
        allowedOrigins,
        allowedHosts,
        maxBodyBytes: posInt(file.maxBodyBytes, DEFAULTS.maxBodyBytes, 'maxBodyBytes'),
        maxConcurrent: posInt(file.maxConcurrent, DEFAULTS.maxConcurrent, 'maxConcurrent'),
        defaultTimeoutMs: posInt(file.defaultTimeoutMs, DEFAULTS.defaultTimeoutMs, 'defaultTimeoutMs'),
        maxTimeoutMs: posInt(file.maxTimeoutMs, DEFAULTS.maxTimeoutMs, 'maxTimeoutMs'),
        maxOutputBytes: posInt(file.maxOutputBytes, DEFAULTS.maxOutputBytes, 'maxOutputBytes'),
        tools,
    };
}

export function loadConfigFromDisk(dir: string, env: NodeJS.ProcessEnv = process.env): BridgeConfig {
    const file = env.BRIDGE_CONFIG ?? path.join(dir, 'bridge.config.json');
    let fileText: string | null = null;
    try {
        fileText = readFileSync(file, 'utf8');
    } catch (e) {
        if (env.BRIDGE_CONFIG || (e as NodeJS.ErrnoException).code !== 'ENOENT')
            throw new Error(`cannot read ${file}: ${(e as Error).message}`);
    }
    return loadConfig({ fileText, env });
}
