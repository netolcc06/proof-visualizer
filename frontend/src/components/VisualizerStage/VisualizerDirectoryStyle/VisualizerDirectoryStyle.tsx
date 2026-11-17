import React, { useMemo, useState } from 'react';

import { Classes } from '@blueprintjs/core';

import '../../../scss/VisualizerDirectoryStyle.scss';
import { useAppSelector } from '../../../store/hooks';
import { selectTheme } from '../../../store/features/theme/themeSlice';
import { NodeInfo, DirectoryStyleProps } from '../../../interfaces/interfaces';
import { emptyNodeInfo } from '../../../interfaces/nodeInfo';
import VisualizerTree from '../../VisualizerTree/VisualizerTree';
import { selectOriginalProof } from '../../../store/features/proof/proofSlice';
import { createTree } from '../../VisualizerTree/treeState';
import NodeInfoTable from '../../NodeInfoTable/NodeInfoTable';

const VisualizerDirectoryStyle: React.FC<DirectoryStyleProps> = ({ ruleHelper }: DirectoryStyleProps) => {
    const proof = useAppSelector(selectOriginalProof);
    const darkTheme = useAppSelector(selectTheme);
    const [nodeInfo, setNodeInfo] = useState<NodeInfo>(emptyNodeInfo);

    // Map the { [node id]: list array id }
    const positionMap = useMemo(() => {
        const map: { [id: number]: number } = {};
        proof.forEach((n, id) => (map[n.id] = id));
        return map;
    }, [proof]);
    // Always built from the original proof, which is also the one used to expand the nodes
    const proofTree = useMemo(() => createTree(proof, 0), [proof]);

    return (
        <div
            className="dir-style"
            style={{
                backgroundColor: darkTheme ? 'rgb(57, 75, 89)' : 'white',
                height:
                    window.innerHeight -
                    (document.getElementsByClassName(Classes.NAVBAR)[0] as HTMLElement).offsetHeight,
            }}
        >
            <div
                style={{
                    width: '50%',
                    height: '100%',
                    float: 'left',
                    clear: 'none',
                    borderRight: '1px solid black',
                    overflow: 'auto',
                }}
            >
                <VisualizerTree
                    darkTheme={darkTheme}
                    proof={proof}
                    positionMap={positionMap}
                    content={proofTree}
                    expandRoot
                    setNodeInfo={setNodeInfo}
                ></VisualizerTree>
            </div>
            <div
                style={{
                    width: '50%',
                    height: '100%',
                    float: 'left',
                    clear: 'none',
                }}
            >
                <NodeInfoTable nodeInfo={nodeInfo} ruleHelper={ruleHelper} />
            </div>
        </div>
    );
};

export default VisualizerDirectoryStyle;
