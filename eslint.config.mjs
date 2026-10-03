// Repo-wide lint config (lint only : no formatter, so no whole-repo format diff).
// Rules are tuned so the current codebase passes cleanly; tighten incrementally.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.build/**',
      '**/release/**',
      '**/target/**',
      '**/coverage/**',
      'scripts/drivers/**',
      'apps/*/build/**',
      'packages/*/src/vendor/**',
      // Browser-injected scripts (port from upstream, not our code to lint)
      'packages/html2docx/src/browser/**',
      // Reference source kept locally for porting; upstream's own lint rules
      // and upstream branding, so neither of our gates reads it.
      'assets/genoffice-0.11.0/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase interoperates with untyped vendor APIs (Univer, pptxgenjs,
      // Electron IPC payloads); `any` at those boundaries is deliberate.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // Empty catch = deliberate fail-open; other empty blocks still flagged.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // tsc already checks undefined identifiers with full type info; eslint's
    // no-undef false-positives on TS-only constructs.
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    // Classic hooks rules only; the React-Compiler rule set (refs, purity,
    // immutability, …) is not adopted yet.
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Plain JS build/tool scripts run in Node without type info.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // The html2docx generation layer was ported verbatim from untyped JS and is
    // being typed file by file, without logic changes. Every one of those files
    // carries a whole-file type-check opt-out plus that note, which is what
    // keeps strict consumers (apps/html, apps/shell) building against it today.
    // The ban is relaxed only here, and only for that directive, so a new
    // whole-file opt-out or a new @ts-ignore anywhere else is still an error.
    files: ['packages/html2docx/src/generate.ts', 'packages/html2docx/src/generate/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': false }],
    },
  },
)
