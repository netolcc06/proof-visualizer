import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../../store';
import { loadProof } from '../proof/loadProof';
import { applyView, changeStyle } from '../proof/proofSlice';
import { CLUSTER_STYLE } from '../../../interfaces/clusterStyle';
import { setSpinner } from '../externalCmd/externalCmd';
import { fixture } from '../../../alethe/testUtils';
import * as solvers from '../../../solvers';
import {
    MISSING_SMT,
    cancelBusy,
    checkProofAction,
    checkSliceAction,
    elaborateProofAction,
    elaborateSliceAction,
    revertProof,
    runSolverAction,
    saveRare,
} from './actions';

vi.mock('../../../solvers', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../solvers')>()),
    runSolver: vi.fn(),
    carcaraCheck: vi.fn(),
    carcaraElaborate: vi.fn(),
    carcaraSlice: vi.fn(),
}));

const smtFiles = import.meta.glob('../../../alethe/__fixtures__/*.smt2', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;
const LIA_SMT = smtFiles['../../../alethe/__fixtures__/lia.smt2'];
const LIA = fixture('lia.alethe');
const LIA_SLICE = fixture('lia.slice-t28.elab.alethe');

const runSolver = vi.mocked(solvers.runSolver);
const carcaraCheck = vi.mocked(solvers.carcaraCheck);
const carcaraElaborate = vi.mocked(solvers.carcaraElaborate);
const carcaraSlice = vi.mocked(solvers.carcaraSlice);

const base = { stdout: '', stderr: '', exitCode: 0, durationMs: 1200 };

const loadedStore = (smt: string | undefined = LIA_SMT) => {
    const store = createAppStore();
    store.dispatch(loadProof({ name: 'lia.alethe', text: LIA, smt }));
    return store;
};

beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
});

describe('runSolverAction', () => {
    it('loads the proof of an unsat run', async () => {
        runSolver.mockResolvedValue({ ...base, status: 'unsat', proof: LIA });
        const store = createAppStore();
        const result = await store.dispatch(
            runSolverAction({
                solver: 'verit',
                backend: 'bridge',
                problem: LIA_SMT,
                extraArgs: ['--x'],
                timeoutMs: 5000,
            }),
        );
        expect(result.ok).toBe(true);
        expect(runSolver).toHaveBeenCalledWith(
            expect.objectContaining({
                solver: 'verit',
                backend: 'bridge',
                problem: LIA_SMT,
                args: ['--x'],
                timeoutMs: 5000,
            }),
        );
        const state = store.getState();
        expect(state.file.name).toBe('veriT-proof.alethe');
        expect(state.proof.source).toBe(LIA);
        expect(state.proof.smt).toBe(LIA_SMT);
        expect(state.proof.proof.length).toBeGreaterThan(0);
        expect(state.solver.lastRun?.status).toBe('unsat');
        expect(state.solver.history).toEqual([]);
        expect(state.externalCmd.spinner).toBe('render');
    });

    it('does not leave the render spinner on in directory style', async () => {
        runSolver.mockResolvedValue({ ...base, status: 'unsat', proof: fixture('euf.alethe') });
        const store = loadedStore();
        store.dispatch(changeStyle('directory'));
        const result = await store.dispatch(runSolverAction({ solver: 'cvc5', backend: 'wasm', problem: 'x' }));
        expect(result.ok).toBe(true);
        const state = store.getState();
        expect(state.file.name).toBe('cvc5-proof.alethe');
        expect(state.proof.source).toBe(fixture('euf.alethe'));
        expect(state.externalCmd.spinner).toBe('off');
    });

    it.each(['sat', 'unknown', 'timeout', 'error'] as const)('reports %s without loading a proof', async (status) => {
        runSolver.mockResolvedValue({ ...base, status, proof: null, stderr: 'boom' });
        const store = createAppStore();
        const result = await store.dispatch(runSolverAction({ solver: 'cvc5', backend: 'wasm', problem: LIA_SMT }));
        expect(result.ok).toBe(false);
        const state = store.getState();
        expect(state.proof.source).toBe('');
        expect(state.solver.lastRun?.status).toBe(status);
        expect(state.solver.toast?.message).toContain('boom');
        expect(state.externalCmd.spinner).toBe('off');
    });

    it('keeps the previous proof in the history', async () => {
        runSolver.mockResolvedValue({ ...base, status: 'unsat', proof: fixture('euf.alethe') });
        const store = loadedStore();
        await store.dispatch(runSolverAction({ solver: 'cvc5', backend: 'wasm', problem: 'x' }));
        expect(store.getState().solver.history).toEqual([{ name: 'lia.alethe', source: LIA, smt: LIA_SMT }]);
    });

    it('rejects an empty problem', async () => {
        const store = createAppStore();
        const result = await store.dispatch(runSolverAction({ solver: 'cvc5', backend: 'wasm', problem: '  ' }));
        expect(result.ok).toBe(false);
        expect(runSolver).not.toHaveBeenCalled();
    });

    it('can be cancelled', async () => {
        runSolver.mockImplementation(
            ({ signal }) =>
                new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')))),
        );
        const store = createAppStore();
        const promise = store.dispatch(runSolverAction({ solver: 'cvc5', backend: 'wasm', problem: LIA_SMT }));
        expect(store.getState().externalCmd.spinner).toBe('busy');
        expect(store.getState().externalCmd.busyLabel).toContain('cvc5');
        cancelBusy();
        expect(await promise).toEqual({ ok: false, error: 'cancelled' });
        expect(store.getState().externalCmd.spinner).toBe('off');
        expect(store.getState().solver.toast?.intent).toBe('warning');
    });
});

