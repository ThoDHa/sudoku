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
  useEffect(
    () => {
      const handleVisibilityChange = () => {
        const isNowHidden = document.visibilityState === 'hidden'
        isHiddenRef.current = isNowHidden

        // Cancel all active timeouts when page becomes hidden
        if (isNowHidden) {
          activeTimeoutsRef.current.forEach((id) => {
            window.clearTimeout(id)
          })
          activeTimeoutsRef.current.clear()
        }
      }

      // Handle pagehide for mobile (fires more reliably than visibilitychange)
      const handlePageHide = () => {
        isHiddenRef.current = true
        activeTimeoutsRef.current.forEach((id) => {
          window.clearTimeout(id)
        })
        activeTimeoutsRef.current.clear()
      }

      // Handle freeze event for Chrome/Android Page Lifecycle API
      const handleFreeze = () => {
        isHiddenRef.current = true
        activeTimeoutsRef.current.forEach((id) => {
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
        timeoutsRef.forEach((id) => {
          window.clearTimeout(id)
        })
        timeoutsRef.clear()
      }
    },
    /* Stryker disable next-line ArrayDeclaration: the only generated replacement is ["Stryker was here"], a constant; the mount effect captures only stable refs, so re-running it on any deps content is observationally identical */ [],
  )

  const setVisibilityAwareTimeout = useCallback(
    (callback: () => void, delay: number): (() => void) => {
      // Don't start timeout if page is already hidden
      if (isHiddenRef.current) {
        return () => {} // Return no-op cancel function
      }

      const timeoutId = window.setTimeout(() => {
        activeTimeoutsRef.current.delete(timeoutId)
        // Only call if page is still visible
        /* istanbul ignore start -- defensive re-check: isHiddenRef.current is true only via handlers that also clear every pending timeout, so a firing callback always sees it false and the skip path is unreachable */
        // Stryker disable next-line ConditionalExpression: the only equivalent replacement is the forced-true half: isHiddenRef.current is true only via handlers that also clear every pending timeout, so a firing callback always sees it false; the forced-false half dies to the hidden-pause tests
        if (!isHiddenRef.current) {
          callback()
        }
        /* istanbul ignore stop */
      }, delay)

      activeTimeoutsRef.current.add(timeoutId)

      // Return cancel function
      return () => {
        window.clearTimeout(timeoutId)
        activeTimeoutsRef.current.delete(timeoutId)
      }
    },
    // Stryker disable next-line ArrayDeclaration: the only generated replacement is ["Stryker was here"], a constant; setVisibilityAwareTimeout captures only stable refs (activeTimeoutsRef, isHiddenRef), so any deps content is observationally identical across renders
    [],
  )

  const cancelAll = useCallback(
    () => {
      activeTimeoutsRef.current.forEach((id) => {
        window.clearTimeout(id)
      })
      activeTimeoutsRef.current.clear()
    },
    /* Stryker disable next-line ArrayDeclaration: the only generated replacement is ["Stryker was here"], a constant; cancelAll captures only the stable activeTimeoutsRef, so any deps content is observationally identical across renders */ [],
  )

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference.
  return useMemo(
    () => ({
      setTimeout: setVisibilityAwareTimeout,
      cancelAll,
    }),
    // Stryker disable next-line ArrayDeclaration: the only generated replacement is ["Stryker was here"], a constant; setVisibilityAwareTimeout and cancelAll are themselves stable (empty-dep useCallbacks), so the memo's [them] and any constant array capture the same values
    [setVisibilityAwareTimeout, cancelAll],
  )
}
