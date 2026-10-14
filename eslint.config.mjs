import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'out/**', '.vscode-test/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/webview/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['vscode', 'node:*', '../extension/*', '../webview/*'] },
      ],
    },
  },
);
