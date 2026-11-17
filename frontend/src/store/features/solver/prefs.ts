// localStorage helpers; storage can be missing or throw (private windows, blocked data)
export function readPref<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
        return fallback;
    }
}

export function writePref(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Not persisted
    }
}

export const RARE_KEY = 'pv.rare';
export const PANEL_KEY = 'pv.solverPanel';
export const PANEL_LAYOUT_KEY = 'pv.solverPanelLayout';
