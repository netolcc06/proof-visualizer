import { renderToStaticMarkup } from 'react-dom/server';
import { getStage } from './stageRegistry';
import { EXPORT_PIXEL_RATIO, Rect, clampPixelRatio, visibleGraphBounds } from './exportGeometry';
import { ConvertToSVG } from '../../VisualizerNavbar/SVGConverter';
import type { NodeInterface, ProofState } from '../../../interfaces/interfaces';

export function downloadBlob(name: string, content: BlobPart, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.download = name;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface PngResult {
    blob: Blob;
    // The pixel ratio fell below 1: the image is smaller than the graph
    lowRes: boolean;
}

// Renders a graph-space rectangle of the stage as a PNG on a white background.
// Konva's toCanvas x/y/width/height are in stage container px (the stage transform is
// applied on top by the layers), so the graph rectangle is mapped with the stage scale/position.
// It redraws the layers into a new canvas, so parts outside the viewport are included
export function renderGraphPng(graphRect: Rect): Promise<PngResult> {
    const stage = getStage();
    if (!stage) return Promise.reject(new Error('The graph is not ready to be exported.'));
    const scale = stage.scaleX();
    const { ratio, clamped } = clampPixelRatio(graphRect.width, graphRect.height, EXPORT_PIXEL_RATIO);

    const canvas = stage.toCanvas({
        x: graphRect.x * scale + stage.x(),
        y: graphRect.y * scale + stage.y(),
        width: graphRect.width * scale,
        height: graphRect.height * scale,
        // Output px per stage px: ratio px per graph unit
        pixelRatio: ratio / scale,
    });

    // Konva output is transparent: paint white behind it
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.save();
        // Konva leaves its translate/scale on the context
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve({ blob, lowRes: clamped });
            else reject(new Error('The image is too large for this browser. Try SVG.'));
        }, 'image/png');
    });
}

export interface ExportOptions {
    format: 'png' | 'svg';
    proof: NodeInterface[];
    visualInfo: ProofState['visualInfo'];
    baseName: string;
    // Graph-space region; the whole visible graph when missing
    region?: Rect;
    notify: (intent: 'warning' | 'danger', message: string) => void;
}

// Downloads the whole visible graph, or `region`, as PNG or SVG
export async function exportGraphImage(opts: ExportOptions): Promise<void> {
    const { format, proof, visualInfo, baseName, region, notify } = opts;
    const name = `${baseName}${region ? '-region' : ''}.${format}`;
    try {
        if (format === 'svg') {
            const svg = renderToStaticMarkup(ConvertToSVG(proof, visualInfo, region));
            downloadBlob(name, svg, 'image/svg+xml');
            return;
        }
        const rect = region ?? visibleGraphBounds(proof, visualInfo);
        if (!rect) {
            notify('danger', 'There is nothing to export.');
            return;
        }
        const { blob, lowRes } = await renderGraphPng(rect);
        downloadBlob(name, blob, 'image/png');
        if (lowRes) notify('warning', 'The image is too large, so it was saved at reduced resolution. Try SVG.');
    } catch (e) {
        notify('danger', e instanceof Error ? e.message : 'Could not export the image.');
    }
}
