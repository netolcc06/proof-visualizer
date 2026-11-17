import { describe, it, expect } from 'vitest';
import proofReducer, {
    process,
    applyView,
    changeStyle,
    unfoldNodes,
    foldAllDescendants,
    unfoldNextNode,
    highlightSteps,
    undo,
    selectProof,
} from './proofSlice';
import { sliceNodesCluster } from './auxi';
import { CLUSTER_STYLE } from '../../../interfaces/clusterStyle';
import { prepareProof } from './alethe';
import type { ProofState } from '../../../interfaces/interfaces';
import type { RootState } from '../../store';
import { ClusterKind } from '../../../interfaces/enum';
import { fixture } from '../../../alethe/testUtils';

const load = (name: string, state?: ProofState): ProofState => {
    const source = fixture(name);
    return proofReducer(state, process({ ...prepareProof(source), source }));
};

const fixtureFiles = import.meta.glob('../../../alethe/__fixtures__/*.alethe', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

const asRoot = (proof: ProofState): RootState => ({ proof }) as RootState;

describe('proof reducer', () => {
    const initial = proofReducer(undefined, { type: 'unknown' });

    it('should handle initial state', () => {
        expect(initial.proof).toEqual([]);
        expect(initial.view).toEqual('full');
        expect(initial.style).toEqual('graph');
        expect(initial.hiddenNodes).toEqual([]);
        expect(initial.source).toEqual('');
    });

    it('should handle process', () => {
        const actual = load('ex1.alethe');
        expect(actual.proof.length).toBeGreaterThan(1);
        expect(actual.proof[0].id).toBe(0);
        expect(actual.proof[0].parents).toEqual([]);
        expect(actual.proof.map((n) => n.stepId)).toContain('t14');
        expect(actual.source).toEqual(fixture('ex1.alethe'));
    });

    it('should reset the state when a new proof is processed', () => {
        const first = load('euf.alethe');
        const second = load('ex1.alethe', first);
        expect(second.nodesSelected).toEqual([]);
        expect(second.proof.every((n) => n.id < second.proof.length)).toBe(true);
        expect(Object.keys(second.visualInfo).length).toBe(second.proof.length + second.hiddenNodes.length);
    });

    it('should cluster the components and default to the clustered view', () => {
        const state = load('euf.alethe');
        expect(state.view).toBe('clustered');
        expect(state.hiddenNodes.length).toBeGreaterThan(0);
        // Every node but the root is in exactly one cluster
        const seen = state.clustersInfos.flatMap((c) => c.hiddenNodes).sort((a, b) => a - b);
        expect(seen).toEqual(state.proof.slice(1).map((n) => n.id));
        state.clustersInfos.forEach((c) => {
            c.hiddenNodes.forEach((id) => expect(state.proof[id].clusterType).toBe(c.type));
        });
        // The folded proof has one pi node per multi-node cluster
        const folded = selectProof(asRoot(state));
        const pis = folded.filter((n) => n.hiddenNodes?.length);
        expect(pis.length).toBe(state.hiddenNodes.length);
        pis.forEach((pi) => expect(pi.clusterType).not.toBe(ClusterKind.NONE));
    });

    it('should handle apply view - full', () => {
        const processed = load('euf.alethe');
        const actual = proofReducer(processed, applyView('full'));
        expect(actual.view).toEqual('full');
        expect(actual.hiddenNodes).toEqual([]);
        expect(selectProof(asRoot(actual)).length).toBe(actual.proof.length);
    });

    it('should handle apply view - colored-full and back to clustered', () => {
        const processed = load('euf.alethe');
        const colored = proofReducer(processed, applyView('colored-full'));
        expect(colored.view).toBe('colored-full');
        expect(colored.hiddenNodes).toEqual([]);
        const [first] = colored.clustersInfos;
        expect(colored.visualInfo[first.hiddenNodes[0]].color).toBe(first.color);
        const clustered = proofReducer(colored, applyView('clustered'));
        expect(clustered.hiddenNodes.length).toBe(processed.hiddenNodes.length);
    });

    it('should unfold and fold a pi node', () => {
        const state = load('euf.alethe');
        const pi = state.proof.length;
        const unfolded = proofReducer(state, unfoldNodes(pi));
        expect(unfolded.hiddenNodes.length).toBe(state.hiddenNodes.length - 1);
        const refolded = proofReducer(unfolded, foldAllDescendants(state.hiddenNodes[0][0]));
        expect(refolded.hiddenNodes.length).toBeGreaterThanOrEqual(unfolded.hiddenNodes.length);
    });

    it('should extract the theory lemmas from the TL clusters', () => {
        const state = load('euf.alethe');
        expect(state.theoryLemmaMap.length).toBeGreaterThan(0);
        state.theoryLemmaMap.forEach((tl) => expect(tl.startsWith('(cl')).toBe(true));
    });

    it('should handle change style', () => {
        expect(proofReducer(initial, changeStyle('directory')).style).toEqual('directory');
        expect(proofReducer(initial, changeStyle('graph')).style).toEqual('graph');
    });
    it('should infer a component for every non-root node of every fixture', () => {
        Object.entries(fixtureFiles).forEach(([path, text]) => {
            const { nodes } = prepareProof(text);
            const none = nodes.filter((n) => n.id !== 0 && n.clusterType === ClusterKind.NONE);
            expect(none.map((n) => `${path}:${n.stepId}`)).toEqual([]);
            // Every non-root node ends up in some cluster
            const clustered = new Set(sliceNodesCluster(nodes, Array(nodes.length).fill(-1)).flat());
            const missing = nodes.filter((n) => n.id !== 0 && !clustered.has(n.id));
            expect(missing.map((n) => `${path}:${n.stepId}`)).toEqual([]);
        });
    });

    describe('unfoldNextNode', () => {
        // Visible nodes are consistent with the visual info, the pi ids and the component colors
        const checkConsistent = (state: ProofState, manualFold = false) => {
            const total = state.proof.length + state.hiddenNodes.length;
            expect(Object.keys(state.visualInfo).map(Number)).toEqual(Array.from({ length: total }, (_, i) => i));
            const inPi = new Map<number, number>();
            state.hiddenNodes.forEach((arr, i) => arr.forEach((id) => inPi.set(id, state.proof.length + i)));
            state.proof.forEach((n) => expect(n.isHidden).toBe(inPi.get(n.id)));

            const visible = selectProof(asRoot(state));
            visible.forEach((n) => {
                const info = state.visualInfo[n.id];
                expect(info).toBeDefined();
                if (manualFold) {
                    expect(info.color).toBe(n.hiddenNodes?.length ? '#555' : '#fff');
                } else if (n.id !== 0) {
                    // Nodes and pi nodes keep the color of their component
                    expect(info.color).toBe(CLUSTER_STYLE[n.clusterType].color);
                }
            });
            expect(visible.length).toBe(state.proof.length - inPi.size + state.hiddenNodes.length);
        };

        // Unfolds, one node at a time, the pi at `index` until none of its nodes is hidden
        const unfoldUntilGone = (initial: ProofState, index: number, manualFold = false): ProofState => {
            let state = initial;
            const pending = new Set(state.hiddenNodes[index]);
            for (let guard = 0; guard < 1000; guard++) {
                const at = state.hiddenNodes.findIndex((arr) => arr.some((id) => pending.has(id)));
                if (at === -1) return state;
                state = proofReducer(state, unfoldNextNode(state.proof.length + at));
                checkConsistent(state, manualFold);
                [...pending].forEach((id) => {
                    if (!state.proof[id].isHidden) pending.delete(id);
                });
            }
            throw new Error('unfoldNextNode did not finish');
        };

        it.each(['euf.alethe', 'q.alethe', 'sko.alethe', 'lia.alethe'])(
            'keeps colors and visual info ids until the pi is gone (%s)',
            (name) => {
                const state = load(name);
                checkConsistent(state);
                const count = state.hiddenNodes.length;
                expect(count).toBeGreaterThan(1);
                // First, a middle one and the last pi
                new Set([0, Math.floor(count / 2), count - 1]).forEach((index) => {
                    unfoldUntilGone(state, index);
                });
            },
        );

        it('keeps the nodes own colors when a manually folded pi is unfolded', () => {
            const full = proofReducer(load('euf.alethe'), applyView('full'));
            const big = full.proof.reduce((best, n) => (n.id >= 5 && n.descendants > best.descendants ? n : best));
            const folded = proofReducer(full, foldAllDescendants(big.id));
            expect(folded.hiddenNodes.length).toBe(1);
            expect(folded.visualInfo[folded.proof.length].color).toBe('#555');
            checkConsistent(folded, true);
            const end = unfoldUntilGone(folded, 0, true);
            expect(end.hiddenNodes).toEqual([]);
            expect(Object.keys(end.visualInfo).length).toBe(end.proof.length);
        });

        it('does not crash on undo', () => {
            const state = load('euf.alethe');
            const next = proofReducer(state, unfoldNextNode(state.proof.length));
            expect(() => proofReducer(next, undo())).not.toThrow();
        });
    });

    describe('highlightSteps', () => {
        it('marks the steps with a flag that survives the views', () => {
            const state = load('euf.alethe');
            const ids = [3, 10, 20];
            const stepIds = ids.map((id) => state.proof[id].stepId);
            const marked = proofReducer(proofReducer(state, applyView('colored-full')), highlightSteps({ stepIds }));
            ids.forEach((id) => expect(marked.visualInfo[id].highlighted).toBe(true));
            expect(marked.visualInfo[1].highlighted).toBeUndefined();

            (['full', 'clustered', 'colored-full'] as const).forEach((view) => {
                const next = proofReducer(marked, applyView(view));
                ids.forEach((id) => expect(next.visualInfo[id].highlighted).toBe(true));
                expect(Object.values(next.visualInfo).filter((v) => v.highlighted).length).toBe(ids.length);
            });
        });

        it('starts without the flag', () => {
            const state = load('euf.alethe');
            expect(Object.values(state.visualInfo).some((v) => v.highlighted)).toBe(false);
        });
    });
});
