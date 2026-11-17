import { AletheParseError, parseErrorAt, parseSExprsDetailed } from './sexpr';
import type { SExpr } from './sexpr';
import type { AletheCommand, AletheProof, AletheStep } from './types';

type Fail = (detail: string) => never;

function atomOf(e: SExpr | undefined, what: string, fail: Fail): string {
    if (typeof e !== 'string') return fail(`Expected ${what}`);
    return e;
}

function atomList(e: SExpr | undefined, what: string, fail: Fail): string[] {
    if (!Array.isArray(e)) return fail(`Expected a list for ${what}`);
    return e.map((x) => atomOf(x, `a symbol in ${what}`, fail));
}

function parseStep(sx: SExpr[], fail: Fail): AletheStep {
    if (sx.length < 4) fail('Malformed step: expected (step <id> (cl ...) :rule <rule> ...)');
    const id = atomOf(sx[1], 'a step id', fail);
    const c = sx[2];
    // A conclusion that is not `(cl ...)` is read as a unit clause.
    const clause = Array.isArray(c) && c[0] === 'cl' ? c.slice(1) : [c];
    const step: AletheStep = {
        kind: 'step',
        id,
        clause,
        rule: '',
        premises: [],
        args: [],
        discharge: [],
        anchor: null,
        extra: [],
    };
    let hasRule = false;
    let i = 3;
    while (i < sx.length) {
        const key = sx[i];
        if (typeof key !== 'string' || !key.startsWith(':')) return fail(`Step ${id}: expected an attribute keyword`);
        let value: SExpr | undefined = sx[i + 1];
        if (value === undefined || (typeof value === 'string' && value.startsWith(':'))) {
            value = [];
            i += 1;
        } else {
            i += 2;
        }
        switch (key) {
            case ':rule':
                step.rule = atomOf(value, `a rule name in step ${id}`, fail);
                hasRule = true;
                break;
            case ':premises':
                step.premises = atomList(value, `:premises of step ${id}`, fail);
                break;
            case ':discharge':
                step.discharge = atomList(value, `:discharge of step ${id}`, fail);
                break;
            case ':args':
                step.args = Array.isArray(value) ? value : [value];
                break;
            default:
                step.extra.push([key, value]);
        }
    }
    if (!hasRule) fail(`Step ${id} has no :rule`);
    return step;
}

/** Validates ids, premises and anchors of a built command list. Throws AletheParseError (line 0, column 0). */
export function validateProof(commands: readonly AletheCommand[]): void {
    const bad = (m: string): never => {
        throw new AletheParseError(m, 0, 0);
    };
    const known = new Set<string>();
    const stack: string[] = [];
    for (const cmd of commands) {
        if (cmd.kind === 'anchor') {
            stack.push(cmd.id);
        } else if (cmd.kind === 'assume' || cmd.kind === 'step') {
            if (known.has(cmd.id)) bad(`Duplicate id "${cmd.id}"`);
            if (cmd.kind === 'step') {
                for (const p of cmd.premises) {
                    if (!known.has(p)) bad(`Step ${cmd.id}: premise "${p}" refers to an unknown or later id`);
                }
                if (stack.length > 0 && stack[stack.length - 1] === cmd.id) stack.pop();
            }
            known.add(cmd.id);
        }
    }
    if (stack.length > 0) bad(`Anchor "${stack[stack.length - 1]}" is never closed by a step with that id`);
}

