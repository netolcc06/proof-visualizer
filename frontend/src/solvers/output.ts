import type { SolverRunResult } from './types';

const isSuccess = (l: string) => l.trim() === 'success';

/**
 * Splits solver stdout into the status line and the proof text (unsat only).
 * Exact `success` lines (print-success) before/after the status line and around the proof are skipped.
 */
export function splitSolverOutput(stdout: string): { status: SolverRunResult['status']; proof: string | null } {
    const lines = stdout.replace(/\r\n/g, '\n').split('\n');
    const skip = (l: string) => l.trim() === '' || isSuccess(l);
    const first = lines.findIndex((l) => !skip(l));
    if (first < 0) return { status: 'error', proof: null };
    const head = lines[first].trim();
    let body = lines.slice(first + 1);
    // trim leading/trailing noise; interior lines are proof text
    while (body.length && skip(body[0])) body = body.slice(1);
    while (body.length && skip(body[body.length - 1])) body = body.slice(0, -1);
    const rest = body.join('\n').trim();
    if (head === 'unsat') return { status: 'unsat', proof: rest === '' ? null : rest };
    if (head === 'sat') return { status: 'sat', proof: null };
    if (head === 'unknown') return { status: 'unknown', proof: null };
    return { status: 'error', proof: null };
}
