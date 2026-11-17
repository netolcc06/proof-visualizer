import { whenReady } from '../whenReady';
import React, { useEffect, useState } from 'react';

import '../../scss/VisualizersDrawer.scss';
import { Drawer, Position, Classes, Tabs, Tab, Button } from '@blueprintjs/core';
import { selectTheme } from '../../store/features/theme/themeSlice';
import { DrawerProps } from '../../interfaces/interfaces';

import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { applyView, selectNodeClusters, selectNodes } from '../../store/features/proof/proofSlice';
import { reRender } from '../../store/features/externalCmd/externalCmd';
import VisualizerLetDrawer from '../VisualizerLetDrawer/VisualizerLetDrawer';
import VisualizerTheoryLemma from '../VisualizerTheoryLemma/VisualizerTheoryLemma';
import { ClusterKind } from '../../interfaces/enum';
import ComponentLegend from '../VisualizerStage/ComponentLegend';

const VisualizersDrawer: React.FC<DrawerProps> = ({ drawerIsOpen, setDrawerIsOpen }: DrawerProps) => {
    const darkTheme = useAppSelector(selectTheme);
    const nodeClusters = useAppSelector(selectNodeClusters);
    const dispatch = useAppDispatch();

    const [tabID, setTabID] = useState('lm');
    const [resizeFlag, setResizeFlag] = useState([false, false]);

    useEffect(() => {
        // When drawer is initialized it focus the escape button
        return whenReady('.visualizers-drawer .' + Classes.BUTTON, (el) => {
            (el as HTMLElement).tabIndex = 1;
            (el as HTMLElement).focus();
        });
    }, []);

    const handleTabChange = (newTabId: string, _: any, e: any): void => {
        setTabID(newTabId);
        const newResizeFlag = [...resizeFlag];
        if (newTabId === 'lm') newResizeFlag[0] = !newResizeFlag[0];
        else if (newTabId === 'tl') newResizeFlag[1] = !newResizeFlag[1];
        setResizeFlag(newResizeFlag);
    };

    const handleClusterClick = (type: ClusterKind): void => {
        dispatch(
            selectNodes(
                nodeClusters.reduce((acc: number[], c) => (c.type === type ? acc.concat(c.hiddenNodes) : acc), []),
            ),
        );
    };

    const menus = {
        view: (
            <div className={'view-infos ' + Classes.DIALOG_BODY}>
                <div className="bts">
                    <Button
                        text="Full"
                        onClick={(e: React.MouseEvent<HTMLElement, MouseEvent>) => {
                            e.preventDefault();
                            dispatch(applyView('full'));
                            dispatch(reRender());
                        }}
                    />
                    <Button
                        text="Clustered"
                        onClick={(e: React.MouseEvent<HTMLElement, MouseEvent>) => {
                            e.preventDefault();
                            dispatch(applyView('clustered'));
                            dispatch(reRender());
                        }}
                    />
                    <Button
                        text="Full and Colored"
                        onClick={(e: React.MouseEvent<HTMLElement, MouseEvent>) => {
                            e.preventDefault();
                            dispatch(applyView('colored-full'));
                            dispatch(reRender());
                        }}
                    />
                </div>
                <div className="views-color-map">
                    <ComponentLegend onSelect={handleClusterClick} />
                </div>
            </div>
        ),
        letMap: <VisualizerLetDrawer shouldResize={resizeFlag[0]} />,
        theoryLemma: <VisualizerTheoryLemma shouldResize={resizeFlag[1]} />,
    };

    return (
        <Drawer
            className={`visualizers-drawer ${darkTheme ? Classes.DARK : ''}`}
            style={{ maxHeight: '65%', width: '35%' }}
            autoFocus={true}
            canEscapeKeyClose={true}
            canOutsideClickClose={false}
            enforceFocus={false}
            hasBackdrop={false}
            isOpen={drawerIsOpen}
            position={Position.RIGHT}
            usePortal={false}
            onClose={(e) => {
                e.preventDefault();
                setDrawerIsOpen(false);
            }}
            icon="applications"
            title="Visualizers"
        >
            <div className={Classes.DRAWER_BODY}>
                <Tabs id="services-tabs" onChange={handleTabChange} selectedTabId={tabID}>
                    <Tab id="vw" title="View" panel={menus['view']} className="services-tab" />
                    <Tab id="lm" title="Let Map" panel={menus['letMap']} className="services-tab" />
                    <Tab id="tl" title="Theory Lemma" panel={menus['theoryLemma']} className="services-tab" />
                </Tabs>
            </div>
        </Drawer>
    );
};

export default VisualizersDrawer;
