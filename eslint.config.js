import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results', 'tests/__screenshots__'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Arquivos de configuração CommonJS (ex.: lighthouserc.cjs).
    files: ['**/*.cjs'],
    languageOptions: { globals: { module: 'writable', require: 'readonly' } },
  },
  {
    // Fixtures do Playwright usam `use(...)` e `async ({}, use)`, que o lint de React confunde com hooks.
    files: ['tests/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off', 'no-empty-pattern': 'off' },
  }
);
