import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Classes } from '@blueprintjs/core';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from 'vitest';
import VisualizerTree from './VisualizerTree';
import { createTree } from './treeState';
import { prepareProof } from '../../store/features/proof/alethe';
import { fixture } from '../../alethe/testUtils';
import { NodeInfo, NodeInterface, TreeNode } from '../../interfaces/interfaces';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mapOf = (proof: NodeInterface[]) => Object.fromEntries(proof.map((n, i) => [n.id, i]));
const euf = prepareProof(fixture('euf.alethe')).nodes;
// t4 reaches t1 through both t2 and t3 (ids: t4=0, t2=1, t1=2, a0=3, t3=4)
const diamond = prepareProof(`(assume a0 p)
(step t1 (cl p) :rule r :premises (a0))
(step t2 (cl p) :rule r :premises (t1))
(step t3 (cl p) :rule r :premises (t1))
(step t4 (cl) :rule r :premises (t2 t3))`).nodes;

// Collapsed children stay mounted until the close animation ends, so only rows with every ancestor expanded count
const isVisible = (row: HTMLElement) => {
    let parent = row.closest(`.${Classes.TREE_NODE}`)?.parentElement?.closest(`.${Classes.TREE_NODE}`);
    while (parent) {
        if (!parent.classList.contains(Classes.TREE_NODE_EXPANDED)) return false;
        parent = parent.parentElement?.closest(`.${Classes.TREE_NODE}`);
    }
    return true;
};
const rowEls = () =>
    Array.from(document.querySelectorAll<HTMLElement>(`.${Classes.TREE_NODE_CONTENT}`)).filter(isVisible);
const ids = () =>
    rowEls().map((r) => Number(r.querySelector(`.${Classes.TREE_NODE_LABEL}`)?.textContent?.match(/^(\d+) :/)?.[1]));
const li = (row: HTMLElement) => row.closest(`.${Classes.TREE_NODE}`) as HTMLElement;
const isSelected = (index: number) => li(rowEls()[index]).classList.contains(Classes.TREE_NODE_SELECTED);
const selectedCount = () => rowEls().filter((_, i) => isSelected(i)).length;
const rowOf = (index: number) => rowEls()[index];
const caret = (index: number) => rowOf(index).querySelector<HTMLElement>(`.${Classes.TREE_NODE_CARET}`) as HTMLElement;
const click = (el: Element, init: MouseEventInit = {}) =>
    act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    });

describe('VisualizerTree', () => {
    let host: HTMLDivElement;
    let root: Root;
    let setNodeInfo: Mock;
    let errors: MockInstance;

    const mount = (proof: NodeInterface[], expandRoot = false, content = createTree(proof, 0)) =>
        act(async () =>
            root.render(
                <VisualizerTree
                    darkTheme={false}
                    proof={proof}
                    positionMap={mapOf(proof)}
                    content={content}
                    expandRoot={expandRoot}
                    setNodeInfo={setNodeInfo as unknown as React.Dispatch<React.SetStateAction<NodeInfo>>}
                />,
            ),
        );
    const lastInfoId = () => (setNodeInfo.mock.lastCall?.[0] as NodeInfo).id;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        setNodeInfo = vi.fn();
        errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        host.remove();
        // No React warnings (duplicate keys, frozen props, ...)
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
    });

    it('shows only the root at first', async () => {
        await mount(euf);
        expect(ids()).toEqual([0]);
    });

    it('expands the caret to show the children and collapses it again', async () => {
        await mount(euf);
        await click(caret(0));
        expect(ids()).toEqual([0, ...euf[0].children]);
        await click(caret(0));
        expect(ids()).toEqual([0]);
        await click(caret(0));
        expect(ids()).toEqual([0, ...euf[0].children]);
    });

    it('expands a second level', async () => {
        await mount(euf);
        await click(caret(0));
        const withKids = euf[0].children.find((c) => euf[c].children.length > 0) as number;
        await click(caret(1 + euf[0].children.indexOf(withKids)));
        const expected = [0];
        for (const c of euf[0].children) {
            expected.push(c);
            if (c === withKids) expected.push(...euf[c].children);
        }
        expect(ids()).toEqual(expected);
    });

    it('reports the clicked node, marks it selected, and deselects on a second click', async () => {
        await mount(euf);
        await click(caret(0));
        await click(rowOf(1));
        expect(lastInfoId()).toBe(euf[0].children[0]);
        expect(selectedCount()).toBe(1);
        expect(isSelected(1)).toBe(true);
        await click(rowOf(1));
        expect(lastInfoId()).toBe(0);
        expect(selectedCount()).toBe(0);
    });

    it('clears the other selection unless shift is held', async () => {
        await mount(euf);
        await click(caret(0));
        await click(rowOf(1));
        await click(rowOf(2));
        expect(selectedCount()).toBe(1);
        expect(isSelected(2)).toBe(true);
        await click(rowOf(1), { shiftKey: true });
        expect(selectedCount()).toBe(2);
    });

    it('toggles only the clicked instance of a node reachable by two paths', async () => {
        await mount(diamond);
        await click(caret(0));
        expect(ids()).toEqual([0, 1, 4]);
        await click(caret(1));
        // t4, t2, t1, t3
        await click(caret(3));
        // t4, t2, t1, t3, t1
        expect(ids()).toEqual([0, 1, 2, 4, 2]);
        await click(rowOf(4));
        expect(isSelected(2)).toBe(false);
        expect(isSelected(4)).toBe(true);
        await click(rowOf(2), { shiftKey: true });
        expect(selectedCount()).toBe(2);
        // Toggling one instance leaves the other one alone
        await click(rowOf(4), { shiftKey: true });
        expect(isSelected(2)).toBe(true);
        expect(isSelected(4)).toBe(false);
    });

    it('expandRoot shows the first level on mount, and no deeper', async () => {
        await mount(euf, true);
        expect(ids()).toEqual([0, ...euf[0].children]);
    });

    it('resets the tree when the content changes', async () => {
        await mount(euf, false, createTree(euf, 0));
        await click(caret(0));
        await click(rowOf(1));
        expect(ids().length).toBeGreaterThan(1);
        await mount(euf, false, createTree(euf, 0));
        expect(ids()).toEqual([0]);
        expect(selectedCount()).toBe(0);
    });

    it('keeps the tree on a re-render with the same content', async () => {
        const content: TreeNode[] = createTree(euf, 0);
        const Wrapper = () => {
            const [n, setN] = useState(0);
            return (
                <>
                    <button id="rerender" onClick={() => setN(n + 1)} />
                    <VisualizerTree
                        darkTheme={false}
                        proof={euf}
                        positionMap={mapOf(euf)}
                        content={content}
                        setNodeInfo={setNodeInfo as unknown as React.Dispatch<React.SetStateAction<NodeInfo>>}
                    />
                </>
            );
        };
        await act(async () => root.render(<Wrapper />));
        await click(caret(0));
        await click(document.getElementById('rerender') as HTMLElement);
        expect(ids()).toEqual([0, ...euf[0].children]);
    });

    it('does not repeat a sibling that lists the same child twice', async () => {
        const dup = diamond.map((n) => (n.id === 0 ? { ...n, children: [1, 4, 1] } : n));
        await mount(dup);
        await click(caret(0));
        expect(ids()).toEqual([0, 1, 4]);
    });
});
