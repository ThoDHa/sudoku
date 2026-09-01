import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Guard against reintroducing the Workbox caching policy that served returning
// browsers stale assets (BUG-8): a CacheFirst 30-day wasm pin froze the solver,
// a 1s network timeout served stale bundles, and 'prompt' mode never activated
// the fresh worker. This asserts the freshness-critical invariants directly on
// the config source so a well-meaning battery optimization can't silently undo them.
// The unit suite always runs from the frontend/ directory (see Makefile).
const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf-8')

describe('PWA cache policy', () => {
  it('uses autoUpdate so a new deploy takes over returning browsers', () => {
    expect(config).toMatch(/registerType:\s*'autoUpdate'/)
    expect(config).not.toMatch(/registerType:\s*'prompt'/)
  })

  // Source-text guard: vite-plugin-pwa generates the SW at build time and the
  // built artifact is never loaded in unit tests, so this catches the BUG-8
  // regression (a 'wasm-cache' CacheFirst runtime rule) at the config level.
  // The complementary positive assertion (wasm in globPatterns) is the test below.
  it('does not pin the wasm behind a CacheFirst runtime rule (precache handles offline)', () => {
    expect(config).not.toMatch(/cacheName:\s*'wasm-cache'/)
  })

  // Source-text guard: asserts the NetworkFirst timeout was raised from the
  // BUG-8 1s value. Built-SW timeout behavior under a real network is not
  // tested here; a build-time integration test would be needed for that.
  it('does not fall back to a stale cache after a 1-second network timeout', () => {
    expect(config).not.toMatch(/networkTimeoutSeconds:\s*1\b/)
  })

  it('precacheaches the app shell (HTML/JS/CSS), not just the wasm (PWA-1)', () => {
    const globLine = config.match(/globPatterns:\s*\[([^\]]*)\]/)
    expect(globLine).not.toBeNull()
    expect(globLine?.[1]).toContain('html')
    expect(globLine?.[1]).toContain('js')
    expect(globLine?.[1]).toContain('css')
    expect(globLine?.[1]).toContain('wasm')
  })

  it('serves the precached shell for offline SPA navigations with /api/ denied (PWA-1)', () => {
    expect(config).toMatch(/navigateFallback:\s*'index\.html'/)
    const denyLine = config.match(/navigateFallbackDenylist:\s*\[([^\]]*)\]/)
    expect(denyLine).not.toBeNull()
    expect(denyLine?.[1]).toContain('api')
  })

  // BUG-27: the navigateFallback answered /reports/ and /test-report/ navigations
  // with the precached app shell, so anyone who had visited the game (registering
  // the SW) saw the homepage instead of the deployed quality reports. The deny
  // patterns must match the real deployed pathnames, which carry the /sudoku/
  // base prefix; an anchored /^\/reports\// passes a text search and still never
  // fires. These assertions evaluate the literal patterns from the config source
  // against real pathnames, so an anchor regression or a dropped entry fails here.
  it('denies the navigation fallback for the deployed report sites, under the base path', () => {
    const denyLine = config.match(/navigateFallbackDenylist:\s*\[([^\]]*)\]/)
    const literals =
      denyLine?.[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? []
    const patterns = literals.map((lit) => {
      const m = lit.match(/^\/(.*)\/[a-z]*$/)
      expect(m).not.toBeNull()
      return new RegExp(m![1]!)
    })
    const matches = (pathname: string) => patterns.some((re) => re.test(pathname))
    expect(matches('/sudoku/reports/')).toBe(true)
    expect(matches('/sudoku/test-report/')).toBe(true)
    expect(matches('/api/solve')).toBe(true)
    expect(matches('/reports/')).toBe(true)
    // The SPA's own routes must stay fallback-eligible.
    expect(matches('/sudoku/')).toBe(false)
    expect(matches('/sudoku/daily-2026-08-31')).toBe(false)
    expect(matches('/sudoku/c/eyJzZWVkIjoxfQ')).toBe(false)
  })
})
