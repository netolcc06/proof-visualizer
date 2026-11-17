import { AletheParseError, buildProofGraph, parseAlethe } from '../../../alethe';
import type { LetMap, ProofGraph } from '../../../alethe';
import type { NodeInterface, ProofState } from '../../../interfaces/interfaces';

export interface PreparedProof {
    nodes: NodeInterface[];
    letMap: LetMap;
}

// Saved view state of a session
export interface SessionView {
    view: ProofState['view'];
    hiddenNodes: number[][];
    visualInfo: ProofState['visualInfo'];
}

export interface SessionFile extends SessionView {
    version: 2;
    name: string;
    alethe: string;
    smt: string;
}

// Serializable payload of the `process` reducer
export interface ProcessPayload extends PreparedProof {
    source: string;
    session?: SessionView;
}

export function graphToNodes(graph: ProofGraph): NodeInterface[] {
    return graph.nodes.map((n) => ({
        id: n.id,
        stepId: n.stepId,
        conclusion: n.conclusion,
        rule: n.rule,
        args: n.args,
        children: n.children,
        parents: n.parents,
        descendants: n.descendants,
        dependencies: [],
        clusterType: n.component,
        discharge: n.discharge,
        anchorPath: n.anchorPath,
        anchorArgs: n.anchorArgs,
    }));
}

export function prepareProof(text: string): PreparedProof {
    const graph = buildProofGraph(parseAlethe(text));
    // Plain object: Redux state must not hold a prototype-less map
    return { nodes: graphToNodes(graph), letMap: { ...graph.letMap } };
}

export function formatLoadError(e: unknown): string {
    if (e instanceof AletheParseError) {
        return e.line > 0
            ? `Alethe parse error: ${e.detail} (line ${e.line}, column ${e.column})`
            : `Invalid Alethe proof: ${e.detail}`;
    }
    return e instanceof Error ? e.message : String(e);
}

export function looksLikeDot(text: string): boolean {
    return /^\s*(unsat\s*)?(strict\s+)?digraph\b/.test(text);
}

export const DOT_ERROR = 'DOT proofs are no longer supported. Generate the proof with --proof-format=alethe.';

export function buildSession(
    name: string,
    source: string,
    smt: string,
    { view, hiddenNodes, visualInfo }: SessionView,
): SessionFile {
    return { version: 2, name, alethe: source, smt, view, hiddenNodes, visualInfo };
}

export function parseSession(text: string): SessionFile {
    let data: Partial<SessionFile> & { dot?: unknown };
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('Invalid session file: not a valid JSON.');
    }
    if (!data || typeof data !== 'object') throw new Error('Invalid session file.');
    if ('dot' in data) {
        throw new Error('This session was saved in the old DOT format and is no longer supported.');
    }
    if (data.version !== 2 || typeof data.alethe !== 'string') {
        throw new Error('Invalid session file: expected a version 2 session with an "alethe" field.');
    }
    if (!['full', 'clustered', 'colored-full'].includes(data.view as string)) {
        throw new Error('Invalid session file: unknown view.');
    }
    if (!Array.isArray(data.hiddenNodes) || !data.visualInfo || typeof data.visualInfo !== 'object') {
        throw new Error('Invalid session file: missing view information.');
    }
    return {
        version: 2,
        name: typeof data.name === 'string' ? data.name : 'session',
        alethe: data.alethe,
        smt: typeof data.smt === 'string' ? data.smt : '',
        view: data.view as ProofState['view'],
        hiddenNodes: data.hiddenNodes,
        visualInfo: data.visualInfo,
    };
}

// Whether a saved view fits a proof with `size` nodes
export function sessionFits(session: SessionView, size: number): boolean {
    const total = size + session.hiddenNodes.length;
    for (let i = 0; i < total; i++) if (!session.visualInfo[i]) return false;
    return session.hiddenNodes.every((arr) => Array.isArray(arr) && arr.every((id) => id >= 0 && id < size));
}
