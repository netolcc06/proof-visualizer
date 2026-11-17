// Classic worker running the unmodified veriT Emscripten glue (wasm/verit, MODULARIZE, EXIT_RUNTIME=1).
// The glue is loaded with importScripts and defines the global factory `createVeriT`; no environment shims needed.
// Glue hooks relied upon: Module.print, printErr, locateFile, instantiateWasm, FS.writeFile, callMain.
// veriT keeps global state, so a worker serves exactly one run. `--max-time` does nothing in wasm: the caller
// terminates the worker on timeout.
// No import/export on purpose: a classic worker must not be a module.
type VeritWorkerRequest = import('./veritWorkerTypes').VeritWorkerRequest;
type VeritWorkerMessage = import('./veritWorkerTypes').VeritWorkerMessage;

(() => {
    interface VeritModule {
        FS: { writeFile(path: string, data: string): void };
        callMain(args: string[]): number | undefined;
    }
    interface VeritOptions {
        print: (line: string) => void;
        printErr: (line: string) => void;
        locateFile: (path: string) => string;
        instantiateWasm?: (
            imports: WebAssembly.Imports,
            receive: (instance: WebAssembly.Instance) => void,
        ) => undefined;
    }

    const ctx = self as unknown as DedicatedWorkerGlobalScope & {
        createVeriT?: (opts: VeritOptions) => Promise<VeritModule>;
        importScripts(...urls: string[]): void;
    };

    const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

    ctx.onmessage = (ev: MessageEvent<VeritWorkerRequest>) => {
        ctx.onmessage = null;
        const { problem, args, baseUrl, wasmModule } = ev.data;
        const out: string[] = [];
        const err: string[] = [];
        let finished = false;

        const finish = (exitCode: number | null, error?: string) => {
            if (finished) return;
            finished = true;
            const msg: VeritWorkerMessage = {
                type: 'done',
                exitCode,
                stdout: out.join('\n') + (out.length ? '\n' : ''),
                stderr: err.join('\n') + (err.length ? '\n' : ''),
                error,
            };
            ctx.postMessage(msg);
        };

        const run = async () => {
            ctx.importScripts(baseUrl + 'verit.js');
            if (!ctx.createVeriT) throw new Error('veriT glue did not define createVeriT');
            const mod = await ctx.createVeriT({
                print: (l) => out.push(l),
                printErr: (l) => err.push(l),
                locateFile: (p) => baseUrl + p,
                // Reuse the module compiled once on the main thread.
                ...(wasmModule && {
                    instantiateWasm: (imports, receive) => {
                        void WebAssembly.instantiate(wasmModule, imports).then(receive, (e) =>
                            finish(null, errText(e)),
                        );
                        return undefined;
                    },
                }),
            });
            mod.FS.writeFile('/input.smt2', problem);
            try {
                finish(mod.callMain([...args, '/input.smt2']) ?? 0);
            } catch (e) {
                // exit(n) is thrown as an object with `.status`; anything else is a crash
                const status = (e as { status?: unknown } | null)?.status;
                if (typeof status === 'number') finish(status);
                else finish(null, errText(e));
            }
        };
        run().catch((e) => finish(null, errText(e)));
    };
})();
