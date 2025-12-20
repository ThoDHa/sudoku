import { useState, useEffect, useCallback } from 'react'

interface BackgroundManagerOptions {
  /** Whether to enable background pause functionality */
  enabled?: boolean
}

interface BackgroundManagerReturn {
  /** Whether the page is currently hidden from user */
  isHidden: boolean
  /** Whether background operations should be paused */
  shouldPauseOperations: boolean
  /** Whether in deep pause mode (immediate on hide for battery saving) */
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
 * - Immediate pause and deep pause on visibility change
 * - Comprehensive event handling (Page Visibility API + focus/blur + page show/hide)
 */
export function useBackgroundManager(options: BackgroundManagerOptions = {}): BackgroundManagerReturn {
  const { enabled = true } = options

  const [isHidden, setIsHidden] = useState(false)
  const [visibilityState, setVisibilityState] = useState<'visible' | 'hidden'>('visible')
  const [forcePaused, setForcePaused] = useState(false)
  const [forceResumed, setForceResumed] = useState(false)
  const [isInDeepPause, setIsInDeepPause] = useState(false)

  // Determine if operations should be paused
  const shouldPauseOperations = enabled && (
    isHidden || forcePaused || isInDeepPause || (visibilityState === 'hidden' && !forceResumed)
  )

  const handleVisibilityChange = useCallback(() => {
    const newVisibilityState = document.visibilityState as 'visible' | 'hidden'
    setVisibilityState(newVisibilityState)

    const newIsHidden = newVisibilityState === 'hidden'
    setIsHidden(newIsHidden)

    if (newIsHidden) {
      setForceResumed(false)
      setIsInDeepPause(true)
    } else {
      setForcePaused(false)
      setIsInDeepPause(false)
    }
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
    if (initialVisibility === 'hidden') {
      setIsInDeepPause(true)
    }

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
    }
  }, [enabled, handleVisibilityChange])

  // Handle pagehide event for better mobile support
  useEffect(() => {
    if (!enabled) return

    const handlePageHide = () => {
      setIsHidden(true)
      setVisibilityState('hidden')
      setIsInDeepPause(true)
    }

    const handlePageShow = () => {
      setIsHidden(false)
      setVisibilityState('visible')
      setIsInDeepPause(false)
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [enabled])

  // Handle freeze/resume events for Chrome/Android
  useEffect(() => {
    if (!enabled) return

    const handleFreeze = () => {
      setIsHidden(true)
      setVisibilityState('hidden')
      setIsInDeepPause(true)
    }

    const handleResume = () => {
      setIsHidden(false)
      setVisibilityState('visible')
      setIsInDeepPause(false)
      setForcePaused(false)
    }

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
