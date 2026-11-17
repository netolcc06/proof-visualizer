import { describe, expect, it } from 'vitest';
import { splitSolverOutput } from './output';

const fixtures = import.meta.glob<string>('../alethe/__fixtures__/*.alethe', {
    query: '?raw',
    import: 'default',
    eager: true,
});

describe('splitSolverOutput', () => {
    it('splits unsat output into status and proof', () => {
        const r = splitSolverOutput('unsat\n(\n(assume a0 p)\n)\n');
        expect(r.status).toBe('unsat');
        expect(r.proof).toBe('(\n(assume a0 p)\n)');
    });
    it('skips leading blank lines and handles CRLF', () => {
        const r = splitSolverOutput('\r\n\r\nunsat\r\n(step t1 (cl) :rule x)\r\n');
        expect(r.status).toBe('unsat');
        expect(r.proof).toBe('(step t1 (cl) :rule x)');
    });
    it('unsat without proof yields null proof', () => {
        expect(splitSolverOutput('unsat\n')).toEqual({ status: 'unsat', proof: null });
    });
    it('sat and unknown carry no proof', () => {
        expect(splitSolverOutput('sat\n(model)\n')).toEqual({ status: 'sat', proof: null });
        expect(splitSolverOutput('unknown')).toEqual({ status: 'unknown', proof: null });
    });
    it('treats errors and empty output as error', () => {
        expect(splitSolverOutput('(error "Parse Error")\n')).toEqual({ status: 'error', proof: null });
        expect(splitSolverOutput('   \n')).toEqual({ status: 'error', proof: null });
    });

    it('skips veriT print-success lines', () => {
        const out = 'success\nsuccess\nunsat\nsuccess\n(assume h1 p)\n(step t2 (cl) :rule x)\nsuccess\n';
        const r = splitSolverOutput(out);
        expect(r.status).toBe('unsat');
        expect(r.proof).toBe('(assume h1 p)\n(step t2 (cl) :rule x)');
    });

    it('splits real veriT and cvc5 fixtures', () => {
        for (const name of ['euf.verit.alethe', 'lia.verit.alethe', 'q.verit.alethe', 'euf.alethe']) {
            const text = fixtures[`../alethe/__fixtures__/${name}`];
            const r = splitSolverOutput(text);
            expect(r.status).toBe('unsat');
            expect(r.proof).toMatch(/^\(/);
            const noisy = 'success\n' + text.replace('unsat\n', 'unsat\nsuccess\n') + 'success\n';
            expect(splitSolverOutput(noisy).proof).toBe(r.proof);
        }
    });
});
