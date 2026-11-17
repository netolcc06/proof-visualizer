// Convert a Windows path (C:\a\b or C:/a/b) to its WSL mount path (/mnt/c/a/b).
export function toWslPath(p: string): string {
    const m = /^([a-zA-Z]):[\\/]?(.*)$/.exec(p);
    if (!m) return p.replace(/\\/g, '/');
    return `/mnt/${m[1]!.toLowerCase()}/${m[2]!.replace(/\\/g, '/')}`.replace(/\/$/, '');
}
