import { useCallback, useRef, useEffect, useMemo } from 'react'

interface VisibilityAwareTimeoutReturn {
  /** 
   * Sets a timeout that is cancelled when the page becomes hidden.
   * Returns a function to manually cancel the timeout.
   */
  setTimeout: (callback: () => void, delay: number) => () => void
  /** Cancel all active timeouts */
  cancelAll: () => void
}

/**
 * Hook that provides visibility-aware timeouts for battery optimization.
 * Timeouts are automatically cancelled when the page becomes hidden,
 * preventing unnecessary callbacks from firing when the user isn't looking.
 * 
 * This is ideal for UI feedback like toast notifications that don't need
 * to fire if the user has switched tabs or locked their phone.
 */
export function useVisibilityAwareTimeout(): VisibilityAwareTimeoutReturn {
  const activeTimeoutsRef = useRef<Set<number>>(new Set())
  const isHiddenRef = useRef(document.visibilityState === 'hidden')

  // Track visibility state
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isNowHidden = document.visibilityState === 'hidden'
      isHiddenRef.current = isNowHidden

      // Cancel all active timeouts when page becomes hidden
      if (isNowHidden) {
        activeTimeoutsRef.current.forEach(id => {
          window.clearTimeout(id)
        })
        activeTimeoutsRef.current.clear()
      }
    }
    
    // Handle pagehide for mobile (fires more reliably than visibilitychange)
    const handlePageHide = () => {
      isHiddenRef.current = true
      activeTimeoutsRef.current.forEach(id => {
        window.clearTimeout(id)
      })
      activeTimeoutsRef.current.clear()
    }
    
    // Handle freeze event for Chrome/Android Page Lifecycle API
    const handleFreeze = () => {
      isHiddenRef.current = true
      activeTimeoutsRef.current.forEach(id => {
        window.clearTimeout(id)
      })
      activeTimeoutsRef.current.clear()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('freeze', handleFreeze)
    
    const timeoutsRef = activeTimeoutsRef.current
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('freeze', handleFreeze)
      // Clean up all timeouts on unmount
      timeoutsRef.forEach(id => {
        window.clearTimeout(id)
      })
      timeoutsRef.clear()
    }
  }, [])

  const setVisibilityAwareTimeout = useCallback((callback: () => void, delay: number): () => void => {
    // Don't start timeout if page is already hidden
    if (isHiddenRef.current) {
      return () => {} // Return no-op cancel function
    }

    const timeoutId = window.setTimeout(() => {
      activeTimeoutsRef.current.delete(timeoutId)
      // Only call if page is still visible
      if (!isHiddenRef.current) {
        callback()
      }
    }, delay)

    activeTimeoutsRef.current.add(timeoutId)

    // Return cancel function
    return () => {
      window.clearTimeout(timeoutId)
      activeTimeoutsRef.current.delete(timeoutId)
    }
  }, [])

  const cancelAll = useCallback(() => {
    activeTimeoutsRef.current.forEach(id => {
      window.clearTimeout(id)
    })
    activeTimeoutsRef.current.clear()
  }, [])

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference.
  return useMemo(() => ({
    setTimeout: setVisibilityAwareTimeout,
    cancelAll,
  }), [setVisibilityAwareTimeout, cancelAll])
}
