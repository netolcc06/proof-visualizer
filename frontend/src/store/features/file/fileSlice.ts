import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../store';
import { FileState } from '../../../interfaces/interfaces';

// Small valid Alethe proof, used as the placeholder file
export const INITIAL_PROOF = '(assume a0 a)\n(assume a1 (not a))\n(step t0 (cl) :rule resolution :premises (a0 a1))\n';

const initialState: FileState = {
    name: 'ex.alethe',
    value: INITIAL_PROOF,
    filesCount: 0,
};

export const fileSlice = createSlice({
    name: 'file',
    initialState,
    // The `reducers` field lets us define reducers and generate associated actions
    reducers: {
        set: (state, action: PayloadAction<{ name: string; value: string }>) => {
            state.name = action.payload.name;
            if (state.value !== action.payload.value) {
                state.value = action.payload.value;
                state.filesCount++;
            }
        },
    },
});

export const { set } = fileSlice.actions;

// The function below is called a selector and allows us to select a value from
// the state. Selectors can also be defined inline where they're used instead of
// in the slice file. For example: `useSelector((state: RootState) => state.counter.value)`
export const selectFileName = (state: RootState): string => state.file.name;

export const selectFileExtension = (state: RootState): string => {
    const ext = state.file.name.split('.').pop();
    return ext ? ext : '';
};

export const selectFile = (state: RootState): string => state.file.value;

export const selectFileCount = (state: RootState): number => state.file.filesCount;

export default fileSlice.reducer;
