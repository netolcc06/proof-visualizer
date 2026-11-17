// Proof component inference: adaptation of cvc5's DotPrinter::defineProofNodeType to Alethe proofs.

export enum ComponentKind {
    NONE = 0,
    SAT = 1,
    CNF = 2,
    TL = 3,
    PP = 4,
    IN = 5,
    RW = 6,
}

/** Rule tables used by `inferComponents`. Tune them here. */
export const COMPONENT_CONFIG = {
    /** Propositional resolution steps: SAT when they depend on an input assumption. */
    satRules: new Set(['resolution', 'th_resolution', 'contraction', 'reordering', 'factoring']),
    /** Rules that make a SAT step an "EQ_RESOLVE pattern" (cvc5 pre-processing encoded as equiv_pos/equiv). */
    eqResolveMarkerRules: new Set(['equiv_pos1', 'equiv_pos2', 'equiv1', 'equiv2']),
    /** Trivial rules: always CNF below SAT/CNF. */
    trivialRules: new Set(['false', 'true']),
    /** CNF transformation rules. */
    cnfRules: new Set([
        'and',
        'not_or',
        'or',
        'implies',
        'not_implies1',
        'not_implies2',
        'equiv1',
        'equiv2',
        'not_equiv1',
        'not_equiv2',
        'xor1',
        'xor2',
        'not_xor1',
        'not_xor2',
        'ite1',
        'ite2',
        'not_ite1',
        'not_ite2',
        'not_and',
        'not_not',
        'and_pos',
        'and_neg',
        'or_pos',
        'or_neg',
        'xor_pos1',
        'xor_pos2',
        'xor_neg1',
        'xor_neg2',
        'implies_pos',
        'implies_neg1',
        'implies_neg2',
        'equiv_pos1',
        'equiv_pos2',
        'equiv_neg1',
        'equiv_neg2',
        'ite_pos1',
        'ite_pos2',
        'ite_neg1',
        'ite_neg2',
        'connective_def',
    ]),
    /** Rewriting rules: nodes inside TL/PP regions with these rules become RW. */
    rewriteRules: new Set([
        'rare_rewrite',
        'evaluate',
        'poly_simp',
        'all_simplify',
        'cong',
        'trans',
        'refl',
        'symm',
        'bind',
        'ac_simp',
        'distinct_elim',
        'la_rw_eq',
        'qnt_rm_unused',
        'qnt_simplify',
    ]),
    /** Any rule with this suffix is a rewriting rule. */
    rewriteSuffix: '_simplify',
    /** `hole` steps whose printed args contain this text are rewriting steps. */
    untranslatedRewriteMarker: 'untranslated rewrite',
};

/** Minimal view of a proof node, indexed like the graph (root = index 0). */
export interface ComponentNodeInput {
    rule: string;
    isAssume: boolean;
    /** Top-level (non-anchor) assumption = problem input. */
    isInput: boolean;
    /** Printed :args, used for the untranslated-rewrite marker. */
    args: string;
    children: readonly number[];
}

function isRewrite(node: ComponentNodeInput): boolean {
    const cfg = COMPONENT_CONFIG;
    if (cfg.rewriteRules.has(node.rule) || node.rule.endsWith(cfg.rewriteSuffix)) return true;
    return node.rule === 'hole' && node.args.includes(cfg.untranslatedRewriteMarker);
}

/**
 * `open[i]`: node i transitively depends on a top-level assumption.
 * `pattern[i]`: node i is an EQ_RESOLVE pattern: a SAT-rule step that has an equiv marker premise and also an open
 * premise that is not a propositional (SAT-rule, non-pattern) step, e.g. an input assumption or a CNF step.
 * This keeps resolutions whose equiv_pos premise only rewrites a closed lemma (e.g. veriT/cvc5 `(cl false)`) in SAT.
 * Iterative post-order from the root.
 */
function computeFlags(nodes: readonly ComponentNodeInput[]): { open: Uint8Array; pattern: Uint8Array } {
    const cfg = COMPONENT_CONFIG;
    const pattern = new Uint8Array(nodes.length);
    const n = nodes.length;
    const open = new Uint8Array(n);
    const state = new Uint8Array(n); // 0 new, 1 entered, 2 done
    const stack = [0];
    const next = new Int32Array(n);
    state[0] = 1;
    while (stack.length > 0) {
        const v = stack[stack.length - 1];
        const ch = nodes[v].children;
        if (next[v] < ch.length) {
            const c = ch[next[v]++];
            if (state[c] === 0) {
                state[c] = 1;
                stack.push(c);
            }
        } else {
            let o = nodes[v].isAssume && nodes[v].isInput ? 1 : 0;
            for (const c of ch) o |= open[c];
            open[v] = o;
            if (cfg.satRules.has(nodes[v].rule) && ch.some((c) => cfg.eqResolveMarkerRules.has(nodes[c].rule))) {
                pattern[v] = ch.some(
                    (c) =>
                        open[c] === 1 &&
                        !cfg.eqResolveMarkerRules.has(nodes[c].rule) &&
                        !(cfg.satRules.has(nodes[c].rule) && !pattern[c]),
                )
                    ? 1
                    : 0;
            }
            state[v] = 2;
            stack.pop();
        }
    }
    return { open, pattern };
}

/**
 * Infers the component of every node (index 0 is the root). Top-down walk, first visit wins:
 * see the design notes in the header of this file and the tables in COMPONENT_CONFIG.
 */
export function inferComponents(nodes: readonly ComponentNodeInput[]): ComponentKind[] {
    const n = nodes.length;
    const result: ComponentKind[] = new Array<ComponentKind>(n).fill(ComponentKind.NONE);
    if (n === 0) return result;
    const cfg = COMPONENT_CONFIG;
    const { open, pattern } = computeFlags(nodes);
    const base = new Uint8Array(n); // component before the rewriting pass
    const seen = new Uint8Array(n);

    const stack: [number, ComponentKind][] = [[0, ComponentKind.NONE]];
    while (stack.length > 0) {
        const [v, last] = stack.pop() as [number, ComponentKind];
        if (seen[v]) continue;
        seen[v] = 1;
        const node = nodes[v];
        const fromTop = last === ComponentKind.NONE || last === ComponentKind.SAT || last === ComponentKind.CNF;
        let kind: ComponentKind;
        if (node.isAssume) {
            if (node.isInput) kind = ComponentKind.IN;
            else kind = fromTop ? ComponentKind.TL : last;
        } else if (
            (last === ComponentKind.NONE || last === ComponentKind.SAT) &&
            open[v] &&
            cfg.satRules.has(node.rule) &&
            !pattern[v]
        ) {
            kind = ComponentKind.SAT;
        } else if (fromTop) {
            if (cfg.trivialRules.has(node.rule)) kind = ComponentKind.CNF;
            else if (!open[v]) kind = ComponentKind.TL;
            else if (cfg.cnfRules.has(node.rule)) kind = ComponentKind.CNF;
            else kind = ComponentKind.PP;
        } else {
            kind = last; // PP or TL propagate downwards
        }
        base[v] = kind;
        for (let i = node.children.length - 1; i >= 0; i--) stack.push([node.children[i], kind]);
    }

    for (let v = 0; v < n; v++) {
        const k = base[v] as ComponentKind;
        const inRegion = k === ComponentKind.TL || k === ComponentKind.PP;
        result[v] = inRegion && !nodes[v].isAssume && isRewrite(nodes[v]) ? ComponentKind.RW : k;
    }
    return result;
}
