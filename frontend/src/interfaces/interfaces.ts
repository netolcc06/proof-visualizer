import type { JSX } from 'react';
import { Dispatch, SetStateAction } from 'react';
import { ActionCreatorWithPayload } from '@reduxjs/toolkit';
import { renderLetKind, ClusterKind } from './enum';
import type { SliceDialogState, SolverState } from '../store/features/solver/solverSlice';

// NODES
interface NodeInterface {
    id: number;
    stepId: string;
    conclusion: string;
    rule: string;
    args: string;
    children: number[];
    parents: number[];
    hiddenNodes?: NodeInterface[];
    isHidden?: number;
    descendants: number;
    dependencies: { piId: number; depsId: number[] }[];
    clusterType: ClusterKind;
    discharge: string[];
    anchorPath: string[];
    anchorArgs: string | null;
}

// Alethe details shown in the node info
interface NodeDetails {
    stepId: string;
    premises: string[];
    discharge: string[];
    anchorPath: string[];
    anchorArgs: string | null;
    clusterType: ClusterKind;
}

interface NodeProps extends NodeDetails {
    id: NodeInterface['id'];
    conclusion: NodeInterface['conclusion'];
    rule: NodeInterface['rule'];
    args: NodeInterface['args'];

    x: number;
    y: number;

    nHided: number;
    nDescendants: number;
    hiddenNodes: number[];
    dependencies: NodeInterface['dependencies'];

    selected: boolean;
    color: string;
    highlighted?: boolean;

    setNodeOnFocus: (id: number) => void;
    toggleNodeSelection: (id: number) => void;
    updateNodePosition: (key: number, x: number, y: number) => void;
    openDrawer: (nodeInfo: NodeInfo, tree?: Array<TreeNode>) => void;
    onDragEnd: (nodeID: number) => void;
    createTree: (id: number) => TreeNode[];
}

// Info passed to the info drawer
interface NodeInfo extends NodeDetails {
    id: NodeProps['id'];
    rule: NodeProps['rule'];
    args: NodeProps['args'];
    conclusion: NodeProps['conclusion'];
    nHided: NodeProps['nHided'];
    nDescendants: NodeProps['nDescendants'];
    hiddenNodes: NodeProps['hiddenNodes'];
    dependencies: NodeProps['dependencies'];
}

// VISUALIZER STAGE
interface VisualizerStageProps {
    disableExternalDrawers: React.DispatchWithoutAction;
}

// CANVAS
// Dividir essas interfaces em funções
interface CanvasProps {
    openDrawer: (nodeInfo: NodeInfo) => void;
    createTree: (proof: NodeInterface[], id: number) => TreeNode[];
}

interface CanvasPropsAndRedux extends CanvasProps {
    proof: NodeInterface[];
    visualInfo: ProofState['visualInfo'];
    nodesSelected: ProofState['nodesSelected'];
    nodeFindData: ExternalCmdState['findData'];
    renderData: ExternalCmdState['renderData'];
    spinner: ExternalCmdState['spinner'];
    selectData: ExternalCmdState['selectData'];
    regionCapture: boolean;

    hideNodes: ActionCreatorWithPayload<void, string>;
    unfoldNextNode: ActionCreatorWithPayload<number, string>;
    unfoldNodes: ActionCreatorWithPayload<number, string>;
    foldAllDescendants: ActionCreatorWithPayload<number>;
    setVisualInfo: ActionCreatorWithPayload<ProofState['visualInfo'], string>;
    findNode: ActionCreatorWithPayload<{ nodeId: number; option: boolean }, string>;
    setSelectArea: ActionCreatorWithPayload<ExternalCmdState['selectData'], string>;
    selectByArea: ActionCreatorWithPayload<ExternalCmdState['selectData']['square'], string>;
    unselectByArea: ActionCreatorWithPayload<ExternalCmdState['selectData']['square'], string>;
    reRender: ActionCreatorWithPayload<void, string>;
    addRenderCount: ActionCreatorWithPayload<void, string>;
    blockRender: ActionCreatorWithPayload<void, string>;
    blockRenderNewFile: ActionCreatorWithPayload<void, string>;
    setSpinner: ActionCreatorWithPayload<ExternalCmdState['spinner'], string>;
    undo: ActionCreatorWithPayload<void, string>;
    openSliceDialog: ActionCreatorWithPayload<SliceDialogState | null, string>;
    selectNodes: ActionCreatorWithPayload<number[], string>;
    unselectNodes: ActionCreatorWithPayload<{ nodes: number[]; cleanAll: boolean }, string>;
    applyColor: ActionCreatorWithPayload<string, string>;
    moveNode: ActionCreatorWithPayload<{ id: number; x: number; y: number }, string>;
}

interface CanvasState {
    canvasSize: { width: number; height: number };
    stage: { stageScale: number; stageX: number; stageY: number };
    showingNodes: { [id: number]: JSX.Element };
    showingEdges: { [id: string]: JSX.Element };
    nodeOnFocus: number;
    proof: NodeInterface[];
    visualInfo: ProofState['visualInfo'];
    selectCount: number;
}

// DIRECTORY STYLE
interface DirectoryStyleProps {
    ruleHelper: (s: string) => string;
}

// SELECT OVERLAY
interface SelectionSquare {
    upperL: { x: number; y: number };
    lowerR: { x: number; y: number };
}

interface SelectOverlayProps {
    isSelecting: boolean;
    selectMode: boolean;
    setIsSelecting: React.Dispatch<{
        type: 'invert' | 'set' | 'change-mode';
        payload: { value: boolean; key: 's' | 'u' | 'n' };
    }>;
}

