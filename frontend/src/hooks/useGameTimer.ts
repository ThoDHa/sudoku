import { useState, useEffect, useCallback, useRef } from 'react'
import { TIMER_UPDATE_INTERVAL, MS_PER_SECOND } from '../lib/constants'

interface UseGameTimerOptions {
  /** Whether to auto-start the timer (default: false) */
  autoStart?: boolean
  /** Pause timer when tab is hidden or window loses focus (default: true) */
  pauseOnHidden?: boolean
}

interface UseGameTimerReturn {
  /** Elapsed time in milliseconds */
  elapsedMs: number
  /** Whether the timer is currently running */
  isRunning: boolean
  /** Whether the timer is paused due to tab/window being hidden */
  isPausedDueToVisibility: boolean
  /** Start or resume the timer */
  startTimer: () => void
  /** Pause the timer */
  pauseTimer: () => void
  /** Reset the timer to zero */
  resetTimer: () => void
  /** Set elapsed time to a specific value (for restoring saved state) */
  setElapsedMs: (ms: number) => void
  /** Format elapsed time as "M:SS" */
  formatTime: (ms?: number) => string
}

/**
 * Hook to manage a game timer with pause/resume functionality.
 * Handles tab visibility changes and window blur/focus to pause when hidden.
 * Auto-resumes when visible again to prevent cheating.
 */
export function useGameTimer(options: UseGameTimerOptions = {}): UseGameTimerReturn {
  const { autoStart = false, pauseOnHidden = true } = options

  const [elapsedMs, setElapsedMs] = useState(0)
  const [isRunning, setIsRunning] = useState(autoStart)
  const [isPausedDueToVisibility, setIsPausedDueToVisibility] = useState(false)
  
  // Track when timer was last started (for calculating elapsed time)
  const startTimeRef = useRef<number | null>(null)
  // Track accumulated time before last pause
  const accumulatedRef = useRef(0)
  // Track if timer was running before visibility pause
  const wasRunningBeforePauseRef = useRef(false)

  const startTimer = useCallback(() => {
    if (!isRunning) {
      startTimeRef.current = Date.now()
      setIsRunning(true)
      setIsPausedDueToVisibility(false)
    }
  }, [isRunning])

  const pauseTimer = useCallback(() => {
    if (isRunning && startTimeRef.current !== null) {
      // Save accumulated time
      accumulatedRef.current += Date.now() - startTimeRef.current
      startTimeRef.current = null
      setIsRunning(false)
    }
  }, [isRunning])

  const resetTimer = useCallback(() => {
    setElapsedMs(0)
    accumulatedRef.current = 0
    startTimeRef.current = isRunning ? Date.now() : null
    setIsPausedDueToVisibility(false)
  }, [isRunning])

  const setElapsedMsValue = useCallback((ms: number) => {
    setElapsedMs(ms)
    accumulatedRef.current = ms
    // If timer is running, reset the start time reference
    if (isRunning) {
      startTimeRef.current = Date.now()
    }
  }, [isRunning])

  const formatTime = useCallback((ms?: number): string => {
    const time = ms ?? elapsedMs
    const totalSeconds = Math.floor(time / MS_PER_SECOND)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [elapsedMs])

  // Main timer interval
  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedMs(accumulatedRef.current + (Date.now() - startTimeRef.current))
      }
    }, TIMER_UPDATE_INTERVAL)

    return () => clearInterval(interval)
  }, [isRunning])

  // Handle tab visibility changes and window blur/focus
  useEffect(() => {
    if (!pauseOnHidden) return

    const pauseForVisibility = () => {
      if (isRunning && startTimeRef.current !== null) {
        // Save accumulated time
        accumulatedRef.current += Date.now() - startTimeRef.current
        startTimeRef.current = null
        wasRunningBeforePauseRef.current = true
        setIsPausedDueToVisibility(true)
      }
    }

    const resumeFromVisibility = () => {
      // Only resume if we paused due to visibility (not user pause)
      if (isRunning && wasRunningBeforePauseRef.current) {
        startTimeRef.current = Date.now()
        setIsPausedDueToVisibility(false)
      }
      wasRunningBeforePauseRef.current = false
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseForVisibility()
      } else {
        resumeFromVisibility()
      }
    }

    const handleWindowBlur = () => {
      // Additional pause on window blur (catches more mobile scenarios)
      pauseForVisibility()
    }

    const handleWindowFocus = () => {
      // Resume on window focus
      resumeFromVisibility()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [isRunning, pauseOnHidden])

  return {
    elapsedMs,
    isRunning,
    isPausedDueToVisibility,
    startTimer,
    pauseTimer,
    resetTimer,
    setElapsedMs: setElapsedMsValue,
    formatTime,
  }
}
