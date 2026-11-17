import type { JSX } from 'react';
import React, { Component } from 'react';
import { Stage, Layer } from 'react-konva';
import Konva from 'konva';
import dagre from '@dagrejs/dagre';
import Node from './VisualizerNode';
import Line from './VisualizerLine';
import Menu from './VisualizerMenu';
import { zoomScale } from './zoom';
import { registerStage, unregisterStage } from './stageRegistry';
import { setSliceDialog } from '../../../store/features/solver/solverSlice';
import {
    NodeProps,
    LineProps,
    TreeNode,
    CanvasPropsAndRedux,
    NodeInterface,
    ProofState,
    ReduxState,
} from '../../../interfaces/interfaces';

import { premiseIds } from '../../../interfaces/nodeInfo';
import '../../../scss/VisualizerCanvas.scss';

import { CanvasProps, CanvasState } from '../../../interfaces/interfaces';
import { connect } from 'react-redux';
import {
    selectVisualInfo,
    hideNodes,
    unfoldNodes,
    unfoldNextNode,
    foldAllDescendants,
    setVisualInfo,
    undo,
    selectNodes,
    unselectNodes,
    applyColor,
    moveNode,
    selectByArea,
    selectNodesSelected,
    unselectByArea,
} from '../../../store/features/proof/proofSlice';
import {
    selectFindData,
    findNode,
    selectRenderData,
    reRender,
    addRenderCount,
    blockRender,
    blockRenderNewFile,
    setSpinner,
    selectSpinner,
    selectSelectData,
    setSelectArea,
    selectRegionCapture,
} from '../../../store/features/externalCmd/externalCmd';

const nodeWidth = 300,
    nodeHeight = 130;

function handleWheel(e: Konva.KonvaEventObject<WheelEvent>): { stageScale: number; stageX: number; stageY: number } {
    e.evt.preventDefault();

    const stage = e.target.getStage();
    if (stage) {
        const oldScale = stage.scaleX();
        const pointerPosition = stage.getPointerPosition();
        let x, y;

        if (pointerPosition) {
            [x, y] = [pointerPosition.x, pointerPosition.y];
        } else {
            [x, y] = [0, 0];
        }

        const mousePointTo = {
            x: x / oldScale - stage.x() / oldScale,
            y: y / oldScale - stage.y() / oldScale,
        };

        const newScale = zoomScale(oldScale, e.evt.deltaY);

        return {
            stageScale: newScale,
            stageX: -(mousePointTo.x - x / newScale) * newScale,
            stageY: -(mousePointTo.y - y / newScale) * newScale,
        };
    }
    return {
        stageScale: 1,
        stageX: 0,
        stageY: 0,
    };
}

class Canvas extends Component<CanvasPropsAndRedux, CanvasState> {
    stageRef = React.createRef<Konva.Stage>();

    constructor(props: CanvasPropsAndRedux) {
        super(props);
        this.componentDidUpdate = this.componentDidUpdate.bind(this);
        this.setNodeOnFocus = this.setNodeOnFocus.bind(this);

        this.state = {
            canvasSize: {
                width: 520,
                height: 300,
            },
            stage: {
                stageScale: 1,
                stageX: 0,
                stageY: 0,
            },
            showingNodes: {},
            showingEdges: {},
            nodeOnFocus: NaN,
            proof: [],
            visualInfo: {},
            selectCount: 0,
        };
    }

    static copyNodePosition = (
        visualInfo: ProofState['visualInfo'],
        showingNodes: CanvasState['showingNodes'],
    ): ProofState['visualInfo'] => {
        // Get the current position of the nodes and create a proofState with them included
        const newVisualInfo: ProofState['visualInfo'] = {};
        Object.keys(visualInfo).forEach((id) => {
            const key = Number(id);

            if (showingNodes[key]) {
                newVisualInfo[key] = {
                    ...visualInfo[key],
                    x: showingNodes[key].props.x,
                    y: showingNodes[key].props.y,
                };
            } else {
                newVisualInfo[key] = {
                    ...visualInfo[key],
                };
            }
        });
        return newVisualInfo;
    };

