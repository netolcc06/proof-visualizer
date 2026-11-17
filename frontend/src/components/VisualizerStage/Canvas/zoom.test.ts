import { describe, it, expect } from 'vitest';
import { zoomScale } from './zoom';

describe('zoomScale', () => {
    it('zooms in when scrolling up', () => {
        expect(zoomScale(1, -100)).toBeGreaterThan(1);
    });

    it('zooms out when scrolling down', () => {
        expect(zoomScale(1, 100)).toBeLessThan(1);
    });

    it('keeps the scale without delta', () => {
        expect(zoomScale(2, 0)).toBe(2);
    });

    it('zooming in then out returns to the same scale', () => {
        expect(zoomScale(zoomScale(1.5, -1), 1)).toBeCloseTo(1.5);
    });
});
