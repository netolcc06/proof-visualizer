import type { JSX } from 'react';
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useReducer, useState } from 'react';

import { Drawer, Position, Classes } from '@blueprintjs/core';
import Canvas from './Canvas/VisualizerCanvas';
import VisualizerTree from '../VisualizerTree/VisualizerTree';
import { createTree } from '../VisualizerTree/treeState';
import VisualizerDirectoryStyle from './VisualizerDirectoryStyle/VisualizerDirectoryStyle';

import '../../scss/VisualizerStage.scss';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectFileCount } from '../../store/features/file/fileSlice';
import { selectStyle, selectProof, selectVisualInfo } from '../../store/features/proof/proofSlice';
import { selectTheme } from '../../store/features/theme/themeSlice';
import { NodeInfo, TreeNode, VisualizerStageProps } from '../../interfaces/interfaces';
import { emptyNodeInfo } from '../../interfaces/nodeInfo';
import NodeInfoTable from '../NodeInfoTable/NodeInfoTable';
import { ruleHelper } from '../NodeInfoTable/ruleHelp';
import ComponentLegend from './ComponentLegend';
import SelectOvelay from './SelectOverlay';
import RegionCaptureOverlay from './RegionCaptureOverlay';
import { selectRegionCapture, setRegionCapture } from '../../store/features/externalCmd/externalCmd';
import { selectFileName } from '../../store/features/file/fileSlice';
import { showToast } from '../../store/features/solver/solverSlice';
import { getStage } from './Canvas/stageRegistry';
import { Rect, screenToGraphRect } from './Canvas/exportGeometry';
import { exportGraphImage } from './Canvas/exportImage';

const VisualizerStage: React.FC<VisualizerStageProps> = ({ disableExternalDrawers }: VisualizerStageProps) => {
    // Proof data
    const proof = useAppSelector(selectProof);
    const fileID = useAppSelector(selectFileCount);
    const style = useAppSelector(selectStyle);
    const darkTheme = useAppSelector(selectTheme);
    const visualInfo = useAppSelector(selectVisualInfo);
    const fileName = useAppSelector(selectFileName);
    const regionCapture = useAppSelector(selectRegionCapture);
    const dispatch = useAppDispatch();
    // Data structures
    const [nodeInfo, setNodeInfo] = useState<NodeInfo>(emptyNodeInfo);
    const [map, setMap] = useState<any>({});
    const [drawerIsOpen, setDrawerIsOpen] = useState(false);
    const [tree, setTree] = useState<TreeNode[]>([]);
    // Select overlay
    const [[isSelecting, selectMode], setIsSelecting] = useReducer(
        (
            state: boolean[],
            action: { type: 'invert' | 'set' | 'change-mode'; payload: { value: boolean; key: 's' | 'u' | 'n' } },
        ): boolean[] => {
            const newState = [...state];
            switch (action.type) {
                case 'invert':
                    newState[0] = !newState[0];
                    break;
                case 'set':
                    newState[0] = action.payload.value;
                    break;
                case 'change-mode':
                    if (!newState[0]) {
                        newState[0] = true;
                        newState[1] = action.payload.key !== 's';
                    } else if (
                        (newState[1] && action.payload.key === 's') ||
                        (!newState[1] && action.payload.key === 'u')
                    ) {
                        newState[1] = !newState[1];
                    } else newState[0] = false;

                    break;
            }
            return newState;
        },
        [false, false],
    );

    // At the beggining
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const key = e.key.toLowerCase();
            if (e.ctrlKey && e.shiftKey && style === 'graph' && (key === 's' || key === 'u')) {
                disableExternalDrawers();
                setDrawerIsOpen(false);
                setIsSelecting({ type: 'change-mode', payload: { value: false, key } });
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    useEffect(() => {
        const _map: any = {};
        // Map the { [node id]: list array id }
        proof.forEach((n, id) => (_map[n.id] = id));
        setMap(_map);
    }, [proof]);

    // Region capture only exists in the graph style
    useEffect(() => {
        if (style !== 'graph' && regionCapture) dispatch(setRegionCapture(false));
    }, [style, regionCapture, dispatch]);

    const cancelCapture = useCallback(() => dispatch(setRegionCapture(false)), [dispatch]);

    const exportRegion = (format: 'png' | 'svg', clientRect: Rect) => {
        const stage = getStage();
        if (!stage) return;
        // Client px -> stage container px -> graph units (current stage scale and position)
        const box = stage.container().getBoundingClientRect();
        const screenRect = { ...clientRect, x: clientRect.x - box.left, y: clientRect.y - box.top };
        const region = screenToGraphRect(screenRect, { scale: stage.scaleX(), x: stage.x(), y: stage.y() });
        dispatch(setRegionCapture(false));
        void exportGraphImage({
            format,
            proof,
            visualInfo,
            region,
            baseName: fileName ? fileName.split('.')[0].replace(/\s+/g, '_') : 'proof',
            notify: (intent, message) => dispatch(showToast({ intent, message })),
        });
    };

    const openDrawer = (nodeInfo: NodeInfo, tree?: TreeNode[]) => {
        setNodeInfo(nodeInfo);
        setTree(tree ? tree : []);
        setDrawerIsOpen(true);
    };

    return (
        <div onContextMenu={(e) => e.preventDefault()}>
            {proof.length > 1 && (
                <>
                    <ComponentLegend floating />
                    {style === 'graph' ? (
                        <>
                            <SelectOvelay
                                isSelecting={isSelecting}
                                selectMode={selectMode}
                                setIsSelecting={setIsSelecting}
                            />
                            {regionCapture && <RegionCaptureOverlay onExport={exportRegion} onCancel={cancelCapture} />}
                            <Canvas key={fileID} proof={proof} openDrawer={openDrawer} createTree={createTree} />
                        </>
                    ) : (
                        <VisualizerDirectoryStyle key={fileID} ruleHelper={ruleHelper} />
                    )}
                    <Drawer
                        className={darkTheme ? Classes.DARK : ''}
                        autoFocus={true}
                        canEscapeKeyClose={true}
                        canOutsideClickClose={true}
                        enforceFocus={true}
                        hasBackdrop={false}
                        isOpen={drawerIsOpen}
                        position={Position.BOTTOM}
                        usePortal={true}
                        onClose={(e) => {
                            e.preventDefault();
                            setDrawerIsOpen(false);
                        }}
                        icon="info-sign"
                        title="Node info"
                    >
                        <div className={Classes.DRAWER_BODY}>
                            <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                                <VisualizerTree
                                    darkTheme={darkTheme}
                                    proof={proof}
                                    positionMap={map}
                                    content={tree}
                                    setNodeInfo={setNodeInfo}
                                />
                            </div>
                            <div className={Classes.DIALOG_BODY}>
                                <NodeInfoTable nodeInfo={nodeInfo} ruleHelper={ruleHelper} />
                            </div>
                        </div>
                    </Drawer>
                </>
            )}
        </div>
    );
};

export default VisualizerStage;
