// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ComponentKind, buildProofGraph, parseAlethe, printAlethe } from './index';

describe('performance', () => {
    it('parses and builds a 50k-step proof with a 10k-deep term', () => {
        const steps = 50000;
        const depth = 10000;
        const deep = '(not '.repeat(depth) + 'p' + ')'.repeat(depth);
        const lines: string[] = ['unsat', '(', `(assume a0 ${deep})`, '(assume a1 (not p))'];
        lines.push('(step t0 (cl p) :rule resolution :premises (a0 a1))');
        for (let i = 1; i < steps; i++) {
            lines.push(`(step t${i} (cl p) :rule resolution :premises (t${i - 1} a1))`);
        }
        lines.push(`(step t${steps} (cl) :rule resolution :premises (t${steps - 1} a1))`);
        lines.push(')');
        const text = lines.join('\n');

        const start = performance.now();
        const proof = parseAlethe(text);
        const graph = buildProofGraph(proof);
        const printed = printAlethe(proof);
        const elapsed = performance.now() - start;

        expect(graph.nodes).toHaveLength(steps + 3);
        expect(graph.nodes[0].stepId).toBe(`t${steps}`);
        expect(graph.nodes[0].component).toBe(ComponentKind.SAT);
        expect(graph.nodes[0].descendants).toBeGreaterThanOrEqual(steps + 3); // tree-size fallback counts shared nodes per path
        expect(printed.length).toBeGreaterThan(text.length / 2);
        expect(elapsed).toBeLessThan(3000);
    });
});
