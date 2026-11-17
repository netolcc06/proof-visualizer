// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    AletheSpliceError,
    buildProofGraph,
    parseAlethe,
    printAlethe,
    pruneUnreachable,
    spliceElaboratedSlice,
} from './index';
import type { AletheProof, AletheStep } from './index';
import { fixture } from './testUtils';

const original = () => parseAlethe(fixture('carcara-slice-doc.alethe'));
const ids = (p: AletheProof) => p.commands.map((c) => (c.kind === 'assume' || c.kind === 'step' ? c.id : c.kind));
const step = (p: AletheProof, id: string) => p.commands.find((c) => c.kind === 'step' && c.id === id) as AletheStep;

function checkReparse(p: AletheProof) {
    const again = parseAlethe(printAlethe(p));
    expect(again.commands).toEqual(p.commands);
    const g = buildProofGraph(again);
    expect(g.nodes[0].stepId).toBe('t5');
    return g;
}

describe('spliceElaboratedSlice', () => {
    it('splices a top-level step', () => {
        const elaborated = parseAlethe(`(step t3 (cl (not (not a)) (or b b)) :rule hole :args ("trust"))
(step t4t1 (cl (or b b) a) :rule reordering :premises (t3))
(step t4 (cl a (or b b)) :rule reordering :premises (t4t1))
(step slice_end (cl) :rule hole :premises (t4) :args ("trust"))`);
        const out = spliceElaboratedSlice(original(), 't4', elaborated);
        expect(ids(out)).toEqual([
            'a0',
            't0',
            't1',
            't2',
            'anchor',
            't3.a0',
            't3.t0',
            't3.t1',
            't3.t2',
            't3',
            'el1_t4t1',
            't4',
            't5',
        ]);
        expect(step(out, 'el1_t4t1')).toMatchObject({ premises: ['t3'], rule: 'reordering', anchor: null });
        expect(step(out, 't4')).toMatchObject({ rule: 'reordering', premises: ['el1_t4t1'] });
        // trust-hole t3 maps to the original subproof, which is untouched
        expect(step(out, 't3').rule).toBe('subproof');
        const g = checkReparse(out);
        expect(g.byStepId.has('el1_t4t1')).toBe(true);
        expect(g.unreachable).toEqual([]);
        expect(ids(pruneUnreachable(out))).toEqual(ids(out));
    });

    it('splices a step inside an anchor without duplicating the anchor', () => {
        const elaborated = parseAlethe(`(anchor :step t3)
(assume t3.a0 (not a))
(step t3.t1 (cl b b) :rule hole :args ("trust"))
(step t3.e1 (cl (not (not b)) (or b b)) :rule or_neg :args (0))
(step t3.t2 (cl (or b b)) :rule resolution :premises (t3.e1 t3.t1))
(step t3 (cl (not (not a)) (or b b)) :rule subproof :discharge (t3.a0))
(step slice_end (cl) :rule hole :premises (t3.t2) :args ("trust"))`);
        const out = spliceElaboratedSlice(original(), 't3.t2', elaborated);
        expect(ids(out).filter((i) => i === 'anchor')).toHaveLength(1);
        const at = ids(out).indexOf('el1_t3.e1');
        expect(ids(out)[at + 1]).toBe('t3.t2');
        expect(step(out, 'el1_t3.e1')).toMatchObject({ anchor: 't3', args: ['0'] });
        expect(step(out, 't3.t2')).toMatchObject({
            rule: 'resolution',
            premises: ['el1_t3.e1', 't3.t1'],
            anchor: 't3',
        });
        const g = checkReparse(out);
        expect(g.nodes[g.byStepId.get('el1_t3.e1') as number].anchorPath).toEqual(['t3']);
    });

    it('splices an elaboration that introduces a subproof', () => {
        const elaborated = parseAlethe(`(step t3 (cl (not (not a)) (or b b)) :rule hole :args ("trust"))
(anchor :step t4s)
(assume t4s.a0 a)
(step t4s.t0 (cl (or b b)) :rule hole :premises (t4s.a0))
(step t4s (cl (not a) (or b b)) :rule subproof :discharge (t4s.a0))
(step t4 (cl a (or b b)) :rule hole :premises (t4s t3))
(step slice_end (cl) :rule hole :premises (t4) :args ("trust"))`);
        const out = spliceElaboratedSlice(original(), 't4', elaborated);
        expect(ids(out).slice(10, 16)).toEqual(['anchor', 'el1_t4s.a0', 'el1_t4s.t0', 'el1_t4s', 't4', 't5']);
        const anchor = out.commands.find((c) => c.kind === 'anchor' && c.id === 'el1_t4s');
        expect(anchor).toMatchObject({ anchor: null });
        expect(step(out, 'el1_t4s')).toMatchObject({ discharge: ['el1_t4s.a0'], anchor: null });
        expect(step(out, 't4').premises).toEqual(['el1_t4s', 't3']);
        checkReparse(out);
    });

    it('chooses a collision-free prefix', () => {
        const base = parseAlethe(`(assume a0 p)
(step el1_x (cl p) :rule hole :premises (a0))
(step t1 (cl p) :rule hole :premises (el1_x))
(step t2 (cl) :rule hole :premises (t1))`);
        const elaborated = parseAlethe(`(step el1_x (cl p) :rule hole :args ("trust"))
(step n (cl p) :rule foo :premises (el1_x))
(step t1 (cl p) :rule bar :premises (n))
(step slice_end (cl) :rule hole :premises (t1) :args ("trust"))`);
        const out = spliceElaboratedSlice(base, 't1', elaborated);
        expect(ids(out)).toContain('el2_n');
    });

    it('rejects a mismatching clause or unknown step', () => {
        const bad = parseAlethe(`(step t4 (cl a) :rule hole :args ("trust"))`);
        expect(() => spliceElaboratedSlice(original(), 't4', bad)).toThrow(AletheSpliceError);
        expect(() => spliceElaboratedSlice(original(), 'nope', bad)).toThrow(/not found/);
        expect(() => spliceElaboratedSlice(original(), 't4', parseAlethe('(assume a0 a)'))).toThrow(/not found/);
    });

    it('falls back to the premise of slice_end and compares let-expanded clauses', () => {
        const base = parseAlethe(`(assume a0 (! (and p q) :named @p_1))
(step t1 (cl (! (not @p_1) :named @p_2) p) :rule and_pos :args (0))
(step t2 (cl p) :rule resolution :premises (t1 a0))
(step t3 (cl) :rule hole :premises (t2))`);
        const elaborated = parseAlethe(`(assume a0 (and p q))
(step t1 (cl (not (and p q)) p) :rule hole :args ("trust"))
(step x9 (cl p) :rule th_resolution :premises (a0 t1))
(step slice_end (cl) :rule hole :premises (x9) :args ("trust"))`);
        const out = spliceElaboratedSlice(base, 't2', elaborated);
        expect(step(out, 't2')).toMatchObject({ rule: 'th_resolution', premises: ['a0', 't1'] });
        expect(ids(out)).toEqual(['a0', 't1', 't2', 't3']);
    });

    it('prunes unreachable commands but keeps definitions and discharged assumes', () => {
        const p = parseAlethe(`(define-fun f () Int 1)
(assume a0 p)
(step dead (cl p) :rule hole :premises (a0))
(anchor :step t1)
(assume t1.a0 q)
(assume t1.a1 r)
(step t1.t0 (cl q) :rule hole :premises (t1.a0))
(step t1 (cl (not q) q) :rule subproof :discharge (t1.a0 t1.a1))
(anchor :step t2)
(step t2 (cl p) :rule hole)
(step t3 (cl) :rule hole :premises (t1))`);
        expect(ids(pruneUnreachable(p))).toEqual(['define-fun', 'anchor', 't1.a0', 't1.a1', 't1.t0', 't1', 't3']);
    });
});
