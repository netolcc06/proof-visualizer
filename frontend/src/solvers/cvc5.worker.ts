// Classic worker running the unmodified official cvc5 Emscripten glue.
// Glue hooks relied upon (check these when upgrading cvc5):
//   Module.arguments, print, printErr, locateFile, preRun, FS (writeFile), instantiateWasm,
//   onRuntimeInitialized (fallback completion signal), onAbort.
// The glue has no onExit/postRun hook, so completion is detected by wrapping the wasm `main` export
// (`__main_argc_argv`) inside `instantiateWasm`; if that export is missing, a setTimeout(0) scheduled from
// `onRuntimeInitialized` fires right after the synchronous `main` returns (exitCode null).
// Worker-env shim: the official build only enables the `web` environment, so before importScripts we hide
// `WorkerGlobalScope` and alias `window` to `self`.
// No import/export on purpose: a classic worker must not be a module.
type Cvc5WorkerRequest = import('./cvc5WorkerTypes').Cvc5WorkerRequest;
type Cvc5WorkerMessage = import('./cvc5WorkerTypes').Cvc5WorkerMessage;

(() => {
    interface EmscriptenFS {
        writeFile(path: string, data: string): void;
    }
    interface Cvc5Module {
        arguments: string[];
        print: (line: string) => void;
        printErr: (line: string) => void;
        locateFile: (path: string) => string;
        preRun: (() => void)[];
        instantiateWasm: (
            imports: WebAssembly.Imports,
            receive: (instance: { exports: WebAssembly.Exports }) => void,
        ) => void;
        onAbort: (what: unknown) => void;
        onRuntimeInitialized: () => void;
        FS?: EmscriptenFS;
    }

    const ctx = self as unknown as DedicatedWorkerGlobalScope & {
        Module?: Cvc5Module;
        importScripts(...urls: string[]): void;
    };

    ctx.onmessage = (ev: MessageEvent<Cvc5WorkerRequest>) => {
        ctx.onmessage = null;
        const { problem, args, baseUrl, wasmModule } = ev.data;
        const out: string[] = [];
        const err: string[] = [];
        let finished = false;

        const finish = (exitCode: number | null, error?: string) => {
            if (finished) return;
            finished = true;
            const msg: Cvc5WorkerMessage = {
                type: 'done',
                exitCode,
                stdout: out.join('\n') + (out.length ? '\n' : ''),
                stderr: err.join('\n') + (err.length ? '\n' : ''),
                error,
            };
            ctx.postMessage(msg);
        };

        const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
        ctx.addEventListener('error', (e) => finish(null, e.message));
        ctx.addEventListener('unhandledrejection', (e) => finish(null, errText(e.reason)));

        const mod: Cvc5Module = {
            arguments: [...args, '/input.smt2'],
            print: (l) => out.push(l),
            printErr: (l) => err.push(l),
            locateFile: (p) => baseUrl + p,
            preRun: [() => mod.FS?.writeFile('/input.smt2', problem)],
            instantiateWasm: (imports, receive) => {
                void (async () => {
                    const module = wasmModule ?? (await WebAssembly.compileStreaming(fetch(baseUrl + 'cvc5.wasm')));
                    const instance = await WebAssembly.instantiate(module, imports);
                    const exports: Record<string, unknown> = { ...instance.exports };
                    const main = exports['__main_argc_argv'] as ((argc: number, argv: number) => number) | undefined;
                    if (typeof main === 'function')
                        exports['__main_argc_argv'] = (argc: number, argv: number) => {
                            try {
                                const ret = main(argc, argv);
                                finish(ret);
                                return ret;
                            } catch (e) {
                                // proc_exit throws ExitStatus; anything else is a crash
                                const status = (e as { name?: string; status?: number } | null)?.status;
                                if ((e as { name?: string } | null)?.name === 'ExitStatus') finish(status ?? 0);
                                else finish(null, errText(e));
                                throw e;
                            }
                        };
                    receive({ exports: exports as WebAssembly.Exports });
                })().catch((e) => finish(null, errText(e)));
                return undefined;
            },
            // Called synchronously right before main: the timeout fires once main has returned.
            onRuntimeInitialized: () => void setTimeout(() => finish(null), 0),
            onAbort: (what) => finish(null, `Aborted(${String(what)})`),
        };
        ctx.Module = mod;
        // The official build only enables the `web` environment: present the worker as a window-less web page.
        Object.defineProperty(ctx, 'WorkerGlobalScope', { value: undefined, configurable: true });
        Object.defineProperty(ctx, 'window', { value: ctx, configurable: true });
        try {
            ctx.importScripts(baseUrl + 'cvc5.js');
        } catch (e) {
            finish(null, errText(e));
        }
    };
})();
