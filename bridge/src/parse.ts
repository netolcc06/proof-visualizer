export type SolverStatus = 'unsat' | 'sat' | 'unknown' | 'timeout' | 'error';

// First stdout line is the status, the rest is the proof.
export function splitSolverOutput(raw: string): { status: SolverStatus; proof: string | null } {
    // veriT prints `success` per command unless --disable-print-success is given
    const stdout = raw.replace(/^[ \t]*success[ \t]*\r?\n/gm, '');
    const nl = stdout.indexOf('\n');
    const first = (nl === -1 ? stdout : stdout.slice(0, nl)).trim();
    const rest = nl === -1 ? '' : stdout.slice(nl + 1);
    if (first === 'unsat') return { status: 'unsat', proof: rest.trim() ? rest.trimEnd() + '\n' : null };
    if (first === 'sat' || first === 'unknown') return { status: first, proof: null };
    return { status: 'error', proof: null };
}

export function parseCheckOutput(stdout: string): { valid: boolean; holey: boolean } {
    const word = stdout.trim().split(/\s+/)[0] ?? '';
    return { valid: word === 'valid' || word === 'holey', holey: word === 'holey' };
}

// `carcara elaborate` prints a status line (valid/holey) and then the proof.
export function parseElaborateOutput(stdout: string, exitCode: number | null): string | null {
    if (exitCode !== 0) return null;
    const nl = stdout.indexOf('\n');
    const first = (nl === -1 ? stdout : stdout.slice(0, nl)).trim();
    if (first !== 'valid' && first !== 'holey') return stdout.trim() ? stdout : null;
    const rest = nl === -1 ? '' : stdout.slice(nl + 1);
    return rest.trim() ? rest : null;
}

export function looksLikeProblem(text: string): boolean {
    return /\(check-sat\)/.test(text) && !/\(step\s/.test(text);
}
