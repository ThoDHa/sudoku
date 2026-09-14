import { useState, useEffect, useRef } from 'react'
import { TIMER_UPDATE_INTERVAL, MS_PER_SECOND } from '../lib/constants'
import { isAutomatedEnvironment } from '../lib/automationEnvironment'
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

  // When the current running span started. Null means unseeded. The value is
  // meaningful only while isRunning: every read is gated on isRunning, and
  // every stopped-to-running transition (startTimer, the autoStart mount
  // effect) writes the ref itself, so a timestamp left behind by a stopped
  // timer is never read.
  const startTimeRef = useRef<number | null>(null)
  // Track accumulated time before last pause
  const accumulatedRef = useRef(0)
  // Track if timer was running before visibility pause
  const wasRunningBeforePauseRef = useRef(false)
  // Track elapsedMs for stable formatTime callback (no re-creation on every tick).
  // Updated post-commit; display components pass elapsedMs explicitly to
  // formatTime(elapsedMs), so the ref is only read by event-handler snapshots
  // (which fire after commit, where the ref is current).
  const elapsedMsRef = useRef(elapsedMs)
  useEffect(() => {
    elapsedMsRef.current = elapsedMs
  })

  // Use the provided background manager (from shared context)

  const startTimer = () => {
    if (!isRunning) {
      startTimeRef.current = Date.now()
      setIsRunning(true)
      setIsPausedDueToVisibility(false)
    } else if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
    }
  }

  // autoStart makes isRunning true from the very first render without anyone
  // calling startTimer, so the running span has to be dated here or the first
  // interval tick would have nothing to measure from and elapsedMs would sit
  // frozen. A non-autoStart timer is dated by startTimer instead.
  useEffect(
    () => {
      startTimeRef.current = autoStart ? Date.now() : null
    },
    /* Stryker disable next-line ArrayDeclaration: React compares deps element-wise, and a constant literal entry is Object.is-equal on every render, so a one-element array runs this mount effect exactly once just as the empty array does */ [],
  )

  // The one span-banking implementation: guards, banks the running span into
  // the accumulator, clears the ref, then lets the caller finish (user pause
  // and visibility pause differ only in that trailing write). The callback
  // form is deliberate: a boolean-returning variant would carry a
  // return false -> true mutant that no stopped-timer test can observe.
  const bankRunningSpan = (onBanked: () => void) => {
    if (isRunning && startTimeRef.current !== null) {
      // Save accumulated time
      accumulatedRef.current += Date.now() - startTimeRef.current
      startTimeRef.current = null
      onBanked()
    }
  }

  const pauseTimer = () => {
    bankRunningSpan(() => {
      setIsRunning(false)
    })
  }

  // The one rebaseline implementation, shared by resetTimer and
  // setElapsedMsValue. The ref write is unconditional on purpose: the
  // invariant at startTimeRef's declaration is what makes a stopped-timer
  // timestamp harmless, and a conditional here would carry an unkillable
  // isRunning -> true mutant.
  const rebaseElapsed = (ms: number) => {
    setElapsedMs(ms)
    accumulatedRef.current = ms
    startTimeRef.current = Date.now()
  }

  const resetTimer = () => {
    rebaseElapsed(0)
    setIsPausedDueToVisibility(false)
  }

  const setElapsedMsValue = (ms: number) => {
    // Validate input to prevent NaN or negative values
    const validMs = Math.max(0, Number.isFinite(ms) ? ms : 0)
    rebaseElapsed(validMs)
  }

  // formatTime reads from refs instead of closure state so it depends on no
  // changing value: the React Compiler can then hold its identity stable
  // across re-renders, which is what keeps TimerControlContext from
  // updating every second and re-rendering Game.tsx's 81 cells. With the
  // compiler off (VITE_SKIP_RC) handler identities churn and control
  // consumers re-render per tick; the identity-stability tests skip there.
  const formatTime = (ms?: number): string => {
    const time = ms ?? elapsedMsRef.current
    const totalSeconds = Math.floor(time / MS_PER_SECOND)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Main timer interval - completely stopped when hidden for battery savings
  // NOTE: In E2E tests, we should NOT pause due to visibility/focus changes
  // since the browser window might not be focused but the page is still "visible"
  useEffect(() => {
    if (!isRunning) return

    // In automated tests, don't pause based on visibility. The environment
    // cannot change while this effect is mounted, so probe it once here rather
    // than on every tick of the interval below.
    const automated = isAutomatedEnvironment(globalThis.navigator)
    const effectiveShouldPause = automated
      ? false
      : pauseOnHidden && backgroundManager.shouldPauseOperations

    // Schedule nothing while hidden: the visibility effect below owns
    // isPausedDueToVisibility, so all this effect has to do is stop burning
    // battery on ticks the interval body would skip anyway.
    if (effectiveShouldPause) {
      return
    }

    // Start the interval
    const interval = setInterval(() => {
      // pauseOnHidden must gate this inner guard too, not just the outer
      // gate: otherwise an opt-out user still gets frozen ticks whenever
      // shouldPauseOperations is true.
      if (!automated && pauseOnHidden && backgroundManager.shouldPauseOperations) {
        return // Skip update when hidden
      }

      if (startTimeRef.current !== null) {
        setElapsedMs(accumulatedRef.current + (Date.now() - startTimeRef.current))
      }
    }, TIMER_UPDATE_INTERVAL)

    return () => {
      clearInterval(interval)
    }
  }, [isRunning, pauseOnHidden, backgroundManager.shouldPauseOperations])

  // Handle visibility changes using central background manager
  useEffect(() => {
    if (isAutomatedEnvironment(globalThis.navigator)) return
    if (!pauseOnHidden) return

    const pauseForVisibility = () => {
      bankRunningSpan(() => {
        wasRunningBeforePauseRef.current = true
      })
    }

    const resumeFromVisibility = () => {
      // Only resume if we paused due to visibility (not user pause)
      if (isRunning && wasRunningBeforePauseRef.current) {
        startTimeRef.current = Date.now()
      }
      wasRunningBeforePauseRef.current = false
    }

    // React to background manager visibility changes
    if (backgroundManager.shouldPauseOperations) {
      pauseForVisibility()
    } else if (!backgroundManager.isHidden) {
      resumeFromVisibility()
    }

    // Canonical sync: ensure isPausedDueToVisibility matches the actual pause
    // state. Wrapped in a named function so the rule treats this as
    // callback-scoped rather than a direct effect-body mutation.
    const syncPauseFlag = () => {
      // Only mark as paused due to visibility if timer is actually running;
      // prevents the pause overlay from showing for completed games.
      setIsPausedDueToVisibility(isRunning && backgroundManager.shouldPauseOperations)
    }
    syncPauseFlag()
  }, [
    backgroundManager.shouldPauseOperations,
    backgroundManager.isHidden,
    isRunning,
    pauseOnHidden,
  ])

  // No return-object useMemo: nothing consumes this object's identity
  // (TimerContext.tsx destructures the fields into its own context objects),
  // and the handler deps were per-render function expressions that never
  // compared equal, so the memo could not hit.
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
