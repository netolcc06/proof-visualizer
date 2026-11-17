import { FoldUndo, HideUndo, UnfoldUndo } from './../../../interfaces/undoClasses';
import { Draft, PayloadAction } from '@reduxjs/toolkit';
import { descendants, findNodesClusters, sliceNodesCluster, extractTheoryLemmas } from './auxi';
import type { ProcessPayload } from './alethe';
import { CLUSTER_STYLE } from '../../../interfaces/clusterStyle';
import { ExternalCmdState, ProofState } from '../../../interfaces/interfaces';
import { BaseUndo, ColorUndo, MoveUndo } from '../../../interfaces/undoClasses';

const STACK_MAX_SIZE = 20;
const LARGE_PROOF_SIZE = 1000 as const;
const undoQueue: BaseUndo[] = [];

function addUndo(undo: BaseUndo): void {
    // Ensures max size
    if (undoQueue.length === STACK_MAX_SIZE) undoQueue.shift();
    // Add to stack
    undoQueue.push(undo);
}

function clearUndo(): void {
    undoQueue.length = 0;
}

function clearHiddenNodes(state: Draft<ProofState>, action: PayloadAction<null>): void {
    state.hiddenNodes.forEach((hiddenArray) => hiddenArray.forEach((node) => (state.proof[node].isHidden = undefined)));
    state.hiddenNodes = [];
}

// Color of the root node in the component views
function rootColor(state: Draft<ProofState>): string {
    return CLUSTER_STYLE[state.proof[0].clusterType]?.color ?? '#fff';
}

function process(state: Draft<ProofState>, action: PayloadAction<ProcessPayload>): void {
    const { nodes, letMap, source, session } = action.payload;

    // Reset the state
    clearUndo();
    state.clustersInfos = [];
    state.nodesSelected = [];
    state.hiddenNodes = [];
    state.proof = nodes;
    state.letMap = letMap;
    state.source = source;
    state.view = 'full';

    // Slice the inferred components into clusters
    const clustersMap: number[] = Array(nodes.length).fill(-1);
    const clusters = sliceNodesCluster(state.proof, clustersMap);
    clusters.forEach((cluster) => {
        const type = state.proof[cluster[0]].clusterType;
        state.clustersInfos.push({ hiddenNodes: cluster, type, color: CLUSTER_STYLE[type].color });
    });
    state.theoryLemmaMap = extractTheoryLemmas(state.proof, state.clustersInfos);

    // Clustered view is the default when there is more than one component
    if (new Set(nodes.map((n) => n.clusterType)).size > 1) state.view = 'clustered';

    if (session) {
        state.view = session.view;
        state.hiddenNodes = session.hiddenNodes;
        state.visualInfo = session.visualInfo;
        // Make sure the nodes that were selected stay selected
        const size = state.proof.length + state.hiddenNodes.length;
        for (let i = 0; i < size; i++) {
            if (state.visualInfo[i].selected) state.nodesSelected.push(i);
        }
    } else {
        // Init the visual info
        state.visualInfo = {};
        state.proof.forEach((node) => {
            state.visualInfo[node.id] = {
                color: '#fff',
                x: 0,
                y: 0,
                selected: false,
            };
        });

        if (state.view === 'clustered') {
            state.visualInfo[0].color = rootColor(state);
            let size = state.proof.length;
            state.clustersInfos.forEach(({ hiddenNodes, color }) => {
                let index;
                if (hiddenNodes.length > 1) {
                    state.hiddenNodes.push(hiddenNodes);
                    index = size++;
                } else index = hiddenNodes[0];
                state.visualInfo[index] = {
                    color: color,
                    x: 0,
                    y: 0,
                    selected: false,
                };
            });
        }
    }
    // Set all the hidden nodes as hidden
    state.hiddenNodes.forEach((hiddenNodesArray, i) => {
        const piID = state.proof.length + i;
        hiddenNodesArray.forEach((node) => (state.proof[node].isHidden = piID));
    });

    // Fold nodes if proof is too large
    if (!session && state.proof.length > LARGE_PROOF_SIZE) {
        let piNode = { id: -1, max: -1 };
        state.proof.forEach((node) => {
            // id >=5 is an arbitrary value
            if (node.id >= 5 && node.descendants > piNode.max) {
                piNode = {
                    id: node.id,
                    max: node.descendants,
                };
            }
        });
        foldAllDescendants(state, { payload: piNode.id } as PayloadAction<number>);
    }
}

