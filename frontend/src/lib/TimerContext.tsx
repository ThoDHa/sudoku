import { createContext, useContext, useMemo, useRef, useCallback, ReactNode } from 'react'
import { useGameTimer } from '../hooks/useGameTimer'
import { useBackgroundManagerContext } from './BackgroundManagerContext'

// The return type of useGameTimer
type GameTimerReturn = ReturnType<typeof useGameTimer>

// Split the context into two parts:
// 1. TimerControlContext - for controls (start, pause, reset, setElapsedMs) - rarely changes
// 2. TimerDisplayContext - for display values (elapsedMs, formatTime) - changes every second

interface TimerControlContextType {
  isRunning: boolean
  isPausedDueToVisibility: boolean
  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void
  setElapsedMs: (ms: number) => void
  /** Get current elapsed time without subscribing to updates (for saves, scores, etc.) */
  getElapsedMs: () => number
  /** Format time without subscribing to updates */
  formatTime: (ms?: number) => string
}

interface TimerDisplayContextType {
  elapsedMs: number
  formatTime: (ms?: number) => string
}

const TimerControlContext = createContext<TimerControlContextType | undefined>(undefined)
const TimerDisplayContext = createContext<TimerDisplayContextType | undefined>(undefined)

interface TimerProviderProps {
  children: ReactNode
  /** Whether to auto-start the timer (default: false) */
  autoStart?: boolean
  /** Pause timer when tab is hidden or window loses focus (default: true) */
  pauseOnHidden?: boolean
}

/**
 * Provider that creates a game timer instance and splits it into two contexts:
 * - TimerControlContext: For components that control the timer (Game.tsx)
 * - TimerDisplayContext: For components that display the timer (TimerDisplay)
 * 
 * This separation ensures that only components subscribing to TimerDisplayContext
 * re-render when the timer ticks, not the entire Game component tree.
 */
export function TimerProvider({ 
  children, 
  autoStart = false,
  pauseOnHidden = true 
}: TimerProviderProps) {
  const backgroundManager = useBackgroundManagerContext()
  
  const timer = useGameTimer({
    autoStart,
    pauseOnHidden,
    backgroundManager,
  })

  // Keep elapsedMs in a ref for getElapsedMs() - allows reading without subscribing
  const elapsedMsRef = useRef(timer.elapsedMs)
  elapsedMsRef.current = timer.elapsedMs

  // Stable callback to get elapsed time without causing re-renders
  const getElapsedMs = useCallback(() => elapsedMsRef.current, [])

  // Split into control context (stable except for isRunning/isPausedDueToVisibility)
  const controlValue = useMemo<TimerControlContextType>(() => ({
    isRunning: timer.isRunning,
    isPausedDueToVisibility: timer.isPausedDueToVisibility,
    startTimer: timer.startTimer,
    pauseTimer: timer.pauseTimer,
    resetTimer: timer.resetTimer,
    setElapsedMs: timer.setElapsedMs,
    getElapsedMs,
    formatTime: timer.formatTime,
  }), [
    timer.isRunning,
    timer.isPausedDueToVisibility,
    timer.startTimer,
    timer.pauseTimer,
    timer.resetTimer,
    timer.setElapsedMs,
    getElapsedMs,
    timer.formatTime,
  ])

  // Display context - changes every second (only TimerDisplay subscribes)
  const displayValue = useMemo<TimerDisplayContextType>(() => ({
    elapsedMs: timer.elapsedMs,
    formatTime: timer.formatTime,
  }), [timer.elapsedMs, timer.formatTime])

  return (
    <TimerControlContext.Provider value={controlValue}>
      <TimerDisplayContext.Provider value={displayValue}>
        {children}
      </TimerDisplayContext.Provider>
    </TimerControlContext.Provider>
  )
}

/**
 * Hook to access timer controls (start, pause, reset, etc.)
 * This context updates rarely - only when isRunning or isPausedDueToVisibility changes.
 * Safe to use in Game.tsx without causing re-renders on every tick.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Hook is co-located with context provider
export function useTimerControl(): TimerControlContextType {
  const context = useContext(TimerControlContext)
  if (context === undefined) {
    throw new Error('useTimerControl must be used within a TimerProvider')
  }
  return context
}

/**
 * Hook to access timer display values (elapsedMs, formatTime).
 * This context updates every second - ONLY use in components that display the timer.
 * Do NOT use in Game.tsx or it will re-render 81 cells every second!
 */
// eslint-disable-next-line react-refresh/only-export-components -- Hook is co-located with context provider
export function useTimerDisplay(): TimerDisplayContextType {
  const context = useContext(TimerDisplayContext)
  if (context === undefined) {
    throw new Error('useTimerDisplay must be used within a TimerProvider')
  }
  return context
}

/**
 * Hook that combines both contexts for components that need everything.
 * WARNING: Using this will cause re-renders every second!
 * Prefer useTimerControl + useTimerDisplay separately when possible.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Hook is co-located with context provider
export function useTimer(): GameTimerReturn {
  const control = useTimerControl()
  const display = useTimerDisplay()
  
  return {
    ...control,
    ...display,
  }
}
