const SCALE_BY = 1.08;

// Wheel up (negative deltaY) zooms in, wheel down zooms out
export function zoomScale(oldScale: number, deltaY: number): number {
    if (deltaY < 0) return oldScale * SCALE_BY;
    if (deltaY > 0) return oldScale / SCALE_BY;
    return oldScale;
}
