// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ComponentKind, buildProofGraph, parseAlethe } from './index';
import type { ProofGraph } from './index';
import { fixture } from './testUtils';

const { SAT, CNF, TL, PP, IN, RW } = ComponentKind;

function graphOf(name: string): ProofGraph {
    return buildProofGraph(parseAlethe(fixture(name)));
}

function comp(g: ProofGraph, stepId: string): ComponentKind {
    const id = g.byStepId.get(stepId);
    if (id === undefined) throw new Error(`${stepId} is not in the graph`);
    return g.nodes[id].component;
}

function compsWhere(g: ProofGraph, pred: (id: string) => boolean): ComponentKind[] {
    return g.nodes.filter((n) => pred(n.stepId)).map((n) => n.component);
}

describe('buildProofGraph structure', () => {
    it('builds euf with root, DAG edges and descendants', () => {
        const g = graphOf('euf.alethe');
        expect(g.nodes[0].stepId).toBe('t64');
        expect(g.nodes[0].conclusion).toBe('(cl)');
        expect(g.nodes[0].parents).toEqual([]);
        expect(g.unreachable).toEqual([]);
        g.nodes.forEach((n, i) => {
            expect(n.id).toBe(i);
            for (const c of n.children) expect(g.nodes[c].parents).toContain(i);
            for (const p of n.parents) expect(g.nodes[p].children).toContain(i);
        });
        expect(g.nodes[0].descendants).toBe(g.nodes.length);
        const t2 = g.nodes[g.byStepId.get('t2') as number];
        expect(t2.children.map((c) => g.nodes[c].stepId)).toEqual(['t2.t4']);
        expect(t2.anchorPath).toEqual([]);
        expect(t2.discharge).toEqual(['t2.a0', 't2.a1']);
        expect(g.nodes[g.byStepId.get('t2.t0') as number].anchorPath).toEqual(['t2']);
        expect(g.nodes[g.byStepId.get('a0') as number].rule).toBe('assume');
        expect(g.nodes[g.byStepId.get('a0') as number].conclusion).toBe('@p_3');
        expect(g.letMap['@p_3']).toBe('(or @p_2 @p_1)');
    });

    it('computes exact descendants on a DAG and lists unreachable ids', () => {
        const g = buildProofGraph(
            parseAlethe(`(assume a0 p)
(step t1 (cl p) :rule r :premises (a0))
(step t2 (cl p) :rule r :premises (t1))
(step t3 (cl p) :rule r :premises (t1))
(step t4 (cl) :rule r :premises (t2 t3))
(step t5 (cl) :rule r)`),
        );
        expect(g.nodes).toHaveLength(1);
        expect(g.nodes[0].stepId).toBe('t5');
        expect(g.unreachable).toEqual(['a0', 't1', 't2', 't3', 't4']);
        const g2 = buildProofGraph(
            parseAlethe(`(assume a0 p)
(step t1 (cl p) :rule r :premises (a0))
(step t2 (cl p) :rule r :premises (t1))
(step t3 (cl p) :rule r :premises (t1))
(step t4 (cl) :rule r :premises (t2 t3))`),
        );
        expect(g2.nodes.map((n) => [n.stepId, n.descendants])).toEqual([
            ['t4', 5],
            ['t2', 3],
            ['t1', 2],
            ['a0', 1],
            ['t3', 3],
        ]);
        expect(g2.nodes[g2.byStepId.get('t1') as number].parents).toHaveLength(2);
    });

    it('handles an empty proof', () => {
        expect(buildProofGraph({ status: null, commands: [] }).nodes).toEqual([]);
    });

    it('records anchor args on the closer', () => {
        const g = graphOf('q.alethe');
        expect(g.nodes[g.byStepId.get('t20') as number].anchorArgs).toBe('(x Int) (:= (x Int) x)');
    });
});

