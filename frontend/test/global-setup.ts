import { cleanAllureResults } from './clean-allure-results'

// Vitest global setup: runs once per vitest process, before any test file.
export default function setup(): void {
  cleanAllureResults()
}
