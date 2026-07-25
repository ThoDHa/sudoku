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
      // Test-infrastructure helpers (mocks/fixtures) are test-only, like the
      // *.test.ts files above; not shipped, and they legitimately use `any`
      // for mock return shapes.
      'src/test-utils/**',
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
      // react-hooks recommended-latest (compiler-aware, FE-2-2b). Inlined via
      // .rules because the shipped shareable config is in legacy eslintrc
      // format (plugins as a string array), not flat config. With the React
      // Compiler wired (FE-1-1), this gates the compiler-era rules too.
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // FE-2-2b staged react-hooks compiler rules. The recommended-latest
      // config is enabled, but these three compiler-era rules surface findings
      // that need careful, behavior-risky effect/ref restructuring (not a
      // rush job). Tracked for follow-up:
      // - set-state-in-effect (19): setState in effects — often a legitimate
      //   sync pattern; the React Compiler auto-memoizes many of these.
      // - refs (11): ref access during render — genuine anti-pattern, needs
      //   per-site fixes.
      // - immutability (3): values the compiler treats as immutable.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      // preserve-manual-memoization: fires when the compiler cannot preserve
      // existing useMemo/useCallback/memo. The codebase has 224 manual-memo
      // sites; removing the ones the compiler bails on is FE-1-2's job, not
      // FE-2-2b's config-enable.
      'react-hooks/preserve-manual-memoization': 'off',

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

      // restrict-template-expressions: allow number interpolation (safe,
      // idiomatic in log/UI strings); only flag types that could print
      // "undefined"/"null" or hide a real coercion bug (undefined, null,
      // never, objects).
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      // strictTypeChecked rollout is COMPLETE: every type-checked rule is
      // enforced except the three permanent justified-OFF cases below. The
      // staged off-block that accompanied the incremental adoption (FE-2-1)
      // has been fully retired — every staged rule was re-enabled once its
      // findings were cleared.

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
      // no-unnecessary-condition: this codebase deliberately keeps defensive
      // guards that the rule's type-level analysis flags as unnecessary but
      // that protect real runtime paths where types diverge from reality —
      // SSR `typeof window === 'undefined'` checks in the WASM loader (several
      // documented via Stryker disable comments as intentional), presence
      // checks on type-narrowed values, and optional chains over values the
      // DOM lib types as always-defined. Stripping them would remove genuine
      // safety, so the rule is a poor fit here.
      '@typescript-eslint/no-unnecessary-condition': 'off',
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
