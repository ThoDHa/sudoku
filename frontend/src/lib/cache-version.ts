// Cache version management for better PWA cache invalidation.
// Tied to the build commit hash (injected via vite `define`) so every deploy
// changes the version. The version is tracked in localStorage for diagnostics
// only; cache invalidation is handled by Workbox's autoUpdate registration plus
// the revisioned precache, so checkCacheVersion no longer touches Cache Storage.
// Wiping caches here previously deleted the Workbox precache out from under the
// installed service worker, breaking offline until the SW re-cached the shell.

export const CACHE_VERSION = __COMMIT_HASH__
export const CACHE_KEY = 'sudoku-app-version'

import { logger } from './logger'

/**
 * Detect a deploy by comparing the stored commit hash against the current build.
 * Returns true when the version changed. Cache Storage is intentionally left
 * untouched: Workbox's autoUpdate + revisioned precache owns invalidation.
 */
export async function checkCacheVersion(): Promise<boolean> {
  try {
    const storedVersion = localStorage.getItem(CACHE_KEY)

    if (storedVersion !== CACHE_VERSION) {
      logger.warn(`Cache version changed: ${storedVersion} → ${CACHE_VERSION}`)
      localStorage.setItem(CACHE_KEY, CACHE_VERSION)
      return true
    }

    return false
  } catch (error) {
    logger.warn('Cache version check failed:', error)
    return false
  }
}

/**
 * Force clear all application caches
 * Useful for debugging or manual cache reset
 */
export async function clearAllCaches(): Promise<void> {
  try {
    // Clear service worker caches
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((name) => caches.delete(name)))
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }

    // Clear localStorage cache version
    localStorage.removeItem(CACHE_KEY)

    logger.warn('All caches cleared successfully')
  } catch (error) {
    logger.error('Failed to clear caches:', error)
    throw error
  }
}
