import { printSExpr } from './sexpr';
import type { SExpr } from './sexpr';
import type { AletheCommand, AletheProof } from './types';

export function commandToSExpr(cmd: AletheCommand): SExpr {
    switch (cmd.kind) {
        case 'assume':
            return ['assume', cmd.id, cmd.term];
        case 'step': {
            const out: SExpr[] = ['step', cmd.id, ['cl', ...cmd.clause], ':rule', cmd.rule];
            if (cmd.premises.length > 0) out.push(':premises', [...cmd.premises]);
            if (cmd.args.length > 0) out.push(':args', cmd.args);
            if (cmd.discharge.length > 0) out.push(':discharge', [...cmd.discharge]);
            for (const [k, v] of cmd.extra) out.push(k, v);
            return out;
        }
        case 'anchor': {
            const out: SExpr[] = ['anchor', ':step', cmd.id];
            if (cmd.args !== null) out.push(':args', cmd.args);
            return out;
        }
        case 'define-fun':
            return ['define-fun', cmd.name, cmd.params, cmd.sort, cmd.body];
        case 'define-const':
            return ['define-const', cmd.name, cmd.sort, cmd.body];
        case 'other':
            return cmd.sexpr;
    }
}

export function printCommand(cmd: AletheCommand): string {
    return printSExpr(commandToSExpr(cmd));
}

/**
 * Flat command list, one command per line, no outer parentheses (the format Carcara expects).
 * The status line is dropped unless `includeStatus` is set (parseAlethe reads it back either way).
 */
export function printAlethe(proof: AletheProof, opts: { includeStatus?: boolean } = {}): string {
    const lines: string[] = [];
    if (opts.includeStatus && proof.status !== null) lines.push(proof.status);
    for (const cmd of proof.commands) lines.push(printCommand(cmd));
    return lines.join('\n') + '\n';
}
