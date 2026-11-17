// Copies the Carcara wasm build (wasm/carcara, `make carcara-wasm`) into public/carcara/ together with its licence
// texts, plus the bundled cvc5 RARE rules (bridge/rare/cvc5-rewrites.rare), which the in-browser Carcara uses as its
// default RARE file.
// Env CARCARA_WASM_DIR: source directory, default ../wasm/carcara/dist (relative to frontend/).
// Env CARCARA_RARE_FILE: RARE file, default ../bridge/rare/cvc5-rewrites.rare.
// A missing build is not an error: the app then shows the in-browser Carcara as unavailable.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'carcara');
const srcDir = resolve(root, process.env.CARCARA_WASM_DIR || '../wasm/carcara/dist');
const rareFile = resolve(root, process.env.CARCARA_RARE_FILE || '../bridge/rare/cvc5-rewrites.rare');
const REQUIRED = ['carcara.js', 'carcara.wasm'];

if (!REQUIRED.every((f) => existsSync(join(srcDir, f)))) {
    console.warn(
        `[fetch-carcara] Carcara wasm not built: run \`make carcara-wasm\` (looked in ${srcDir}); the option will be unavailable`,
    );
    rmSync(outDir, { recursive: true, force: true });
    process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const licences = readdirSync(srcDir).filter((f) => /^(LICENSE|NOTICE|GMP-)/.test(f));
for (const f of [...REQUIRED, ...licences]) copyFileSync(join(srcDir, f), join(outDir, f));
let note = '';
if (existsSync(rareFile)) copyFileSync(rareFile, join(outDir, 'cvc5-rewrites.rare'));
else {
    rmSync(join(outDir, 'cvc5-rewrites.rare'), { force: true });
    note = ' (RARE file not found: cvc5 rare_rewrite steps will need a custom RARE file)';
    console.warn(`[fetch-carcara] ${rareFile} not found${note}`);
}
console.log(`[fetch-carcara] copied ${REQUIRED.length} files and ${licences.length} licence files from ${srcDir} to public/carcara/`);
