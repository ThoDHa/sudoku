// Cache version management for better PWA cache invalidation
// Increment this version when you want to force cache refresh

export const CACHE_VERSION = '1.0.2';
export const CACHE_KEY = 'sudoku-app-version';

/**
 * Check if the cache version has changed and clear caches if needed
 * This helps ensure users get fresh content after updates
 */
export async function checkCacheVersion(): Promise<boolean> {
  try {
    const storedVersion = localStorage.getItem(CACHE_KEY);
    
    if (storedVersion !== CACHE_VERSION) {
      console.warn(`Cache version changed: ${storedVersion} → ${CACHE_VERSION}`);
      
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.warn('Cleared all caches due to version change');
      }
      
      // Update stored version
      localStorage.setItem(CACHE_KEY, CACHE_VERSION);
      
      return true; // Cache was cleared
    }
    
    return false; // No cache clearing needed
  } catch (error) {
    console.warn('Cache version check failed:', error);
    return false;
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
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
    
    // Clear localStorage cache version
    localStorage.removeItem(CACHE_KEY);
    
    console.warn('All caches cleared successfully');
  } catch (error) {
    console.error('Failed to clear caches:', error);
    throw error;
  }
}

/**
 * Add a cache-busting query parameter to URLs
 */
export function addCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${CACHE_VERSION}`;
}