// Fake Carcara mimicking `check`, `elaborate` and `slice` output and exit codes.
// Like the real tool, `slice --sliced-output A B` writes the proof to A and the problem to B.
import { readFileSync, writeFileSync } from 'node:fs';

// Global flags come before the subcommand, as in the real CLI.
const argv = process.argv.slice(2);
while (argv[0]?.startsWith('--no-')) argv.shift();
const [cmd, ...rest] = argv;
if (cmd === '--version') {
    console.log('carcara 1.0.0 (fake)');
    process.exit(0);
}
const proofFile = rest[0];
const problemFile = rest[1];
const proof = readFileSync(proofFile, 'utf8');
const problem = readFileSync(problemFile, 'utf8');

if (proof.includes(';args')) {
    console.log(JSON.stringify(process.argv.slice(2)));
} else if (proof.includes(';sleep')) setTimeout(() => {}, 60_000);
else if (cmd === 'check') {
    if (proof.includes('bad-rule')) {
        console.error('[ERROR] unknown rule: bad-rule');
        console.log('invalid');
        process.exit(1);
    }
    console.log(proof.includes('(hole') || proof.includes(':rule hole') ? 'holey' : 'valid');
} else if (cmd === 'elaborate') {
    console.log(proof.includes(':rule hole') ? 'holey' : 'valid');
    console.log(proof.trimEnd().replace(/:rule resolution/g, ':rule th_resolution'));
} else if (cmd === 'slice') {
    const from = rest[rest.indexOf('--from') + 1];
    const out = rest.indexOf('--sliced-output');
    const lines = proof.split('\n').filter((l) => l.startsWith('(assume') || l.includes(`(step ${from} `));
    if (!lines.some((l) => l.includes(`(step ${from} `))) {
        console.error(`[ERROR] invalid slice id: ${from}`);
        process.exit(1);
    }
    const sliced = lines.join('\n') + '\n';
    if (out !== -1) {
        writeFileSync(rest[out + 1], sliced);
        writeFileSync(rest[out + 2], problem.split('\n').filter((l) => !l.startsWith('(check-sat)')).join('\n') + '(check-sat)\n(exit)\n');
    }
    console.log(sliced.trimEnd());
} else {
    console.error('unknown command');
    process.exit(2);
}