function buildCommands(items: SExpr[], offsetOf: (i: number) => number, text: string): AletheCommand[] {
    const commands: AletheCommand[] = [];
    const known = new Set<string>();
    const anchors: string[] = [];
    for (let k = 0; k < items.length; k++) {
        const sx = items[k];
        const fail: Fail = (detail) => {
            throw parseErrorAt(text, offsetOf(k), detail);
        };
        if (!Array.isArray(sx)) return fail('Expected a command list');
        const head = sx[0];
        const top = anchors.length > 0 ? anchors[anchors.length - 1] : null;
        if (head === 'assume') {
            if (sx.length !== 3) fail('Malformed assume: expected (assume <id> <term>)');
            const id = atomOf(sx[1], 'an assumption id', fail);
            if (known.has(id)) fail(`Duplicate id "${id}"`);
            known.add(id);
            commands.push({ kind: 'assume', id, term: sx[2], anchor: top });
        } else if (head === 'step') {
            const step = parseStep(sx, fail);
            if (known.has(step.id)) fail(`Duplicate id "${step.id}"`);
            for (const p of step.premises) {
                if (!known.has(p)) fail(`Step ${step.id}: premise "${p}" refers to an unknown or later id`);
            }
            const at = anchors.lastIndexOf(step.id);
            if (at !== -1) {
                if (at !== anchors.length - 1) {
                    fail(
                        `Step ${step.id} closes an anchor while inner anchor "${anchors[anchors.length - 1]}" is open`,
                    );
                }
                anchors.pop();
            }
            step.anchor = anchors.length > 0 ? anchors[anchors.length - 1] : null;
            known.add(step.id);
            commands.push(step);
        } else if (head === 'anchor') {
            let id: string | null = null;
            let args: SExpr[] | null = null;
            for (let i = 1; i < sx.length; i += 2) {
                if (sx[i] === ':step') id = atomOf(sx[i + 1], 'an anchor step id', fail);
                else if (sx[i] === ':args') {
                    const a = sx[i + 1];
                    if (!Array.isArray(a)) fail('Expected a list for anchor :args');
                    args = a as SExpr[];
                } else fail('Unexpected attribute in anchor');
            }
            if (id === null) return fail('Anchor without :step');
            if (known.has(id) || anchors.includes(id)) fail(`Anchor id "${id}" is already used`);
            commands.push({ kind: 'anchor', id, args, anchor: top });
            anchors.push(id);
        } else if (head === 'define-fun' && sx.length === 5 && Array.isArray(sx[2]) && typeof sx[1] === 'string') {
            commands.push({ kind: 'define-fun', name: sx[1], params: sx[2], sort: sx[3], body: sx[4] });
        } else if (head === 'define-const' && sx.length === 4 && typeof sx[1] === 'string') {
            commands.push({ kind: 'define-const', name: sx[1], params: [], sort: sx[2], body: sx[3] });
        } else {
            commands.push({ kind: 'other', sexpr: sx });
        }
    }
    if (anchors.length > 0) {
        const id = anchors[anchors.length - 1];
        throw parseErrorAt(
            text,
            Math.max(0, text.length - 1),
            `Anchor "${id}" is never closed by a step with id "${id}"`,
        );
    }
    return commands;
}

/**
 * Parses Alethe text: either cvc5 output (optional status line + ONE outer list wrapping the commands)
 * or a flat command list (veriT/Carcara).
 */
export function parseAlethe(text: string): AletheProof {
    const { exprs, starts, firstChildStarts } = parseSExprsDetailed(text);
    let status: string | null = null;
    const lists: { e: SExpr; start: number }[] = [];
    for (let i = 0; i < exprs.length; i++) {
        const e = exprs[i];
        if (typeof e === 'string') {
            if (lists.length > 0 || status !== null) throw parseErrorAt(text, starts[i], `Unexpected atom "${e}"`);
            status = e;
        } else {
            lists.push({ e, start: starts[i] });
        }
    }
    if (lists.length === 1) {
        const outer = lists[0].e as SExpr[];
        if (outer.every((x) => Array.isArray(x))) {
            return { status, commands: buildCommands(outer, (i) => firstChildStarts[i], text) };
        }
    }
    return {
        status,
        commands: buildCommands(
            lists.map((l) => l.e),
            (i) => lists[i].start,
            text,
        ),
    };
}
