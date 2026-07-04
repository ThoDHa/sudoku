// Cache version management for better PWA cache invalidation.
// Tied to the build commit hash (injected via vite `define`) so every deploy
// changes the version and forces a one-time cache clear for returning users.
// A hardcoded string here was never bumped per deploy, so it never fired.

export const CACHE_VERSION = __COMMIT_HASH__
export const CACHE_KEY = 'sudoku-app-version'

import { logger } from './logger'

/**
 * Check if cache version has changed and clear caches if needed
 * This helps ensure users get fresh content after updates
 */
export async function checkCacheVersion(): Promise<boolean> {
  try {
    const storedVersion = localStorage.getItem(CACHE_KEY)

    if (storedVersion !== CACHE_VERSION) {
      logger.warn(`Cache version changed: ${storedVersion} → ${CACHE_VERSION}`)

      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
        logger.warn('Cleared all caches due to version change')
      }

      // Update stored version
      localStorage.setItem(CACHE_KEY, CACHE_VERSION)

      return true // Cache was cleared
    }

    return false // No cache clearing needed
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