describe('carcara actions', () => {
    it('stores the check result for the dialog', async () => {
        carcaraCheck.mockResolvedValue({ ...base, valid: true, holey: false, stderr: 'checking...' });
        const store = loadedStore();
        await store.dispatch(checkProofAction());
        expect(carcaraCheck).toHaveBeenCalledWith(
            expect.objectContaining({ problem: LIA_SMT, rareFile: undefined }),
            expect.any(AbortSignal),
        );
        expect(store.getState().solver.checkReport).toMatchObject({
            title: 'Proof check',
            verdict: 'valid',
            durationMs: 1200,
            stderr: 'checking...',
        });
    });

    it.each([
        [true, true, 'holey'],
        [false, false, 'invalid'],
    ] as const)('maps valid=%s holey=%s to %s', async (valid, holey, verdict) => {
        carcaraCheck.mockResolvedValue({ ...base, valid, holey });
        const store = loadedStore();
        await store.dispatch(checkProofAction());
        expect(store.getState().solver.checkReport?.verdict).toBe(verdict);
    });

    it('passes the custom RARE file only when enabled', async () => {
        carcaraCheck.mockResolvedValue({ ...base, valid: true, holey: false });
        const store = loadedStore();
        store.dispatch(saveRare({ text: '(define-rule x ())', useBridgeDefault: true }));
        await store.dispatch(checkProofAction());
        expect(carcaraCheck.mock.calls[0][0].rareFile).toBeUndefined();
        store.dispatch(saveRare({ text: '(define-rule x ())', useBridgeDefault: false }));
        await store.dispatch(checkProofAction());
        expect(carcaraCheck.mock.calls[1][0].rareFile).toBe('(define-rule x ())');
        expect(JSON.parse(localStorage.getItem('pv.rare') ?? '{}').useBridgeDefault).toBe(false);
    });

    it('asks for the SMT problem when it is missing', async () => {
        const store = loadedStore('');
        for (const action of [
            checkProofAction(),
            elaborateProofAction(),
            elaborateSliceAction({ from: 't28', maxDistance: 0 }),
        ]) {
            const before = store.getState().solver.panelRequest;
            expect(await store.dispatch(action)).toEqual({ ok: false, error: 'missing input' });
            expect(store.getState().solver.toast?.message).toBe(MISSING_SMT);
            expect(store.getState().solver.panelRequest).toBe(before + 1);
        }
        expect(carcaraCheck).not.toHaveBeenCalled();
        expect(carcaraElaborate).not.toHaveBeenCalled();
        expect(carcaraSlice).not.toHaveBeenCalled();
    });

    it('elaborates the whole proof keeping the SMT problem', async () => {
        carcaraElaborate.mockResolvedValue({ ...base, proof: fixture('lia.verit.alethe') });
        const store = loadedStore();
        const result = await store.dispatch(elaborateProofAction());
        expect(result.ok).toBe(true);
        const state = store.getState();
        expect(state.file.name).toBe('lia.elab.alethe');
        expect(state.proof.smt).toBe(LIA_SMT);
        expect(state.solver.history).toHaveLength(1);
    });

    it('reports Carcara failures with stderr', async () => {
        carcaraElaborate.mockResolvedValue({ ...base, proof: null, exitCode: 1, stderr: 'parse error at 3:4' });
        const store = loadedStore();
        const result = await store.dispatch(elaborateProofAction());
        expect(result.ok).toBe(false);
        expect(store.getState().solver.toast?.message).toContain('parse error at 3:4');
        expect(store.getState().proof.source).toBe(LIA);
    });
});

