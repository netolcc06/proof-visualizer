import React, { useState } from 'react';

import { Classes, Tree } from '@blueprintjs/core';
import { TreeNode, TreeProps } from '../../interfaces/interfaces';
import { collapseNode, expandNode, nodeAt, selectNode } from './treeState';

const VisualizerTree: React.FC<TreeProps> = ({
    darkTheme,
    proof,
    positionMap,
    content,
    expandRoot = false,
    setNodeInfo,
}: TreeProps) => {
    const initialNodes = () => (expandRoot ? expandNode(content, [0], proof, positionMap) : content);

    // STATES:
    const [nodes, setNodes] = useState<TreeNode[]>(initialNodes);
    const [lastContent, setLastContent] = useState(content);

    // New content resets the tree
    if (lastContent !== content) {
        setLastContent(content);
        setNodes(initialNodes());
    }

    // The callbacks receive a copy of the node props, so the state is always read by path
    const handleNodeClick = (_nodeData: unknown, path: number[], e: React.MouseEvent<HTMLElement>) => {
        const node = nodeAt(nodes, path);
        if (!node) return;
        const toBeShow = node.isSelected ? nodes[0] : node;
        setNodeInfo({
            id: toBeShow.id,
            stepId: toBeShow.stepId ?? '',
            premises: toBeShow.premises ?? [],
            discharge: toBeShow.discharge ?? [],
            anchorPath: toBeShow.anchorPath ?? [],
            anchorArgs: toBeShow.anchorArgs ?? null,
            clusterType: toBeShow.clusterType ?? 0,
            rule: toBeShow.rule ? toBeShow.rule : '',
            args: toBeShow.args ? toBeShow.args : '',
            conclusion: toBeShow.conclusion ? toBeShow.conclusion : '',
            nHided: toBeShow.nHided ? toBeShow.nHided : 0,
            nDescendants: toBeShow.descendants,
            hiddenNodes: toBeShow.hiddenNodes,
            dependencies: toBeShow.dependencies,
        });
        setNodes(selectNode(nodes, path, e.shiftKey));
    };

    const handleNodeCollapse = (_nodeData: unknown, path: number[]) => setNodes(collapseNode(nodes, path));

    const handleNodeExpand = (_nodeData: unknown, path: number[]) =>
        setNodes(expandNode(nodes, path, proof, positionMap));

    return (
        <div style={{ backgroundColor: darkTheme ? '#394b59' : 'white' }}>
            <Tree
                contents={nodes}
                onNodeClick={handleNodeClick}
                onNodeCollapse={handleNodeCollapse}
                onNodeExpand={handleNodeExpand}
                className={Classes.ELEVATION_0}
            />
        </div>
    );
};

export default VisualizerTree;
