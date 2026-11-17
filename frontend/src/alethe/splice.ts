import { validateProof } from './parser';
import { childIds, indexProof, reachableIds } from './graph';
import type { ProofIndex, ProofNode } from './graph';
import { collectNamedTerms, ensureNamesDefined } from './letmap';
import { renderSExpr } from './sexpr';
import type { SExpr } from './sexpr';
import type { AletheCommand, AletheProof, AletheStep } from './types';

export class AletheSpliceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AletheSpliceError';
    }
}

/** Canonical printer: named annotations stripped and let names expanded using the proof's own definitions. */
function makeCanon(proof: AletheProof): (e: SExpr) => string {
    const named = collectNamedTerms(proof);
    const memo = new Map<string, string>();
    const expand = {
        get(name: string): string | undefined {
            const cached = memo.get(name);
            if (cached !== undefined) return cached;
            const term = named.get(name);
            if (term === undefined) return undefined;
            memo.set(name, name); // cycle guard
            const text = renderSExpr(term, 'strip', expand);
            memo.set(name, text);
            return text;
        },
    };
    return (e) => {
        try {
            return renderSExpr(e, 'strip', expand);
        } catch {
            return renderSExpr(e, 'strip');
        }
    };
}

function nodeKey(node: ProofNode, canon: (e: SExpr) => string): string {
    return node.kind === 'assume' ? canon(node.term) : canon(['cl', ...node.clause]);
}

/** Slice boundary: a premise-less hole (Carcara keeps `:args ("trust")` only before elaboration). */
function isBoundaryHole(node: ProofNode): boolean {
    return node.kind === 'step' && node.rule === 'hole' && node.premises.length === 0;
}

type Canon = (e: SExpr) => string;

/** Same rule, premises, discharge and args (modulo names); clauses are compared separately. */
function sameStep(a: ProofNode, b: ProofNode, ca: Canon, cb: Canon): boolean {
    if (a.kind === 'assume' || b.kind === 'assume') return a.kind === b.kind;
    return (
        a.rule === b.rule &&
        a.premises.join(' ') === b.premises.join(' ') &&
        a.discharge.join(' ') === b.discharge.join(' ') &&
        a.args.length === b.args.length &&
        a.args.every((x, i) => ca(x) === cb(b.args[i]))
    );
}

const sortedKeys = (keys: string[]) => [...keys].sort();
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function anchorChain(anchor: string | null, index: ProofIndex): string[] {
    const chain: string[] = [];
    let cur = anchor;
    while (cur !== null) {
        chain.push(cur);
        cur = index.anchors.get(cur)?.anchor ?? null;
    }
    return chain;
}

/**
 * Replaces the derivation of `fromStepId` in `original` by its derivation in `elaborated`
 * (Carcara `slice --from <id>` followed by `elaborate`).
 * Copied commands get a unique `el<k>_` id prefix and are inserted right before the original step;
 * the original step keeps its id and clause. Terms are shared with the inputs, not cloned.
 * Old premises of the step stay in the output; call `pruneUnreachable` to drop them.
 */
