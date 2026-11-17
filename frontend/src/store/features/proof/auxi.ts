import { ClusterKind } from '../../../interfaces/enum';
import { NodeInterface, ProofState } from '../../../interfaces/interfaces';

export const piNodeParents = (
    proof: NodeInterface[],
    hiddenNodesArray: number[],
    dependencies: { [parentId: number]: number[] } = {},
): number[] => {
    const parents = hiddenNodesArray
        // Concat all the parents
        .reduce((acc: number[], hiddenNode) => {
            let haveHiddenParent = false;

            proof[hiddenNode].parents.forEach((parent) => {
                // If this parent is a hidden node
                if (hiddenNodesArray.indexOf(parent) !== -1) {
                    haveHiddenParent = true;
                } else {
                    dependencies[parent]
                        ? dependencies[parent].push(hiddenNode)
                        : (dependencies[parent] = [hiddenNode]);
                }
            });

            if (haveHiddenParent) return acc;
            return acc.concat(proof[hiddenNode].parents);
        }, [])
        // Filter the duplicated elements
        .filter((parent, i, self) => self.indexOf(parent) === i)
        // Only the parents that aren't in he hidden nodes array remains
        .filter((parent) => hiddenNodesArray.indexOf(parent) === -1);

    // Removes the pi node parents from the dependencies
    Object.keys(dependencies).forEach((parent) => {
        const n = Number(parent);
        if (parents.indexOf(n) !== -1) delete dependencies[n];
    });

    return parents;
};

export const descendants = (proof: NodeInterface[], nodeId: number): number[] => {
    const validChildren = proof[nodeId].children.filter((node) => !proof[node].isHidden);
    return validChildren.concat(
        validChildren.reduce((acc: number[], childId) => {
            return acc.concat(descendants(proof, childId));
        }, []),
    );
};

export const piNodeChildren = (proof: NodeInterface[], hiddenNodesArray: number[]): number[] => {
    const children = hiddenNodesArray
        // Get all the childrens
        .reduce((acc: number[], hiddenNode) => acc.concat(proof[hiddenNode].children), [])
        // Exclude the childrens that are part of the hidden nodes
        .filter((child) => hiddenNodesArray.indexOf(child) === -1);
    return children;
};

export const findNodesClusters = (proof: NodeInterface[], hiddenNodesArray: number[]): number[][] => {
    const hiddenNodes = [...hiddenNodesArray];
    const clusters: number[][] = [];
    let clusteredNodes = 0;
    const parents = hiddenNodes.map((hiddenNode) => proof[hiddenNode].parents);

    // Cluster the nodes based on similiar parents
    parents.forEach((parent, clusterID) => {
        // If not all of the nodes where clustered and is a non empty cluster
        if (clusteredNodes !== parents.length && parents[clusterID].length) {
            clusters.push([]);
            parents.forEach((p, hiddenID) => {
                // If those nodes have some parent in commom and they weren't verified yet
                if (parents[hiddenID].length && parent.some((_p) => p.indexOf(_p) !== -1)) {
                    if (hiddenNodes[hiddenID]) clusters[clusters.length - 1].push(hiddenNodes[hiddenID]);
                    // Removes these parents from the array, making shure they will not get verified again (already clustered)
                    parents[hiddenID] = [];
                    // Increases the number o clustered nodes
                    clusteredNodes++;
                }
            });
        }
    });

    let pastCluster: number[][] = [];
    // Cluster the nodes until there aren't changes being made
    while (JSON.stringify(pastCluster) != JSON.stringify(clusters)) {
        pastCluster = [...clusters];
        clusters.forEach((cluster, clusterID) => {
            const clusterParents = proof[cluster[0]].parents;

            // For each cluster
            clusters.forEach((parentCluster, id) => {
                // If this parentCluster (cluster) is parent of the current cluster
                if (parentCluster.some((hiddenID) => clusterParents.indexOf(hiddenID) !== -1)) {
                    // Group the nodes couple in one single cluster (the parent cluster)
                    if (clusters[clusterID]) clusters[id] = clusters[id].concat(clusters[clusterID]);
                    clusters.splice(clusterID, 1);
                    clusterID--;
                }
            });
        });
    }

    // Filter the nodes with length 1
    return clusters.filter((cluster) => cluster.length > 1);
};

