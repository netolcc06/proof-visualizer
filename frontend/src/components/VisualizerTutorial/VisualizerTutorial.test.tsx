import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../../store/store';
import VisualizerTutorial from './VisualizerTutorial';
import { divsIds, tutorials } from './tutorialContent';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const plain = (text: string) => text.replace(/\0([^\0]*)\0[^\0]*\0/g, '$1');
const popoverText = () => document.querySelector('.tutorial-popover .content')?.textContent ?? '';
const click = (el: Element | null) => {
    if (!el) throw new Error('element not found');
    act(() => (el as HTMLElement).click());
};

describe('VisualizerTutorial', () => {
    let host: HTMLDivElement;
    let root: Root;

    const Harness: React.FC = () => {
        const [inTutorial, setInTutorial] = React.useState(false);
        return (
            <Provider store={createAppStore()}>
                <div id="app-container">
                    {divsIds.map((id) => (
                        <span key={id} id={id} />
                    ))}
                    <button id="start" onClick={() => setInTutorial(true)} />
                    <VisualizerTutorial inTutorial={inTutorial} setInTutorial={setInTutorial} />
                </div>
            </Provider>
        );
    };

    beforeEach(() => {
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
            x: 400,
            y: 10,
            left: 400,
            top: 10,
            right: 460,
            bottom: 40,
            width: 60,
            height: 30,
            toJSON: () => ({}),
        });
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root.render(<Harness />));
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.restoreAllMocks();
    });

    it('goes through every step and page without a nested <body>', () => {
        click(document.getElementById('start'));
        for (let stage = 0; stage < tutorials.length; stage++) {
            const pages = tutorials[stage];
            for (let page = 0; page < pages.length; page++) {
                expect(popoverText()).toBe(plain(pages[page]));
                expect(document.querySelectorAll('body')).toHaveLength(1);
                expect(document.getElementById('app-container')?.querySelector('body')).toBeNull();
                if (page < pages.length - 1) click(document.querySelector('.next-page.progress'));
            }
            click(document.querySelector('.bp6-dialog-footer button'));
        }
        expect(document.querySelector('.tutorial-popover')).toBeNull();
        expect(document.getElementById('app-container')).not.toBeNull();
    });

    it('closes with Escape only', () => {
        click(document.getElementById('start'));
        const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
        const stop = vi.spyOn(other, 'stopPropagation');
        act(() => {
            window.dispatchEvent(other);
        });
        expect(stop).not.toHaveBeenCalled();
        expect(document.querySelector('.tutorial-popover')).not.toBeNull();
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(document.querySelector('.tutorial-popover')).toBeNull();
    });
});
