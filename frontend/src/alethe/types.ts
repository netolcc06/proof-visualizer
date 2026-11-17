import type { SExpr } from './sexpr';

export interface AletheAssume {
    kind: 'assume';
    id: string;
    term: SExpr;
    anchor: string | null;
}

export interface AletheStep {
    kind: 'step';
    id: string;
    clause: SExpr[];
    rule: string;
    premises: string[];
    args: SExpr[];
    discharge: string[];
    /** Id of the innermost enclosing anchor; null at top level. A subproof-closing step belongs to the anchor's parent. */
    anchor: string | null;
    /** Unknown attributes, preserved for printing. */
    extra: [string, SExpr][];
}

/** `id` is the id of the step that closes the anchor. */
export interface AletheAnchor {
    kind: 'anchor';
    id: string;
    args: SExpr[] | null;
    anchor: string | null;
}

export interface AletheDefine {
    kind: 'define-fun' | 'define-const';
    name: string;
    params: SExpr[];
    sort: SExpr;
    body: SExpr;
}

export interface AletheOther {
    kind: 'other';
    sexpr: SExpr;
}

export type AletheCommand = AletheAssume | AletheStep | AletheAnchor | AletheDefine | AletheOther;

export interface AletheProof {
    status: string | null;
    commands: AletheCommand[];
}
