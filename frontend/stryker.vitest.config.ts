import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

// This config uses react() with NO babel/RC preset, so the React Compiler is
// off in the Stryker sandbox (consistent with the coverage model: Stryker
// mutates source as written, not RC-compiled output). Set VITE_SKIP_RC=1 so
// tests tagged with .skipIf(process.env.VITE_SKIP_RC) — the RC-dependent
// identity-stability tests whose assertions only hold when RC is firing —
// skip in the sandbox just as they do in the coverage run. Without this, the
// initial test run fails on those tests and StrykerJS aborts before mutation
// testing begins.
process.env.VITE_SKIP_RC = '1'

export default defineConfig({
  plugins: [react()],
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

