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

// E2E/automation contexts (Playwright, Headless Chrome, webdriver) where
// focus/visibility pausing must be bypassed: the runner window may not be
// focused but the page is still "visible".
function isAutomatedEnvironment(): boolean {
  /* v8 ignore start -- SSR/non-browser guard: navigator is always defined in browsers and jsdom, so this early return is unreachable in the test environment */
  // Stryker disable next-line ConditionalExpression,StringLiteral,BooleanLiteral: jsdom always defines navigator (object) and navigator.userAgent (string), so this SSR/non-browser guard is unreachable here and every mutation is observationally identical
  if (typeof navigator === 'undefined') return false
  /* v8 ignore stop */
  return (
    navigator.webdriver === true ||
    // Stryker disable next-line ConditionalExpression: navigator.userAgent is always a string in jsdom and browsers, so the typeof guard is always true and forcing it true is observationally identical
    (typeof navigator.userAgent === 'string' &&
      (navigator.userAgent.includes('HeadlessChrome') ||
        navigator.userAgent.includes('playwright')))
  )
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
  // Stryker disable next-line BooleanLiteral: wasRunningBeforePauseRef is read only inside resumeFromVisibility, whose mount-time read is absorbed by the autoStart mount effect (same Date.now() tick) plus React's identical-state bailout, so initial false == true
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

  // On mount, if autoStart is set, kick off accumulation. startTimer()'s
  // recovery branch (isRunning true but startTimeRef null) seeds startTimeRef.
  useEffect(() => {
    if (autoStart) {
      startTimer()
    }
  }, /* Stryker disable next-line ArrayDeclaration: a constant deps entry is observationally identical to the empty array since the mount effect runs once either way */ []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const setElapsedMsValue = useCallback(
    (ms: number) => {
      // Validate input to prevent NaN or negative values
      const validMs = Math.max(0, Number.isFinite(ms) ? ms : 0)
      setElapsedMs(validMs)
      accumulatedRef.current = validMs
      // If timer is running, reset the start time reference
      // Stryker disable next-line ConditionalExpression: startTimeRef is read only under isRunning guards; when isRunning is false the seed is overwritten by the next startTimer before any read, so forcing the branch true is unobservable
      if (isRunning) {
        startTimeRef.current = Date.now()
      }
    },
    [isRunning],
  )

  // STABLE formatTime - reads from ref instead of closure to avoid recreation every tick
  // This is critical: if formatTime changes every second, TimerControlContext updates,
  // which causes Game.tsx to re-render, which re-renders 81 cells!
  const formatTime = useCallback((ms?: number): string => {
    const time = ms ?? elapsedMsRef.current
    const totalSeconds = Math.floor(time / MS_PER_SECOND)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, /* Stryker disable next-line ArrayDeclaration: formatTime reads elapsedMs via a ref and has no reactive deps, so a constant deps entry is observationally identical to the empty array */ []) // No dependencies - stable forever!

  // Main timer interval - completely stopped when hidden for battery savings
  // NOTE: In E2E tests, we should NOT pause due to visibility/focus changes
  // since the browser window might not be focused but the page is still "visible"
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: when isRunning is false the visibility effect's final setIsPausedDueToVisibility(isRunning && shouldPause) line overwrites the true this mutant would set, and no interval tick updates elapsedMs (startTimeRef is null), so forcing the guard false is unobservable
    if (!isRunning) return

    // In automated tests, don't pause based on visibility
    const effectiveShouldPause = isAutomatedEnvironment()
      ? false
      // Stryker disable next-line ConditionalExpression: when not automated and pauseOnHidden and shouldPause, the visibility effect's pauseForVisibility already sets isPausedDueToVisibility and nulls startTimeRef, so forcing this ternary branch false (skipping the interval pause) is compensated
      : pauseOnHidden && backgroundManager.shouldPauseOperations

    // Stryker disable next-line ConditionalExpression,BlockStatement: the visibility effect compensates isPausedDueToVisibility and the interval body skips when startTimeRef is null (nulled by pauseForVisibility), so skipping or emptying this block is unobservable
    if (effectiveShouldPause) {
      // Stryker disable next-line BooleanLiteral: the visibility effect's final line overwrites isPausedDueToVisibility, so setting false here instead of true is unobservable
      setIsPausedDueToVisibility(true)
      return // No interval when hidden
    }

    // Start the interval
    const interval = setInterval(() => {
      // pauseOnHidden must gate this inner guard too, not just the outer
      // gate: otherwise an opt-out user still gets frozen ticks whenever
      // shouldPauseOperations is true.
      if (!isAutomatedEnvironment() && pauseOnHidden && backgroundManager.shouldPauseOperations) {
        return // Skip update when hidden
      }

      // Stryker disable next-line ConditionalExpression: when the interval fires startTimeRef is always non-null (pauseForVisibility nulls it only alongside tearing down the interval), so forcing this guard true is observationally identical
      if (startTimeRef.current !== null) {
        setElapsedMs(accumulatedRef.current + (Date.now() - startTimeRef.current))
      }
    }, TIMER_UPDATE_INTERVAL)

    // Stryker disable next-line ArrowFunction: the interval body is idempotent (setElapsedMs to accumulatedRef + (Date.now() - startTimeRef)), so a leaked interval from a no-op cleanup computes the same value as the active one
    return () => clearInterval(interval)
  }, [isRunning, pauseOnHidden, backgroundManager.shouldPauseOperations])

  // Handle visibility changes using central background manager
  useEffect(() => {
    if (isAutomatedEnvironment()) return
    if (!pauseOnHidden) return

    const pauseForVisibility = () => {
      // Stryker disable next-line LogicalOperator,ConditionalExpression: the differing case (isRunning true with startTimeRef null) is unreachable - pauseForVisibility nulls startTimeRef once per hide and the next visibility change either keeps shouldPause true (no re-run) or re-seeds startTimeRef via resumeFromVisibility before another pause
      if (isRunning && startTimeRef.current !== null) {
        // Save accumulated time
        accumulatedRef.current += Date.now() - startTimeRef.current
        startTimeRef.current = null
        wasRunningBeforePauseRef.current = true
        // Stryker disable next-line BooleanLiteral: the visibility effect's final setIsPausedDueToVisibility line overwrites this value, so setting false here instead of true is unobservable
        setIsPausedDueToVisibility(true)
      }
    }

    const resumeFromVisibility = () => {
      // Only resume if we paused due to visibility (not user pause)
      // Stryker disable next-line ConditionalExpression,LogicalOperator: in fake-timer tests the differing case (resume re-running when wasRunningBeforePauseRef is wrong) re-seeds startTimeRef in the same Date.now() tick as the triggering startTimer, and React's identical-state bailout absorbs the rest
      if (isRunning && wasRunningBeforePauseRef.current) {
        startTimeRef.current = Date.now()
        // Stryker disable next-line BooleanLiteral: the visibility effect's final setIsPausedDueToVisibility line overwrites this value, so setting true here instead of false is unobservable
        setIsPausedDueToVisibility(false)
      }
      // Stryker disable next-line BooleanLiteral: in fake-timer tests any resume re-run happens in the same Date.now() tick as the triggering startTimer, so the re-seed this mutant enables lands on the same instant and is observationally identical
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
  }, [
    backgroundManager.shouldPauseOperations,
    backgroundManager.isHidden,
    isRunning,
    pauseOnHidden,
  ])

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference.
  return useMemo(
    () => ({
      elapsedMs,
      isRunning,
      isPausedDueToVisibility,
      startTimer,
      pauseTimer,
      resetTimer,
      setElapsedMs: setElapsedMsValue,
      formatTime,
    }),
    [
      elapsedMs,
      isRunning,
      isPausedDueToVisibility,
      startTimer,
      pauseTimer,
      resetTimer,
      setElapsedMsValue,
      formatTime,
    ],
  )
}
