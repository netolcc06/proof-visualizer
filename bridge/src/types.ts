export type PathStyle = 'native' | 'wsl';
export type ToolName = 'cvc5' | 'verit' | 'carcara';

export interface ToolConfig {
    command: string;
    args: string[];
    pathStyle: PathStyle;
    defaultArgs?: string[];
    // Carcara only: default RARE rules file (absolute path)
    rareFile?: string | null;
}

export interface BridgeConfig {
    port: number;
    host: string;
    allowedOrigins: string[];
    allowedHosts: string[];
    maxBodyBytes: number;
    maxConcurrent: number;
    defaultTimeoutMs: number;
    maxTimeoutMs: number;
    maxOutputBytes: number;
    tools: Partial<Record<ToolName, ToolConfig>>;
}

export class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}
