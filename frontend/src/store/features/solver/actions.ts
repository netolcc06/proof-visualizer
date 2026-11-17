import type { Action } from '@reduxjs/toolkit';
import type { ThunkDispatch } from '@reduxjs/toolkit';
import type { AppThunk, RootState } from '../../store';
import { AletheSpliceError, parseAlethe, printAlethe, pruneUnreachable, spliceElaboratedSlice } from '../../../alethe';
import { carcaraCheck, carcaraElaborate, carcaraSlice, runSolver } from '../../../solvers';
import type { Backend, SolverId } from '../../../solvers';
import { setBusy, setSpinner } from '../externalCmd/externalCmd';
import { applyView, highlightSteps, selectProof, selectStyle } from '../proof/proofSlice';
import { loadProof } from '../proof/loadProof';
import type { LoadProofArgs, LoadResult } from '../proof/loadProof';
import { RARE_KEY, writePref } from './prefs';
import {
    popHistory,
    pushHistory,
    requestSolverPanel,
    setCheckReport,
    setLastRun,
    setRare,
    showToast,
} from './solverSlice';
import type { CheckReport, RareState } from './solverSlice';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

type Dispatch = ThunkDispatch<RootState, unknown, Action<string>>;

export const MISSING_SMT =
    'The SMT problem is required for this action. Paste it in the solver panel (SMT input) and try again.';
// "Whole sub-proof": Carcara takes -d as an unsigned integer
export const MAX_DISTANCE = 1000000;

let controller: AbortController | null = null;

// Aborts the running solver/Carcara request, if any
export function cancelBusy(): void {
    controller?.abort();
}

type Busy<T> = { ok: true; value: T } | { ok: false; error: string; aborted: boolean };

async function withBusy<T>(
    dispatch: Dispatch,
    label: string,
    fn: (signal: AbortSignal) => Promise<T>,
): Promise<Busy<T>> {
    const ctrl = new AbortController();
    controller = ctrl;
    dispatch(setBusy(label));
    try {
        return { ok: true, value: await fn(ctrl.signal) };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), aborted: ctrl.signal.aborted };
    } finally {
        if (controller === ctrl) controller = null;
        dispatch(setSpinner('off'));
    }
}

// Carcara colors its errors with ANSI escapes
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

const tail = (text: string, max = 800): string => {
    const t = text.replace(ANSI, '').trim();
    return t.length > max ? '...' + t.slice(-max) : t;
};

const toast = (intent: 'success' | 'danger' | 'warning' | 'primary', message: string) => showToast({ intent, message });

function fail(dispatch: Dispatch, error: string): ActionResult {
    dispatch(toast('danger', error));
    return { ok: false, error };
}

function failBusy(dispatch: Dispatch, what: string, r: { error: string; aborted: boolean }): ActionResult {
    if (r.aborted) {
        dispatch(toast('warning', `${what} cancelled.`));
        return { ok: false, error: 'cancelled' };
    }
    return fail(dispatch, `${what} failed: ${r.error}`);
}

// Only the graph canvas clears the render spinner
const startRender = (): AppThunk => (dispatch, getState) => {
    const state = getState();
    if (selectStyle(state) === 'graph' && selectProof(state).length > 1) dispatch(setSpinner('render'));
};

// Loads a proof and remembers the previous one so it can be reverted
export const replaceProof =
    (args: LoadProofArgs): AppThunk<LoadResult> =>
    (dispatch, getState) => {
        const { file, proof } = getState();
        const previous = { name: file.name, source: proof.source, smt: proof.smt };
        const result = dispatch(loadProof(args));
        if (result.ok && previous.source) dispatch(pushHistory(previous));
        if (result.ok) dispatch(startRender());
        return result;
    };

export const revertProof = (): AppThunk<ActionResult> => (dispatch, getState) => {
    const entry = getState().solver.history.at(-1);
    if (!entry) return fail(dispatch, 'There is no previous proof to revert to.');
    const result = dispatch(loadProof({ name: entry.name, text: entry.source, smt: entry.smt }));
    if (!result.ok) return fail(dispatch, result.error);
    dispatch(popHistory());
    dispatch(startRender());
    dispatch(toast('primary', `Reverted to ${entry.name}.`));
    return { ok: true };
};

export const saveRare =
    (rare: RareState): AppThunk =>
    (dispatch) => {
        writePref(RARE_KEY, rare);
        dispatch(setRare(rare));
    };

const SOLVER_NAMES: Record<SolverId, string> = { cvc5: 'cvc5', verit: 'veriT' };

