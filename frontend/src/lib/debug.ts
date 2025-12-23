// Type augmentation for DEBUG flag on window
declare global {
  interface Window {
    DEBUG?: boolean
  }
}

// Cached debug mode state to avoid repeated localStorage access
let cachedDebugMode: boolean | null = null

/**
 * Check if debug mode is enabled.
 * Debug mode can be enabled via:
 * 1. window.DEBUG = true
 * 2. localStorage.setItem('debug', 'true')
 * 3. URL contains ?debug or #debug
 */
export function isDebugMode(): boolean {
  // Check cached value first
  if (cachedDebugMode !== null) {
    return cachedDebugMode
  }
  
  // Check window.DEBUG flag (set programmatically)
  if (typeof window !== 'undefined' && window.DEBUG === true) {
    cachedDebugMode = true
    return true
  }
  
  // Check localStorage
  try {
    if (localStorage.getItem('debug') === 'true') {
      cachedDebugMode = true
      return true
    }
  } catch {
    // localStorage not available
  }
  
  // Check URL parameters
  if (typeof window !== 'undefined') {
    const url = window.location.href
    if (url.includes('?debug') || url.includes('#debug')) {
      cachedDebugMode = true
      return true
    }
  }
  
  cachedDebugMode = false
  return false
}

/**
 * Enable debug mode programmatically
 */
export function enableDebug(): void {
  if (typeof window !== 'undefined') {
    window.DEBUG = true
  }
  cachedDebugMode = true
  try {
    localStorage.setItem('debug', 'true')
  } catch {
    // localStorage not available
  }
}

/**
 * Disable debug mode programmatically
 */
export function disableDebug(): void {
  if (typeof window !== 'undefined') {
    window.DEBUG = false
  }
  cachedDebugMode = false
  try {
    localStorage.removeItem('debug')
  } catch {
    // localStorage not available
  }
}

/**
 * Log a debug message if debug mode is enabled.
 * Uses console.debug for proper log level.
 */
export function debugLog(...args: unknown[]): void {
  if (isDebugMode()) {
    console.debug(...args)
  }
}
