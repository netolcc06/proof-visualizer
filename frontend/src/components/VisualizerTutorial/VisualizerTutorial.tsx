import { Classes, Portal } from '@blueprintjs/core';
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { TutorialProps } from '../../interfaces/interfaces';
import '../../scss/Tutorial.scss';
import TutorialPopover from './TutorialPopover';
import { divsIds, tutorials } from './tutorialContent';

const W = 340;

// Visible rectangle of an element, or null when it is missing or off-screen
const visibleRect = (id: string): DOMRect | null => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) return null;
    return r;
};

const VisualizerTutorial: React.FC<TutorialProps> = ({ inTutorial, setInTutorial }: TutorialProps) => {
    const [stage, setStage] = useState(-1);
    const [position, setPosition] = useState({ x: 0, y: 0, tW: 0 });
    // Bumped on window resize to reposition the current step
    const [resizeTick, setResizeTick] = useState(0);

    const increaseStage = useCallback(() => {
        if (stage < tutorials.length - 1) setStage(stage + 1);
        else setInTutorial(false);
    }, [stage, setInTutorial]);

    useEffect(() => {
        if (!inTutorial) return;
        const onResize = () => setResizeTick((t) => t + 1);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [inTutorial]);

    useEffect(() => {
        setStage(inTutorial ? 0 : -1);
    }, [inTutorial]);

    useLayoutEffect(() => {
        if (stage < 0) return;
        const rect = visibleRect(divsIds[stage]);
        // Skip a step whose target cannot be shown
        if (!rect) {
            increaseStage();
            return;
        }
        const newTW = rect.x + rect.width / 2;
        let newX = newTW;
        // Beginning, end and normal positions
        if (newX < W) newX = 3;
        else if (newX + W / 2 > window.innerWidth) newX = window.innerWidth - W - 3;
        else newX -= W / 2;

        setPosition({ x: newX, y: rect.y + rect.height, tW: newTW });
    }, [stage, resizeTick, increaseStage]);

    return (
        <Portal className="tutorial-portal">
            <div
                className={`${Classes.OVERLAY}-enter-done`}
                style={{
                    position: 'fixed',
                    inset: 0,
                    pointerEvents: stage >= 0 ? 'auto' : 'none',
                    backgroundColor: stage >= 0 ? 'rgba(87, 82, 82, 0.233)' : 'transparent',
                }}
            >
                {stage >= 0 && (
                    <TutorialPopover
                        key={stage}
                        setIsOpen={setInTutorial}
                        nextTutorial={increaseStage}
                        stage={stage}
                        content={tutorials[stage]}
                        W={W}
                        position={position}
                    />
                )}
            </div>
        </Portal>
    );
};

export default VisualizerTutorial;
