export interface PanelLayout {
    x: number;
    y: number;
    minimized: boolean;
}

export interface PanelBounds {
    panelWidth: number;
    headerHeight: number;
    // Lowest allowed top edge (bottom of the navbar)
    minTop: number;
    viewportWidth: number;
    viewportHeight: number;
}

export const PANEL_MAX_WIDTH = 520;

export const panelWidthFor = (viewportWidth: number): number => Math.min(PANEL_MAX_WIDTH, viewportWidth * 0.9);

// Keeps the whole header inside the viewport and below the navbar
export const clampPanelPosition = (
    pos: { x: number; y: number },
    { panelWidth, headerHeight, minTop, viewportWidth, viewportHeight }: PanelBounds,
): { x: number; y: number } => {
    const maxX = Math.max(0, viewportWidth - panelWidth);
    const maxY = Math.max(minTop, viewportHeight - headerHeight);
    return {
        x: Math.min(Math.max(pos.x, 0), maxX),
        y: Math.min(Math.max(pos.y, minTop), maxY),
    };
};

// Returns null when the stored value is malformed
export const parsePanelLayout = (raw: unknown): PanelLayout | null => {
    if (typeof raw !== 'object' || raw === null) return null;
    const { x, y, minimized } = raw as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (typeof minimized !== 'boolean') return null;
    return { x, y, minimized };
};
