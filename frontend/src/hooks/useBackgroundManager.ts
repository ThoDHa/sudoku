import { useState, useEffect, useCallback, useRef } from 'react'

interface BackgroundManagerOptions {
  /** Whether to enable background pause functionality */
  enabled?: boolean
  /** Delay in ms before entering deep pause mode (default: 5000 = 5s) */
  deepPauseDelay?: number
}

interface BackgroundManagerReturn {
  /** Whether the page is currently hidden from user */
  isHidden: boolean
  /** Whether background operations should be paused */
  shouldPauseOperations: boolean
  /** Whether in deep pause mode (more aggressive battery saving) */
  isInDeepPause: boolean
  /** Current visibility state */
  visibilityState: 'visible' | 'hidden'
  /** Force operations to resume (for manual override) */
  forceResume: () => void
  /** Force operations to pause (for manual override) */
  forcePause: () => void
}

/**
 * Central hook for managing background operations to reduce battery usage.
 * Coordinates all background activities (timers, auto-save, animations, etc.)
 * when the page becomes hidden from the user.
 *
 * Features:
 * - Immediate pause on visibility change
 * - Deep pause mode after configurable delay for extended battery savings
 * - Comprehensive event handling (Page Visibility API + focus/blur + page show/hide)
 * - Safe error handling for all callbacks
 */
export function useBackgroundManager(options: BackgroundManagerOptions = {}): BackgroundManagerReturn {
  const { enabled = true, deepPauseDelay = 5000 } = options

  const [isHidden, setIsHidden] = useState(false)
  const [visibilityState, setVisibilityState] = useState<'visible' | 'hidden'>('visible')
  const [forcePaused, setForcePaused] = useState(false)
  const [forceResumed, setForceResumed] = useState(false)
  const [isInDeepPause, setIsInDeepPause] = useState(false)

  const hiddenStartTimeRef = useRef<number | null>(null)
  const visibilityChangeCallbacksRef = useRef<Set<() => void>>(new Set())
  const deepPauseTimeoutRef = useRef<number | null>(null)

  // Determine if operations should be paused
  const shouldPauseOperations = enabled && (
    isHidden || forcePaused || isInDeepPause || (visibilityState === 'hidden' && !forceResumed)
  )

  const handleVisibilityChange = useCallback(() => {
    const newVisibilityState = document.visibilityState as 'visible' | 'hidden'
    setVisibilityState(newVisibilityState)

    const newIsHidden = newVisibilityState === 'hidden'
    setIsHidden(newIsHidden)

    // Reset force states when visibility changes
    if (newIsHidden) {
      setForceResumed(false)
      hiddenStartTimeRef.current = Date.now()
      
      // Start deep pause timer
      if (deepPauseDelay > 0) {
        deepPauseTimeoutRef.current = window.setTimeout(() => {
          setIsInDeepPause(true)
        }, deepPauseDelay)
      }
      
    } else {
      setForcePaused(false)
      setIsInDeepPause(false)
      hiddenStartTimeRef.current = null
      
      // Clear timers
      if (deepPauseTimeoutRef.current) {
        clearTimeout(deepPauseTimeoutRef.current)
        deepPauseTimeoutRef.current = null
      }
    }

    // Notify all registered callbacks
    visibilityChangeCallbacksRef.current.forEach(callback => {
      try {
        callback()
      } catch (error) {
        console.warn('Background manager callback error:', error)
      }
    })
  }, [])

  const forceResume = useCallback(() => {
    setForceResumed(true)
    setForcePaused(false)
    setIsInDeepPause(false)
  }, [])

  const forcePause = useCallback(() => {
    setForcePaused(true)
    setForceResumed(false)
  }, [])

  // Register visibility change listeners
  useEffect(() => {
    if (!enabled) return

    // Check initial visibility state
    const initialVisibility = document.visibilityState as 'visible' | 'hidden'
    setVisibilityState(initialVisibility)
    setIsHidden(initialVisibility === 'hidden')

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
      
      // Clean up timers
      if (deepPauseTimeoutRef.current) {
        clearTimeout(deepPauseTimeoutRef.current)
      }
    }
  }, [enabled, handleVisibilityChange])

  // Handle pagehide event for better mobile support
  useEffect(() => {
    if (!enabled) return

    const handlePageHide = () => {
      setIsHidden(true)
      setVisibilityState('hidden')
      hiddenStartTimeRef.current = Date.now()
      
      // Immediately enter deep pause on pagehide (mobile optimization)
      setIsInDeepPause(true)
    }

    const handlePageShow = () => {
      setIsHidden(false)
      setVisibilityState('visible')
      setIsInDeepPause(false)
      hiddenStartTimeRef.current = null
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [enabled])

  // Handle freeze/resume events for Chrome/Android
  // These fire when the page is being frozen to conserve resources
  useEffect(() => {
    if (!enabled) return

    const handleFreeze = () => {
      setIsHidden(true)
      setVisibilityState('hidden')
      setIsInDeepPause(true)
      hiddenStartTimeRef.current = Date.now()
      
      // Clear deep pause timer since we're already in deep pause
      if (deepPauseTimeoutRef.current) {
        clearTimeout(deepPauseTimeoutRef.current)
        deepPauseTimeoutRef.current = null
      }
    }

    const handleResume = () => {
      setIsHidden(false)
      setVisibilityState('visible')
      setIsInDeepPause(false)
      setForcePaused(false)
      hiddenStartTimeRef.current = null
    }

    // freeze/resume are part of the Page Lifecycle API
    // https://developer.chrome.com/blog/page-lifecycle-api/
    document.addEventListener('freeze', handleFreeze)
    document.addEventListener('resume', handleResume)

    return () => {
      document.removeEventListener('freeze', handleFreeze)
      document.removeEventListener('resume', handleResume)
    }
  }, [enabled])

  // Handle beforeunload for when user navigates away
  useEffect(() => {
    if (!enabled) return

    const handleBeforeUnload = () => {
      setIsHidden(true)
      setVisibilityState('hidden')
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [enabled])

  return {
    isHidden,
    shouldPauseOperations,
    isInDeepPause,
    visibilityState,
    forceResume,
    forcePause,
  }
}