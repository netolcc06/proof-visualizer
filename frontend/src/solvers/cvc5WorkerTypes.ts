export interface Cvc5WorkerRequest {
    problem: string;
    args: string[];
    baseUrl: string;
    wasmModule?: WebAssembly.Module;
}

export type Cvc5WorkerMessage = {
    type: 'done';
    exitCode: number | null;
    stdout: string;
    stderr: string;
    error?: string;
};