export function spliceElaboratedSlice(original: AletheProof, fromStepId: string, elaborated: AletheProof): AletheProof {
    const orig = indexProof(original);
    const elab = indexProof(elaborated);
    const O = orig.byId.get(fromStepId);
    if (!O || O.kind !== 'step') throw new AletheSpliceError(`Step "${fromStepId}" not found in the original proof`);

    let S = elab.byId.get(fromStepId);
    if (!S) {
        const end = elab.byId.get('slice_end');
        const target = end && end.kind === 'step' ? end.premises[0] : undefined;
        S = target === undefined ? undefined : elab.byId.get(target);
    }
    if (!S || S.kind !== 'step') {
        throw new AletheSpliceError(`Step "${fromStepId}" not found in the elaborated slice`);
    }

    const origCanon = makeCanon(original);
    const elabCanon = makeCanon(elaborated);
    const exact = nodeKey(S, elabCanon) === nodeKey(O, origCanon);

    // Elaboration may reorder/dedupe the literals (or drop the step): then S is copied and O is rebuilt from it.
    const targetKeys = O.clause.map(origCanon);
    const rootKeys = S.clause.map(elabCanon);
    let permutation: 'reordering' | 'contraction' | null = null;
    if (!exact) {
        if (sameList(sortedKeys(rootKeys), sortedKeys(targetKeys))) permutation = 'reordering';
        else if (sameList([...new Set(rootKeys)].sort(), [...new Set(targetKeys)].sort())) permutation = 'contraction';
        else {
            throw new AletheSpliceError(
                `The clause of "${S.id}" differs between the original and the elaborated slice`,
            );
        }
    }

    const origIsSubproof = orig.anchors.has(O.id);
    const elabIsSubproof = elab.anchors.has(S.id);
    if (exact && elabIsSubproof && !origIsSubproof) {
        throw new AletheSpliceError(`Elaboration turned "${S.id}" into a subproof, which cannot be spliced`);
    }

    // E: anchors of the elaborated slice that already exist around the original step.
    const enclosing = new Set(anchorChain(S.anchor, elab));
    if (exact && origIsSubproof && elabIsSubproof) enclosing.add(S.id);
    const context = origIsSubproof ? O.id : O.anchor; // anchor context of the insertion point

    // A subproof-closing step is only reused when its last inner step is unchanged too.
    const sameBody = (node: ProofNode, twin: ProofNode): boolean => {
        if (!elab.anchors.has(node.id)) return true;
        const ei = elab.lastInside.get(node.id);
        const oi = orig.lastInside.get(node.id);
        if (ei === undefined || ei !== oi) return false;
        const en = elab.byId.get(ei) as ProofNode;
        const on = orig.byId.get(oi) as ProofNode;
        return nodeKey(en, elabCanon) === nodeKey(on, origCanon) && sameStep(en, on, elabCanon, origCanon);
    };

    // Collect the derivation of S; nodes equal to original ones are mapped, not copied.
    const mapped = new Map<string, string>();
    const copied = new Set<string>();
    const visited = new Set<string>([S.id]);
    const stack = [S.id];
    while (stack.length > 0) {
        const id = stack.pop() as string;
        const node = elab.byId.get(id) as ProofNode;
        if (!(exact && id === S.id)) {
            const twin = orig.byId.get(id);
            const local = node.anchor === null || enclosing.has(node.anchor);
            if (
                twin &&
                twin.kind === node.kind &&
                local &&
                nodeKey(node, elabCanon) === nodeKey(twin, origCanon) &&
                (isBoundaryHole(node) || (sameStep(node, twin, elabCanon, origCanon) && sameBody(node, twin)))
            ) {
                mapped.set(id, id);
                continue;
            }
            copied.add(id);
        }
        for (const c of childIds(node, elab)) {
            if (!visited.has(c)) {
                visited.add(c);
                stack.push(c);
            }
        }
    }

    // Anchors that must be copied (not enclosing the original step) and their local assumptions.
    const copiedAnchors = new Set<string>();
    for (const id of copied) {
        let a = (elab.byId.get(id) as ProofNode).anchor;
        while (a !== null && !enclosing.has(a) && !copiedAnchors.has(a)) {
            copiedAnchors.add(a);
            a = elab.anchors.get(a)?.anchor ?? null;
        }
    }
    for (const cmd of elaborated.commands) {
        if (cmd.kind === 'assume' && cmd.anchor !== null && copiedAnchors.has(cmd.anchor)) copied.add(cmd.id);
    }

    // Smallest k such that no original id starts with `el<k>_`.
    const origIds = [...orig.byId.keys(), ...orig.anchors.keys()];
    let k = 1;
    while (origIds.some((id) => id.startsWith(`el${k}_`))) k++;
    const prefix = `el${k}_`;

    const rename = (id: string): string => {
        const m = mapped.get(id);
        if (m !== undefined) return m;
        return copied.has(id) || copiedAnchors.has(id) ? prefix + id : id;
    };
    const mapAnchor = (a: string | null): string | null => (a === null || enclosing.has(a) ? context : rename(a));

    const inserted: AletheCommand[] = [];
    for (const cmd of elaborated.commands) {
        if (cmd.kind === 'anchor' && copiedAnchors.has(cmd.id)) {
            inserted.push({ ...cmd, id: rename(cmd.id), anchor: mapAnchor(cmd.anchor) });
        } else if (cmd.kind === 'assume' && copied.has(cmd.id)) {
            inserted.push({ ...cmd, id: rename(cmd.id), anchor: mapAnchor(cmd.anchor) });
        } else if (cmd.kind === 'step' && copied.has(cmd.id)) {
            inserted.push({
                ...cmd,
                id: rename(cmd.id),
                premises: cmd.premises.map(rename),
                discharge: cmd.discharge.map(rename),
                anchor: mapAnchor(cmd.anchor),
            });
        }
    }

    let replaced: AletheStep;
    if (exact) {
        replaced = {
            ...O,
            rule: S.rule,
            premises: S.premises.map(rename),
            args: S.args,
            discharge: S.discharge.map(rename),
            extra: S.extra,
        };
    } else {
        const root = rename(S.id);
        const base = { ...O, args: [], discharge: [], extra: [] };
        const dedup: SExpr[] = [];
        const seen = new Set<string>();
        S.clause.forEach((lit, i) => {
            if (!seen.has(rootKeys[i])) {
                seen.add(rootKeys[i]);
                dedup.push(lit);
            }
        });
        if (permutation === 'reordering') {
            replaced = { ...base, rule: 'reordering', premises: [root] };
        } else if (sameList([...seen], targetKeys)) {
            replaced = { ...base, rule: 'contraction', premises: [root] };
        } else {
            const mid = `${prefix}contraction_${S.id}`;
            inserted.push({
                ...base,
                id: mid,
                clause: dedup,
                rule: 'contraction',
                premises: [root],
                anchor: context,
            });
            replaced = { ...base, rule: 'reordering', premises: [mid] };
        }
    }

    const at = original.commands.indexOf(O);
    const commands = [...original.commands.slice(0, at), ...inserted, replaced, ...original.commands.slice(at + 1)];
    try {
        validateProof(commands);
    } catch (e) {
        throw new AletheSpliceError(`The spliced proof is invalid: ${(e as Error).message}`);
    }
    return { status: original.status, commands };
}

/**
 * Removes commands not reachable from the root. Keeps define-fun/define-const/other commands, anchors whose
 * closing step is reachable, and assumptions discharged by a reachable closing step.
 */
export function pruneUnreachable(proof: AletheProof): AletheProof {
    const index = indexProof(proof);
    if (index.root === null) return { status: proof.status, commands: [...proof.commands] };
    const reachable = reachableIds(index);
    for (const id of [...reachable]) {
        const node = index.byId.get(id) as ProofNode;
        if (node.kind === 'step') for (const d of node.discharge) if (index.byId.has(d)) reachable.add(d);
    }
    const commands = proof.commands.filter((cmd) => {
        if (cmd.kind === 'assume' || cmd.kind === 'step') return reachable.has(cmd.id);
        if (cmd.kind === 'anchor') return reachable.has(cmd.id);
        return true;
    });
    return { status: proof.status, commands: ensureNamesDefined(commands, collectNamedTerms(proof)) };
}
