import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { TIMER_UPDATE_INTERVAL, MS_PER_SECOND } from '../lib/constants'
import type { useBackgroundManager } from './useBackgroundManager'

type BackgroundManagerReturn = ReturnType<typeof useBackgroundManager>

interface UseGameTimerOptions {
  /** Whether to auto-start the timer (default: false) */
  autoStart?: boolean
  /** Pause timer when tab is hidden or window loses focus (default: true) */
  pauseOnHidden?: boolean
  /** Background manager instance to use (required for shared context) */
  backgroundManager: BackgroundManagerReturn
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
export function useGameTimer(options: UseGameTimerOptions): UseGameTimerReturn {
  const { autoStart = false, pauseOnHidden = true, backgroundManager } = options

  const [elapsedMs, setElapsedMs] = useState(0)
  const [isRunning, setIsRunning] = useState(autoStart)
  const [isPausedDueToVisibility, setIsPausedDueToVisibility] = useState(false)

  // Track when timer was last started (for calculating elapsed time)
  const startTimeRef = useRef<number | null>(null)
  // Track accumulated time before last pause
  const accumulatedRef = useRef(0)
  // Track if timer was running before visibility pause
  const wasRunningBeforePauseRef = useRef(false)
  // Track elapsedMs for stable formatTime callback (no re-creation on every tick)
  const elapsedMsRef = useRef(elapsedMs)
  elapsedMsRef.current = elapsedMs

  // Use the provided background manager (from shared context)

  const startTimer = useCallback(() => {
    if (!isRunning) {
      startTimeRef.current = Date.now()
      setIsRunning(true)
      setIsPausedDueToVisibility(false)
    } else if (startTimeRef.current === null) {
      // Edge case: isRunning is true but no start time reference
      // This could happen from stale closures - recover gracefully
      startTimeRef.current = Date.now()
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
    // Validate input to prevent NaN or negative values
    const validMs = Math.max(0, Number.isFinite(ms) ? ms : 0)
    setElapsedMs(validMs)
    accumulatedRef.current = validMs
    // If timer is running, reset the start time reference
    if (isRunning) {
      startTimeRef.current = Date.now()
    }
  }, [isRunning])

  // STABLE formatTime - reads from ref instead of closure to avoid recreation every tick
  // This is critical: if formatTime changes every second, TimerControlContext updates,
  // which causes Game.tsx to re-render, which re-renders 81 cells!
  const formatTime = useCallback((ms?: number): string => {
    const time = ms ?? elapsedMsRef.current
    const totalSeconds = Math.floor(time / MS_PER_SECOND)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, []) // No dependencies - stable forever!

  // Main timer interval - completely stopped when hidden for battery savings
  useEffect(() => {
    if (!isRunning) return

    if (pauseOnHidden && backgroundManager.shouldPauseOperations) {
      setIsPausedDueToVisibility(true)
      return // No interval when hidden
    }

    // Start the interval
    const interval = setInterval(() => {
      // Respect background manager's pause decision
      if (backgroundManager.shouldPauseOperations) {
        return // Skip update when hidden
      }

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

    // Only mark as paused due to visibility if timer is actually running
    // This prevents the pause overlay from showing for completed games
    setIsPausedDueToVisibility(isRunning && backgroundManager.shouldPauseOperations)

  }, [backgroundManager.shouldPauseOperations, backgroundManager.isHidden, isRunning, pauseOnHidden])

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference.
  return useMemo(() => ({
    elapsedMs,
    isRunning,
    isPausedDueToVisibility,
    startTimer,
    pauseTimer,
    resetTimer,
    setElapsedMs: setElapsedMsValue,
    formatTime,
  }), [elapsedMs, isRunning, isPausedDueToVisibility, startTimer, pauseTimer, resetTimer, setElapsedMsValue, formatTime])
}