// NAVBAR
interface NavbarProps {
    setDialogIsOpen: Dispatch<SetStateAction<boolean>>;
    setDrawerIsOpen: Dispatch<SetStateAction<boolean>>;
    addErrorToast: (err: string) => void;
    inTutorial: boolean;
    setInTutorial: Dispatch<SetStateAction<boolean>>;
    setSmtDrawerIsOpen: Dispatch<SetStateAction<boolean>>;
}

interface NavbarPropsAndRedux extends NavbarProps {
    proof: ProofState['proof'];
    source: string;
    smt: string;
    view: ProofState['view'];
    visualInfo: ProofState['visualInfo'];
    hiddenNodes: number[][];
    hideNodes: ActionCreatorWithPayload<void, string>;
}

// DIALOG
interface VisualizerDialogProps {
    dialogIsOpen: boolean;
    setDialogIsOpen: Dispatch<SetStateAction<boolean>>;
    addErrorToast: (err: string) => void;
}

// TREENODE
interface TreeNode extends NodeDetails {
    id: NodeProps['id'];
    conclusion: NodeProps['conclusion'];
    rule: NodeProps['rule'];
    args: NodeProps['args'];
    descendants: NodeProps['nDescendants'];
    nHided: NodeProps['nHided'];
    hiddenNodes: NodeProps['hiddenNodes'];
    dependencies: NodeProps['dependencies'];

    icon: 'graph';
    isSelected?: boolean;
    isExpanded?: boolean;
    label: string;
    secondaryLabel: string;
    hasCaret: boolean | undefined;
    parentsId: number[];
    parentId: number;
    childNodes: TreeNode[];
}

interface TreeProps {
    darkTheme: boolean;
    proof: ProofState['proof'];
    positionMap: any;
    content: TreeNode[];
    // Start with the root node expanded
    expandRoot?: boolean;
    setNodeInfo: Dispatch<SetStateAction<NodeInfo>>;
}

interface LineProps {
    key: string;
    points: Array<number>;
}

// VISUALIZERS DRAWER
interface LetRenderProps {
    id: number;
    toRender: string;
    letMap: ProofState['letMap'];
    shouldExpand: boolean;
    shouldRevert: boolean;
    dispatchExpansion: React.Dispatch<{
        type: renderLetKind;
        payload: boolean;
    }>;
}

interface DrawerVisualizerTabProps {
    shouldResize: boolean;
}

interface DrawerProps {
    drawerIsOpen: boolean;
    setDrawerIsOpen: Dispatch<SetStateAction<boolean>>;
}

// SMT PANEL (floating)
interface SmtDrawerProps {
    isOpen: boolean;
    setDrawerIsOpen: Dispatch<SetStateAction<boolean>>;
    // Set when Carcara needs the SMT problem: expands a minimized panel
    expandRequested?: boolean;
    onExpandHandled?: () => void;
}

// TUTORIAL PROPS
interface TutorialProps {
    inTutorial: boolean;
    setInTutorial: Dispatch<SetStateAction<boolean>>;
}

interface TutorialPopoverProps {
    setIsOpen: Dispatch<SetStateAction<boolean>>;
    nextTutorial: () => void;
    stage: number;
    content: string[];
    W: number;
    position: {
        x: number;
        y: number;
        tW: number;
    };
}

// REDUX STATES
interface ReduxState {
    file: FileState;
    proof: ProofState;
    theme: ThemeState;
    externalCmd: ExternalCmdState;
    solver: SolverState;
}
// PROOFS
interface ProofState {
    proof: NodeInterface[];
    view: 'full' | 'clustered' | 'colored-full';
    style: 'graph' | 'directory';
    hiddenNodes: number[][];
    letMap: {
        [Key: string]: string;
    };
    theoryLemmaMap: string[];
    visualInfo: {
        [id: number]: {
            color: string;
            x: number;
            y: number;
            selected: boolean;
            // Border mark (e.g. steps added by a spliced slice)
            highlighted?: boolean;
        };
    };
    nodesSelected: number[];
    // Raw Alethe text of the loaded proof
    source: string;
    clustersInfos: {
        hiddenNodes: number[];
        type: ClusterKind;
        color: string;
    }[];
    smt: string;
}
// FILE
interface FileState {
    name: string;
    value: string;
    filesCount: number;
}
//THEME
interface ThemeState {
    value: boolean;
}
//EXTERNAL COMMANDS
interface ExternalCmdState {
    findData: {
        nodeToFind: number;
        findOption: boolean;
    };
    renderData: {
        count: number;
        fileChanged: boolean;
    };
    spinner: 'off' | 'busy' | 'render';
    busyLabel: string;
    selectData: { type: boolean; square: SelectionSquare };
    // Image region capture mode (Download > Select region)
    regionCapture: boolean;
}

export type {
    NodeInterface,
    NodeDetails,
    NodeProps,
    NodeInfo,
    VisualizerStageProps,
    CanvasProps,
    CanvasPropsAndRedux,
    CanvasState,
    DirectoryStyleProps,
    SelectionSquare,
    SelectOverlayProps,
    NavbarProps,
    NavbarPropsAndRedux,
    VisualizerDialogProps,
    TreeNode,
    TreeProps,
    LineProps,
    LetRenderProps,
    DrawerVisualizerTabProps,
    DrawerProps,
    SmtDrawerProps,
    TutorialProps,
    TutorialPopoverProps,
    ReduxState,
    ProofState,
    FileState,
    ThemeState,
    ExternalCmdState,
};
