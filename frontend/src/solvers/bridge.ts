import type {
    BridgeHealth,
    CarcaraCheckRequest,
    CarcaraCheckResponse,
    CarcaraElaborateRequest,
    CarcaraElaborateResponse,
    CarcaraSliceRequest,
    CarcaraSliceResponse,
    SolveRequest,
    SolverRunResult,
} from './types';

const STORAGE_KEY = 'pv.bridgeUrl';
const HEALTH_TIMEOUT_MS = 12_000;

const defaultUrl = () => (import.meta.env.DEV ? '' : 'http://localhost:4000');

/** Base URL of the local bridge ('' = same origin, used with the Vite dev proxy). */
export function getBridgeUrl(): string {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v !== null) return v;
    } catch {
        // storage unavailable
    }
    return defaultUrl();
}

export function setBridgeUrl(url: string): void {
    const clean = url.trim().replace(/\/+$/, '');
    try {
        localStorage.setItem(STORAGE_KEY, clean);
    } catch {
        // storage unavailable
    }
}

/** Returns null when the bridge is unreachable. */
export async function getBridgeHealth(signal?: AbortSignal): Promise<BridgeHealth | null> {
    const timeout = AbortSignal.timeout(HEALTH_TIMEOUT_MS);
    try {
        const res = await fetch(`${getBridgeUrl()}/api/health`, {
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        if (!res.ok) return null;
        return (await res.json()) as BridgeHealth;
    } catch {
        return null;
    }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${getBridgeUrl()}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });
    } catch (err) {
        if (signal?.aborted) throw err;
        throw new Error(`Cannot reach the local bridge at ${getBridgeUrl() || 'this origin'} (is it running?)`, {
            cause: err,
        });
    }
    let data: unknown = null;
    try {
        data = await res.json();
    } catch {
        // non-JSON body
    }
    if (!res.ok) {
        const msg = (data as { error?: unknown } | null)?.error;
        throw new Error(typeof msg === 'string' ? msg : `Bridge request failed: HTTP ${res.status}`);
    }
    return data as T;
}

export function runSolverViaBridge(req: SolveRequest, signal?: AbortSignal): Promise<SolverRunResult> {
    return post<SolverRunResult>('/api/solve', req, signal);
}

export function carcaraCheck(req: CarcaraCheckRequest, signal?: AbortSignal): Promise<CarcaraCheckResponse> {
    return post('/api/carcara/check', req, signal);
}

export function carcaraElaborate(
    req: CarcaraElaborateRequest,
    signal?: AbortSignal,
): Promise<CarcaraElaborateResponse> {
    return post('/api/carcara/elaborate', req, signal);
}

export function carcaraSlice(req: CarcaraSliceRequest, signal?: AbortSignal): Promise<CarcaraSliceResponse> {
    return post('/api/carcara/slice', req, signal);
}
