import { describe, it, expect } from 'vitest';
import counterReducer, { INITIAL_PROOF, set } from './fileSlice';
import type { FileState } from '../../../interfaces/interfaces';

describe('file reducer', () => {
    const initialState: FileState = {
        name: 'ex.alethe',
        value: INITIAL_PROOF,
        filesCount: 0,
    };
    it('should handle initial state', () => {
        const state = counterReducer(undefined, { type: 'unknown' });
        expect(state.name).toEqual('ex.alethe');
        expect(state.filesCount).toEqual(0);
    });

    it('should handle set', () => {
        const actual = counterReducer(
            initialState,
            set({
                name: 'ex.alethe',
                value: INITIAL_PROOF,
            }),
        );
        expect(actual).toEqual({
            name: 'ex.alethe',
            value: INITIAL_PROOF,
            filesCount: 0,
        });
    });
});
