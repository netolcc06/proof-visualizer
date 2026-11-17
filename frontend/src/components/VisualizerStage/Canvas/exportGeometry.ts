// Pure geometry for image export (no Konva, no DOM)
import type { NodeInterface, ProofState } from '../../../interfaces/interfaces';

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ViewTransform {
    scale: number;
    x: number;
    y: number;
}

type ExportNode = Pick<NodeInterface, 'id' | 'dependencies' | 'children'>;
type VisualInfo = Pick<ProofState['visualInfo'][number], 'x' | 'y'>;

// Node geometry, shared with VisualizerNode and SVGConverter
export const NODE_WIDTH = 300;
export const NODE_HEIGHT = 105;
// The step id label sits above the node
export const LABEL_HEIGHT = 14;
// A node with dependencies adds an arrow and a circle out to x + 375
export const DEPENDENCIES_WIDTH = 375;
export const EXPORT_MARGIN = 20;

export const EXPORT_PIXEL_RATIO = 2;
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 100_000_000;
// Drags below this many px (either side) are not a selection
export const MIN_REGION_PX = 8;

export function nodeBox(x: number, y: number, hasDependencies: boolean): Rect {
    return {
        x,
        y: y - LABEL_HEIGHT,
        width: hasDependencies ? DEPENDENCIES_WIDTH : NODE_WIDTH,
        height: NODE_HEIGHT + LABEL_HEIGHT,
    };
}

export function intersects(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// Bounding box (with margin) of the nodes in `proof`, i.e. the visible ones; null when empty
export function visibleGraphBounds(
    proof: ExportNode[],
    visualInfo: { [id: number]: VisualInfo },
    margin = EXPORT_MARGIN,
): Rect | null {
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    proof.forEach((node) => {
        const info = visualInfo[node.id];
        if (!info) return;
        const box = nodeBox(info.x, info.y, node.dependencies.length > 0);
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
    });
    if (!isFinite(minX + minY + maxX + maxY)) return null;
    return { x: minX - margin, y: minY - margin, width: maxX - minX + 2 * margin, height: maxY - minY + 2 * margin };
}

// Rectangle between two points, whatever the drag direction
export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function isTinyRect(rect: Rect, min = MIN_REGION_PX): boolean {
    return rect.width < min || rect.height < min;
}

// Screen (stage container) px -> graph units
export function screenToGraphRect(rect: Rect, view: ViewTransform): Rect {
    return {
        x: (rect.x - view.x) / view.scale,
        y: (rect.y - view.y) / view.scale,
        width: rect.width / view.scale,
        height: rect.height / view.scale,
    };
}

// Graph units -> screen (stage container) px
export function graphToScreenRect(rect: Rect, view: ViewTransform): Rect {
    return {
        x: rect.x * view.scale + view.x,
        y: rect.y * view.scale + view.y,
        width: rect.width * view.scale,
        height: rect.height * view.scale,
    };
}

// Pixels per graph unit for the output, lowered to respect the canvas limits.
// `clamped` is true when it falls below 1 (the image is smaller than the graph)
export function clampPixelRatio(
    width: number,
    height: number,
    desired = EXPORT_PIXEL_RATIO,
    maxSide = MAX_CANVAS_SIDE,
    maxArea = MAX_CANVAS_AREA,
): { ratio: number; clamped: boolean } {
    const side = Math.max(width, height);
    const area = width * height;
    let ratio = desired;
    if (side > 0) ratio = Math.min(ratio, maxSide / side);
    if (area > 0) ratio = Math.min(ratio, Math.sqrt(maxArea / area));
    // Round down so the rounded canvas size never exceeds the limits
    ratio = Math.floor(ratio * 1000) / 1000;
    return { ratio, clamped: ratio < 1 };
}

export interface RegionEdge {
    from: number;
    to: number;
}

// Nodes and edges of `proof` that show up in `region` (all of them without a region).
// An edge goes from the child (x + 150, y) to the parent (x + 150, y + 105);
// it is kept when its bounding box meets the region
export function selectExportItems<T extends ExportNode>(
    proof: T[],
    visualInfo: { [id: number]: VisualInfo },
    region?: Rect,
): { nodes: T[]; edges: RegionEdge[] } {
    const ids = new Set(proof.filter((n) => visualInfo[n.id]).map((n) => n.id));
    const nodes: T[] = [];
    const edges: RegionEdge[] = [];
    proof.forEach((node) => {
        const info = visualInfo[node.id];
        if (!info) return;
        if (!region || intersects(nodeBox(info.x, info.y, node.dependencies.length > 0), region)) nodes.push(node);
        node.children.forEach((child) => {
            if (!ids.has(child)) return;
            const c = visualInfo[child];
            const edgeBox = rectFromPoints({ x: c.x + 150, y: c.y }, { x: info.x + 150, y: info.y + NODE_HEIGHT });
            // Zero-width boxes (vertical edges) still need to count
            const padded = { ...edgeBox, x: edgeBox.x - 1, width: edgeBox.width + 2 };
            if (!region || intersects(padded, region)) edges.push({ from: child, to: node.id });
        });
    });
    return { nodes, edges };
}
