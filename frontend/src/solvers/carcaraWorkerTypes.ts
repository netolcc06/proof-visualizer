export interface CarcaraWorkerRequest {
    argv: string[];
    /** Files written to the in-memory filesystem before the run. */
    files: { path: string; data: string }[];
    /** Files read back after the run (null when missing). */
    outputs: string[];
    baseUrl: string;
    wasmModule?: WebAssembly.Module;
}

export type CarcaraWorkerMessage = {
    type: 'done';
    exitCode: number | null;
    stdout: string;
    stderr: string;
    outputs: Record<string, string | null>;
    error?: string;
};
