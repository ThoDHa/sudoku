// Mock logger before importing modules that use it
vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CACHE_VERSION, CACHE_KEY, checkCacheVersion, clearAllCaches } from './cache-version'

describe('cache-version', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('derives CACHE_VERSION from the build commit hash so every deploy busts the cache', () => {
    // A hardcoded version string was never bumped per deploy, so checkCacheVersion
    // never fired for returning users. Tying it to the injected commit hash means a
    // new deploy always changes the version and forces a one-time cache clear.
    expect(CACHE_VERSION).toBe(__COMMIT_HASH__)
    expect(CACHE_VERSION.length).toBeGreaterThan(0)
  })

  it('clears caches and stores the new version when the stored version differs', async () => {
    localStorage.setItem(CACHE_KEY, 'a-stale-version')
    const cleared = await checkCacheVersion()
    expect(cleared).toBe(true)
    expect(localStorage.getItem(CACHE_KEY)).toBe(CACHE_VERSION)
  })

  it('does nothing when the stored version already matches', async () => {
    localStorage.setItem(CACHE_KEY, CACHE_VERSION)
    const cleared = await checkCacheVersion()
    expect(cleared).toBe(false)
    expect(localStorage.getItem(CACHE_KEY)).toBe(CACHE_VERSION)
  })

  it('deletes every Cache Storage entry when the version changed and the caches API exists', async () => {
    const deleted: string[] = []
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['app-assets', 'images-cache']),
      delete: vi.fn((name: string) => {
        deleted.push(name)
        return Promise.resolve(true)
      }),
    })
    localStorage.setItem(CACHE_KEY, 'a-stale-version')

    const cleared = await checkCacheVersion()

    expect(cleared).toBe(true)
    expect(deleted).toEqual(['app-assets', 'images-cache'])
  })

  it('logs the version transition and the cache-clear messages with their full text', async () => {
    const { logger } = await import('./logger')
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['app-assets']),
      delete: vi.fn().mockResolvedValue(true),
    })
    localStorage.setItem(CACHE_KEY, 'a-stale-version')

    await checkCacheVersion()

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cache version changed'))
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Cleared all caches due to version change'),
    )
  })

  it('returns false and logs a warning when localStorage throws during the version check', async () => {
    const { logger } = await import('./logger')
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    const cleared = await checkCacheVersion()

    expect(cleared).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('clearAllCaches', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clears every Cache Storage entry, unregisters service workers, and drops the stored version', async () => {
    const deletedCaches: string[] = []
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['app-assets', 'images-cache']),
      delete: vi.fn((name: string) => {
        deletedCaches.push(name)
        return Promise.resolve(true)
      }),
    })
    const unregistered: string[] = []
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([
          { unregister: () => Promise.resolve(unregistered.push('sw-a') && true) },
          { unregister: () => Promise.resolve(unregistered.push('sw-b') && true) },
        ]),
      },
    })
    localStorage.setItem(CACHE_KEY, 'stale')

    await clearAllCaches()

    expect(deletedCaches).toEqual(['app-assets', 'images-cache'])
    expect(unregistered).toEqual(['sw-a', 'sw-b'])
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('still removes the stored version when the caches API and serviceWorker API are absent', async () => {
    localStorage.setItem(CACHE_KEY, 'stale')

    await clearAllCaches()

    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('rethrows and logs an error when clearing fails', async () => {
    const { logger } = await import('./logger')
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    await expect(clearAllCaches()).rejects.toThrow('SecurityError')
    expect(logger.error).toHaveBeenCalled()

    spy.mockRestore()
  })
})
