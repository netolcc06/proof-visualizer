import { namedAnnotation } from './sexpr';
import type { SExpr } from './sexpr';
import type { AletheProof } from './types';
const files = import.meta.glob('./__fixtures__/*.alethe', { query: '?raw', import: 'default', eager: true });

export function fixture(name: string): string {
    const text = files[`./__fixtures__/${name}`];
    if (typeof text !== 'string') throw new Error(`Missing fixture ${name}`);
    return text;
}

/** Names (from `names`) that are referenced before their `(! t :named n)` definition, in printing order. */
export function usedBeforeDefined(proof: AletheProof, names: ReadonlySet<string>): string[] {
    const bad: string[] = [];
    const defined = new Set<string>();
    const walk = (root: SExpr) => {
        type Frame = { list: SExpr[]; i: number; name?: string };
        const stack: Frame[] = [];
        const visit = (e: SExpr, afterNamed: boolean) => {
            if (typeof e === 'string') {
                if (!afterNamed && names.has(e) && !defined.has(e)) bad.push(e);
            } else {
                stack.push({ list: e, i: 0, name: namedAnnotation(e)?.name });
            }
        };
        visit(root, false);
        while (stack.length > 0) {
            const f = stack[stack.length - 1];
            if (f.i >= f.list.length) {
                stack.pop();
                if (f.name !== undefined) defined.add(f.name);
            } else {
                visit(f.list[f.i], f.i > 0 && f.list[f.i - 1] === ':named');
                f.i++;
            }
        }
    };
    for (const cmd of proof.commands) {
        if (cmd.kind === 'assume') walk(cmd.term);
        else if (cmd.kind === 'step') [...cmd.clause, ...cmd.args, ...cmd.extra.map(([, v]) => v)].forEach(walk);
        else if (cmd.kind === 'anchor') (cmd.args ?? []).forEach(walk);
        else if (cmd.kind === 'define-fun' || cmd.kind === 'define-const') walk(cmd.body);
    }
    return bad;
}
