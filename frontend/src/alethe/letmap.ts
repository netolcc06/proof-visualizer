import { namedAnnotation, renderSExpr } from './sexpr';
import type { SExpr } from './sexpr';
import type { AletheCommand, AletheProof } from './types';

/** name -> display string of its term (may reference other names). */
export interface LetMap {
    [name: string]: string;
}

/** Display form of a term: every `(! t :named n)` is abbreviated to `n`. Non-recursive. */
export function displayTerm(e: SExpr): string {
    return renderSExpr(e, 'abbrev');
}

function commandRoots(cmd: AletheCommand): SExpr[] {
    switch (cmd.kind) {
        case 'assume':
            return [cmd.term];
        case 'step':
            return [...cmd.clause, ...cmd.args, ...cmd.extra.map(([, v]) => v)];
        case 'anchor':
            return cmd.args ? [...cmd.args] : [];
        case 'define-fun':
        case 'define-const':
            return [cmd.body];
        case 'other':
            return [cmd.sexpr];
    }
}

/** First `(! t :named n)` occurrence of every name (the named term `t`), in traversal order. */
export function collectNamedTerms(proof: AletheProof): Map<string, SExpr> {
    const found = new Map<string, SExpr>();
    for (const cmd of proof.commands) {
        const stack: SExpr[] = commandRoots(cmd).reverse();
        while (stack.length > 0) {
            const e = stack.pop() as SExpr;
            if (typeof e === 'string') continue;
            const named = namedAnnotation(e);
            if (named && !found.has(named.name)) found.set(named.name, named.term);
            for (let i = e.length - 1; i >= 0; i--) stack.push(e[i]);
        }
    }
    return found;
}

/**
 * Collects every `(! t :named n)` (nested ones too; inner names stay abbreviated in the outer's display)
 * and every define-fun / define-const (0-ary: the body; with params: `(lambda (params) body)`).
 */
export function collectLetMap(proof: AletheProof): LetMap {
    const map: LetMap = Object.create(null);
    for (const [name, term] of collectNamedTerms(proof)) map[name] = displayTerm(term);
    for (const cmd of proof.commands) {
        if (cmd.kind !== 'define-fun' && cmd.kind !== 'define-const') continue;
        const body = displayTerm(cmd.body);
        map[cmd.name] = cmd.params.length === 0 ? body : `(lambda ${displayTerm(cmd.params)} ${body})`;
    }
    return map;
}

function isDelim(c: number): boolean {
    return c <= 32 || c === 40 || c === 41 || c === 34 || c === 59 || c === 0xa0;
}

/** Whole-symbol occurrences of let names in `text` (`@p_1` never matches inside `@p_12`). */
export function letNamesIn(text: string, letMap: LetMap): { name: string; index: number }[] {
    const out: { name: string; index: number }[] = [];
    const n = text.length;
    let i = 0;
    while (i < n) {
        const c = text.charCodeAt(i);
        if (isDelim(c)) {
            if (c === 34) {
                // string literal ("" is an escaped quote)
                let j = i + 1;
                for (;;) {
                    j = text.indexOf('"', j);
                    if (j === -1) return out;
                    if (text.charCodeAt(j + 1) === 34) j += 2;
                    else break;
                }
                i = j + 1;
            } else if (c === 59) {
                const nl = text.indexOf('\n', i);
                i = nl === -1 ? n : nl + 1;
            } else {
                i++;
            }
            continue;
        }
        let j: number;
        if (c === 124) {
            const close = text.indexOf('|', i + 1);
            j = close === -1 ? n : close + 1;
        } else {
            j = i + 1;
            while (j < n && !isDelim(text.charCodeAt(j))) j++;
        }
        const token = text.slice(i, j);
        if (Object.prototype.hasOwnProperty.call(letMap, token)) out.push({ name: token, index: i });
        i = j;
    }
    return out;
}

interface Frame {
    src: SExpr[];
    out: SExpr[];
    i: number;
    defines?: string;
}

/**
 * Rewrites the terms of `commands` so that every name in `defs` is defined (by `(! t :named n)`) before its first
 * use in printing order. Dropped commands may have held the first definition: a reference to a still-undefined name
 * is replaced by `(! <definition> :named n)`, and the inserted body is walked too. Repeated definitions of an already
 * defined name become plain references. Input terms are not mutated.
 */
export function ensureNamesDefined(
    commands: readonly AletheCommand[],
    defs: ReadonlyMap<string, SExpr>,
): AletheCommand[] {
    if (defs.size === 0) return [...commands];
    const defined = new Set<string>();

    const fix = (root: SExpr): SExpr => {
        const stack: Frame[] = [];
        const place = (item: SExpr, afterNamed: boolean): SExpr | undefined => {
            if (typeof item === 'string') {
                const body = afterNamed || defined.has(item) ? undefined : defs.get(item);
                if (body === undefined) return item;
                stack.push({ src: ['!', body, ':named', item], out: [], i: 0, defines: item });
                return undefined;
            }
            const named = namedAnnotation(item);
            if (named && defined.has(named.name)) return named.name;
            stack.push({ src: item, out: [], i: 0, defines: named?.name });
            return undefined;
        };
        const first = place(root, false);
        if (first !== undefined) return first;
        for (;;) {
            const f = stack[stack.length - 1];
            if (f.i >= f.src.length) {
                stack.pop();
                if (f.defines !== undefined) defined.add(f.defines);
                if (stack.length === 0) return f.out;
                stack[stack.length - 1].out.push(f.out);
                stack[stack.length - 1].i++;
                continue;
            }
            const r = place(f.src[f.i], f.i > 0 && f.src[f.i - 1] === ':named');
            if (r !== undefined) {
                f.out.push(r);
                f.i++;
            }
        }
    };

    return commands.map((cmd): AletheCommand => {
        switch (cmd.kind) {
            case 'assume':
                return { ...cmd, term: fix(cmd.term) };
            case 'step': {
                const clause = cmd.clause.map(fix);
                const args = cmd.args.map(fix);
                const extra = cmd.extra.map(([k, v]): [string, SExpr] => [k, fix(v)]);
                return { ...cmd, clause, args, extra };
            }
            case 'anchor':
                return cmd.args ? { ...cmd, args: cmd.args.map(fix) } : cmd;
            case 'define-fun':
            case 'define-const':
                return { ...cmd, body: fix(cmd.body) };
            case 'other':
                return cmd;
        }
    });
}
