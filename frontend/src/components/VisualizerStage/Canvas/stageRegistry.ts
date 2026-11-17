import type Konva from 'konva';

// The Konva stage of the mounted Canvas, so the export code does not query the DOM
let current: Konva.Stage | null = null;

export function registerStage(stage: Konva.Stage | null): void {
    current = stage;
}

// Clears only if `stage` is still the registered one (a new Canvas may have mounted first)
export function unregisterStage(stage: Konva.Stage | null): void {
    if (current === stage) current = null;
}

export function getStage(): Konva.Stage | null {
    return current;
}
