import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import sonarjs from 'eslint-plugin-sonarjs'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  // Ignore patterns - including test files that aren't in tsconfig
  {
    ignores: [
      'dist',
      'node_modules',
      '*.config.js',
      '*.config.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'e2e/**/*',
    ],
  },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,

  // TypeScript project settings
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Accessibility (FE-2-2): jsx-a11y recommended flat config catches the whole
  // a11y class automatically going forward, as a prevention layer under the
  // already-completed A11Y-1/A11Y-2 work.
  jsxA11y.flatConfigs.recommended,

  // React rules
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React hooks - keep rules of hooks, disable overly strict ones
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // TypeScript rules - strict but practical
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // General best practices - forbid console.* in runtime code (use logger instead)
      // Test files are ignored at top level, so this only affects src/
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',

      // FE-2-1 staged strictTypeChecked rollout. strictTypeChecked is now the
      // base, but the high-volume type-checked rules are temporarily OFF until
      // each rule's findings are cleared in a follow-up commit; every rule here
      // is re-enabled the moment its backlog is fixed. no-floating-promises and
      // no-misused-promises are already enforced (the async-correctness fixes
      // landed with this change). Tracked in FE-2-1.
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',

      // Permanent, justified OFF (not staged rollout debt):
      // require-await: the flagged functions are async-by-contract — they carry
      // a Promise<T> signature for callers (.then/await) and rely on async's
      // throw->rejection wrapping, with no await expression today. Removing
      // async would either break callers or change throw semantics for no gain.
      '@typescript-eslint/require-await': 'off',
      // no-implied-eval: wasm.worker.ts uses `new Function(scriptText)()` as the
      // documented fallback to load wasm_exec.js in module workers, where
      // importScripts is unavailable. The worker prefers importScripts and only
      // reaches this path when it is absent; there is no eval-free alternative
      // for executing a fetched script string in a module worker.
      '@typescript-eslint/no-implied-eval': 'off',
    },
  },

  // SonarJS complexity-focused rules (subset of recommended; not the full noisy set)
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['warn', 20],
      'sonarjs/no-unused-collection': 'warn',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-element-overwrite': 'warn',
      'sonarjs/no-duplicate-string': 'warn',
      'sonarjs/no-small-switch': 'warn',
    },
  },

  // Disable formatting rules that conflict with Prettier - MUST be last
  eslintConfigPrettier,
)
