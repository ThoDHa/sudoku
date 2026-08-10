import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { pwaPlugins } from './vite.config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const getCommitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// Stryker runs vitest with its root inside a sandbox copy of the project
// (.stryker-tmp/sandbox-*/). node_modules there is a symlink back to the real
// frontend dir, which resolves OUTSIDE the sandbox root. Vite refuses to serve
// files outside root, which breaks loading of setup files and node_modules
// imports. Allow the real frontend dir explicitly.
const realNodeModules = fs.realpathSync(path.resolve(dirname, 'node_modules'))
const realFrontendRoot = path.dirname(realNodeModules)

// RC must be ON during Stryker's test execution: after FE-7-SWEEP removed ~92
// useCallback sites, the unmemoized functions cause effect cascades and test
// failures when RC is off. Stryker mutates the source files BEFORE RC's babel
// transform runs, so mutations still target the original code. RC only affects
// how the (already-mutated) code executes during the test run.
//
// VITE_SKIP_RC must ALSO be set: Stryker's instrumentation adds coverage
// tracking that changes the AST enough to prevent RC from memoizing function
// identities. The identity-stability tests (handler stability blocks) cannot
// pass under instrumentation regardless of RC, so they must be skipped via
// the same .skipIf(process.env.VITE_SKIP_RC) guard they already use.
process.env.VITE_SKIP_RC = '1'
const reactCompilerAllEnvs = (() => {
  const preset = reactCompilerPreset({ target: '19' })
  return { ...preset, rolldown: { ...preset.rolldown, applyToEnvironmentHook: () => true } }
})()

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerAllEnvs] }),
    // Shared with vite.config.ts, not copied: this config must resolve
    // virtual:pwa-register the same way the normal suite does, or the three
    // tests that reach pwaRegistration.ts through a component fail to load.
    ...pwaPlugins,
  ],
  define: {
    __COMMIT_HASH__: JSON.stringify(getCommitHash()),
  },
  worker: {
    format: 'es',
  },
  server: {
    fs: {
      allow: [dirname, realFrontendRoot],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    fileParallelism: false,
    // Drop allure-vitest/setup for mutation runs: allure is a reporting layer
    // for full-suite runs (make report), not needed under Stryker, and its
    // node_modules path triggers the out-of-root serving issue above.
    setupFiles: ['./test/test-setup.ts'],
  },
})

