// Classic worker running the unmodified Carcara Emscripten glue (wasm/carcara, MODULARIZE, EXIT_RUNTIME=1).
// The glue is loaded with importScripts and defines the global factory `createCarcara`.
// Glue hooks relied upon: Module.print, printErr, locateFile, instantiateWasm, FS.writeFile/readFile, callMain.
// The runtime is torn down when main() exits, so a worker serves exactly one run.
// No import/export on purpose: a classic worker must not be a module.
type CarcaraWorkerRequest = import('./carcaraWorkerTypes').CarcaraWorkerRequest;
type CarcaraWorkerMessage = import('./carcaraWorkerTypes').CarcaraWorkerMessage;

(() => {
    interface CarcaraModule {
        FS: { writeFile(path: string, data: string): void; readFile(path: string, opts: { encoding: 'utf8' }): string };
        callMain(args: string[]): number | undefined;
    }
    interface CarcaraOptions {
        print: (line: string) => void;
        printErr: (line: string) => void;
        locateFile: (path: string) => string;
        instantiateWasm?: (
            imports: WebAssembly.Imports,
            receive: (instance: WebAssembly.Instance) => void,
        ) => undefined;
    }

    const ctx = self as unknown as DedicatedWorkerGlobalScope & {
        createCarcara?: (opts: CarcaraOptions) => Promise<CarcaraModule>;
        importScripts(...urls: string[]): void;
    };

    const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

    ctx.onmessage = (ev: MessageEvent<CarcaraWorkerRequest>) => {
        ctx.onmessage = null;
        const { argv, files, outputs, baseUrl, wasmModule } = ev.data;
        const out: string[] = [];
        const err: string[] = [];
        let finished = false;
        let mod: CarcaraModule | undefined;

        const finish = (exitCode: number | null, error?: string) => {
            if (finished) return;
            finished = true;
            const read: Record<string, string | null> = {};
            for (const path of outputs) {
                try {
                    read[path] = mod ? mod.FS.readFile(path, { encoding: 'utf8' }) : null;
                } catch {
                    read[path] = null;
                }
            }
            const msg: CarcaraWorkerMessage = {
                type: 'done',
                exitCode,
                stdout: out.join('\n') + (out.length ? '\n' : ''),
                stderr: err.join('\n') + (err.length ? '\n' : ''),
                outputs: read,
                error,
            };
            ctx.postMessage(msg);
        };

        const run = async () => {
            ctx.importScripts(baseUrl + 'carcara.js');
            if (!ctx.createCarcara) throw new Error('Carcara glue did not define createCarcara');
            mod = await ctx.createCarcara({
                print: (l) => out.push(l),
                printErr: (l) => err.push(l),
                // The glue asks for its link name (carcara-<hash>.wasm); the build ships it as carcara.wasm
                locateFile: (p) => baseUrl + (p.endsWith('.wasm') ? 'carcara.wasm' : p),
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
            for (const f of files) mod.FS.writeFile(f.path, f.data);
            try {
                finish(mod.callMain(argv) ?? 0);
            } catch (e) {
                // exit(n) is thrown as an object with `.status`; anything else (a Rust panic aborts) is a crash
                const status = (e as { status?: unknown } | null)?.status;
                if (typeof status === 'number') finish(status);
                else finish(null, errText(e));
            }
        };
        run().catch((e) => finish(null, errText(e)));
    };
})();
