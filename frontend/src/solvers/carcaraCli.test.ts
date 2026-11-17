import { describe, expect, it } from 'vitest';
import {
    CARCARA_DEFAULT_ARGS,
    EXTERNAL_TOOL_NOTE,
    buildCarcaraArgs,
    buildCarcaraArgv,
    looksLikeProblem,
    needsExternalTool,
    parseCheckOutput,
    parseElaborateOutput,
    validateCarcaraUserArgs,
} from './carcaraCli';

// Pins the same behaviour as bridge/test/unit.test.ts, since the bridge keeps its own copy of this logic.
describe('carcara user args', () => {
    it('denies flags that run programs or touch files, in any spelling', () => {
        for (const bad of [
            '-x',
            '-ix',
            '--sat-solver=sh',
            '--rare-file=/etc/passwd',
            '--sliced-output',
            '--from=1',
            '-d',
        ])
            expect(() => validateCarcaraUserArgs([bad]), bad).toThrow('not allowed');
        expect(() => validateCarcaraUserArgs(['--smt-solver', 'cvc5'])).toThrow('--smt-solver');
    });

    it('lets other flags through', () => {
        expect(validateCarcaraUserArgs(['-i', '--allowed-rules', 'foo', 'bar'])).toEqual([
            '-i',
            '--allowed-rules',
            'foo',
            'bar',
        ]);
        expect(validateCarcaraUserArgs(undefined)).toEqual([]);
    });
});

describe('carcara argv', () => {
    it('lets a user flag replace the default of the same name', () => {
        expect(buildCarcaraArgs(['--allow-int-real-subtyping'], ['-i'])).toEqual(['--allow-int-real-subtyping', '-i']);
        expect(buildCarcaraArgs(['--allow-int-real-subtyping'], ['--allow-int-real-subtyping'])).toEqual([
            '--allow-int-real-subtyping',
        ]);
        expect(buildCarcaraArgs(['--x=1'], ['--x=2'])).toEqual(['--x=2']);
    });

    it('check: --no-color before the subcommand, options after the positionals', () => {
        expect(buildCarcaraArgv('check', ['/p', '/q'], { rarePath: '/r' })).toEqual([
            '--no-color',
            'check',
            '/p',
            '/q',
            '--rare-file',
            '/r',
            ...CARCARA_DEFAULT_ARGS,
        ]);
        expect(buildCarcaraArgv('check', ['/p', '/q'])).toEqual([
            '--no-color',
            'check',
            '/p',
            '/q',
            '--allow-int-real-subtyping',
        ]);
    });

    it('elaborate and slice also turn term sharing off', () => {
        for (const cmd of ['elaborate', 'slice'] as const)
            expect(buildCarcaraArgv(cmd, ['/p'], { userArgs: ['-i'] })).toEqual([
                '--no-color',
                '--no-print-with-sharing',
                cmd,
                '/p',
                '--allow-int-real-subtyping',
                '-i',
            ]);
    });
});

describe('carcara output', () => {
    it('parses the check verdict', () => {
        expect(parseCheckOutput('valid\n')).toEqual({ valid: true, holey: false });
        expect(parseCheckOutput('holey\n')).toEqual({ valid: true, holey: true });
        expect(parseCheckOutput('invalid\n')).toEqual({ valid: false, holey: false });
        expect(parseCheckOutput('')).toEqual({ valid: false, holey: false });
    });

    it('strips the status line of elaborate', () => {
        expect(parseElaborateOutput('valid\n(assume a0 true)\n', 0)).toBe('(assume a0 true)\n');
        expect(parseElaborateOutput('holey\n(assume a0 true)\n', 0)).toBe('(assume a0 true)\n');
        expect(parseElaborateOutput('valid\n(assume a0 true)\n', 1)).toBeNull();
        expect(parseElaborateOutput('valid\n', 0)).toBeNull();
        expect(parseElaborateOutput('(assume a0 true)\n', 0)).toBe('(assume a0 true)\n');
    });

    it('tells the sliced problem from the sliced proof', () => {
        expect(looksLikeProblem('(set-logic QF_UF)\n(assert p)\n(check-sat)\n')).toBe(true);
        expect(looksLikeProblem('(assume a0 p)\n(step t1 (cl) :rule resolution)\n')).toBe(false);
    });

    it('spots steps that need an external solver', () => {
        expect(needsExternalTool('(step t1 (cl p) :rule lia_generic)')).toBe(true);
        expect(needsExternalTool('(step t1 (cl p) :rule  lia_generic :args (1))')).toBe(true);
        expect(needsExternalTool('(step t1 (cl p) :rule resolution)')).toBe(false);
        expect(needsExternalTool('(assume lia_generic p)')).toBe(false);
        expect(EXTERNAL_TOOL_NOTE).toContain('lia_generic');
    });
});