    static newNodeProps = (
        node: NodeInterface,
        visualInfos: ProofState['visualInfo'],
        proof: NodeInterface[],
    ): NodeProps => {
        const visualInfo = visualInfos[node.id];
        return {
            id: node.id,
            stepId: node.stepId,
            premises: premiseIds(proof, node),
            discharge: node.discharge,
            anchorPath: node.anchorPath,
            anchorArgs: node.anchorArgs,
            clusterType: node.clusterType,
            conclusion: node.conclusion,
            rule: node.rule,
            args: node.args,
            x: visualInfo.x,
            y: visualInfo.y,
            nHided: node.hiddenNodes ? node.hiddenNodes.length : 0,
            nDescendants: node.descendants - 1,
            hiddenNodes: node.hiddenNodes ? node.hiddenNodes.map((node) => node.id) : [],
            dependencies: node.dependencies ? node.dependencies : [],
            selected: visualInfo.selected,
            color: visualInfo.color,
            highlighted: visualInfo.highlighted,
            setNodeOnFocus: () => undefined,
            toggleNodeSelection: () => undefined,
            updateNodePosition: () => undefined,
            openDrawer: () => undefined,
            onDragEnd: () => undefined,
            createTree: () => {
                return [];
            },
        };
    };

    static getDerivedStateFromProps(props: CanvasPropsAndRedux, current_state: CanvasState) {
        const proofChanged = JSON.stringify(current_state.proof) !== JSON.stringify(props.proof);
        const visualInfoChanged = JSON.stringify(current_state.visualInfo) !== JSON.stringify(props.visualInfo);
        const { nodeToFind, findOption } = props.nodeFindData;
        const { count, fileChanged } = props.renderData;
        const { selectData, setSelectArea, unselectByArea, selectByArea, selectNodes } = props;
        const { stage } = current_state;

        // If there is any select square to be converted
        if (selectData.square.lowerR.x !== -1) {
            current_state.selectCount++;
            if (current_state.selectCount === 1) {
                // Convert the dimensions of the square to fit the offset and scale
                const converted = {
                    upperL: {
                        x: (selectData.square.upperL.x - stage.stageX) / stage.stageScale,
                        y: (selectData.square.upperL.y - stage.stageY) / stage.stageScale,
                    },
                    lowerR: {
                        x: (selectData.square.lowerR.x - stage.stageX) / stage.stageScale,
                        y: (selectData.square.lowerR.y - stage.stageY) / stage.stageScale,
                    },
                };

                if (selectData.type) {
                    unselectByArea(converted);
                } else selectByArea(converted);
                setSelectArea({ type: false, square: { upperL: { x: -1, y: -1 }, lowerR: { x: -1, y: -1 } } });
            }
        } else current_state.selectCount = 0;

        // If there is a node to be found
        if (nodeToFind > -1) {
            // Is valid node
            if (nodeToFind <= props.proof[props.proof.length - 1].id) {
                // Change the stage position
                const { x, y } = props.visualInfo[nodeToFind];
                stage.stageX = current_state.canvasSize.width / 2 - (x + nodeWidth / 2) * stage.stageScale;
                stage.stageY = current_state.canvasSize.height / 2 - (y + nodeHeight / 2) * stage.stageScale;

                // Select the finded node
                if (findOption) {
                    selectNodes([nodeToFind]);
                }
            }
            // Reset the node finder
            props.findNode({ nodeId: -1, option: false });
        }

        // If the proof or visual info changed or we have a new file being uploaded
        if (proofChanged || visualInfoChanged || fileChanged) {
            // Create the showing nodes array
            const showingNodes: CanvasState['showingNodes'] = {};
            props.proof.forEach((node) => {
                showingNodes[node.id] = (
                    <Node key={node.id} {...Canvas.newNodeProps(node, props.visualInfo, props.proof)} />
                );
            });

            // If has nodes and can render
            if (showingNodes[0] && count < 2) {
                props.addRenderCount();

                const g = new dagre.graphlib.Graph();
                g.setGraph({ rankdir: 'BT', ranker: 'tight-tree' });
                g.setDefaultEdgeLabel(function () {
                    return {};
                });
                props.proof.forEach((node) => {
                    g.setNode(node.id.toString(), {
                        width: nodeWidth + (node.dependencies.length ? 95 : 0),
                        height: nodeHeight,
                    });
                    node.children.forEach((child) => {
                        g.setEdge(child.toString(), node.id.toString());
                    });
                });
                dagre.layout(g);

                const xOffset = g.node('0').x - (showingNodes[0].props.x ? showingNodes[0].props.x : 0);
                const yOffset = g.node('0').y - (showingNodes[0].props.y ? showingNodes[0].props.y : 0);
                g.nodes().forEach((v) => {
                    try {
                        const { x, y } = g.node(v);
                        const key = parseInt(v);
                        showingNodes[key] = (
                            <Node
                                key={showingNodes[key].key}
                                {...{
                                    ...showingNodes[key].props,
                                    x: x - xOffset,
                                    y: y - yOffset,
                                }}
                            />
                        );
                    } catch (e) {
                        console.log(e);
                    }
                });

                props.setVisualInfo(Canvas.copyNodePosition(props.visualInfo, showingNodes));
            }
            // Reset the new file indicator if it's true
            if (fileChanged) props.blockRenderNewFile();

            return {
                showingNodes: showingNodes,
                showingEdges: {},
                proof: props.proof,
                visualInfo: props.visualInfo,
                stage: stage,
            };
        }
        // Nothing to lay out: a later move must not trigger a relayout
        else if (count < 2) props.blockRender();
        // Disable the render spinner if the rendering have finished
        else if (props.spinner === 'render' && count === 2) {
            setTimeout(() => props.setSpinner('off'), 100);
        }
        return { stage: stage };
    }

