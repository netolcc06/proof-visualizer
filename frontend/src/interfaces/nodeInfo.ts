import { ClusterKind } from './enum';
import { NodeInfo, NodeInterface } from './interfaces';

export const emptyNodeInfo = (): NodeInfo => ({
    id: -1,
    stepId: '',
    rule: '',
    args: '',
    conclusion: '',
    nHided: 0,
    nDescendants: 0,
    hiddenNodes: [],
    dependencies: [],
    premises: [],
    discharge: [],
    anchorPath: [],
    anchorArgs: null,
    clusterType: ClusterKind.NONE,
});

// Step ids of the premises of a node (pi nodes are named after their id)
export const premiseIds = (proof: NodeInterface[], node: NodeInterface): string[] =>
    node.children.map((child) => proof.find((n) => n.id === child)?.stepId ?? String(child));
