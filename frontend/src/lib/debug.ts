/**
 * Debug logging utility
 * 
 * Provides a centralized way to control console.log output.
 * - In production: logs are disabled by default
 * - In development: logs are enabled by default
 * - Can be toggled at runtime via localStorage or window.DEBUG
 */

// Check if debug mode is enabled
function isDebugEnabled(): boolean {
  // Allow runtime override via window.DEBUG
  if (typeof window !== 'undefined' && 'DEBUG' in window) {
    return Boolean((window as unknown as { DEBUG: boolean }).DEBUG)
  }
  
  // Check localStorage for debug preference
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('debug')
    if (stored !== null) {
      return stored === 'true'
    }
  }
  
  // Default: enabled in development, disabled in production
  return import.meta.env.DEV
}

/**
 * Debug log - only outputs when debug mode is enabled
 * Use this for development/debugging logs that should not appear in production
 */
export function debugLog(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log(...args)
  }
}

/**
 * Enable debug mode at runtime
 */
export function enableDebug(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('debug', 'true')
  }
  if (typeof window !== 'undefined') {
    (window as unknown as { DEBUG: boolean }).DEBUG = true
  }
}

/**
 * Disable debug mode at runtime
 */
export function disableDebug(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('debug', 'false')
  }
  if (typeof window !== 'undefined') {
    (window as unknown as { DEBUG: boolean }).DEBUG = false
  }
}
