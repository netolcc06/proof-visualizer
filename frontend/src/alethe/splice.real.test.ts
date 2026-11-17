// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    buildProofGraph,
    parseAlethe,
    printAlethe,
    printSExpr,
    pruneUnreachable,
    spliceElaboratedSlice,
} from './index';
import type { AletheProof, AletheStep } from './index';
import { collectNamedTerms, ensureNamesDefined } from './letmap';
import { fixture, usedBeforeDefined } from './testUtils';

const step = (p: AletheProof, id: string) => p.commands.find((c) => c.kind === 'step' && c.id === id) as AletheStep;
const clauseText = (s: AletheStep) => printSExpr(s.clause);

// Real Carcara 1.1.0 `slice` + `elaborate` outputs (no sharing, boundary holes without "trust").
const cases = [
    { original: 'lia.alethe', elab: 'lia.slice-t28.elab.alethe', from: 't28' },
    { original: 'euf.alethe', elab: 'euf.slice-t2.t4.elab.alethe', from: 't2.t4' },
    { original: 'q.alethe', elab: 'q.slice-t23.elab.alethe', from: 't23' },
    { original: 'euf.alethe', elab: 'euf.slice-t14.elab.alethe', from: 't14' },
];

describe('splice with real Carcara slices', () => {
    for (const c of cases) {
        it(`${c.elab}`, () => {
            const original = parseAlethe(fixture(c.original));
            const elaborated = parseAlethe(fixture(c.elab));
            const rootBefore = buildProofGraph(original).nodes[0].stepId;
            const spliced = spliceElaboratedSlice(original, c.from, elaborated);
            const pruned = pruneUnreachable(spliced);
            const reparsed = parseAlethe(printAlethe(pruned));
            const g = buildProofGraph(reparsed);
            expect(usedBeforeDefined(reparsed, new Set(collectNamedTerms(original).keys()))).toEqual([]);
            expect(g.nodes[0].stepId).toBe(rootBefore);
            expect(g.unreachable).toEqual([]);
            const before = step(original, c.from);
            const after = step(reparsed, c.from);
            expect(clauseText(after)).toBe(clauseText(before));
            // original anchors and ids are never duplicated
            const ids = reparsed.commands.map((x) => (x.kind === 'assume' || x.kind === 'step' ? x.id : null));
            expect(new Set(ids.filter(Boolean)).size).toBe(ids.filter(Boolean).length);
        });
    }

    it('lia: elaborated resolution args and changed premises are kept', () => {
        const original = parseAlethe(fixture('lia.alethe'));
        const out = spliceElaboratedSlice(original, 't28', parseAlethe(fixture('lia.slice-t28.elab.alethe')));
        const t28 = step(out, 't28');
        expect(t28.rule).toBe('resolution');
        expect(t28.args.length).toBe(4);
        expect(t28.premises).toEqual(['t18', 't20', 'el1_t27']);
        expect(step(out, 'el1_t27').args.length).toBe(4);
        expect(step(original, 't28').args).toEqual([]);
    });

    it('euf t2.t4: unchanged slice leaves the proof as it was', () => {
        const original = parseAlethe(fixture('euf.alethe'));
        const out = spliceElaboratedSlice(original, 't2.t4', parseAlethe(fixture('euf.slice-t2.t4.elab.alethe')));
        expect(out.commands).toEqual(original.commands);
    });

    it('q t23: anchors t20 and t21 stay intact', () => {
        const original = parseAlethe(fixture('q.alethe'));
        const out = spliceElaboratedSlice(original, 't23', parseAlethe(fixture('q.slice-t23.elab.alethe')));
        expect(step(out, 't23').args.length).toBeGreaterThan(0);
        expect(step(out, 't23').premises).toEqual(['t19', 't22', 'a0']);
        expect(out.commands.filter((x) => x.kind === 'anchor')).toHaveLength(2);
        const g = buildProofGraph(pruneUnreachable(out));
        expect(g.byStepId.has('t20.t0')).toBe(true);
    });

    it('euf t14: the from step is rebuilt as a reordering of the permuted copy', () => {
        const original = parseAlethe(fixture('euf.alethe'));
        const out = spliceElaboratedSlice(original, 't14', parseAlethe(fixture('euf.slice-t14.elab.alethe')));
        const t14 = step(out, 't14');
        expect(t14.rule).toBe('reordering');
        expect(t14.premises).toEqual(['el1_t13']);
        expect(step(out, 'el1_t13').args.length).toBeGreaterThan(0);
        expect(step(out, 'el1_t13').anchor).toBeNull();
        expect(step(out, 't13').args).toEqual([]);
        const g = buildProofGraph(pruneUnreachable(out));
        expect(g.byStepId.get('el1_t13')).toBeDefined();
        expect(g.nodes[g.byStepId.get('t14') as number].children).toHaveLength(1);
    });

    it('lia t28: names whose definition lived in a removed command are re-defined', () => {
        const original = parseAlethe(fixture('lia.alethe'));
        const out = spliceElaboratedSlice(original, 't28', parseAlethe(fixture('lia.slice-t28.elab.alethe')));
        const text = printAlethe(pruneUnreachable(out));
        expect(text).not.toContain('(assume a2');
        expect(text).toContain('(! (< y 5) :named @p_4)');
        expect(text.split(':named @p_4)')).toHaveLength(2);
    });

    it('ensureNamesDefined handles nested missing names and duplicate definitions', () => {
        const full = parseAlethe(`(assume a0 (! (and (! (f x) :named @p_1) (! (g @p_1) :named @p_2)) :named @p_3))
(step t1 (cl @p_3) :rule hole :premises (a0))
(step t2 (cl @p_2 (! (f x) :named @p_1)) :rule hole)
(step t3 (cl) :rule hole :premises (t2))`);
        const kept = { ...full, commands: full.commands.slice(2) };
        const fixed = ensureNamesDefined(kept.commands, collectNamedTerms(full));
        const out = { ...full, commands: fixed };
        const names = new Set(collectNamedTerms(full).keys());
        expect(usedBeforeDefined(kept, names)).toEqual(['@p_2']);
        expect(usedBeforeDefined(out, names)).toEqual([]);
        expect(printAlethe(out).split('\n')[0]).toBe(
            '(step t2 (cl (! (g (! (f x) :named @p_1)) :named @p_2) @p_1) :rule hole)',
        );
        expect(kept.commands[0]).toMatchObject({ kind: 'step', id: 't2' });
    });

    it('rebuilds with contraction when the elaborated clause has duplicates', () => {
        const original = parseAlethe(`(assume a0 p)
(step t1 (cl p q) :rule hole :premises (a0))
(step t2 (cl q p) :rule reordering :premises (t1))
(step t3 (cl) :rule hole :premises (t2))`);
        const elaborated = parseAlethe(`(step x (cl p q q) :rule hole)
(step slice_end (cl) :rule hole :premises (x))`);
        const target = parseAlethe(`(assume a0 p)
(step t1 (cl p q p) :rule hole :premises (a0))
(step t2 (cl q p) :rule reordering :premises (t1))
(step t3 (cl) :rule hole :premises (t2))`);
        const out = spliceElaboratedSlice(target, 't2', elaborated);
        const t2 = step(out, 't2');
        expect(t2.rule).toBe('reordering');
        const mid = step(out, t2.premises[0]);
        expect(mid.rule).toBe('contraction');
        expect(printSExpr(mid.clause)).toBe('(p q)');
        expect(mid.premises).toEqual(['el1_x']);
        expect(original.commands).toHaveLength(4);
    });
});
