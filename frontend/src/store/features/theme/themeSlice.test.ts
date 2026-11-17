import { describe, it, expect } from 'vitest';
import counterReducer, { toggle } from './themeSlice';
import type { ThemeState } from '../../../interfaces/interfaces';

describe('theme reducer', () => {
    const initialState: ThemeState = {
        value: true,
    };
    it('should handle initial state', () => {
        expect(counterReducer(undefined, { type: 'unknown' })).toEqual({
            value: true,
        });
    });

    it('should handle set', () => {
        const actual = counterReducer(initialState, toggle());
        expect(actual).toEqual({
            value: false,
        });
    });
});
