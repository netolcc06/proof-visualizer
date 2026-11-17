import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createAppStore } from '../../store/store';
import { PANEL_LAYOUT_KEY } from '../../store/features/solver/prefs';
import VisualizerSmtDrawer from './VisualizerSmtDrawer';

vi.mock('@monaco-editor/react', () => ({
    default: ({ value }: { value: string }) => <textarea data-testid="monaco" defaultValue={value} />,
}));
vi.mock('../../solvers', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../solvers')>()),
    isCvc5WasmAvailable: () => Promise.resolve(true),
    getBridgeHealth: () => Promise.resolve(null),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const panel = () => document.querySelector('.smt-drawer') as HTMLElement | null;
const content = () => document.querySelector('.solver-panel') as HTMLElement;
const button = (label: string) => document.querySelector(`button[aria-label="${label}"]`) as HTMLElement;
const click = (el: Element | null) => {
    if (!el) throw new Error('element not found');
    act(() => (el as HTMLElement).click());
};
const stored = () => JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY) ?? 'null');

describe('VisualizerSmtDrawer', () => {
    let host: HTMLDivElement;
    let root: Root;
    let closed: Mock<(open: boolean | ((o: boolean) => boolean)) => void>;

    const render = async (expandRequested = false) => {
        await act(async () => {
            root.render(
                <Provider store={store}>
                    <VisualizerSmtDrawer isOpen setDrawerIsOpen={closed} expandRequested={expandRequested} />
                </Provider>,
            );
        });
    };
    let store: ReturnType<typeof createAppStore>;

    beforeEach(() => {
        localStorage.clear();
        store = createAppStore();
        closed = vi.fn<(open: boolean | ((o: boolean) => boolean)) => void>();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        localStorage.clear();
    });

    it('is a labelled dialog at the default position', async () => {
        await render();
        expect(panel()?.getAttribute('role')).toBe('dialog');
        expect(panel()?.getAttribute('aria-label')).toBe('SMT Input and Solvers');
        expect(panel()?.style.left).toBe('0px');
        expect(panel()?.style.top).toBe('50px');
    });

    it('minimizes keeping the content mounted, and restores', async () => {
        await render();
        const editor = document.querySelector('[data-testid="monaco"]');
        click(button('Minimize SMT panel'));
        expect(content().hidden).toBe(true);
        expect(document.querySelector('[data-testid="monaco"]')).toBe(editor);
        expect(stored().minimized).toBe(true);
        click(button('Restore SMT panel'));
        expect(content().hidden).toBe(false);
        expect(stored().minimized).toBe(false);
    });

    it('closes with the close button and with Escape from inside the panel', async () => {
        await render();
        click(button('Close SMT panel'));
        expect(closed).toHaveBeenCalledWith(false);
        closed.mockClear();
        act(() => {
            document
                .querySelector('[data-testid="monaco"]')
                ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(closed).toHaveBeenCalledWith(false);
    });

    it('ignores Escape from outside the panel and while Monaco handled it', async () => {
        await render();
        act(() => {
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(closed).not.toHaveBeenCalled();
        act(() => {
            document
                .querySelector('[data-testid="monaco"]')
                ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        });
        expect(closed).toHaveBeenCalledTimes(1);
        closed.mockClear();
        const suggest = document.createElement('div');
        suggest.className = 'suggest-widget visible';
        panel()?.appendChild(suggest);
        act(() => {
            suggest.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        });
        expect(closed).not.toHaveBeenCalled();
    });

    it('reads back a persisted layout', async () => {
        localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify({ x: 120, y: 200, minimized: true }));
        await render();
        expect(panel()?.style.left).toBe('120px');
        expect(panel()?.style.top).toBe('200px');
        expect(content().hidden).toBe(true);
    });

    it('clamps a persisted layout to the viewport', async () => {
        localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify({ x: 99999, y: -40, minimized: false }));
        await render();
        expect(parseFloat(panel()?.style.left ?? '')).toBeLessThan(window.innerWidth);
        expect(panel()?.style.top).toBe('50px');
    });

    it('falls back to the default when the persisted layout is malformed', async () => {
        localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify({ x: 'a', y: null, minimized: 1 }));
        await render();
        expect(panel()?.style.left).toBe('0px');
        expect(panel()?.style.top).toBe('50px');
        expect(content().hidden).toBe(false);
    });

    it('expands a minimized panel when a panel request arrives', async () => {
        localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify({ x: 0, y: 50, minimized: true }));
        await render();
        expect(content().hidden).toBe(true);
        await render(true);
        expect(content().hidden).toBe(false);
    });
});