export const groupPiNodeDependencies = (
    proof: NodeInterface[],
    hiddenNodesArray: number[],
): NodeInterface['dependencies'] => {
    const piNodeDependencies: NodeInterface['dependencies'] = [];
    const depMap: { [piID: number]: number } = {};

    // Copy all the hidden nodes dependencies to the new pi node
    proof.forEach((node) => {
        // Search for all the hidden nodes that have deps
        if (hiddenNodesArray.indexOf(node.id) !== -1 && node.dependencies.length) {
            // For each dependence in this node
            node.dependencies.forEach((dep) => {
                // This pi node dependence wasn't inserted yet
                if (Object.keys(depMap).indexOf(String(dep.piId)) === -1) {
                    piNodeDependencies.push(dep);
                    depMap[dep.piId] = piNodeDependencies.length - 1;
                }
                // Concat the nodes inside the pi node already inserted
                else {
                    piNodeDependencies[depMap[dep.piId]].depsId = piNodeDependencies[depMap[dep.piId]].depsId.concat(
                        dep.depsId,
                    );
                }
            });
        }
    });
    return piNodeDependencies;
};

// Groups the nodes of each component: a node joins the cluster of its first already placed parent with the
// same component, otherwise it starts a cluster together with its same-component siblings.
// The root stays out of the clusters (it is always visible).
export const sliceNodesCluster = (
    proof: NodeInterface[],
    clusterMap: number[],
    nodeId = 0,
    slicedClusters: number[][] = [],
): number[][] => {
    const visited = new Uint8Array(proof.length);
    const stack = [nodeId];

    while (stack.length) {
        const id = stack.pop() as number;
        if (visited[id]) continue;
        visited[id] = 1;
        const currentNode = proof[id];

        if (id && clusterMap[id] === -1) {
            const parent = currentNode.parents.find(
                (p) => proof[p].clusterType === currentNode.clusterType && clusterMap[p] !== -1,
            );

            if (parent !== undefined) {
                const target = clusterMap[parent];
                slicedClusters[target].push(id);
                clusterMap[id] = target;
            } else {
                const clusterID = slicedClusters.length;
                clusterMap[id] = clusterID;
                slicedClusters.push([id]);

                // Add the brothers with the same type in the same cluster
                proof[currentNode.parents[0]].children.forEach((c) => {
                    if (proof[c].clusterType === currentNode.clusterType && clusterMap[c] === -1) {
                        slicedClusters[clusterID].push(c);
                        clusterMap[c] = clusterID;
                    }
                });
            }
        }

        // Reversed so the children are visited in order
        for (let i = currentNode.children.length - 1; i >= 0; i--) stack.push(currentNode.children[i]);
    }
    return slicedClusters;
};

// Conclusion of the top node(s) of every theory lemma cluster. A top node is a derivation (not an assumption) that is
// used only from outside the theory/rewriting regions (the rewriting component may split a lemma in fragments).
export const extractTheoryLemmas = (
    proof: NodeInterface[],
    clusters: ProofState['clustersInfos'],
): ProofState['theoryLemmaMap'] => {
    const inside = (kind: ClusterKind): boolean => kind === ClusterKind.TL || kind === ClusterKind.RW;
    return clusters
        .filter((c) => c.type === ClusterKind.TL)
        .flatMap((c) =>
            c.hiddenNodes
                .filter(
                    (id) =>
                        proof[id].rule !== 'assume' && proof[id].parents.every((p) => !inside(proof[p].clusterType)),
                )
                .map((id) => proof[id].conclusion),
        );
};
