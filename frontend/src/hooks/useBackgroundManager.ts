import { useCallback, useEffect, useMemo, useState } from 'react'
import { isAutomatedEnvironment } from '../lib/automationEnvironment'

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
export function useBackgroundManager(
  options: BackgroundManagerOptions = {},
): BackgroundManagerReturn {
  const { enabled = true } = options

  const [isHidden, setIsHidden] = useState(() =>
    enabled ? document.visibilityState === 'hidden' : false,
  )
  const [isWindowBlurred, setIsWindowBlurred] = useState(false)
  const [visibilityState, setVisibilityState] = useState<'visible' | 'hidden'>(() =>
    enabled ? document.visibilityState : 'visible',
  )
  const [forcePaused, setForcePaused] = useState(false)
  const [isInDeepPause, setIsInDeepPause] = useState(
    () => enabled && document.visibilityState === 'hidden',
  )

  // Pausing must be bypassed under E2E automation: the runner window is often
  // unfocused while the page is still visible, and pausing there blocks timers.
  const automated = isAutomatedEnvironment(globalThis.navigator)

  // Core logic: pause if enabled, not automated, and any pause condition holds.
  // The !automated gate is what keeps an unfocused E2E runner from pausing, so
  // no pause condition needs to re-check it.
  const shouldPauseOperations =
    enabled && !automated && (isHidden || isWindowBlurred || forcePaused || isInDeepPause)

  const handleVisibilityChange = useCallback(() => {
    const newVisibilityState = document.visibilityState
    setVisibilityState(newVisibilityState)

    const newIsHidden = newVisibilityState === 'hidden'
    setIsHidden(newIsHidden)

    if (newIsHidden) {
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
    setForcePaused(false)
    setIsInDeepPause(false)
  }, [])

  const forcePause = useCallback(() => {
    setForcePaused(true)
  }, [])

  // Register visibility change listeners
  useEffect(() => {
    if (!enabled) return

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

  return useMemo(
    () => ({
      isHidden,
      isWindowBlurred,
      shouldPauseOperations,
      isInDeepPause,
      visibilityState,
      forceResume,
      forcePause,
    }),
    [
      isHidden,
      isWindowBlurred,
      shouldPauseOperations,
      isInDeepPause,
      visibilityState,
      forceResume,
      forcePause,
    ],
  )
}
