import { describe, expect, it } from 'vitest';
import {
    clampPixelRatio,
    graphToScreenRect,
    intersects,
    isTinyRect,
    rectFromPoints,
    screenToGraphRect,
    selectExportItems,
    visibleGraphBounds,
} from './exportGeometry';

const node = (id: number, children: number[] = [], deps = false) => ({
    id,
    children,
    dependencies: deps ? [{ piId: 1, depsId: [2] }] : [],
});

describe('visibleGraphBounds', () => {
    it('covers the node box, the step id label and the margin', () => {
        const b = visibleGraphBounds([node(0)], { 0: { x: 100, y: 200 } }, 10);
        expect(b).toEqual({ x: 90, y: 176, width: 320, height: 139 });
    });

    it('extends to x + 375 for nodes with dependencies', () => {
        const b = visibleGraphBounds([node(0, [], true)], { 0: { x: 0, y: 0 } }, 0);
        expect(b).toEqual({ x: 0, y: -14, width: 375, height: 119 });
    });

    it('ignores nodes that are not in the visible proof (folded)', () => {
        const info = { 0: { x: 0, y: 0 }, 1: { x: 5000, y: 5000 } };
        const b = visibleGraphBounds([node(0)], info, 0);
        expect(b?.width).toBe(300);
        expect(b?.height).toBe(119);
    });

    it('is null without nodes', () => {
        expect(visibleGraphBounds([], {})).toBeNull();
    });
});

describe('rect conversion', () => {
    const view = { scale: 0.5, x: 100, y: -50 };

    it('converts screen to graph and back', () => {
        const screen = { x: 200, y: 50, width: 100, height: 40 };
        const graph = screenToGraphRect(screen, view);
        expect(graph).toEqual({ x: 200, y: 200, width: 200, height: 80 });
        expect(graphToScreenRect(graph, view)).toEqual(screen);
    });

    it('builds a rect from points in any direction', () => {
        expect(rectFromPoints({ x: 50, y: 10 }, { x: 20, y: 40 })).toEqual({ x: 20, y: 10, width: 30, height: 30 });
    });

    it('flags tiny rects', () => {
        expect(isTinyRect({ x: 0, y: 0, width: 7, height: 100 })).toBe(true);
        expect(isTinyRect({ x: 0, y: 0, width: 8, height: 8 })).toBe(false);
    });
});

describe('clampPixelRatio', () => {
    it('keeps 2x when it fits', () => {
        expect(clampPixelRatio(1000, 500)).toEqual({ ratio: 2, clamped: false });
    });

    it('limits the longest side to 16384', () => {
        const { ratio, clamped } = clampPixelRatio(10000, 100);
        expect(ratio).toBeLessThanOrEqual(16384 / 10000);
        expect(ratio).toBeGreaterThan(1.6);
        expect(clamped).toBe(false);
    });

    it('limits the area to 100M px', () => {
        const { ratio } = clampPixelRatio(8000, 8000);
        expect(8000 * ratio * 8000 * ratio).toBeLessThanOrEqual(100_000_000);
        expect(ratio).toBeCloseTo(1.25, 2);
    });

    it('goes below 1 and reports it for huge graphs', () => {
        const { ratio, clamped } = clampPixelRatio(40000, 1000);
        expect(ratio).toBeLessThan(1);
        expect(40000 * ratio).toBeLessThanOrEqual(16384);
        expect(clamped).toBe(true);
    });
});

describe('selectExportItems', () => {
    // 1 is the child of 0 (edge from (x+150, y) of 1 to (x+150, y+105) of 0)
    const proof = [node(0), node(1, [], false), node(2)];
    proof[0].children = [1];
    const info = { 0: { x: 0, y: 0 }, 1: { x: 0, y: 300 }, 2: { x: 2000, y: 2000 } };

    it('keeps everything without a region', () => {
        const { nodes, edges } = selectExportItems(proof, info);
        expect(nodes.map((n) => n.id)).toEqual([0, 1, 2]);
        expect(edges).toEqual([{ from: 1, to: 0 }]);
    });

    it('drops nodes outside the region', () => {
        const { nodes } = selectExportItems(proof, info, { x: -10, y: -10, width: 400, height: 150 });
        expect(nodes.map((n) => n.id)).toEqual([0]);
    });

    it('keeps an edge that crosses the region without endpoints inside', () => {
        const { nodes, edges } = selectExportItems(proof, info, { x: 100, y: 150, width: 100, height: 100 });
        expect(nodes).toEqual([]);
        expect(edges).toEqual([{ from: 1, to: 0 }]);
    });

    it('drops edges that miss the region', () => {
        const { edges } = selectExportItems(proof, info, { x: 1900, y: 1900, width: 300, height: 300 });
        expect(edges).toEqual([]);
    });

    it('counts the label and dependencies circle when intersecting', () => {
        const deps = [node(0, [], true)];
        const i = { 0: { x: 0, y: 0 } };
        expect(selectExportItems(deps, i, { x: 340, y: 40, width: 20, height: 20 }).nodes).toHaveLength(1);
        expect(selectExportItems([node(0)], i, { x: 340, y: 40, width: 20, height: 20 }).nodes).toHaveLength(0);
        expect(selectExportItems([node(0)], i, { x: 0, y: -20, width: 20, height: 10 }).nodes).toHaveLength(1);
    });
});

describe('intersects', () => {
    it('is false for touching rects', () => {
        expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    });
});
