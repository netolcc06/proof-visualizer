import { runSolverViaBridge } from './bridge';
import { runCvc5Wasm } from './cvc5Wasm';
import { runVeritWasm } from './veritWasm';
import type { Backend, SolverId, SolverRunResult } from './types';

export * from './types';
export * from './output';
export * from './bridge';
export { runCvc5Wasm, isCvc5WasmAvailable, CVC5_DEFAULT_ARGS } from './cvc5Wasm';
export { runVeritWasm, isVeritWasmAvailable, VERIT_DEFAULT_ARGS } from './veritWasm';

export interface RunSolverRequest {
    solver: SolverId;
    backend: Backend;
    problem: string;
    args?: string[];
    signal?: AbortSignal;
    timeoutMs?: number;
}

export function runSolver({
    solver,
    backend,
    problem,
    args,
    signal,
    timeoutMs,
}: RunSolverRequest): Promise<SolverRunResult> {
    if (backend === 'bridge') return runSolverViaBridge({ solver, problem, args, timeoutMs }, signal);
    return solver === 'cvc5'
        ? runCvc5Wasm(problem, args, { signal, timeoutMs })
        : runVeritWasm(problem, args, { signal, timeoutMs });
}
