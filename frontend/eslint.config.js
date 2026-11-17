import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
    { ignores: ['dist', 'node_modules', 'public', 'scripts'] },
    {
        files: ['**/*.{ts,tsx}'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2023,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            // Legacy code: keep these visible without failing the build
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/refs': 'warn',
            'react-hooks/immutability': 'warn',
            'react-hooks/exhaustive-deps': 'warn',
            'react-hooks/purity': 'warn',
            'react-hooks/preserve-manual-memoization': 'warn',
            'react-hooks/static-components': 'warn',
            'react-hooks/use-memo': 'warn',
            'react-hooks/globals': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
            '@typescript-eslint/no-unused-expressions': 'warn',
            'no-useless-assignment': 'warn',
        },
    },
    prettierRecommended,
    {
        rules: {
            'prettier/prettier': ['error', { endOfLine: 'auto' }],
        },
    },
);
