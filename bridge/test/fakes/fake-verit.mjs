// Fake veriT: unsat + flat Alethe proof on stdout (with --proof=-), mimicking the real CLI output shape.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.includes('--version')) {
    console.log('veriT 2021.06.2-rmx (fake)');
    process.exit(0);
}
if (args.includes('--dump-args')) {
    // not reachable via the API; kept for debugging
    console.log(JSON.stringify(args));
}
const file = args[args.length - 1];
const problem = readFileSync(file, 'utf8');
if (problem.includes(';sleep')) setTimeout(() => {}, 60_000);
else if (problem.includes(';args')) {
    console.log('unsat');
    console.log(`(assume a0 true)\n; args ${JSON.stringify(args.slice(0, -1))}\n(step t1 (cl) :rule false)`);
} else if (problem.includes('(assert false)')) {
    console.log('unsat');
    console.log('(assume h1 false)\n(step t1 (cl) :rule false :premises (h1))');
} else {
    console.log('sat');
}
