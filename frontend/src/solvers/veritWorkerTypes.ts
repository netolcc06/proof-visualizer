export interface VeritWorkerRequest {
    problem: string;
    args: string[];
    baseUrl: string;
    wasmModule?: WebAssembly.Module;
}

export type VeritWorkerMessage = {
    type: 'done';
    exitCode: number | null;
    stdout: string;
    stderr: string;
    error?: string;
};
