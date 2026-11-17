// Carcara command line and output handling shared by the in-browser runner. It mirrors bridge/src/args.ts and
// bridge/src/parse.ts (the bridge is a separate Node package and cannot import from the frontend);
// carcaraCli.test.ts pins the same behaviour as the bridge unit tests.

export type CarcaraCommand = 'check' | 'elaborate' | 'slice';

/** Default options; a user flag with the same name replaces the default. */
export const CARCARA_DEFAULT_ARGS = ['--allow-int-real-subtyping'];

// Flags users may never pass: external program execution (unavailable in wasm anyway), RARE file, slice plumbing.
const DENIED = [
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
];

const flagName = (arg: string) => arg.split('=', 1)[0];

/** Throws for denied or malformed user args; returns them unchanged otherwise. */
export function validateCarcaraUserArgs(args: string[] | undefined): string[] {
    if (args === undefined) return [];
    for (const arg of args) {
        if (arg.includes('\0')) throw new Error('args must not contain NUL');
        if (DENIED.includes(flagName(arg))) throw new Error(`argument not allowed: ${flagName(arg)}`);
        // Short-flag clusters such as -ix would hide -x.
        if (/^-[A-Za-z]+$/.test(arg) && arg.slice(1).includes('x')) throw new Error('argument not allowed: -x');
    }
    return args;
}

/** Defaults first; a user flag with the same name replaces the default. */
export function buildCarcaraArgs(defaults: string[], userArgs: string[]): string[] {
    const userNames = new Set(userArgs.map(flagName));
    return [...defaults.filter((d) => !userNames.has(flagName(d))), ...userArgs];
}

/**
 * Same layout as the bridge: global flags before the subcommand (term sharing is off for elaborate and slice, since
 * renumbered `@p_N` names would break splicing), then the positionals, the RARE file and the options.
 */
export function buildCarcaraArgv(
    cmd: CarcaraCommand,
    positional: string[],
    { rarePath, userArgs = [] }: { rarePath?: string | null; userArgs?: string[] } = {},
): string[] {
    const global = ['--no-color', ...(cmd === 'check' ? [] : ['--no-print-with-sharing'])];
    const extra = rarePath ? ['--rare-file', rarePath] : [];
    return [...global, cmd, ...positional, ...extra, ...buildCarcaraArgs(CARCARA_DEFAULT_ARGS, userArgs)];
}

/** `carcara check` prints valid, holey or invalid. */
export function parseCheckOutput(stdout: string): { valid: boolean; holey: boolean } {
    const word = stdout.trim().split(/\s+/)[0] ?? '';
    return { valid: word === 'valid' || word === 'holey', holey: word === 'holey' };
}

/** `carcara elaborate` prints a status line (valid/holey) and then the proof. */
export function parseElaborateOutput(stdout: string, exitCode: number | null): string | null {
    if (exitCode !== 0) return null;
    const nl = stdout.indexOf('\n');
    const first = (nl === -1 ? stdout : stdout.slice(0, nl)).trim();
    if (first !== 'valid' && first !== 'holey') return stdout.trim() ? stdout : null;
    const rest = nl === -1 ? '' : stdout.slice(nl + 1);
    return rest.trim() ? rest : null;
}

/** `slice --sliced-output` writes the proof and the problem to two files; tell them apart by content. */
export function looksLikeProblem(text: string): boolean {
    return /\(check-sat\)/.test(text) && !/\(step\s/.test(text);
}

/** Steps whose elaboration or checking needs an external solver, which cannot run in the browser. */
export function needsExternalTool(proof: string): boolean {
    return /:rule\s+lia_generic\b/.test(proof);
}

export const EXTERNAL_TOOL_NOTE =
    'lia_generic steps stay as holes: checking or elaborating them needs an external SMT solver, which cannot run in the browser.';
