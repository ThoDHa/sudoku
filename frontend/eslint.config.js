import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import sonarjs from 'eslint-plugin-sonarjs'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  // Ignore patterns - including test files that aren't in tsconfig
  { ignores: [
    'dist', 
    'node_modules', 
    '*.config.js', 
    '*.config.ts',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    'e2e/**/*',
  ]},
  
  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,
  
  // TypeScript project settings
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  
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
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      
      // TypeScript rules - strict but practical
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      
      // General best practices - forbid console.* in runtime code (use logger instead)
      // Test files are ignored at top level, so this only affects src/
      'no-console': 'error',
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
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
