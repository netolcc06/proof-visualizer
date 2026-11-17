// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collectLetMap, displayTerm, letNamesIn, parseAlethe, parseSExprs } from './index';
import { fixture } from './testUtils';

describe('letmap', () => {
    it('abbreviates named terms', () => {
        const [e] = parseSExprs('(and (! (f x) :named @p_1) (! (g (! y :named @p_2)) :named @p_3))');
        expect(displayTerm(e)).toBe('(and @p_1 @p_3)');
    });

    it('collects nested names with abbreviated inner names', () => {
        const map = collectLetMap(parseAlethe(fixture('euf.alethe')));
        expect(map['@p_3']).toBe('(or @p_2 @p_1)');
        expect(map['@p_2']).toBe('(= a b)');
        expect(map['@p_8']).toBe('(= (g @p_7 b) (g @p_5 b))');
        expect(Object.keys(map).length).toBeGreaterThan(30);
    });

    it('handles define-fun and define-const', () => {
        const p = parseAlethe(`(define-fun f ((x Int) (y Int)) Int (+ (! x :named @n) y))
(define-const c Int (! 3 :named @three))
(assume a0 (= (f 1 2) c))`);
        const map = collectLetMap(p);
        expect(map['f']).toBe('(lambda ((x Int) (y Int)) (+ @n y))');
        expect(map['c']).toBe('@three');
        expect(map['@three']).toBe('3');
    });

    it('finds whole-symbol occurrences only', () => {
        const map = { '@p_1': 'a', '@p_12': 'b', let3: 'c', '|weird name|': 'd', '@quantifiers_skolemize_1': 'e' };
        const text = '(or @p_12 @p_1 (f let3 let30 |weird name| "@p_1 str" @quantifiers_skolemize_1))';
        const found = letNamesIn(text, map);
        expect(found.map((f) => f.name)).toEqual(['@p_12', '@p_1', 'let3', '|weird name|', '@quantifiers_skolemize_1']);
        for (const f of found) expect(text.startsWith(f.name, f.index)).toBe(true);
    });
});
