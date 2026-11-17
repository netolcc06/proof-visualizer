import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@blueprintjs/core';
import { Rect, isTinyRect, rectFromPoints } from './Canvas/exportGeometry';

import '../../scss/RegionCaptureOverlay.scss';

interface RegionCaptureOverlayProps {
    // `rect` is in viewport (client) px
    onExport: (format: 'png' | 'svg', rect: Rect) => void;
    onCancel: () => void;
}

// Toolbar size estimate, used only to keep it inside the viewport
const TOOLBAR_W = 220;
const TOOLBAR_H = 40;
const GAP = 8;

const RegionCaptureOverlay: React.FC<RegionCaptureOverlayProps> = ({ onExport, onCancel }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const [dragRect, setDragRect] = useState<Rect | null>(null);
    const [rect, setRect] = useState<Rect | null>(null);
    const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    // Keep the overlay size in state, for the toolbar placement
    useEffect(() => {
        const measure = () => {
            const box = rootRef.current?.getBoundingClientRect();
            if (box?.width && box.height) setSize({ width: box.width, height: box.height });
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // Point relative to the overlay, clamped to it
    const localPoint = (e: MouseEvent | React.MouseEvent) => {
        const box = rootRef.current?.getBoundingClientRect();
        const width = box?.width || window.innerWidth;
        const height = box?.height || window.innerHeight;
        return {
            x: Math.min(Math.max(e.clientX - (box?.left ?? 0), 0), width),
            y: Math.min(Math.max(e.clientY - (box?.top ?? 0), 0), height),
        };
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        const onMove = (e: MouseEvent) => {
            if (startRef.current) setDragRect(rectFromPoints(startRef.current, localPoint(e)));
        };
        const onUp = (e: MouseEvent) => {
            const start = startRef.current;
            if (!start) return;
            startRef.current = null;
            setDragRect(null);
            const dragged = rectFromPoints(start, localPoint(e));
            // Tiny drags are ignored: the previous rectangle stays
            if (!isTinyRect(dragged)) setRect(dragged);
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [onCancel]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        startRef.current = localPoint(e);
        setRect(null);
        setDragRect({ ...startRef.current, width: 0, height: 0 });
    };

    const shown = dragRect ?? rect;

    const exportAs = (format: 'png' | 'svg', r: Rect) => {
        const box = rootRef.current?.getBoundingClientRect();
        onExport(format, { ...r, x: r.x + (box?.left ?? 0), y: r.y + (box?.top ?? 0) });
    };

    // Below-right of the rectangle, flipped or clamped to stay in the viewport
    const toolbarStyle = (r: Rect): React.CSSProperties => {
        const { width, height } = size;
        let top = r.y + r.height + GAP;
        if (top + TOOLBAR_H > height) top = r.y - TOOLBAR_H - GAP;
        top = Math.min(Math.max(top, GAP), Math.max(height - TOOLBAR_H - GAP, GAP));
        const left = Math.min(Math.max(r.x + r.width - TOOLBAR_W, GAP), Math.max(width - TOOLBAR_W - GAP, GAP));
        return { top, left };
    };

    return (
        <div
            ref={rootRef}
            className={`region-capture${shown ? ' has-rect' : ''}`}
            data-testid="region-capture"
            onMouseDown={handleMouseDown}
            onContextMenu={(e) => e.preventDefault()}
        >
            {!shown && <div className="region-hint">Drag to select the area to save · Esc to cancel</div>}
            {shown && (
                <div
                    className="region-rect"
                    data-testid="region-rect"
                    style={{ left: shown.x, top: shown.y, width: shown.width, height: shown.height }}
                />
            )}
            {rect && !dragRect && (
                <div
                    className="region-toolbar"
                    data-testid="region-toolbar"
                    style={toolbarStyle(rect)}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <Button size="small" icon="media" text="PNG" onClick={() => exportAs('png', rect)} />
                    <Button size="small" icon="widget" text="SVG" onClick={() => exportAs('svg', rect)} />
                    <Button size="small" text="Cancel" onClick={onCancel} />
                </div>
            )}
        </div>
    );
};

export default RegionCaptureOverlay;