export interface SolverRunArgs {
    solver: SolverId;
    backend: Backend;
    problem: string;
    extraArgs?: string[];
    timeoutMs?: number;
}

export const runSolverAction =
    ({ solver, backend, problem, extraArgs, timeoutMs }: SolverRunArgs): AppThunk<Promise<ActionResult>> =>
    async (dispatch) => {
        if (!problem.trim()) return fail(dispatch, 'The SMT input is empty.');
        const name = SOLVER_NAMES[solver];
        const label = `Running ${name}${backend === 'wasm' ? ' (wasm)' : ''}…`;
        dispatch(setLastRun(null));

        const run = await withBusy(dispatch, label, (signal) =>
            runSolver({ solver, backend, problem, args: extraArgs, signal, timeoutMs }),
        );
        if (!run.ok) return failBusy(dispatch, name, run);

        const res = run.value;
        dispatch(
            setLastRun({
                label: name,
                status: res.status,
                durationMs: res.durationMs,
                stdout: res.stdout,
                stderr: res.stderr,
            }),
        );
        if (res.status === 'unsat' && res.proof) {
            const loaded = dispatch(replaceProof({ name: `${name}-proof.alethe`, text: res.proof, smt: problem }));
            if (!loaded.ok) return fail(dispatch, loaded.error);
            dispatch(toast('success', `${name} found a proof in ${(res.durationMs / 1000).toFixed(2)} s.`));
            return { ok: true };
        }

        const detail = tail(res.stderr);
        const messages: Record<string, string> = {
            unsat: `${name} answered unsat but produced no proof.`,
            sat: `${name} answered sat: the problem is satisfiable, so there is no proof.`,
            unknown: `${name} answered unknown.`,
            timeout: `${name} timed out.`,
            error: `${name} failed.`,
        };
        const message = (messages[res.status] ?? `${name}: ${res.status}`) + (detail ? `\n${detail}` : '');
        dispatch(toast(res.status === 'sat' || res.status === 'unknown' ? 'warning' : 'danger', message));
        return { ok: false, error: message };
    };

