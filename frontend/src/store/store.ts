import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit';
import externalCmdReducer from './features/externalCmd/externalCmd';
import fileReducer from './features/file/fileSlice';
import proofReducer from './features/proof/proofSlice';
import solverReducer from './features/solver/solverSlice';
import themeReducer from './features/theme/themeSlice';

export const createAppStore = () =>
    configureStore({
        reducer: {
            file: fileReducer,
            proof: proofReducer,
            theme: themeReducer,
            externalCmd: externalCmdReducer,
            solver: solverReducer,
        },
    });

export const store = createAppStore();

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action<string>>;
