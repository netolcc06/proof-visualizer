// S-expression tokenizer/parser/printer (SMT-LIB 2.6 lexical rules). All routines are iterative.

export type SExpr = string | SExpr[];

export class AletheParseError extends Error {
    readonly line: number;
    readonly column: number;
    readonly detail: string;

    /** `message` includes the position; `detail` is the message without it. */
    constructor(detail: string, line: number, column: number) {
        super(`${detail} (line ${line}, column ${column})`);
        this.name = 'AletheParseError';
        this.detail = detail;
        this.line = line;
        this.column = column;
    }
}

/** 1-based line/column of a character offset. */
export function positionAt(text: string, offset: number): { line: number; column: number } {
    let line = 1;
    let last = -1;
    let i = text.indexOf('\n');
    while (i !== -1 && i < offset) {
        line++;
        last = i;
        i = text.indexOf('\n', i + 1);
    }
    return { line, column: offset - last };
}

export function parseErrorAt(text: string, offset: number, detail: string): AletheParseError {
    const { line, column } = positionAt(text, offset);
    return new AletheParseError(detail, line, column);
}

export interface SExprParseResult {
    exprs: SExpr[];
    /** Start offsets of the top-level expressions. */
    starts: number[];
    /** Start offsets of the children of the first top-level list (locates commands in a wrapped proof). */
    firstChildStarts: number[];
}

function isDelimiter(c: number): boolean {
    // whitespace ( ) " ;
    return c <= 32 || c === 40 || c === 41 || c === 34 || c === 59 || c === 0xa0 || c === 0xfeff;
}

export function parseSExprsDetailed(text: string): SExprParseResult {
    const n = text.length;
    const top: SExpr[] = [];
    const starts: number[] = [];
    const firstChildStarts: number[] = [];
    const stack: SExpr[][] = [];
    const openAt: number[] = [];
    let cur: SExpr[] = top;

    const record = (start: number) => {
        if (stack.length === 0) starts.push(start);
        else if (stack.length === 1 && top.length === 0) firstChildStarts.push(start);
    };

    let i = 0;
    while (i < n) {
        const c = text.charCodeAt(i);
        if (c <= 32 || c === 0xa0 || c === 0xfeff) {
            i++;
        } else if (c === 59) {
            const nl = text.indexOf('\n', i);
            i = nl === -1 ? n : nl + 1;
        } else if (c === 40) {
            stack.push(cur);
            openAt.push(i);
            cur = [];
            i++;
        } else if (c === 41) {
            if (stack.length === 0) throw parseErrorAt(text, i, "Unexpected ')'");
            const done = cur;
            const start = openAt.pop() as number;
            cur = stack.pop() as SExpr[];
            record(start);
            cur.push(done);
            i++;
        } else if (c === 124) {
            const j = text.indexOf('|', i + 1);
            if (j === -1) throw parseErrorAt(text, i, 'Unterminated quoted symbol');
            record(i);
            cur.push(text.slice(i, j + 1));
            i = j + 1;
        } else if (c === 34) {
            let j = i + 1;
            for (;;) {
                j = text.indexOf('"', j);
                if (j === -1) throw parseErrorAt(text, i, 'Unterminated string literal');
                if (text.charCodeAt(j + 1) === 34) j += 2;
                else break;
            }
            record(i);
            cur.push(text.slice(i, j + 1));
            i = j + 1;
        } else {
            let j = i + 1;
            while (j < n && !isDelimiter(text.charCodeAt(j))) j++;
            record(i);
            cur.push(text.slice(i, j));
            i = j;
        }
    }
    if (stack.length > 0) throw parseErrorAt(text, openAt[openAt.length - 1], "Unclosed '('");
    return { exprs: top, starts, firstChildStarts };
}

export function parseSExprs(text: string): SExpr[] {
    return parseSExprsDetailed(text).exprs;
}

/** `plain`: as is. `abbrev`: `(! t :named n)` -> `n`. `strip`: `(! t :named n)` -> `t`. */
export type RenderMode = 'plain' | 'abbrev' | 'strip';

export function namedAnnotation(list: SExpr[]): { term: SExpr; name: string } | null {
    if (list[0] !== '!' || list.length < 4) return null;
    for (let i = 2; i + 1 < list.length; i++) {
        const name = list[i + 1];
        if (list[i] === ':named' && typeof name === 'string') return { term: list[1], name };
    }
    return null;
}

/** Non-recursive printer; `atomMap` optionally substitutes whole atoms by strings. */
export function renderSExpr(
    e: SExpr,
    mode: RenderMode = 'plain',
    atomMap?: { get(key: string): string | undefined },
): string {
    const out: string[] = [];
    const stack: SExpr[][] = [];
    const pos: number[] = [];
    let next: SExpr | undefined = e;
    let space = false;
    for (;;) {
        if (next === undefined) {
            if (stack.length === 0) break;
            const list = stack[stack.length - 1];
            const p = pos[pos.length - 1];
            if (p >= list.length) {
                out.push(')');
                stack.pop();
                pos.pop();
                space = true;
            } else {
                pos[pos.length - 1] = p + 1;
                next = list[p];
            }
            continue;
        }
        let item: SExpr = next;
        next = undefined;
        while (mode !== 'plain' && Array.isArray(item)) {
            const named = namedAnnotation(item);
            if (!named) break;
            item = mode === 'abbrev' ? named.name : named.term;
            if (mode === 'abbrev') break;
        }
        if (space) out.push(' ');
        if (typeof item === 'string') {
            out.push(atomMap?.get(item) ?? item);
            space = true;
        } else {
            out.push('(');
            stack.push(item);
            pos.push(0);
            space = false;
        }
    }
    return out.join('');
}

export function printSExpr(e: SExpr): string {
    return renderSExpr(e, 'plain');
}
