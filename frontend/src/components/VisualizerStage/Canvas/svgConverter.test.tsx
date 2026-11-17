import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConvertToSVG } from '../../VisualizerNavbar/SVGConverter';
import type { NodeInterface, ProofState } from '../../../interfaces/interfaces';

const mk = (id: number, children: number[]) =>
    ({
        id,
        stepId: `t${id}`,
        conclusion: 'c',
        rule: 'r',
        args: '',
        children,
        parents: [],
        descendants: 1,
        dependencies: [],
        discharge: [],
        anchorPath: [],
        anchorArgs: null,
        clusterType: 0,
    }) as unknown as NodeInterface;

const vi = (x: number, y: number) => ({ color: '#ffffff', x, y, selected: false });

describe('ConvertToSVG', () => {
    const proof = [mk(0, [1]), mk(1, [])];
    const info: ProofState['visualInfo'] = { 0: vi(0, 0), 1: vi(0, 300), 9: vi(99999, 99999) };

    it('sizes the whole graph from the visible nodes only', () => {
        const svg = renderToStaticMarkup(ConvertToSVG(proof, info));
        expect(svg).toContain('width="340"');
        expect(svg).toContain('height="459"');
        expect(svg).toContain('viewBox="0 0 340 459"');
    });

    it('uses the region as viewBox and size, dropping nodes outside', () => {
        const svg = renderToStaticMarkup(ConvertToSVG(proof, info, { x: -10, y: -10, width: 400, height: 150 }));
        expect(svg).toContain('viewBox="0 0 400 150"');
        expect(svg).toContain('width="400"');
        expect(svg).not.toContain('clip-id-1');
        expect(svg).toContain('clip-id-0');
    });
});