function hideNodes(state: Draft<ProofState>, action: PayloadAction<void>): void {
    const size = state.proof.length + state.hiddenNodes.length;

    const toHideNodes = state.nodesSelected.filter(
        (id) => id > 0 && id < state.proof.length && !state.proof[id].isHidden,
    );

    const clusters = findNodesClusters(state.proof, toHideNodes);
    // If there are clusters to hide
    if (clusters.length) {
        clusters.forEach((cluster) => state.hiddenNodes.push(cluster));

        // Save the position of all nodes
        const pos: { id: number; x: number; y: number }[] = [];
        for (let id = 0; id < size; id++) {
            pos.push({ id: id, x: state.visualInfo[id].x, y: state.visualInfo[id].y });
        }

        // Set the visual info for the new pi nodes
        clusters.forEach((cluster, i) => {
            const piID = size + i;
            state.visualInfo[piID] = {
                color: '#555',
                x: 0,
                y: 0,
                selected: false,
            };

            cluster.forEach((nodeID) => (state.proof[nodeID].isHidden = piID));
        });

        // Add undo action
        addUndo(new HideUndo([], pos, clusters.length));
    }
    // Unselect the selected nodes
    toHideNodes.forEach((id) => (state.visualInfo[id].selected = false));
    // Unselect all the nodes
    unselectNodes(state, { payload: { nodes: state.nodesSelected, cleanAll: true }, type: 'string' });
}

function foldAllDescendants(state: Draft<ProofState>, action: PayloadAction<number>): void {
    const size = state.proof.length + state.hiddenNodes.length;
    const hashMap: { [nodeID: number]: boolean } = {};
    const newHidden = [action.payload, ...descendants(state.proof, action.payload)].filter((id) => {
        let isTheFirst = true;
        if (hashMap[id]) isTheFirst = false;
        else hashMap[id] = true;

        return id > 0 && id < state.proof.length && isTheFirst && !state.proof[id].isHidden;
    });

    // If the array is valid to become a pi node
    if (newHidden.length > 1) {
        state.hiddenNodes.push(newHidden);
        newHidden.forEach((nodeID) => {
            state.proof[nodeID].isHidden = size;
            state.visualInfo[nodeID].selected = false;
        });

        // Set the visual info for the new pi node and the root node
        state.visualInfo[action.payload].selected = false;
        state.visualInfo[size] = {
            color: '#555',
            x: 0,
            y: 0,
            selected: false,
        };

        // Save the position of all nodes
        const pos: { id: number; x: number; y: number }[] = [];
        for (let id = 0; id < size; id++) {
            pos.push({ id: id, x: state.visualInfo[id].x, y: state.visualInfo[id].y });
        }

        // Add undo action
        addUndo(new FoldUndo([], pos));
        // Unselect all the nodes
        unselectNodes(state, { payload: { nodes: state.nodesSelected, cleanAll: true }, type: 'string' });
    }
}

function unfoldNodes(state: Draft<ProofState>, action: PayloadAction<number>): void {
    const pi = action.payload;
    const hiddenID = pi - state.proof.length;
    const hiddens = state.hiddenNodes[hiddenID];
    const size = state.proof.length + state.hiddenNodes.length;
    const color = state.visualInfo[pi].color;

    // Save all the positions
    const pos: { id: number; x: number; y: number }[] = [];
    for (let id = 0; id < size; id++) {
        pos.push({ id: id, x: state.visualInfo[id].x, y: state.visualInfo[id].y });
    }

    // Unselect the hidden nodes and set their color equal to the pi node
    const colors: { id: number; color: string }[] = [];
    hiddens.forEach((id) => {
        // Save all the hidden nodes colors
        colors.push({ id: id, color: state.visualInfo[id].color });
        // Signalize nodes are unhided
        state.proof[id].isHidden = undefined;
        state.visualInfo[id] = {
            ...state.visualInfo[id],
            color: color !== '#555' ? color : state.visualInfo[id].color,
            selected: false,
        };
    });
    colors.push({ id: pi, color: color });

    // Remove the pi node array
    state.hiddenNodes.splice(hiddenID, 1);

    // Make sure the ids are realocated
    for (let i = pi; i < size - 1; i++) {
        state.visualInfo[i] = state.visualInfo[i + 1];
    }
    // Delete the last position
    delete state.visualInfo[size - 1];

    // Add undo action
    addUndo(new UnfoldUndo([...hiddens], pos, colors));
    // Unselect all the nodes
    unselectNodes(state, { payload: { nodes: state.nodesSelected, cleanAll: true }, type: 'string' });
}

