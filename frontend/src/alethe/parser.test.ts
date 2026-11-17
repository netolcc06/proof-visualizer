// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AletheParseError, parseAlethe, parseSExprs, printAlethe, printSExpr } from './index';
import { fixture } from './testUtils';

describe('sexpr', () => {
    it('tokenizes SMT-LIB lexical forms', () => {
        const text = `; comment
(a |b c
d| "s ""q"" ;" 1/2 -11 #b01 #xAF :kw 1.5) ; tail
unsat`;
        const out = parseSExprs(text);
        expect(out).toEqual([['a', '|b c\nd|', '"s ""q"" ;"', '1/2', '-11', '#b01', '#xAF', ':kw', '1.5'], 'unsat']);
    });

    it('prints canonically', () => {
        const [e] = parseSExprs('(a   (b\n c) () d)');
        expect(printSExpr(e)).toBe('(a (b c) () d)');
    });

    it('reports line and column', () => {
        expect(() => parseSExprs('(a\n  (b c)\n')).toThrow(AletheParseError);
        try {
            parseSExprs('(a\n  )) x');
        } catch (e) {
            expect(e).toBeInstanceOf(AletheParseError);
            expect((e as AletheParseError).line).toBe(2);
            expect((e as AletheParseError).column).toBe(4);
        }
        expect(() => parseSExprs('(a "oops')).toThrow(/Unterminated string/);
        expect(() => parseSExprs('(a |oops')).toThrow(/Unterminated quoted/);
    });

    it('handles very deep nesting', () => {
        const depth = 100000;
        const text = '('.repeat(depth) + 'x' + ')'.repeat(depth);
        const [e] = parseSExprs(text);
        expect(printSExpr(e)).toBe(text);
    });
});

describe('parseAlethe', () => {
    it('parses cvc5 output (status + wrapper)', () => {
        const p = parseAlethe(fixture('euf.alethe'));
        expect(p.status).toBe('unsat');
        expect(p.commands.filter((c) => c.kind === 'assume')).toHaveLength(4 + 2 + 2 + 2);
        const t2 = p.commands.find((c) => c.kind === 'step' && c.id === 't2');
        expect(t2).toMatchObject({ rule: 'subproof', discharge: ['t2.a0', 't2.a1'], anchor: null });
        const inner = p.commands.find((c) => c.kind === 'step' && c.id === 't2.t0');
        expect(inner).toMatchObject({ anchor: 't2', premises: ['t2.a1'] });
    });

    it('parses flat veriT-style lists', () => {
        const p = parseAlethe(fixture('verit-style.alethe'));
        expect(p.status).toBeNull();
        expect(p.commands).toHaveLength(5);
    });

    it('parses anchors with args and tracks nesting', () => {
        const p = parseAlethe(fixture('q.alethe'));
        const anchor = p.commands.find((c) => c.kind === 'anchor');
        expect(anchor).toMatchObject({ id: 't20', anchor: null });
        expect(printSExpr((anchor as unknown as { args: never }).args)).toBe('((x Int) (:= (x Int) x))');
        const closer = p.commands.find((c) => c.kind === 'step' && c.id === 't20');
        expect(closer).toMatchObject({ anchor: null, rule: 'bind' });
    });

    it('supports nested anchors, define-fun, extra attributes and other commands', () => {
        const text = `(set-logic QF_UF)
(define-fun f ((x Int)) Int (+ x 1))
(define-const c Int 3)
(assume a0 p)
(anchor :step t1)
(anchor :step t1.t2 :args ((y Int)))
(assume t1.t2.a0 q)
(step t1.t2 (cl r) :rule foo :premises (t1.t2.a0) :weird (1 2) :flag)
(step t1 (cl s) :rule subproof :premises (a0) :args (1/2 "x") :discharge (t1.t2.a0))`;
        const p = parseAlethe(text);
        expect(p.commands.map((c) => c.kind)).toEqual([
            'other',
            'define-fun',
            'define-const',
            'assume',
            'anchor',
            'anchor',
            'assume',
            'step',
            'step',
        ]);
        expect(p.commands[5]).toMatchObject({ id: 't1.t2', anchor: 't1' });
        expect(p.commands[7]).toMatchObject({
            anchor: 't1',
            extra: [
                [':weird', ['1', '2']],
                [':flag', []],
            ],
        });
        expect(p.commands[8]).toMatchObject({ anchor: null, args: ['1/2', '"x"'] });
        expect(parseAlethe(printAlethe(p))).toEqual(p);
    });

    it('rejects invalid proofs with helpful errors', () => {
        expect(() => parseAlethe('(assume a0 p)(assume a0 q)')).toThrow(/Duplicate id "a0"/);
        expect(() => parseAlethe('(step t0 (cl) :rule r :premises (t9))')).toThrow(/unknown or later/);
        expect(() => parseAlethe('(step t0 (cl) :rule r :premises (t1))\n(step t1 (cl) :rule r)')).toThrow(
            /unknown or later/,
        );
        expect(() => parseAlethe('(anchor :step t1)\n(assume t1.a0 p)')).toThrow(/never closed/);
        expect(() => parseAlethe('(step t0 (cl))')).toThrow(AletheParseError);
        expect(() => parseAlethe('(step t0 (cl) :premises ())')).toThrow(/no :rule/);
        try {
            parseAlethe('(assume a0 p)\n(assume a1 q)\n(step t0 (cl) :rule r :premises (zz))');
        } catch (e) {
            expect((e as AletheParseError).line).toBe(3);
        }
    });
});

describe('printAlethe', () => {
    for (const name of [
        'euf',
        'lia',
        'q',
        'sko',
        'ex1',
        'verit-style',
        'carcara-slice-doc',
        'euf.verit',
        'lia.verit',
        'q.verit',
    ]) {
        it(`round-trips ${name}`, () => {
            const p = parseAlethe(fixture(`${name}.alethe`));
            const text = printAlethe(p);
            expect(text.startsWith('(') || text.startsWith('unsat')).toBe(true);
            expect(text.startsWith('unsat')).toBe(false);
            expect(text.split('\n').filter(Boolean)).toHaveLength(p.commands.length);
            expect(parseAlethe(text)).toEqual({ ...p, status: null });
            expect(parseAlethe(printAlethe(p, { includeStatus: true }))).toEqual(p);
        });
    }
});
