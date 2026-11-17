// Re-download cvc5's Alethe RARE rewrite rules for Carcara (--rare-file).
// Usage: npm run fetch:rare [-- --ref <sha|branch>]
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const i = process.argv.indexOf('--ref');
const ref = i !== -1 ? process.argv[i + 1] : 'main';
if (!ref) throw new Error('--ref needs a value');

const api = `https://api.github.com/repos/cvc5/cvc5/commits/${encodeURIComponent(ref)}`;
const sha = ((await (await fetch(api, { headers: { 'User-Agent': 'pv-bridge' } })).json())).sha;
if (!sha) throw new Error(`cannot resolve cvc5 ref ${ref}`);

const url = `https://raw.githubusercontent.com/cvc5/cvc5/${sha}/proofs/alethe/rewrites.eo`;
const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);

const header = [
    '; RARE rules used by cvc5 Alethe proofs (for Carcara --rare-file).',
    `; Source: https://github.com/cvc5/cvc5/blob/${sha}/proofs/alethe/rewrites.eo`,
    '; License: BSD 3-Clause (cvc5). Refresh with: npm run fetch:rare',
    '',
].join('\n');
const out = path.resolve(import.meta.dirname, '..', 'rare', 'cvc5-rewrites.rare');
writeFileSync(out, header + (await res.text()));
console.log(`wrote ${out} (cvc5 ${sha})`);
