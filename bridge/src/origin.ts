export const DEFAULT_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'https://ufmg-smite.github.io',
];

// No Origin header (curl, same-origin proxy) is allowed; browsers always send one cross-origin.
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
    if (origin === undefined) return true;
    return allowed.includes(origin.replace(/\/$/, ''));
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export const DEFAULT_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// DNS-rebinding guard: the Host header name must be loopback (bound to loopback) or in `allowedHosts` (otherwise).
export function isHostAllowed(hostHeader: string | undefined, bindHost: string, allowedHosts: string[] = DEFAULT_HOSTS): boolean {
    if (!hostHeader) return false;
    const name = (
        hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0]!
    ).toLowerCase();
    if (LOOPBACK.has(bindHost)) return LOOPBACK.has(name);
    return allowedHosts.some((h) => h.toLowerCase() === name);
}