function unfoldNextNode(state: Draft<ProofState>, action: PayloadAction<number>): void {
    const pi = action.payload;
    const hiddenID = pi - state.proof.length;
    const hiddens = [...state.hiddenNodes[hiddenID]];
    const size = state.proof.length + state.hiddenNodes.length;
    const color = state.visualInfo[pi].color;

    // Save all the positions
    const pos: { id: number; x: number; y: number }[] = [];
    for (let id = 0; id < size; id++) {
        pos.push({ id: id, x: state.visualInfo[id].x, y: state.visualInfo[id].y });
    }

    // Shows a node with the pi color (a manually folded pi keeps the nodes' own colors)
    const colors: { id: number; color: string }[] = [];
    const reveal = (id: number): void => {
        // Save the hidden node color
        colors.push({ id: id, color: state.visualInfo[id].color });
        // Signalize node is unhided
        state.proof[id].isHidden = undefined;
        state.visualInfo[id] = {
            ...state.visualInfo[id],
            color: color !== '#555' ? color : state.visualInfo[id].color,
            selected: false,
        };
    };

    const [firstHidden, ...rest] = hiddens;
    reveal(firstHidden);

    // If the remaining hidden nodes are still clusterable we keep them folded.
    // Otherwise, we need to show all of them
    const nodeClusters = findNodesClusters(state.proof, rest);

    // Remove the pi node: the pi nodes above it shift down by one
    state.hiddenNodes.splice(hiddenID, 1);
    for (let i = pi; i < size - 1; i++) {
        state.visualInfo[i] = state.visualInfo[i + 1];
    }
    delete state.visualInfo[size - 1];

    if (nodeClusters.length) {
        // Nodes that dropped out of every cluster become visible
        const clustered = new Set(nodeClusters.reduce((acc: number[], cluster) => acc.concat(cluster), []));
        rest.forEach((id) => {
            if (!clustered.has(id)) reveal(id);
        });

        // The new pi nodes take the ids after the shifted ones
        nodeClusters.forEach((cluster, i) => {
            state.hiddenNodes.push(cluster);
            state.visualInfo[size - 1 + i] = {
                color: color,
                x: 0,
                y: 0,
                selected: false,
            };
        });
    } else {
        rest.forEach(reveal);
    }

    // Keep the hidden nodes pointing to their (possibly shifted) pi node
    state.hiddenNodes.forEach((hiddenArray, i) => {
        hiddenArray.forEach((id) => (state.proof[id].isHidden = state.proof.length + i));
    });

    // The pi node must be the last color entry (see undo)
    colors.push({ id: pi, color: color });
    // Add undo action
    addUndo(new UnfoldUndo(hiddens, pos, colors));
    // Unselect all the nodes
    unselectNodes(state, { payload: { nodes: state.nodesSelected, cleanAll: true }, type: 'string' });
}

function setVisualInfo(state: Draft<ProofState>, action: PayloadAction<ProofState['visualInfo']>): void {
    state.visualInfo = action.payload;
}

function selectByArea(state: Draft<ProofState>, action: PayloadAction<ExternalCmdState['selectData']['square']>): void {
    const { upperL, lowerR } = action.payload;
    const size = state.proof.length + state.hiddenNodes.length;
    for (let i = 0; i < size; i++) {
        const thisNode = state.visualInfo[i];
        if (
            upperL.x <= thisNode.x &&
            thisNode.x <= lowerR.x &&
            upperL.y <= thisNode.y &&
            thisNode.y <= lowerR.y &&
            !thisNode.selected
        ) {
            thisNode.selected = true;
            state.nodesSelected.push(i);
        }
    }
}

function unselectByArea(
    state: Draft<ProofState>,
    action: PayloadAction<ExternalCmdState['selectData']['square']>,
): void {
    const { upperL, lowerR } = action.payload;
    const size = state.proof.length + state.hiddenNodes.length;
    for (let i = 0; i < size; i++) {
        const thisNode = state.visualInfo[i];
        if (
            upperL.x <= thisNode.x &&
            thisNode.x <= lowerR.x &&
            upperL.y <= thisNode.y &&
            thisNode.y <= lowerR.y &&
            thisNode.selected
        ) {
            thisNode.selected = false;
            state.nodesSelected = state.nodesSelected.filter((node) => node !== i);
        }
    }
}

function selectNodes(state: Draft<ProofState>, action: PayloadAction<number[]>): void {
    const len = state.proof.length + state.hiddenNodes.length;
    action.payload.forEach((id) => {
        if (id >= 0 && id < len) {
            if (!state.visualInfo[id].selected) state.nodesSelected.push(id);
            state.visualInfo[id].selected = true;
        }
    });
}

