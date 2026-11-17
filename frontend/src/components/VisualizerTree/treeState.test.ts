import { describe, expect, it } from 'vitest';
import { collapseNode, createTree, expandNode, nodeAt, selectNode } from './treeState';
import { prepareProof } from '../../store/features/proof/alethe';
import { TreeNode } from '../../interfaces/interfaces';

// ids: t4=0, t2=1, t1=2, a0=3, t3=4; t1 is reachable through t2 and t3
const proof = prepareProof(`(assume a0 p)
(step t1 (cl p) :rule r :premises (a0))
(step t2 (cl p) :rule r :premises (t1))
(step t3 (cl p) :rule r :premises (t1))
(step t4 (cl) :rule r :premises (t2 t3))`).nodes;
const map = Object.fromEntries(proof.map((n, i) => [n.id, i]));

function deepFreeze<T>(o: T): T {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
        Object.freeze(o);
        Object.values(o).forEach(deepFreeze);
    }
    return o;
}

const fresh = () => deepFreeze(createTree(proof, 0));
// Root expanded, then both of its children expanded (t1 under t2 and under t3)
const expanded = (): TreeNode[] => {
    let t = expandNode(createTree(proof, 0), [0], proof, map);
    t = expandNode(t, [0, 0], proof, map);
    t = expandNode(t, [0, 1], proof, map);
    return deepFreeze(t);
};

describe('treeState', () => {
    it('expands lazily without mutating the input', () => {
        const tree = fresh();
        const next = expandNode(tree, [0], proof, map);
        expect(tree[0].isExpanded).toBe(false);
        expect(tree[0].childNodes).toEqual([]);
        expect(next[0].isExpanded).toBe(true);
        expect(next[0].childNodes.map((c) => c.id)).toEqual([1, 4]);
    });

    it('does not rebuild the children on a second expand', () => {
        const tree = expanded();
        const again = expandNode(collapseNode(tree, [0]), [0], proof, map);
        expect(again[0].childNodes).toBe(tree[0].childNodes);
        expect(again[0].isExpanded).toBe(true);
    });

    it('collapses without mutating the input and keeps the children', () => {
        const tree = expanded();
        const next = collapseNode(tree, [0]);
        expect(tree[0].isExpanded).toBe(true);
        expect(next[0].isExpanded).toBe(false);
        expect(next[0].childNodes).toBe(tree[0].childNodes);
    });

    it('selects by path, not by id', () => {
        const tree = expanded();
        expect(nodeAt(tree, [0, 0, 0])?.id).toBe(2);
        expect(nodeAt(tree, [0, 1, 0])?.id).toBe(2);
        const next = selectNode(tree, [0, 1, 0], false);
        expect(nodeAt(next, [0, 1, 0])?.isSelected).toBe(true);
        expect(nodeAt(next, [0, 0, 0])?.isSelected).toBe(false);
        expect(nodeAt(tree, [0, 1, 0])?.isSelected).toBe(false);
    });

    it('toggles, and clears the others unless additive', () => {
        const tree = expanded();
        const a = selectNode(tree, [0, 0], false);
        const b = selectNode(a, [0, 1], false);
        expect(nodeAt(b, [0, 0])?.isSelected).toBe(false);
        expect(nodeAt(b, [0, 1])?.isSelected).toBe(true);
        const c = selectNode(b, [0, 0], true);
        expect(nodeAt(c, [0, 0])?.isSelected).toBe(true);
        expect(nodeAt(c, [0, 1])?.isSelected).toBe(true);
        const d = selectNode(c, [0, 1], false);
        expect(nodeAt(d, [0, 1])?.isSelected).toBe(false);
        expect(nodeAt(d, [0, 0])?.isSelected).toBe(false);
    });

    it('ignores a path that does not exist', () => {
        const tree = fresh();
        expect(expandNode(tree, [3], proof, map)).toBe(tree);
        expect(selectNode(tree, [0, 5], false)).toEqual(tree);
        expect(nodeAt(tree, [0, 5])).toBeUndefined();
    });
});
