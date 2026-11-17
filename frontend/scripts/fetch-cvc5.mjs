// Fetches the official cvc5 wasm release into public/cvc5/ (glue is used unmodified).
// Env CVC5_WASM_DIR: copy cvc5.js + cvc5.wasm from a local directory instead of downloading.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'cvc5');
const WANTED = ['cvc5.js', 'cvc5.wasm'];

const fail = (msg) => {
    console.error(`[fetch-cvc5] ${msg}`);
    process.exit(1);
};

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).config?.cvc5Version;
if (!version) fail('config.cvc5Version is missing in package.json');

const versionFile = join(outDir, 'VERSION');
const upToDate = () =>
    existsSync(versionFile) &&
    readFileSync(versionFile, 'utf8').trim() === version &&
    WANTED.every((f) => existsSync(join(outDir, f)));

if (upToDate()) {
    console.log(`[fetch-cvc5] cvc5 ${version} already present`);
    process.exit(0);
}

/** Minimal ZIP reader (central directory; stored + deflate; ZIP64). Returns name -> Buffer. */
function readZip(buf, wanted) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('not a ZIP file (end of central directory not found)');
    let count = buf.readUInt16LE(eocd + 10);
    let cdOffset = buf.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || count === 0xffff) {
        const loc = eocd - 20;
        if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new Error('ZIP64 locator not found');
        const z64 = Number(buf.readBigUInt64LE(loc + 8));
        if (buf.readUInt32LE(z64) !== 0x06064b50) throw new Error('ZIP64 end record not found');
        count = Number(buf.readBigUInt64LE(z64 + 32));
        cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
    }
    const files = {};
    let p = cdOffset;
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt ZIP central directory');
        const method = buf.readUInt16LE(p + 10);
        let csize = buf.readUInt32LE(p + 20);
        let usize = buf.readUInt32LE(p + 24);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        let lho = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        if (csize === 0xffffffff || usize === 0xffffffff || lho === 0xffffffff) {
            let e = p + 46 + nameLen;
            const end = e + extraLen;
            while (e + 4 <= end) {
                const id = buf.readUInt16LE(e);
                const size = buf.readUInt16LE(e + 2);
                if (id === 0x0001) {
                    let q = e + 4;
                    if (usize === 0xffffffff) ((usize = Number(buf.readBigUInt64LE(q))), (q += 8));
                    if (csize === 0xffffffff) ((csize = Number(buf.readBigUInt64LE(q))), (q += 8));
                    if (lho === 0xffffffff) lho = Number(buf.readBigUInt64LE(q));
                }
                e += 4 + size;
            }
        }
        p += 46 + nameLen + extraLen + commentLen;
        const base = name.split('/').pop();
        if (!wanted.includes(base) || name.endsWith('/')) continue;
        if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error(`corrupt local header for ${name}`);
        const dataStart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
        const raw = buf.subarray(dataStart, dataStart + csize);
        let data;
        if (method === 0) data = raw;
        else if (method === 8) data = inflateRawSync(raw);
        else throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
        if (data.length !== usize) throw new Error(`size mismatch for ${name}`);
        files[base] = data;
    }
    return files;
}

try {
    mkdirSync(outDir, { recursive: true });
    const localDir = process.env.CVC5_WASM_DIR;
    if (localDir) {
        for (const f of WANTED) {
            const src = join(resolve(localDir), f);
            if (!existsSync(src)) fail(`CVC5_WASM_DIR: ${src} not found`);
            copyFileSync(src, join(outDir, f));
        }
        console.log(`[fetch-cvc5] copied cvc5 files from ${localDir}`);
    } else {
        const url = `https://github.com/cvc5/cvc5/releases/download/cvc5-${version}/cvc5-Wasm.zip`;
        console.log(`[fetch-cvc5] downloading ${url}`);
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) fail(`download failed: HTTP ${res.status} ${res.statusText} (${url})`);
        const files = readZip(Buffer.from(await res.arrayBuffer()), WANTED);
        for (const f of WANTED) {
            if (!files[f]) fail(`${f} not found inside cvc5-Wasm.zip`);
            writeFileSync(join(outDir, f), files[f]);
        }
    }
    writeFileSync(versionFile, `${version}\n`);
    console.log(`[fetch-cvc5] cvc5 ${version} ready in public/cvc5/`);
} catch (err) {
    fail(`${err instanceof Error ? err.message : err}`);
}
