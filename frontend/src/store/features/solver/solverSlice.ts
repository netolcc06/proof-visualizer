import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import type { Backend } from '../../../solvers/types';
import { CARCARA_BACKEND_KEY, RARE_KEY, readPref } from './prefs';

export const HISTORY_MAX = 10;

export interface HistoryEntry {
    name: string;
    source: string;
    smt: string;
}

export interface RareState {
    text: string;
    useBridgeDefault: boolean;
}

export interface RunReport {
    label: string;
    status: string;
    durationMs: number;
    stdout: string;
    stderr: string;
}

export interface CheckReport {
    title: string;
    verdict: 'valid' | 'holey' | 'invalid' | 'error';
    durationMs: number;
    stdout: string;
    stderr: string;
    /** Which backend ran Carcara. */
    backend?: Backend;
    /** Limits that apply to this result (e.g. steps that were not checked in the browser). */
    note?: string;
}

export interface SliceDialogState {
    from: string;
    action: 'elaborate' | 'check';
}

export interface ToastMessage {
    id: number;
    intent: 'success' | 'danger' | 'warning' | 'primary';
    message: string;
}

export interface SolverState {
    history: HistoryEntry[];
    rare: RareState;
    /** Chosen Carcara backend; null = automatic (wasm when available, else the bridge). */
    carcaraBackend: Backend | null;
    lastRun: RunReport | null;
    checkReport: CheckReport | null;
    rareDialogOpen: boolean;
    sliceDialog: SliceDialogState | null;
    toast: ToastMessage | null;
    // Incremented to ask the app to open the solver panel
    panelRequest: number;
}

export const initialRare = (): RareState => {
    const saved = readPref<Partial<RareState>>(RARE_KEY, {});
    return { text: saved.text ?? '', useBridgeDefault: saved.useBridgeDefault ?? true };
};

export const initialCarcaraBackend = (): Backend | null => {
    const saved = readPref<unknown>(CARCARA_BACKEND_KEY, null);
    return saved === 'wasm' || saved === 'bridge' ? saved : null;
};

const initialState = (): SolverState => ({
    history: [],
    rare: initialRare(),
    carcaraBackend: initialCarcaraBackend(),
    lastRun: null,
    checkReport: null,
    rareDialogOpen: false,
    sliceDialog: null,
    toast: null,
    panelRequest: 0,
});

let toastCount = 0;

export const solverSlice = createSlice({
    name: 'solver',
    initialState,
    reducers: {
        pushHistory: (state, action: PayloadAction<HistoryEntry>) => {
            state.history.push(action.payload);
            if (state.history.length > HISTORY_MAX) state.history.shift();
        },
        popHistory: (state) => {
            state.history.pop();
        },
        setRare: (state, action: PayloadAction<RareState>) => {
            state.rare = action.payload;
        },
        setCarcaraBackend: (state, action: PayloadAction<Backend | null>) => {
            state.carcaraBackend = action.payload;
        },
        setLastRun: (state, action: PayloadAction<RunReport | null>) => {
            state.lastRun = action.payload;
        },
        setCheckReport: (state, action: PayloadAction<CheckReport | null>) => {
            state.checkReport = action.payload;
        },
        setRareDialogOpen: (state, action: PayloadAction<boolean>) => {
            state.rareDialogOpen = action.payload;
        },
        setSliceDialog: (state, action: PayloadAction<SliceDialogState | null>) => {
            state.sliceDialog = action.payload;
        },
        showToast: (state, action: PayloadAction<Omit<ToastMessage, 'id'>>) => {
            state.toast = { id: ++toastCount, ...action.payload };
        },
        requestSolverPanel: (state) => {
            state.panelRequest++;
        },
    },
});

export const {
    pushHistory,
    popHistory,
    setRare,
    setCarcaraBackend,
    setLastRun,
    setCheckReport,
    setRareDialogOpen,
    setSliceDialog,
    showToast,
    requestSolverPanel,
} = solverSlice.actions;

export const selectHistory = (state: RootState): HistoryEntry[] => state.solver.history;
export const selectRare = (state: RootState): RareState => state.solver.rare;
export const selectCarcaraBackend = (state: RootState): Backend | null => state.solver.carcaraBackend;
export const selectLastRun = (state: RootState): RunReport | null => state.solver.lastRun;
export const selectCheckReport = (state: RootState): CheckReport | null => state.solver.checkReport;
export const selectRareDialogOpen = (state: RootState): boolean => state.solver.rareDialogOpen;
export const selectSliceDialog = (state: RootState): SliceDialogState | null => state.solver.sliceDialog;
export const selectToast = (state: RootState): ToastMessage | null => state.solver.toast;
export const selectPanelRequest = (state: RootState): number => state.solver.panelRequest;

export default solverSlice.reducer;
