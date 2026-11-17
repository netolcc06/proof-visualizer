import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { RARE_KEY, readPref } from './prefs';

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

const initialState = (): SolverState => ({
    history: [],
    rare: initialRare(),
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
    setLastRun,
    setCheckReport,
    setRareDialogOpen,
    setSliceDialog,
    showToast,
    requestSolverPanel,
} = solverSlice.actions;

export const selectHistory = (state: RootState): HistoryEntry[] => state.solver.history;
export const selectRare = (state: RootState): RareState => state.solver.rare;
export const selectLastRun = (state: RootState): RunReport | null => state.solver.lastRun;
export const selectCheckReport = (state: RootState): CheckReport | null => state.solver.checkReport;
export const selectRareDialogOpen = (state: RootState): boolean => state.solver.rareDialogOpen;
export const selectSliceDialog = (state: RootState): SliceDialogState | null => state.solver.sliceDialog;
export const selectToast = (state: RootState): ToastMessage | null => state.solver.toast;
export const selectPanelRequest = (state: RootState): number => state.solver.panelRequest;

export default solverSlice.reducer;
