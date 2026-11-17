import { inferComponents } from './components';
import type { ComponentKind } from './components';
import { collectLetMap, displayTerm } from './letmap';
import type { LetMap } from './letmap';
import type { AletheAnchor, AletheAssume, AletheProof, AletheStep } from './types';

export interface ProofGraphNode {
    /** 0 = root; ids are assigned in DFS order from the root. */
    id: number;
    stepId: string;
    /** 'assume' for assumptions. */
    rule: string;
    conclusion: string;
    args: string;
    /** Premises (explicit + the last step inside the anchor for subproof-closing steps). */
    children: number[];
    /** Consumers; the root has none. */
    parents: number[];
    discharge: string[];
    /** Enclosing anchors, outermost first. */
    anchorPath: string[];
    /** Display of the anchor :args when the node closes an anchor. */
    anchorArgs: string | null;
    /** Number of distinct nodes in the sub-DAG, including the node itself (see EXACT_DESCENDANTS_LIMIT). */
    descendants: number;
    component: ComponentKind;
}

export interface ProofGraph {
    nodes: ProofGraphNode[];
    letMap: LetMap;
    /** Ids of assumes/steps not reachable from the root. */
    unreachable: string[];
    byStepId: Map<string, number>;
}

/** Up to this many nodes `descendants` is exact (bitset union); above it the tree size (saturating) is used. */
export const EXACT_DESCENDANTS_LIMIT = 5000;

export type ProofNode = AletheAssume | AletheStep;

/** Structural index of a proof, shared by the graph builder, splice and prune. */
export interface ProofIndex {
    byId: Map<string, ProofNode>;
    anchors: Map<string, AletheAnchor>;
    /** Closing step id -> last assume/step inside its anchor. */
    lastInside: Map<string, string>;
    /** Id of the last top-level step (the root), or null. */
    root: string | null;
}

export function indexProof(proof: AletheProof): ProofIndex {
    const byId = new Map<string, ProofNode>();
    const anchors = new Map<string, AletheAnchor>();
    const lastInside = new Map<string, string>();
    let root: string | null = null;
    for (const cmd of proof.commands) {
        if (cmd.kind === 'anchor') {
            anchors.set(cmd.id, cmd);
        } else if (cmd.kind === 'assume' || cmd.kind === 'step') {
            byId.set(cmd.id, cmd);
            if (cmd.anchor !== null) lastInside.set(cmd.anchor, cmd.id);
            else if (cmd.kind === 'step') root = cmd.id;
        }
    }
    return { byId, anchors, lastInside, root };
}

/** Premise ids of a node, including the implicit premise of subproof-closing steps. */
export function childIds(node: ProofNode, index: ProofIndex): string[] {
    if (node.kind === 'assume') return [];
    const out = [...new Set(node.premises)].filter((p) => index.byId.has(p));
    const inner = index.lastInside.get(node.id);
    if (inner !== undefined && index.anchors.has(node.id) && !out.includes(inner)) out.push(inner);
    return out;
}

/** Ids reachable from the root through premises (iterative). */
export function reachableIds(index: ProofIndex): Set<string> {
    const seen = new Set<string>();
    if (index.root === null) return seen;
    const stack = [index.root];
    seen.add(index.root);
    while (stack.length > 0) {
        const node = index.byId.get(stack.pop() as string) as ProofNode;
        for (const c of childIds(node, index)) {
            if (!seen.has(c)) {
                seen.add(c);
                stack.push(c);
            }
        }
    }
    return seen;
}

function anchorPathOf(anchor: string | null, anchors: Map<string, AletheAnchor>): string[] {
    const path: string[] = [];
    let cur = anchor;
    while (cur !== null) {
        path.push(cur);
        cur = anchors.get(cur)?.anchor ?? null;
    }
    return path.reverse();
}

function computeDescendants(nodes: ProofGraphNode[], postorder: number[]): void {
    const n = nodes.length;
    if (n <= EXACT_DESCENDANTS_LIMIT) {
        const words = (n + 31) >>> 5;
        const sets = new Array<Uint32Array>(n);
        for (const v of postorder) {
            const bits = new Uint32Array(words);
            for (const c of nodes[v].children) {
                const cs = sets[c];
                for (let w = 0; w < words; w++) bits[w] |= cs[w];
            }
            bits[v >>> 5] |= 1 << (v & 31);
            sets[v] = bits;
            let count = 0;
            for (let w = 0; w < words; w++) {
                let x = bits[w];
                x = x - ((x >>> 1) & 0x55555555);
                x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
                count += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
            }
            nodes[v].descendants = count;
        }
        return;
    }
    // Tree size: counts shared nodes once per path, saturating at MAX_SAFE_INTEGER.
    for (const v of postorder) {
        let total = 1;
        for (const c of nodes[v].children) total = Math.min(Number.MAX_SAFE_INTEGER, total + nodes[c].descendants);
        nodes[v].descendants = total;
    }
}

/** Builds the proof DAG reachable from the last top-level step. */
export function buildProofGraph(proof: AletheProof): ProofGraph {
    const index = indexProof(proof);
    const letMap = collectLetMap(proof);
    const nodes: ProofGraphNode[] = [];
    const byStepId = new Map<string, number>();
    const postorder: number[] = [];

    if (index.root !== null) {
        const childStepIds: string[][] = [];
        const make = (stepId: string): number => {
            const cmd = index.byId.get(stepId) as ProofNode;
            const id = nodes.length;
            const anchor = cmd.kind === 'step' ? index.anchors.get(cmd.id) : undefined;
            nodes.push({
                id,
                stepId,
                rule: cmd.kind === 'assume' ? 'assume' : cmd.rule,
                conclusion: displayTerm(cmd.kind === 'assume' ? cmd.term : ['cl', ...cmd.clause]),
                args: cmd.kind === 'step' ? cmd.args.map(displayTerm).join(' ') : '',
                children: [],
                parents: [],
                discharge: cmd.kind === 'step' ? cmd.discharge : [],
                anchorPath: anchorPathOf(cmd.anchor, index.anchors),
                anchorArgs: anchor && anchor.args ? anchor.args.map(displayTerm).join(' ') : null,
                descendants: 1,
                component: 0,
            });
            childStepIds.push(childIds(cmd, index));
            byStepId.set(stepId, id);
            return id;
        };
        // Iterative DFS: ids in preorder, children in premise order.
        const stack: number[] = [make(index.root)];
        const next: number[] = [0];
        while (stack.length > 0) {
            const v = stack[stack.length - 1];
            const kids = childStepIds[v];
            if (next[v] < kids.length) {
                const cid = kids[next[v]++];
                let c = byStepId.get(cid);
                if (c === undefined) {
                    c = make(cid);
                    next[c] = 0;
                    stack.push(c);
                }
                nodes[v].children.push(c);
                nodes[c].parents.push(v);
            } else {
                postorder.push(v);
                stack.pop();
            }
        }
    }

    computeDescendants(nodes, postorder);
    const components = inferComponents(
        nodes.map((nd) => ({
            rule: nd.rule,
            isAssume: nd.rule === 'assume',
            isInput: nd.rule === 'assume' && nd.anchorPath.length === 0,
            args: nd.args,
            children: nd.children,
        })),
    );
    for (const nd of nodes) nd.component = components[nd.id];

    const unreachable: string[] = [];
    for (const cmd of proof.commands) {
        if ((cmd.kind === 'assume' || cmd.kind === 'step') && !byStepId.has(cmd.id)) unreachable.push(cmd.id);
    }
    return { nodes, letMap, unreachable, byStepId };
}
