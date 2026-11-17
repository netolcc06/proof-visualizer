import type { ToolName } from './types.ts';

// Flags the bridge enforces; user copies are dropped silently.
const ENFORCED: Record<'cvc5' | 'verit', string[]> = {
    cvc5: ['--dump-proofs', '--proof-format=alethe'],
    verit: ['--disable-print-success', '--proof=-'],
};

// Flags users may never pass (output redirection, external program execution, arbitrary file access).
const DENIED: Record<ToolName, string[]> = {
    cvc5: [
        '-o',
        '--output',
        '--proof-format',
        '--proof-format-mode',
        '--dump-to',
        '--regular-output-channel',
        '--diagnostic-output-channel',
        '--replay-log',
        '--in',
    ],
    verit: ['--proof', '--output', '--proof-stats', '--proof-file-from-input'],
    carcara: [
        '-x',
        '--sat-ref-checker',
        '--sat-solver',
        '--drat-checker',
        '--smt-solver',
        '--rare-file',
        '--sliced-output',
        '--from',
        '--max-distance',
        '-d',
        '--eunoia-mech',
    ],
};

export const CVC5_DEFAULT_ARGS = ['--dump-proofs', '--proof-format=alethe', '--proof-granularity=dsl-rewrite'];
export const VERIT_DEFAULT_ARGS = [
    '--disable-banner',
    '--disable-print-success',
    '--proof=-',
    '--proof-prune',
    '--proof-merge',
    '--proof-with-sharing',
];

export const CARCARA_DEFAULT_ARGS = ['--allow-int-real-subtyping'];

export class ArgError extends Error {}

function flagName(arg: string): string {
    const eq = arg.indexOf('=');
    return eq === -1 ? arg : arg.slice(0, eq);
}

// Throws ArgError for denied or malformed user args; returns the args unchanged otherwise.
export function validateUserArgs(tool: ToolName, args: unknown): string[] {
    if (args === undefined) return [];
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string'))
        throw new ArgError('args must be an array of strings');
    for (const arg of args as string[]) {
        if (arg.includes('\0')) throw new ArgError('args must not contain NUL');
        const name = flagName(arg);
        if (DENIED[tool].includes(name)) throw new ArgError(`argument not allowed: ${name}`);
        // Short-flag clusters such as -ix would hide -x.
        if (tool === 'carcara' && /^-[A-Za-z]+$/.test(arg) && arg.slice(1).includes('x'))
            throw new ArgError('argument not allowed: -x');
        // Bare words would be treated as extra input files by the solvers.
        if (tool !== 'carcara' && !arg.startsWith('-'))
            throw new ArgError(`positional argument not allowed: ${arg} (use --opt=value)`);
    }
    return args as string[];
}

// Defaults first; a user flag with the same name replaces the default. Enforced flags always end up present.
export function buildSolverArgs(tool: 'cvc5' | 'verit', defaults: string[], userArgs: string[]): string[] {
    const userNames = new Set(userArgs.map(flagName));
    const kept = defaults.filter((d) => !userNames.has(flagName(d)));
    const merged = [...kept, ...userArgs].filter((a) => !ENFORCED[tool].includes(a));
    return [...ENFORCED[tool], ...merged];
}

// Carcara options go after the positionals; a user flag with the same name replaces the default.
export function buildCarcaraArgs(defaults: string[], userArgs: string[]): string[] {
    const userNames = new Set(userArgs.map(flagName));
    return [...defaults.filter((d) => !userNames.has(flagName(d))), ...userArgs];
}