function unselectNodes(state: Draft<ProofState>, action: PayloadAction<{ nodes: number[]; cleanAll: boolean }>): void {
    const len = state.proof.length + state.hiddenNodes.length;
    action.payload.nodes.forEach((id) => {
        if (id >= 0 && id < len) {
            state.visualInfo[id].selected = false;
        }
    });
    // Allow faster clear of all the nodes selected
    if (action.payload.cleanAll) state.nodesSelected = [];
    else state.nodesSelected = state.nodesSelected.filter((node) => action.payload.nodes.indexOf(node) === -1);
}

function changeStyle(state: Draft<ProofState>, action: PayloadAction<ProofState['style']>): void {
    switch (action.payload) {
        case 'graph':
            state.style = 'graph';
            break;
        case 'directory':
            state.style = 'directory';
            break;
    }
}

// Border mark that survives the visual info rebuilds of applyView
function keepHighlight(state: Draft<ProofState>, id: number): { highlighted?: boolean } {
    return state.visualInfo[id]?.highlighted ? { highlighted: true } : {};
}

function applyView(state: Draft<ProofState>, action: PayloadAction<ProofState['view']>): void {
    // Unselect all the nodes
    unselectNodes(state, { payload: { nodes: state.nodesSelected, cleanAll: true }, type: 'string' });
    // Delete all the pi nodes visual info
    for (let i = state.proof.length; i < state.proof.length + state.hiddenNodes.length; i++) {
        delete state.visualInfo[i];
    }
    clearUndo();

    switch (action.payload) {
        // View without hidden Nodes
        case 'full':
            if (state.hiddenNodes.length || state.view !== 'full') {
                state.proof.forEach((node) => {
                    state.visualInfo[node.id] = {
                        color: '#fff',
                        x: 0,
                        y: 0,
                        selected: false,
                        ...keepHighlight(state, node.id),
                    };
                });

                clearHiddenNodes(state, { payload: null, type: 'string' });
            }
            state.view = 'full';
            break;
        // Cluster all the nodes in your respective group
        case 'clustered':
            // If there are clusters infos
            if (state.clustersInfos.length) {
                state.view = 'clustered';

                clearHiddenNodes(state, { payload: null, type: 'string' });
                state.visualInfo[0] = { ...state.visualInfo[0], color: rootColor(state) };
                let size = state.proof.length;

                state.clustersInfos.forEach(({ hiddenNodes, color }) => {
                    let index;
                    if (hiddenNodes.length > 1) {
                        state.hiddenNodes.push(hiddenNodes);
                        hiddenNodes.forEach((node) => (state.proof[node].isHidden = size));
                        index = size++;
                    }
                    // Cluster with 1 node
                    else index = hiddenNodes[0];

                    state.visualInfo[index] = {
                        color: color,
                        x: 0,
                        y: 0,
                        selected: false,
                        ...keepHighlight(state, index),
                    };
                });
            }
            break;
        // Apply full view but apply the clustrer color
        case 'colored-full':
            state.view = 'colored-full';
            clearHiddenNodes(state, { payload: null, type: 'string' });

            // If there are clusters infos
            if (state.clustersInfos.length) {
                state.visualInfo[0] = { ...state.visualInfo[0], color: rootColor(state) };
                state.clustersInfos.forEach((cluster) => {
                    cluster.hiddenNodes.forEach((node) => {
                        state.visualInfo[node] = {
                            color: cluster.color,
                            x: 0,
                            y: 0,
                            selected: false,
                            ...keepHighlight(state, node),
                        };
                    });
                });
            }
            break;
    }
}

function applyColor(state: Draft<ProofState>, action: PayloadAction<string>): void {
    const colorMap: { [color: string]: number[] } = {};
    //  Lembrar de iterar por nodesSelected
    state.nodesSelected.forEach((nodeID) => {
        const thisInfo = state.visualInfo[nodeID];
        if (colorMap[thisInfo.color]) colorMap[thisInfo.color].push(nodeID);
        else {
            colorMap[thisInfo.color] = [nodeID];
        }

        thisInfo.color = action.payload;
    });

    if (state.nodesSelected.length) addUndo(new ColorUndo([], colorMap));
    // Unselect all the nodes
    unselectNodes(state, { payload: { nodes: state.nodesSelected, cleanAll: true }, type: 'string' });
}

