import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegionCaptureOverlay from './RegionCaptureOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mouse = (target: EventTarget, type: string, x: number, y: number) =>
    act(() => {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
    });
const overlay = () => document.querySelector('[data-testid="region-capture"]') as HTMLElement;
const toolbar = () => document.querySelector('[data-testid="region-toolbar"]');
const drag = (x1: number, y1: number, x2: number, y2: number) => {
    mouse(overlay(), 'mousedown', x1, y1);
    mouse(window, 'mousemove', x2, y2);
    mouse(window, 'mouseup', x2, y2);
};
const buttonByText = (text: string) =>
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLElement;

describe('RegionCaptureOverlay', () => {
    let host: HTMLDivElement;
    let root: Root;
    const onExport = vi.fn();
    const onCancel = vi.fn();

    beforeEach(() => {
        onExport.mockClear();
        onCancel.mockClear();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root.render(<RegionCaptureOverlay onExport={onExport} onCancel={onCancel} />));
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it('shows the hint and no toolbar at first', () => {
        expect(overlay().textContent).toContain('Drag to select the area to save · Esc to cancel');
        expect(toolbar()).toBeNull();
    });

    it('shows the toolbar after a drag and exports the dragged rectangle', () => {
        drag(300, 200, 100, 80);
        expect(toolbar()).not.toBeNull();
        act(() => buttonByText('PNG').click());
        expect(onExport).toHaveBeenCalledWith('png', { x: 100, y: 80, width: 200, height: 120 });
        act(() => buttonByText('SVG').click());
        expect(onExport).toHaveBeenLastCalledWith('svg', { x: 100, y: 80, width: 200, height: 120 });
    });

    it('ignores a tiny drag', () => {
        drag(100, 100, 104, 104);
        expect(toolbar()).toBeNull();
        expect(document.querySelector('[data-testid="region-rect"]')).toBeNull();
    });

    it('leaves the mode with Esc and with Cancel', () => {
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(onCancel).toHaveBeenCalledTimes(1);
        drag(10, 10, 100, 100);
        act(() => buttonByText('Cancel').click());
        expect(onCancel).toHaveBeenCalledTimes(2);
    });

    it('replaces the rectangle when dragging again', () => {
        drag(10, 10, 100, 100);
        drag(200, 150, 400, 350);
        act(() => buttonByText('PNG').click());
        expect(onExport).toHaveBeenCalledTimes(1);
        expect(onExport).toHaveBeenCalledWith('png', { x: 200, y: 150, width: 200, height: 200 });
    });
});