describe('slice actions', () => {
    const slice = { ...base, slicedProof: 'sp', slicedProblem: 'sprob', elaboratedProof: LIA_SLICE };

    it('splices the elaborated slice and highlights it', async () => {
        carcaraSlice.mockResolvedValue(slice);
        const store = loadedStore();
        const result = await store.dispatch(elaborateSliceAction({ from: 't28', maxDistance: 1000000 }));
        expect(result.ok).toBe(true);
        expect(carcaraSlice).toHaveBeenCalledWith(
            expect.objectContaining({ from: 't28', maxDistance: 1000000, elaborate: true, problem: LIA_SMT }),
            expect.any(AbortSignal),
        );
        const state = store.getState();
        expect(state.proof.source).toContain('el1_');
        expect(state.proof.proof.some((n) => n.stepId.startsWith('el1_'))).toBe(true);
        expect(state.proof.smt).toBe(LIA_SMT);
        expect(state.solver.history).toEqual([{ name: 'lia.alethe', source: LIA, smt: LIA_SMT }]);
        expect(state.solver.toast?.message).toMatch(/^Elaborated slice from t28: \d+ new steps\.$/);

        // Unfolded, colored by component, and the new steps marked with a border
        expect(state.proof.view).toBe('colored-full');
        expect(state.proof.hiddenNodes).toEqual([]);
        state.proof.proof.forEach((n) => {
            const info = state.proof.visualInfo[n.id];
            if (n.id !== 0) expect(info.color).toBe(CLUSTER_STYLE[n.clusterType].color);
            expect(info.highlighted).toBe(n.stepId === 't28' || n.stepId.startsWith('el1_') ? true : undefined);
        });
        const marked = state.proof.proof.filter((n) => state.proof.visualInfo[n.id].highlighted);
        expect(marked.map((n) => n.stepId)).toContain('t28');
        expect(marked.some((n) => n.stepId.startsWith('el1_'))).toBe(true);

        // The border survives the other views
        const markedIds = marked.map((n) => n.id);
        (['full', 'clustered'] as const).forEach((view) => {
            store.dispatch(applyView(view));
            const { visualInfo } = store.getState().proof;
            markedIds.forEach((id) => expect(visualInfo[id].highlighted).toBe(true));
        });
    });

    it('reverts to the previous proof', async () => {
        carcaraSlice.mockResolvedValue(slice);
        const store = loadedStore();
        await store.dispatch(elaborateSliceAction({ from: 't28', maxDistance: 0 }));
        expect(store.dispatch(revertProof()).ok).toBe(true);
        const state = store.getState();
        expect(state.proof.source).toBe(LIA);
        expect(state.proof.smt).toBe(LIA_SMT);
        expect(state.file.name).toBe('lia.alethe');
        expect(state.solver.history).toEqual([]);
        expect(store.dispatch(revertProof()).ok).toBe(false);
    });

    it('reverts without the render spinner in directory style', async () => {
        carcaraSlice.mockResolvedValue(slice);
        const store = loadedStore();
        await store.dispatch(elaborateSliceAction({ from: 't28', maxDistance: 0 }));
        store.dispatch(changeStyle('directory'));
        store.dispatch(setSpinner('off'));
        expect(store.dispatch(revertProof()).ok).toBe(true);
        expect(store.getState().proof.source).toBe(LIA);
        expect(store.getState().externalCmd.spinner).toBe('off');
    });

    it('opens the slice only, with the sliced problem', async () => {
        carcaraSlice.mockResolvedValue(slice);
        const store = loadedStore();
        await store.dispatch(elaborateSliceAction({ from: 't28', maxDistance: 0, mode: 'open' }));
        const state = store.getState();
        expect(state.proof.source).toBe(LIA_SLICE);
        expect(state.proof.smt).toBe('sprob');
        expect(state.file.name).toBe('slice-t28.elab.alethe');
        expect(state.solver.history).toHaveLength(1);
    });

    it('explains splice errors and keeps the current proof', async () => {
        carcaraSlice.mockResolvedValue({ ...slice, elaboratedProof: LIA_SLICE });
        const store = loadedStore();
        const result = await store.dispatch(elaborateSliceAction({ from: 'nope', maxDistance: 0 }));
        expect(result.ok).toBe(false);
        expect(store.getState().solver.toast?.message).toContain('Cannot splice the elaborated slice from nope');
        expect(store.getState().proof.source).toBe(LIA);
        expect(store.getState().solver.history).toEqual([]);
    });

    it('reports a failed slice with stderr', async () => {
        carcaraSlice.mockResolvedValue({
            ...slice,
            elaboratedProof: null,
            exitCode: 2,
            stderr: '[34mno such step[39m',
        });
        const store = loadedStore();
        const result = await store.dispatch(elaborateSliceAction({ from: 't28', maxDistance: 0 }));
        expect(result.ok).toBe(false);
        expect(store.getState().solver.toast?.message).toContain('no such step');
        expect(store.getState().solver.toast?.message).not.toContain(String.fromCharCode(27));
    });

    it('checks a slice and stores the report', async () => {
        carcaraSlice.mockResolvedValue(slice);
        carcaraCheck.mockResolvedValue({ ...base, valid: true, holey: false, durationMs: 300 });
        const store = loadedStore();
        await store.dispatch(checkSliceAction({ from: 't28', maxDistance: 2 }));
        expect(carcaraSlice.mock.calls[0][0]).toMatchObject({ from: 't28', maxDistance: 2 });
        expect(carcaraSlice.mock.calls[0][0].elaborate).toBeUndefined();
        expect(carcaraCheck).toHaveBeenCalledWith(
            expect.objectContaining({ proof: 'sp', problem: 'sprob' }),
            expect.any(AbortSignal),
        );
        expect(store.getState().solver.checkReport).toMatchObject({
            title: 'Slice check from t28',
            verdict: 'valid',
            durationMs: 1500,
        });
    });
});
