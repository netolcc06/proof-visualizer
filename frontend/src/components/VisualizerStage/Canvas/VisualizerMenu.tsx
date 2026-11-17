import type { JSX } from 'react';
import React, { useEffect, useState } from 'react';
import { Classes, ControlGroup, Button, InputGroup } from '@blueprintjs/core';
import { colorConverter } from '../../../store/features/theme/auxi';

const Menu = ({
    unfold,
    unfoldNext,
    foldSelectedNodes,
    foldAllDescendants,
    elaborateSlice,
    checkSlice,
    changeNodeColor,
    currentColor,
    options,
}: {
    unfold: () => void;
    unfoldNext: () => void;
    foldSelectedNodes: () => void;
    foldAllDescendants: () => void;
    elaborateSlice: () => void;
    checkSlice: () => void;
    changeNodeColor: (color: string) => void;
    currentColor: string;
    options: { unfold: boolean; foldSelected: boolean; foldAllDescendants: boolean; slice: boolean };
}): JSX.Element => {
    const [color, setColor] = useState(currentColor);

    useEffect(() => {
        setColor(currentColor);
    }, [currentColor]);

    return (
        <div className={Classes.POPOVER_CONTENT}>
            <ul id="menu" className={Classes.MENU}>
                {options.unfold ? (
                    <>
                        <li className="">
                            <a className={Classes.MENU_ITEM} onClick={() => unfold()}>
                                <div
                                    className={`${Classes.TEXT_OVERFLOW_ELLIPSIS} ${Classes.FILL} ${Classes.iconClass('eye-open')}`}
                                >
                                    <span> Unfold</span>
                                </div>
                            </a>
                        </li>
                        <li className="">
                            <a className={Classes.MENU_ITEM} onClick={() => unfoldNext()}>
                                <div
                                    className={`${Classes.TEXT_OVERFLOW_ELLIPSIS} ${Classes.FILL} ${Classes.iconClass('eye-open')}`}
                                >
                                    <span> Unfold Next</span>
                                </div>
                            </a>
                        </li>
                    </>
                ) : null}
                {options.foldSelected ? (
                    <li className="">
                        <a className={Classes.MENU_ITEM} onClick={() => foldSelectedNodes()}>
                            <div
                                className={`${Classes.TEXT_OVERFLOW_ELLIPSIS} ${Classes.FILL} ${Classes.iconClass('eye-off')}`}
                            >
                                <span> Fold selected nodes</span>
                            </div>
                        </a>
                    </li>
                ) : null}
                {options.foldAllDescendants ? (
                    <li className="">
                        <a className={Classes.MENU_ITEM} onClick={() => foldAllDescendants()}>
                            <div
                                className={`${Classes.TEXT_OVERFLOW_ELLIPSIS} ${Classes.FILL} ${Classes.iconClass('eye-off')}`}
                            >
                                <span> Fold all descendants</span>
                            </div>
                        </a>
                    </li>
                ) : null}
                {options.slice ? (
                    <>
                        <li className="">
                            <a className={Classes.MENU_ITEM} onClick={() => elaborateSlice()}>
                                <div
                                    className={`${Classes.TEXT_OVERFLOW_ELLIPSIS} ${Classes.FILL} ${Classes.iconClass('build')}`}
                                >
                                    <span> Elaborate slice from here…</span>
                                </div>
                            </a>
                        </li>
                        <li className="">
                            <a className={Classes.MENU_ITEM} onClick={() => checkSlice()}>
                                <div
                                    className={`${Classes.TEXT_OVERFLOW_ELLIPSIS} ${Classes.FILL} ${Classes.iconClass('endorsed')}`}
                                >
                                    <span> Check slice from here…</span>
                                </div>
                            </a>
                        </li>
                    </>
                ) : null}
                <li className="">
                    <a className={Classes.MENU_ITEM}>
                        <div className={`${Classes.TEXT_OVERFLOW_ELLIPSIS} ${Classes.FILL}`}>
                            <span>
                                <span onClick={() => changeNodeColor(colorConverter('red'))}> 🟥</span>
                                <span onClick={() => changeNodeColor(colorConverter('orange'))}> 🟧</span>
                                <span onClick={() => changeNodeColor(colorConverter('yellow'))}> 🟨</span>
                                <span onClick={() => changeNodeColor(colorConverter('green'))}> 🟩</span>
                                <span onClick={() => changeNodeColor(colorConverter('blue'))}> 🟦</span>
                                <span onClick={() => changeNodeColor(colorConverter('purple'))}> 🟪</span>
                                <span onClick={() => changeNodeColor(colorConverter('brown'))}> 🟫</span>
                                <span onClick={() => changeNodeColor(colorConverter('black'))}> ⬛</span>
                                <span onClick={() => changeNodeColor(colorConverter('white'))}> ⬜</span>
                            </span>
                        </div>
                    </a>
                </li>
                <li className="">
                    <a className={Classes.MENU_ITEM}>
                        <div className={`${Classes.TEXT_OVERFLOW_ELLIPSIS} ${Classes.FILL}`}>
                            <ControlGroup
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                                fill={true}
                                vertical={false}
                            >
                                <InputGroup
                                    placeholder={currentColor}
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                />
                                <Button
                                    icon="style"
                                    onClick={() => {
                                        changeNodeColor(color);
                                        setColor('');
                                    }}
                                    disabled={color.match(/^#([0-9a-f]{3}){1,2}$/i) === null}
                                ></Button>
                            </ControlGroup>
                        </div>
                    </a>
                </li>
            </ul>
        </div>
    );
};

export default Menu;
