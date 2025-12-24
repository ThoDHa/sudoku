import { useState, useEffect, useCallback, useMemo } from 'react'

interface BackgroundManagerOptions {
  /** Whether to enable background pause functionality */
  enabled?: boolean
}

interface BackgroundManagerReturn {
  /** Whether the page is currently hidden from user (tab not visible) */
  isHidden: boolean
  /** Whether the window has lost focus (app switched, but tab may still be visible) */
  isWindowBlurred: boolean
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
  const [isWindowBlurred, setIsWindowBlurred] = useState(false)
  const [visibilityState, setVisibilityState] = useState<'visible' | 'hidden'>('visible')
  const [forcePaused, setForcePaused] = useState(false)
  const [forceResumed, setForceResumed] = useState(false)
  const [isInDeepPause, setIsInDeepPause] = useState(false)

  // Determine if operations should be paused (includes both visibility hidden AND window blur)
  const shouldPauseOperations = enabled && (
    isHidden || isWindowBlurred || forcePaused || isInDeepPause || (visibilityState === 'hidden' && !forceResumed)
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

  // Separate handlers for window blur/focus (app switching on desktop)
  // These set isWindowBlurred but NOT isHidden - so timer pauses but frozen state doesn't trigger
  const handleWindowBlur = useCallback(() => {
    setIsWindowBlurred(true)
  }, [])

  const handleWindowFocus = useCallback(() => {
    setIsWindowBlurred(false)
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
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [enabled, handleVisibilityChange, handleWindowBlur, handleWindowFocus])

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

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference, causing all
  // context consumers to re-render (~746 renders/second instead of ~1/second).
  return useMemo(() => ({
    isHidden,
    isWindowBlurred,
    shouldPauseOperations,
    isInDeepPause,
    visibilityState,
    forceResume,
    forcePause,
  }), [isHidden, isWindowBlurred, shouldPauseOperations, isInDeepPause, visibilityState, forceResume, forcePause])
}