    componentWillUnmount(): void {
        unregisterStage(this.stageRef.current);
    }

    componentDidMount(): void {
        registerStage(this.stageRef.current);
        const { showingNodes } = this.state;
        const { proof, visualInfo } = this.props;

        const newShowingNodes: CanvasState['showingNodes'] = {};
        proof.forEach((node) => {
            newShowingNodes[node.id] = <Node key={node.id} {...Canvas.newNodeProps(node, visualInfo, proof)} />;
        });

        this.setState({ proof: proof, showingNodes: newShowingNodes });

        if (showingNodes[0]) {
            const [width, height] = [window.innerWidth, window.innerHeight - 50];

            // Make sure every time the Canvas is mounted the props are passed to the showing nodes
            this.updateEdgesAndFuncs();

            this.setState({
                canvasSize: {
                    width,
                    height,
                },
                stage: {
                    stageScale: 1,
                    stageX: width / 2 - (showingNodes[0].props.x + 300 / 2),
                    stageY: height / 10 - (showingNodes[0].props.y + 30 / 2),
                },
            });
        }
    }

    componentDidUpdate(prevProps: CanvasPropsAndRedux, prevState: CanvasState) {
        // Region capture blocks the node menu
        if (this.props.regionCapture && !prevProps.regionCapture) {
            const menuNode = document.getElementById('menu');
            if (menuNode) menuNode.style.display = 'none';
        }
        // If the proof changed or the nodes were rebuilt (new nodes have no handlers nor edges)
        if (prevProps.proof !== this.props.proof || prevState.showingNodes !== this.state.showingNodes) {
            this.updateEdgesAndFuncs();
        }
    }

