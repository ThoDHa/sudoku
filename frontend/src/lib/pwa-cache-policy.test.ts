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

  it('does not pin the wasm behind a CacheFirst runtime rule (precache handles offline)', () => {
    expect(config).not.toMatch(/cacheName:\s*'wasm-cache'/)
  })

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
})