// Source, SMT problem and RARE file for Carcara, or null (with a toast) when something is missing
function carcaraContext(
    dispatch: Dispatch,
    state: RootState,
): { proof: string; problem: string; rareFile?: string } | null {
    if (!state.proof.source) {
        fail(dispatch, 'Load a proof first.');
        return null;
    }
    if (!state.proof.smt.trim()) {
        fail(dispatch, MISSING_SMT);
        dispatch(requestSolverPanel());
        return null;
    }
    let proof: string;
    try {
        proof = printAlethe(parseAlethe(state.proof.source));
    } catch (e) {
        fail(dispatch, `Cannot read the current proof: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
    const { rare } = state.solver;
    const rareFile = !rare.useBridgeDefault && rare.text.trim() ? rare.text : undefined;
    return { proof, problem: state.proof.smt, rareFile };
}

const baseName = (name: string): string => name.replace(/\.(alethe|json)$/i, '') || 'proof';

function verdictOf(res: { valid: boolean; holey: boolean; timedOut?: boolean }): CheckReport['verdict'] {
    if (res.timedOut) return 'error';
    if (!res.valid) return 'invalid';
    return res.holey ? 'holey' : 'valid';
}

export const checkProofAction = (): AppThunk<Promise<ActionResult>> => async (dispatch, getState) => {
    const ctx = carcaraContext(dispatch, getState());
    if (!ctx) return { ok: false, error: 'missing input' };
    const run = await withBusy(dispatch, 'Checking proof with Carcara…', (signal) => carcaraCheck(ctx, signal));
    if (!run.ok) return failBusy(dispatch, 'Carcara check', run);
    const res = run.value;
    dispatch(
        setCheckReport({
            title: 'Proof check',
            verdict: verdictOf(res),
            durationMs: res.durationMs,
            stdout: res.stdout,
            stderr: res.stderr,
        }),
    );
    return { ok: true };
};

export const elaborateProofAction = (): AppThunk<Promise<ActionResult>> => async (dispatch, getState) => {
    const state = getState();
    const ctx = carcaraContext(dispatch, state);
    if (!ctx) return { ok: false, error: 'missing input' };
    const run = await withBusy(dispatch, 'Elaborating proof with Carcara…', (signal) => carcaraElaborate(ctx, signal));
    if (!run.ok) return failBusy(dispatch, 'Carcara elaboration', run);
    const res = run.value;
    if (!res.proof) {
        return fail(dispatch, `Carcara could not elaborate the proof (exit ${res.exitCode}).\n${tail(res.stderr)}`);
    }
    const loaded = dispatch(
        replaceProof({ name: `${baseName(state.file.name)}.elab.alethe`, text: res.proof, smt: ctx.problem }),
    );
    if (!loaded.ok) return fail(dispatch, loaded.error);
    dispatch(toast('success', `Proof elaborated in ${(res.durationMs / 1000).toFixed(2)} s.`));
    return { ok: true };
};

export interface SliceArgs {
    from: string;
    maxDistance: number;
    mode?: 'splice' | 'open';
}

const ELAB_ID = /^el\d+_/;

export const elaborateSliceAction =
    ({ from, maxDistance, mode = 'splice' }: SliceArgs): AppThunk<Promise<ActionResult>> =>
    async (dispatch, getState) => {
        const state = getState();
        const ctx = carcaraContext(dispatch, state);
        if (!ctx) return { ok: false, error: 'missing input' };
        const run = await withBusy(dispatch, `Elaborating slice from ${from}…`, (signal) =>
            carcaraSlice({ ...ctx, from, maxDistance, elaborate: true }, signal),
        );
        if (!run.ok) return failBusy(dispatch, 'Slice elaboration', run);
        const res = run.value;
        if (!res.elaboratedProof) {
            return fail(
                dispatch,
                `Carcara could not elaborate the slice from ${from} (exit ${res.exitCode}).\n${tail(res.stderr)}`,
            );
        }

        if (mode === 'open') {
            const loaded = dispatch(
                replaceProof({
                    name: `slice-${from}.elab.alethe`,
                    text: res.elaboratedProof,
                    smt: res.slicedProblem ?? ctx.problem,
                }),
            );
            if (!loaded.ok) return fail(dispatch, loaded.error);
            dispatch(toast('success', `Opened the elaborated slice from ${from}.`));
            return { ok: true };
        }

        let text: string;
        let newIds: string[];
        try {
            const original = parseAlethe(state.proof.source);
            const spliced = pruneUnreachable(spliceElaboratedSlice(original, from, parseAlethe(res.elaboratedProof)));
            const before = new Set(original.commands.flatMap((c) => (c.kind === 'step' ? [c.id] : [])));
            newIds = spliced.commands.flatMap((c) =>
                c.kind === 'step' && ELAB_ID.test(c.id) && !before.has(c.id) ? [c.id] : [],
            );
            text = printAlethe(spliced);
        } catch (e) {
            const reason = e instanceof AletheSpliceError ? e.message : e instanceof Error ? e.message : String(e);
            return fail(dispatch, `Cannot splice the elaborated slice from ${from}: ${reason}`);
        }

        const loaded = dispatch(replaceProof({ name: state.file.name, text, smt: ctx.problem }));
        if (!loaded.ok) return fail(dispatch, loaded.error);
        // Unfolded and colored by component; the new steps are marked with a border
        dispatch(applyView('colored-full'));
        dispatch(highlightSteps({ stepIds: [from, ...newIds] }));
        const message = `Elaborated slice from ${from}: ${newIds.length} new steps.`;
        dispatch(toast('success', message));
        return { ok: true, message };
    };

export const checkSliceAction =
    ({ from, maxDistance }: SliceArgs): AppThunk<Promise<ActionResult>> =>
    async (dispatch, getState) => {
        const ctx = carcaraContext(dispatch, getState());
        if (!ctx) return { ok: false, error: 'missing input' };
        const run = await withBusy(dispatch, `Checking slice from ${from}…`, async (signal) => {
            const slice = await carcaraSlice({ ...ctx, from, maxDistance }, signal);
            if (!slice.slicedProof || slice.slicedProblem === null) return { slice };
            const check = await carcaraCheck(
                { proof: slice.slicedProof, problem: slice.slicedProblem, rareFile: ctx.rareFile },
                signal,
            );
            return { slice, check };
        });
        if (!run.ok) return failBusy(dispatch, 'Slice check', run);
        const { slice, check } = run.value;
        if (!check) {
            return fail(
                dispatch,
                `Carcara could not slice from ${from} (exit ${slice.exitCode}).\n${tail(slice.stderr)}`,
            );
        }
        dispatch(
            setCheckReport({
                title: `Slice check from ${from}`,
                verdict: verdictOf(check),
                durationMs: slice.durationMs + check.durationMs,
                stdout: check.stdout,
                stderr: check.stderr,
            }),
        );
        return { ok: true };
    };