// Marks the nodes with the given Alethe step ids with a border (not undoable)
function highlightSteps(state: Draft<ProofState>, action: PayloadAction<{ stepIds: string[] }>): void {
    const ids = new Set(action.payload.stepIds);
    state.proof.forEach((node) => {
        if (ids.has(node.stepId) && state.visualInfo[node.id]) state.visualInfo[node.id].highlighted = true;
    });
}

function moveNode(state: Draft<ProofState>, action: PayloadAction<{ id: number; x: number; y: number }>): void {
    const { id, x, y } = action.payload;
    addUndo(new MoveUndo([id], state.visualInfo[id].x, state.visualInfo[id].y));

    // Update the position
    state.visualInfo[id].x = x;
    state.visualInfo[id].y = y;
}

function setSmt(state: Draft<ProofState>, action: PayloadAction<string>): void {
    state.smt = action.payload;
}

function undo(state: Draft<ProofState>, action: PayloadAction<void>): void {
    const topUndo = undoQueue.pop();
    if (topUndo) {
        const { nodes, name } = topUndo;
        if (name === 'MoveUndo') {
            const { x, y } = topUndo as MoveUndo;
            state.visualInfo[nodes[0]] = {
                ...state.visualInfo[nodes[0]],
                x,
                y,
            };
        } else if (name === 'ColorUndo') {
            const { colorMap } = topUndo as ColorUndo;
            Object.keys(colorMap).forEach((color) => {
                colorMap[color].forEach((node) => (state.visualInfo[node].color = color));
            });
        } else {
            // Unselect all the nodes
            unselectNodes(state, { payload: { nodes: state.nodesSelected, cleanAll: true }, type: 'string' });

            if (name === 'FoldUndo') {
                const { positions } = topUndo as FoldUndo;
                // Make sure the node is not hidden
                state.hiddenNodes[state.hiddenNodes.length - 1].forEach(
                    (node) => (state.proof[node].isHidden = undefined),
                );
                // Remove the old pi node
                state.hiddenNodes.splice(state.hiddenNodes.length - 1, 1);
                delete state.visualInfo[state.proof.length + state.hiddenNodes.length];
                // Put all the nodes in the older position
                positions.forEach(({ id, x, y }) => {
                    state.visualInfo[id].x = x;
                    state.visualInfo[id].y = y;
                });
            } else if (name === 'HideUndo') {
                const { positions, nPiNodes } = topUndo as HideUndo;
                // Remove the old pi nodes
                for (let len = state.proof.length + state.hiddenNodes.length, i = 0; i < nPiNodes; i++) {
                    delete state.visualInfo[--len];
                    // Make sure the node is not hidden
                    state.hiddenNodes[nPiNodes - i - 1].forEach((node) => (state.proof[node].isHidden = undefined));
                }
                state.hiddenNodes.splice(state.hiddenNodes.length - nPiNodes, nPiNodes);

                // Put all the nodes in the older position
                positions.forEach(({ id, x, y }) => {
                    state.visualInfo[id].x = x;
                    state.visualInfo[id].y = y;
                });
            } else if (name === 'UnfoldUndo') {
                const { positions, colors } = topUndo as UnfoldUndo;
                let i;
                // Create the old pi node in the right position
                const oldPiNum = colors[colors.length - 1].id;
                const newSize = state.proof.length + state.hiddenNodes.length;
                state.hiddenNodes.splice(oldPiNum - state.proof.length, 0, nodes);
                // Make sure all the hidden nodes will be signalized as hidden
                nodes.forEach((nodeID) => (state.proof[nodeID].isHidden = oldPiNum));
                // Shift the pi nodes visual info
                for (i = newSize; i > oldPiNum; i--) {
                    state.visualInfo[i] = state.visualInfo[i - 1];
                }
                state.visualInfo[i] = { x: 0, y: 0, color: '', selected: false };
                // Put all the nodes in the older position
                positions.forEach(({ id, x, y }) => {
                    state.visualInfo[id].x = x;
                    state.visualInfo[id].y = y;
                });
                // Set the old color of all the hidden nodes
                colors.forEach(({ id, color }) => {
                    state.visualInfo[id].color = color;
                });
            }
        }
    }
}

const reducers = {
    process,
    hideNodes,
    foldAllDescendants,
    unfoldNodes,
    unfoldNextNode,
    setVisualInfo,
    selectByArea,
    unselectByArea,
    selectNodes,
    unselectNodes,
    changeStyle,
    applyView,
    applyColor,
    highlightSteps,
    moveNode,
    setSmt,
    undo,
};

export default reducers;