    updateEdgesAndFuncs() {
        const { showingNodes, showingEdges } = this.state;
        const { proof } = this.props;

        // Update edges
        proof.forEach((node) => {
            if (showingNodes[node.parents[0]]) {
                node.parents.forEach((parent) => {
                    showingEdges[`${node.id}->${parent}`] = Line(
                        this.LineProps(
                            `${node.id}->${parent}`,
                            showingNodes[node.id].props,
                            showingNodes[parent].props,
                        ),
                    );
                });
            }
        });
        Object.keys(showingNodes).forEach((nodeId: string) => {
            // Make sure a function is updated once
            if (!showingNodes[parseInt(nodeId)].props.setNodeOnFocus.length) {
                const { openDrawer } = this.props;

                // Set the node functions
                showingNodes[parseInt(nodeId)] = (
                    <Node
                        key={nodeId}
                        {...{
                            ...showingNodes[parseInt(nodeId)].props,
                            setNodeOnFocus: this.setNodeOnFocus,
                            toggleNodeSelection: this.toggleNodeSelection,
                            updateNodePosition: this.updateNodePosition,
                            openDrawer: openDrawer,
                            onDragEnd: this.saveNodePosition,
                            createTree: this.createTree,
                        }}
                    />
                );
            }
        });
        this.setState({ showingEdges, showingNodes });
    }

    /* NODE MENU ACTIONS */
    foldAllDescendants = (): void => {
        const { nodeOnFocus } = this.state;
        const { foldAllDescendants, reRender } = this.props;

        reRender();
        foldAllDescendants(nodeOnFocus);
    };

    foldSelectedNodes = (): void => {
        const { hideNodes, reRender } = this.props;

        reRender();
        hideNodes();
    };

    unfold = (): void => {
        const { nodeOnFocus } = this.state;
        const { unfoldNodes, reRender } = this.props;

        reRender();
        unfoldNodes(nodeOnFocus);
    };

    unfoldNext = (): void => {
        const { nodeOnFocus } = this.state;
        const { unfoldNextNode, reRender } = this.props;

        reRender();
        unfoldNextNode(nodeOnFocus);
    };

    changeNodeColor = (color: string): void => {
        const { showingNodes, nodeOnFocus } = this.state;
        const { applyColor, selectNodes } = this.props;

        // Select the node in focus to set the color later
        if (showingNodes[nodeOnFocus]) {
            selectNodes([nodeOnFocus]);
        }

        applyColor(color);
    };

    toggleNodeSelection = (id: number): void => {
        const { visualInfo, unselectNodes, selectNodes } = this.props;

        if (visualInfo[id].selected) {
            unselectNodes({ nodes: [id], cleanAll: false });
        } else {
            selectNodes([id]);
        }
    };

    /*TREE*/
    createTree = (id: number): TreeNode[] => {
        return this.props.createTree(this.state.proof, id);
    };

    /* UTILS */
    setNodeOnFocus = (id: number): void => {
        this.setState({ nodeOnFocus: id });
    };

    LineProps = (key: string, from: NodeProps, to: NodeProps): LineProps => ({
        key,
        points: [from.x + 150, from.y, to.x + 150, to.y + 105],
    });

    saveNodePosition = (nodeID: number): void => {
        const { moveNode } = this.props;
        const { showingNodes } = this.state;

        const thisNode = showingNodes[nodeID];
        moveNode({ id: nodeID, x: thisNode.props.x, y: thisNode.props.y });
    };

    updateNodePosition = (key: number, x: number, y: number): void => {
        const { showingNodes, showingEdges } = this.state;

        showingNodes[key] = <Node key={key} {...{ ...showingNodes[key].props, x, y }} />;

        Object.keys(showingEdges)
            .filter((edgeKey) => edgeKey.indexOf(key.toString()) !== -1)
            .forEach((edge) => {
                const [from, to] = edge.split('->').map((x) => parseInt(x));
                showingEdges[edge] = Line(this.LineProps(edge, showingNodes[from].props, showingNodes[to].props));
            });
        this.setState({ showingNodes, showingEdges });
    };

    // Opens the Carcara slice dialog for the focused node
    openSlice = (action: 'elaborate' | 'check'): void => {
        const found = this.state.proof.find((o) => o.id === this.state.nodeOnFocus);
        if (found) this.props.openSliceDialog({ from: found.stepId, action });
    };

