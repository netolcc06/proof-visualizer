import { describe, it, expect } from 'vitest';
import Let, { findLets } from './let';

const letMap = {
    '@p_1': '(f a)',
    '@p_12': '(g @p_1 b)',
    '@p_2': '(= @p_12 @p_1)',
};

// Same construction as the let drawer: all lets created from the map, in map order
const buildLets = (map: { [name: string]: string }): { [name: string]: Let } => {
    const lets: { [name: string]: Let } = {};
    Object.keys(map).forEach((key) => {
        lets[key] = new Let(key, map[key], lets, findLets(map[key], map));
    });
    return lets;
};

describe('findLets', () => {
    it('matches whole symbols only', () => {
        expect(findLets('(or @p_1 @p_12 @p_123 @p_1)', letMap)).toEqual({ 4: '@p_1', 9: '@p_12', 22: '@p_1' });
    });

    it('finds a name at index 0', () => {
        expect(findLets('@p_1', letMap)).toEqual({ 0: '@p_1' });
    });

    it('works with arbitrary names', () => {
        expect(findLets('(+ x |my name| y)', { x: '1', '|my name|': '2' })).toEqual({ 3: 'x', 5: '|my name|' });
    });
});

describe('Let expansion', () => {
    it('expands totally, even when a let is defined before the lets it uses', () => {
        const lets = buildLets(letMap);
        expect(lets['@p_2'].expandValue()).toBe('(= (g (f a) b) (f a))');
        expect(lets['@p_12'].expandValue()).toBe('(g (f a) b)');
    });

    it('expands totally with repeated and interleaved names', () => {
        const map = { '@p_1': 'a', '@p_10': 'bbb', top: '(h @p_1 @p_10 @p_1 @p_10)' };
        expect(buildLets(map).top.expandValue()).toBe('(h a bbb a bbb)');
    });

    it('expands partially one occurrence and keeps @p_12 distinct from @p_1', () => {
        const lets = buildLets(letMap);
        const parent = lets['@p_2'];
        const idx = parent.value.indexOf('@p_12');
        const text = parent.expandPartialy(lets['@p_12'], idx);
        expect(text).toContain('(= (g @p_1 b) @p_1)');
        expect(parent.lines[0].value).toBe('(= (g @p_1 b) @p_1)');

        // Now the inner @p_1 can be expanded in the new text
        const next = findLets(parent.lines[0].value, letMap);
        expect(Object.values(next)).toEqual(['@p_1', '@p_1']);
    });

    it('reverts to the original value', () => {
        const lets = buildLets(letMap);
        lets['@p_2'].expandValue(true);
        expect(lets['@p_2'].shrinkValue()).toBe('(= @p_12 @p_1)');
    });
});
