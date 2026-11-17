import { describe, expect, it } from 'vitest';
import { clampPanelPosition, panelWidthFor, parsePanelLayout, type PanelBounds } from './panelLayout';

const bounds: PanelBounds = {
    panelWidth: 520,
    headerHeight: 40,
    minTop: 50,
    viewportWidth: 1200,
    viewportHeight: 800,
};

describe('clampPanelPosition', () => {
    it('keeps a position that fits', () => {
        expect(clampPanelPosition({ x: 100, y: 200 }, bounds)).toEqual({ x: 100, y: 200 });
    });

    it('pulls a partly off-screen panel back', () => {
        expect(clampPanelPosition({ x: 900, y: 790 }, bounds)).toEqual({ x: 680, y: 760 });
    });

    it('handles negative values and the navbar', () => {
        expect(clampPanelPosition({ x: -30, y: -5 }, bounds)).toEqual({ x: 0, y: 50 });
    });

    it('handles a small viewport', () => {
        const small = { ...bounds, panelWidth: 270, viewportWidth: 300, viewportHeight: 60 };
        expect(clampPanelPosition({ x: 100, y: 100 }, small)).toEqual({ x: 30, y: 50 });
        const tiny = { ...bounds, panelWidth: 400, viewportWidth: 300, viewportHeight: 30 };
        expect(clampPanelPosition({ x: 10, y: 10 }, tiny)).toEqual({ x: 0, y: 50 });
    });
});

describe('panelWidthFor', () => {
    it('caps at 520 and shrinks to 90% on small screens', () => {
        expect(panelWidthFor(2000)).toBe(520);
        expect(panelWidthFor(400)).toBeCloseTo(360);
    });
});

describe('parsePanelLayout', () => {
    it('accepts a valid layout', () => {
        expect(parsePanelLayout({ x: 1, y: 2, minimized: true })).toEqual({ x: 1, y: 2, minimized: true });
    });

    it('rejects malformed values', () => {
        const bads = [
            null,
            'x',
            3,
            {},
            { x: 1, y: 2 },
            { x: '1', y: 2, minimized: false },
            { x: NaN, y: 2, minimized: false },
        ];
        for (const bad of bads) {
            expect(parsePanelLayout(bad)).toBeNull();
        }
    });
});
