import type { JSX } from 'react';
import { Button, Classes, Divider } from '@blueprintjs/core';
import React, { useEffect, useRef, useState } from 'react';
import { TutorialPopoverProps } from '../../interfaces/interfaces';
import { selectTheme } from '../../store/features/theme/themeSlice';
import { useAppSelector } from '../../store/hooks';

const TutorialPopover: React.FC<TutorialPopoverProps> = ({
    setIsOpen,
    nextTutorial,
    stage,
    content,
    W,
    position,
}: TutorialPopoverProps) => {
    const [page, setPage] = useState(0);
    const popoverRef = useRef<HTMLDivElement>(null);

    const darkTheme = useAppSelector(selectTheme);

    const renderPageBall = (): JSX.Element[] => {
        return content.map((_, id) => (
            <div key={id} className={`page-ball ${id === page && (darkTheme ? 'page-on' : 'page-on-light')}`} />
        ));
    };

    const changePage = (type: string): void => {
        if (type === '>') setPage(page + 1);
        else setPage(page - 1);
    };

    useEffect(() => {
        const parent = popoverRef.current;
        if (!parent) return;
        // Set the focus
        let bt = parent.getElementsByClassName('next-page progress');
        if (!bt.length) {
            bt = parent.getElementsByClassName(Classes.BUTTON);
            if (!bt.length) return;
            // Make sure the next stage button will not be instantly clicked
            const timer = setTimeout(() => (bt[bt.length - 1] as HTMLElement | undefined)?.focus(), 150);
            return () => clearTimeout(timer);
        }
        (bt[0] as HTMLElement).focus();
    }, [stage, page]);

    useEffect(() => {
        function handleEsc(e: KeyboardEvent): void {
            if (e.key === 'Escape') setIsOpen(false);
        }
        window.addEventListener('keydown', handleEsc, false);

        return () => {
            window.removeEventListener('keydown', handleEsc, false);
        };
    }, [setIsOpen]);

    const insertAnchors = (text: string): (JSX.Element | string)[] => {
        const list: (JSX.Element | string)[] = [];

        let i = -1,
            last = 0;
        const positions = [0, 0, 0];
        for (let j = 0; j < text.length; j++) {
            if (text[j] === '\0') {
                i++;
                positions[i] = j;
            }
            if (i === 2) {
                list.push(text.substring(last, positions[0]));
                const name = text.substring(positions[0] + 1, positions[1]);
                const link = text.substring(positions[1] + 1, positions[2]);
                list.push(
                    <a key={`${last}-${link}`} href={link} target="_blank" rel="noreferrer">
                        {name}
                    </a>,
                );

                last = positions[2] + 1;
                i = -1;
            }
        }
        list.push(text.substring(last, text.length));

        return list;
    };

    return (
        <div className={darkTheme ? Classes.DARK : ''}>
            <div
                className="arrow-up"
                style={{
                    left: position.tW,
                    top: position.y - 7,
                    borderBottomColor: darkTheme ? 'rgb(48, 65, 71)' : 'rgb(255,255,255)',
                }}
            />
            <div
                className="arrow-up arrow-2"
                style={{
                    left: position.tW - 2,
                    top: position.y - 9,
                    borderBottomColor: darkTheme ? '#bdbdbd' : 'rgba(71, 64, 64, 0.281)',
                }}
            />
            <div
                ref={popoverRef}
                className={`tutorial-popover ${Classes.DIALOG}`}
                style={{ width: W, left: position.x, top: position.y }}
            >
                <div className={Classes.DIALOG_HEADER}>
                    <div className="cur-page">{renderPageBall()}</div>
                    <Button icon="small-cross" onClick={() => setIsOpen(false)} tabIndex={-1} />
                </div>
                <div className="tutorial-body">
                    {page > 0 && (
                        <button
                            className="next-page regress"
                            onClick={(e) => {
                                e.stopPropagation();
                                changePage('<');
                            }}
                        >
                            {'<'}
                        </button>
                    )}
                    <p className="content">{stage ? content[page] : insertAnchors(content[page])}</p>
                    {page < content.length - 1 && (
                        <button
                            className="next-page progress"
                            onClick={(e) => {
                                e.stopPropagation();
                                changePage('>');
                            }}
                        >
                            {'>'}
                        </button>
                    )}
                </div>
                {page === content.length - 1 && (
                    <>
                        <Divider style={{ backgroundColor: darkTheme ? 'white' : '' }} />
                        <div className={Classes.DIALOG_FOOTER}>
                            <Button
                                text="Next"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    nextTutorial();
                                }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default TutorialPopover;
