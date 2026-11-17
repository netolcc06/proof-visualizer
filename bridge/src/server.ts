import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createBridge } from './app.ts';
import { loadConfigFromDisk } from './config.ts';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };

let config;
try {
    config = loadConfigFromDisk(root);
} catch (e) {
    console.error((e as Error).message);
    process.exit(1);
}

const server = createBridge(config, pkg.version);
server.listen(config.port, config.host, () => {
    console.log(`proof-visualizer bridge ${pkg.version} listening on http://${config.host}:${config.port}`);
    for (const name of ['cvc5', 'verit', 'carcara'] as const) {
        const t = config.tools[name];
        console.log(`  ${name}: ${t ? [t.command, ...t.args].join(' ') : 'not configured'}`);
    }
});
