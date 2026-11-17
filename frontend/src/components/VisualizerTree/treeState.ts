import { NodeInterface, TreeNode } from '../../interfaces/interfaces';
import { premiseIds } from '../../interfaces/nodeInfo';

export type TreePath = number[];

export function castProofNodeToTreeNode(node: NodeInterface, proof: NodeInterface[]): TreeNode {
    const label = node.hiddenNodes?.length
        ? // Pi node
          `${node.id} : π ➜ ${node.conclusion}`
        : node.dependencies.length
          ? // Node with dependencies
            `${node.id} : β ➜ ${node.conclusion}`
          : //Normal node
            `${node.id} : ${node.conclusion}`;

    // Create the node tree
    return {
        id: node.id,
        stepId: node.stepId,
        premises: premiseIds(proof, node),
        discharge: node.discharge,
        anchorPath: node.anchorPath,
        anchorArgs: node.anchorArgs,
        clusterType: node.clusterType,
        icon: 'graph',
        isSelected: false,
        isExpanded: false,
        label: label,
        secondaryLabel: `${node.rule}`,
        rule: node.rule,
        args: node.args,
        conclusion: node.conclusion,
        parentId: node.parents[0],
        descendants: node.descendants - 1,
        nHided: node.hiddenNodes ? node.hiddenNodes.length : 0,
        hiddenNodes: node.hiddenNodes ? node.hiddenNodes.map((n) => n.id) : [],
        childNodes: [],
        dependencies: node.dependencies,
        parentsId: node.parents,
        hasCaret: Boolean(node.descendants - 1),
    };
}

export function createTree(proof: NodeInterface[], id: number): TreeNode[] {
    const rootNode = proof.find((o) => o.id === id);
    const tree: TreeNode[] = [];

    // Make sure found the root node
    if (rootNode) {
        tree.push(castProofNodeToTreeNode(rootNode, proof));
    }
    return tree;
}

export function nodeAt(nodes: TreeNode[], path: TreePath): TreeNode | undefined {
    let list: TreeNode[] | undefined = nodes;
    let node: TreeNode | undefined;
    for (const i of path) {
        node = list?.[i];
        list = node?.childNodes;
    }
    return node;
}

// Returns a new tree where the node at `path` is replaced by `fn(node)`; the input is never mutated.
function updateAt(nodes: TreeNode[], path: TreePath, fn: (node: TreeNode) => TreeNode): TreeNode[] {
    const [head, ...rest] = path;
    if (nodes[head] === undefined) return nodes;
    const node = nodes[head];
    const next = rest.length ? { ...node, childNodes: updateAt(node.childNodes ?? [], rest, fn) } : fn(node);
    return nodes.map((n, i) => (i === head ? next : n));
}

export function expandNode(
    nodes: TreeNode[],
    path: TreePath,
    proof: NodeInterface[],
    positionMap: { [id: number]: number },
): TreeNode[] {
    return updateAt(nodes, path, (node) => {
        if (!node.hasCaret || node.childNodes?.length) return { ...node, isExpanded: true };
        // A step can list the same premise twice (e.g. in a folded view); Blueprint keys siblings by id
        const ids = [...new Set(proof[positionMap[node.id]]?.children ?? [])];
        const childNodes = ids
            .filter((c) => proof[positionMap[c]] !== undefined)
            .map((c) => castProofNodeToTreeNode(proof[positionMap[c]], proof));
        return { ...node, isExpanded: true, childNodes };
    });
}

export function collapseNode(nodes: TreeNode[], path: TreePath): TreeNode[] {
    return updateAt(nodes, path, (node) => ({ ...node, isExpanded: false }));
}

function clearSelection(nodes: TreeNode[]): TreeNode[] {
    let changed = false;
    const out = nodes.map((n) => {
        const childNodes = clearSelection(n.childNodes ?? []);
        if (!n.isSelected && childNodes === n.childNodes) return n;
        changed = true;
        return { ...n, isSelected: false, childNodes };
    });
    return changed ? out : nodes;
}

// Toggles the node at `path`. Unless `additive`, every other selection is cleared first.
export function selectNode(nodes: TreeNode[], path: TreePath, additive: boolean): TreeNode[] {
    const wasSelected = Boolean(nodeAt(nodes, path)?.isSelected);
    const base = additive ? nodes : clearSelection(nodes);
    return updateAt(base, path, (node) => ({ ...node, isSelected: !wasSelected }));
}
