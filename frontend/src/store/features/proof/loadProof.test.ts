import { describe, it, expect } from 'vitest';
import { createAppStore } from '../../store';
import { applyView, selectProof } from './proofSlice';
import { loadProof } from './loadProof';
import { buildSession } from './alethe';
import { buildProofGraph, parseAlethe } from '../../../alethe';
import { fixture } from '../../../alethe/testUtils';

const smtFiles = import.meta.glob('../../../alethe/__fixtures__/*.smt2', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;
const smtOf = (name: string): string => smtFiles[`../../../alethe/__fixtures__/${name}.smt2`];

const makeStore = createAppStore;

const CVC5 = ['euf', 'lia', 'q', 'sko', 'ex1'];
const VERIT = ['euf.verit', 'lia.verit', 'q.verit', 'verit-style'];

describe('loadProof', () => {
    it.each([...CVC5, ...VERIT])('loads %s', (name) => {
        const store = makeStore();
        const text = fixture(`${name}.alethe`);
        const result = store.dispatch(loadProof({ name: `${name}.alethe`, text }));
        expect(result).toEqual({ ok: true });

        const { proof, file, externalCmd } = store.getState();
        const graph = buildProofGraph(parseAlethe(text));
        expect(proof.proof.length).toBe(graph.nodes.length);
        expect(proof.proof[0].id).toBe(0);
        expect(proof.proof.map((n) => n.stepId)).toEqual(graph.nodes.map((n) => n.stepId));
        expect(proof.clustersInfos.length).toBeGreaterThan(0);
        expect(proof.source).toBe(text);
        expect(file.name).toBe(`${name}.alethe`);
        expect(externalCmd.renderData.fileChanged).toBe(true);
        expect(proof.smt).toBe('');
        // Redux state must be serializable: no Maps
        expect(JSON.parse(JSON.stringify(proof)).proof.length).toBe(proof.proof.length);
        if (CVC5.includes(name) && name !== 'ex1') expect(Object.keys(proof.letMap).length).toBeGreaterThan(0);
        if (graph.nodes.some((n) => n.component !== graph.nodes[0].component)) expect(proof.view).toBe('clustered');
        expect(selectProof(store.getState()).length).toBeGreaterThanOrEqual(1);
    });

    it('extracts theory lemmas for euf and keeps the problem', () => {
        const store = makeStore();
        const text = fixture('euf.alethe');
        store.dispatch(loadProof({ name: 'euf.alethe', text, smt: smtOf('euf') }));
        const { proof } = store.getState();
        expect(proof.theoryLemmaMap.length).toBeGreaterThan(0);
        expect(proof.smt).toBe(smtOf('euf'));
    });

    it('accepts a flat command list without status or outer parens', () => {
        const store = makeStore();
        const text = '(assume a0 a)\n(assume a1 (not a))\n(step t0 (cl) :rule resolution :premises (a0 a1))';
        expect(store.dispatch(loadProof({ name: 'x.proof', text })).ok).toBe(true);
        expect(store.getState().proof.proof.length).toBe(3);
    });

    it('reports parse errors with line and column', () => {
        const store = makeStore();
        const result = store.dispatch(loadProof({ name: 'bad.alethe', text: '(assume a0 a)\n(step t0 (cl' }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/line \d+, column \d+/);
        expect(store.getState().proof.proof).toEqual([]);
    });

    it('rejects DOT proofs and old DOT sessions', () => {
        const store = makeStore();
        const dot = store.dispatch(loadProof({ name: 'p.dot', text: 'unsat\ndigraph proof {\n}' }));
        expect(dot.ok).toBe(false);
        const old = JSON.stringify({ dot: 'digraph {}', view: 'full' });
        const json = store.dispatch(loadProof({ name: 'p.json', text: old }));
        expect(json.ok).toBe(false);
        if (!json.ok) expect(json.error).toMatch(/DOT/);
    });

    it('round-trips a session', () => {
        const first = makeStore();
        const text = fixture('euf.alethe');
        first.dispatch(loadProof({ name: 'euf.alethe', text, smt: smtOf('euf') }));
        first.dispatch(applyView('colored-full'));
        const { proof } = first.getState();
        const session = buildSession('euf.alethe', proof.source, proof.smt, {
            view: proof.view,
            hiddenNodes: proof.hiddenNodes,
            visualInfo: proof.visualInfo,
        });
        expect(session.version).toBe(2);

        const second = makeStore();
        const result = second.dispatch(loadProof({ name: 'euf.json', text: JSON.stringify(session) }));
        expect(result).toEqual({ ok: true });
        const restored = second.getState();
        expect(restored.proof.view).toBe('colored-full');
        expect(restored.proof.hiddenNodes).toEqual(proof.hiddenNodes);
        expect(restored.proof.visualInfo).toEqual(proof.visualInfo);
        expect(restored.proof.smt).toBe(smtOf('euf'));
        expect(restored.proof.source).toBe(text);
        expect(restored.file.name).toBe('euf.alethe');
        // Positions are kept: the canvas must not re-layout
        expect(restored.externalCmd.renderData.count).toBe(2);
    });

    it('rejects a session that does not match its proof', () => {
        const store = makeStore();
        const session = {
            version: 2,
            name: 'x',
            alethe: fixture('euf.alethe'),
            smt: '',
            view: 'full',
            hiddenNodes: [],
            visualInfo: { 0: { color: '#fff', x: 0, y: 0, selected: false } },
        };
        const result = store.dispatch(loadProof({ name: 'x.json', text: JSON.stringify(session) }));
        expect(result.ok).toBe(false);
    });
});
