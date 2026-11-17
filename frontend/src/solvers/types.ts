export type SolverId = 'cvc5' | 'verit';
export type Backend = 'wasm' | 'bridge';

export type SolverStatus = 'unsat' | 'sat' | 'unknown' | 'timeout' | 'error';

export interface SolverRunResult {
    status: SolverStatus;
    /** Alethe text, without the leading status line. */
    proof: string | null;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
    /** Set by the bridge when the tool hit its time limit. */
    timedOut?: boolean;
}

export interface ToolInfo {
    path: string;
    version: string;
}

export interface CarcaraToolInfo extends ToolInfo {
    rareFile?: string | null;
}

export interface BridgeHealth {
    version: string;
    tools: { cvc5: ToolInfo | null; verit: ToolInfo | null; carcara: CarcaraToolInfo | null };
}

export interface SolveRequest {
    solver: SolverId;
    problem: string;
    args?: string[];
    timeoutMs?: number;
}

interface CarcaraBase {
    proof: string;
    problem: string;
    /** Content of a RARE rules file; the bridge falls back to its bundled one. */
    rareFile?: string;
    args?: string[];
    timeoutMs?: number;
}

export type CarcaraCheckRequest = CarcaraBase;
export interface CarcaraCheckResponse {
    valid: boolean;
    holey: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
    timedOut?: boolean;
}

export type CarcaraElaborateRequest = CarcaraBase;
export interface CarcaraElaborateResponse {
    proof: string | null;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
    timedOut?: boolean;
}

export interface CarcaraSliceRequest extends CarcaraBase {
    from: string;
    maxDistance?: number;
    elaborate?: boolean;
}
export interface CarcaraSliceResponse {
    slicedProof: string | null;
    slicedProblem: string | null;
    elaboratedProof: string | null;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
    timedOut?: boolean;
}

export interface RunOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}
