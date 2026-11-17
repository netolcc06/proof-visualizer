import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../store';
import { ExternalCmdState } from '../../../interfaces/interfaces';

const initialState: ExternalCmdState = {
    findData: {
        nodeToFind: -1,
        findOption: false,
    },
    renderData: {
        count: 0,
        fileChanged: false,
    },
    spinner: 'off',
    busyLabel: '',
    selectData: { type: false, square: { upperL: { x: -1, y: -1 }, lowerR: { x: -1, y: -1 } } },
    regionCapture: false,
};

export const externalCmd = createSlice({
    name: 'externalCmd',
    initialState,
    reducers: {
        findNode: (state, action: PayloadAction<{ nodeId: number; option: boolean }>) => {
            state.findData = { nodeToFind: action.payload.nodeId, findOption: action.payload.option };
        },
        reRender: (state) => {
            state.renderData.count = 0;
        },
        addRenderCount: (state) => {
            state.renderData.count++;
        },
        blockRender: (state) => {
            state.renderData.count = 2;
        },
        allowRenderNewFile: (state) => {
            state.renderData.fileChanged = true;
        },
        blockRenderNewFile: (state) => {
            state.renderData.fileChanged = false;
        },
        setSpinner: (state, action: PayloadAction<ExternalCmdState['spinner']>) => {
            state.spinner = action.payload;
        },
        // Long-running external work (solver, Carcara); the overlay shows the label
        setBusy: (state, action: PayloadAction<string>) => {
            state.spinner = 'busy';
            state.busyLabel = action.payload;
        },
        setSelectArea: (state, action: PayloadAction<ExternalCmdState['selectData']>) => {
            state.selectData = action.payload;
        },
        setRegionCapture: (state, action: PayloadAction<boolean>) => {
            state.regionCapture = action.payload;
        },
    },
});

export const {
    findNode,
    reRender,
    addRenderCount,
    blockRender,
    allowRenderNewFile,
    blockRenderNewFile,
    setSpinner,
    setBusy,
    setSelectArea,
    setRegionCapture,
} = externalCmd.actions;

export const selectFindData = (state: RootState): { nodeToFind: number; findOption: boolean } =>
    state.externalCmd.findData;

export const selectRenderData = (state: RootState): { count: number; fileChanged: boolean } =>
    state.externalCmd.renderData;

export const selectSpinner = (state: RootState): ExternalCmdState['spinner'] => state.externalCmd.spinner;

export const selectBusyLabel = (state: RootState): string => state.externalCmd.busyLabel;

export const selectSelectData = (state: RootState): ExternalCmdState['selectData'] => state.externalCmd.selectData;

export const selectRegionCapture = (state: RootState): boolean => state.externalCmd.regionCapture;

export default externalCmd.reducer;