    handleKeyDown = (e: React.KeyboardEvent) => {
        const { undo } = this.props;
        // CTRL + Z
        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            undo();
        }
    };

    render(): JSX.Element {
        const { canvasSize, stage, showingNodes, showingEdges, nodeOnFocus, proof } = this.state;
        const color = showingNodes[nodeOnFocus] ? showingNodes[nodeOnFocus].props.color : '';
        const { nodesSelected, regionCapture } = this.props;
        const found = proof.find((o) => o.id === nodeOnFocus);

        return (
            <div tabIndex={1} onKeyDown={this.handleKeyDown} style={{ overflow: 'hidden' }}>
                <Menu
                    unfold={this.unfold}
                    unfoldNext={this.unfoldNext}
                    foldSelectedNodes={this.foldSelectedNodes}
                    foldAllDescendants={this.foldAllDescendants}
                    elaborateSlice={() => this.openSlice('elaborate')}
                    checkSlice={() => this.openSlice('check')}
                    changeNodeColor={this.changeNodeColor}
                    options={{
                        unfold: showingNodes[nodeOnFocus] ? Boolean(showingNodes[nodeOnFocus].props.nHided) : false,
                        foldSelected: nodesSelected.length > 1 && nodesSelected.includes(nodeOnFocus),
                        foldAllDescendants:
                            Boolean(found?.children.length) && !found?.hiddenNodes?.length && found?.id != 0,
                        slice:
                            Boolean(found) &&
                            found?.rule !== 'π' &&
                            found?.rule !== 'assume' &&
                            !found?.hiddenNodes?.length,
                    }}
                    currentColor={color}
                ></Menu>
                <Stage
                    ref={this.stageRef}
                    draggable={!regionCapture}
                    onDragMove={() => null}
                    onDragEnd={(e) => {
                        // Node drags bubble up here: only the stage itself moves the view
                        if (e.target !== e.target.getStage()) return;
                        this.setState({
                            stage: {
                                stageScale: this.state.stage.stageScale,
                                stageX: e.target.x(),
                                stageY: e.target.y(),
                            },
                        });
                    }}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    onWheel={(e) => !regionCapture && this.setState({ stage: handleWheel(e) })}
                    scaleX={stage.stageScale}
                    scaleY={stage.stageScale}
                    x={stage.stageX}
                    y={stage.stageY}
                    onContextMenu={(e) => e.evt.preventDefault()}
                >
                    <Layer>
                        {Object.keys(showingEdges).length > 0 &&
                            Object.keys(showingEdges).map(function (key) {
                                return showingEdges[key];
                            })}
                        {Object.keys(showingNodes).length > 0 &&
                            Object.keys(showingNodes).map(
                                (value: string): JSX.Element => showingNodes[parseInt(value)],
                            )}
                    </Layer>
                </Stage>
            </div>
        );
    }
}

function mapStateToProps(state: ReduxState, ownProps: CanvasProps) {
    return {
        visualInfo: selectVisualInfo(state),
        nodeFindData: selectFindData(state),
        renderData: selectRenderData(state),
        spinner: selectSpinner(state),
        selectData: selectSelectData(state),
        regionCapture: selectRegionCapture(state),
        nodesSelected: selectNodesSelected(state),
        ...ownProps,
    };
}

const mapDispatchToProps = {
    hideNodes,
    unfoldNodes,
    unfoldNextNode,
    foldAllDescendants,
    setVisualInfo,
    findNode,
    setSelectArea,
    selectByArea,
    unselectByArea,
    reRender,
    addRenderCount,
    blockRender,
    blockRenderNewFile,
    setSpinner,
    undo,
    openSliceDialog: setSliceDialog,
    selectNodes,
    unselectNodes,
    applyColor,
    moveNode,
};

export default connect(mapStateToProps, mapDispatchToProps)(Canvas);
