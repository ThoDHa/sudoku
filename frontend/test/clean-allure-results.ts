import { rmSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Reset ./allure-results at the start of a test run.
 *
 * The Allure reporters (allure-vitest, allure-playwright) only ever append
 * UUID-named result files, so without a reset the directory grows without
 * bound and eventually exhausts file-watcher and tooling limits. Clearing at
 * run start bounds it to a single run's output and keeps every report
 * describing exactly one run.
 *
 * ALLURE_SKIP_CLEAN (any non-empty value) skips the reset: aggregate make
 * targets (`make test`, `make check-full`) clean once up front and set it so
 * consecutive suites combine into one result set.
 */
export function cleanAllureResults(): void {
  if (process.env['ALLURE_SKIP_CLEAN']) return
  const resultsDir = resolve('allure-results')
  try {
    rmSync(resultsDir, { recursive: true, force: true })
    mkdirSync(resultsDir, { recursive: true })
  } catch (error) {
    throw new Error(
      `Cannot reset ${resultsDir} (root-owned leftovers from an old Docker test run? run \`make allure-clean\`): ${String(error)}`,
    )
  }
}
