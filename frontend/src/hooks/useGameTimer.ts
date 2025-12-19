import { useState, useEffect, useCallback, useRef } from 'react'
import { TIMER_UPDATE_INTERVAL, MS_PER_SECOND } from '../lib/constants'
import { useBackgroundManager } from './useBackgroundManager'

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
  * Uses central background manager for consistent visibility handling.
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

  // Use central background manager
  const backgroundManager = useBackgroundManager({ enabled: pauseOnHidden })

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

  // Main timer interval - completely stopped when hidden for battery savings
  useEffect(() => {
    if (!isRunning) return

    // Don't run timer at all when page is hidden to save battery
    if (pauseOnHidden && backgroundManager.shouldPauseOperations) {
      return // No interval when hidden
    }

    const interval = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedMs(accumulatedRef.current + (Date.now() - startTimeRef.current))
      }
    }, TIMER_UPDATE_INTERVAL)

    return () => clearInterval(interval)
  }, [isRunning, pauseOnHidden, backgroundManager.shouldPauseOperations])

  // Handle visibility changes using central background manager
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

    // React to background manager visibility changes
    if (backgroundManager.shouldPauseOperations) {
      pauseForVisibility()
    } else if (!backgroundManager.isHidden) {
      resumeFromVisibility()
    }

    // Update isPausedDueToVisibility based on background manager state
    setIsPausedDueToVisibility(backgroundManager.shouldPauseOperations)

  }, [backgroundManager.shouldPauseOperations, backgroundManager.isHidden, isRunning, pauseOnHidden])

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