describe('component inference on cvc5 fixtures', () => {
    it('euf', () => {
        const g = graphOf('euf.alethe');
        expect(comp(g, 't64')).toBe(SAT);
        expect([TL, RW]).toContain(comp(g, 't14'));
        const derivation = compsWhere(g, (id) => /^t(\d|1[0-4])$/.test(id) || id.startsWith('t2.'));
        expect(derivation.length).toBeGreaterThan(15);
        for (const c of derivation) expect([TL, RW]).toContain(c);
        for (const a of ['a0', 'a1', 'a2', 'a3']) expect(comp(g, a)).toBe(IN);
        expect(comp(g, 't15')).toBe(CNF);
        expect(comp(g, 't63')).toBe(SAT);
        expect(comp(g, 't2.t0')).toBe(RW);
    });

    it('lia', () => {
        const g = graphOf('lia.alethe');
        for (const s of ['t40', 't38', 't37']) expect(comp(g, s)).toBe(SAT);
        expect(comp(g, 't17')).toBe(TL);
        expect(comp(g, 't39')).toBe(CNF);
        expect(comp(g, 't36')).toBe(PP);
        expect(comp(g, 'a1')).toBe(IN);
        for (const s of ['t30', 't31', 't32', 't33', 't34']) expect(comp(g, s)).toBe(RW);
    });

    it('q', () => {
        const g = graphOf('q.alethe');
        for (const a of ['a0', 'a1', 'a2']) expect(comp(g, a)).toBe(IN);
        for (const n of g.nodes) {
            if (n.stepId.startsWith('t20') || n.stepId.startsWith('t21')) expect([PP, RW]).toContain(n.component);
        }
        expect(comp(g, 't20')).toBe(RW);
        expect(comp(g, 't21.t0')).toBe(RW);
        expect(comp(g, 't47')).toBe(SAT);
    });

    it('sko and ex1 give sane results', () => {
        for (const f of ['sko.alethe', 'ex1.alethe']) {
            const g = graphOf(f);
            expect(g.nodes.length).toBeGreaterThan(0);
            expect(g.nodes.every((n) => n.component !== ComponentKind.NONE)).toBe(true);
        }
    });

    it('hand-written fixtures', () => {
        const v = graphOf('verit-style.alethe');
        expect(comp(v, 't3')).toBe(SAT);
        expect(comp(v, 't2')).toBe(SAT);
        expect(comp(v, 't1')).toBe(TL);
        expect(comp(v, 'h1')).toBe(IN);
        const c = graphOf('carcara-slice-doc.alethe');
        expect([SAT, PP, TL]).toContain(comp(c, 't5'));
        expect(comp(c, 'a0')).toBe(IN);
        expect(comp(c, 't3.a0')).not.toBe(IN);
    });
});

describe('component inference on veriT fixtures', () => {
    for (const f of ['euf.verit.alethe', 'lia.verit.alethe', 'q.verit.alethe']) {
        it(f, () => {
            const g = graphOf(f);
            expect(g.nodes.length).toBeGreaterThan(5);
            expect(g.nodes[0].conclusion).toBe('(cl)');
            expect(g.nodes[0].component).toBe(SAT);
            for (const n of g.nodes) {
                expect(n.component).not.toBe(ComponentKind.NONE);
                if (/^h\d+$/.test(n.stepId)) expect(n.component).toBe(IN);
                if (/^eq_|^la_/.test(n.rule) && n.children.length === 0) expect([TL, RW]).toContain(n.component);
            }
        });
    }

    it('euf.verit key steps', () => {
        const g = graphOf('euf.verit.alethe');
        expect(comp(g, 't13')).toBe(SAT);
        expect(comp(g, 't4')).toBe(CNF);
        expect(comp(g, 't11')).toBe(TL);
        expect(comp(g, 't18')).toBe(TL);
    });

    it('lia.verit key steps', () => {
        const g = graphOf('lia.verit.alethe');
        expect(comp(g, 't12')).toBe(TL);
        expect(comp(g, 't6')).toBe(PP);
        expect(comp(g, 't4')).toBe(RW);
    });
});
