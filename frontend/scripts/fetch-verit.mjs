// Copies the veriT wasm build (wasm/verit, `make verit-wasm`) into public/verit/ together with its licence texts.
// Env VERIT_WASM_DIR: source directory, default ../wasm/verit/dist (relative to frontend/).
// A missing build is not an error: the app then shows the veriT wasm option as unavailable.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'verit');
const srcDir = resolve(root, process.env.VERIT_WASM_DIR || '../wasm/verit/dist');
const REQUIRED = ['verit.js', 'verit.wasm'];

if (!REQUIRED.every((f) => existsSync(join(srcDir, f)))) {
    console.warn(`[fetch-verit] veriT wasm not built: run \`make verit-wasm\` (looked in ${srcDir}); the option will be unavailable`);
    rmSync(outDir, { recursive: true, force: true });
    process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const licences = readdirSync(srcDir).filter((f) => /^(LICENSE|GMP-)/.test(f));
for (const f of [...REQUIRED, ...licences]) copyFileSync(join(srcDir, f), join(outDir, f));
console.log(`[fetch-verit] copied ${REQUIRED.length} files and ${licences.length} licence files from ${srcDir} to public/verit/`);
