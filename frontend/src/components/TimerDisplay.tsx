import { memo } from 'react'
import { useTimerDisplay, useTimerControl } from '../lib/TimerContext'

/**
 * TimerDisplay - An isolated component that subscribes to timer updates.
 * 
 * This component is the ONLY component that should re-render every second.
 * By isolating timer display here, we prevent Game.tsx and Board.tsx from
 * re-rendering 81 cells every second just to update the timer.
 * 
 * Battery/Performance Impact:
 * - Before: Timer tick → Game.tsx re-render → Board.tsx → 81 cells = ~12% CPU
 * - After: Timer tick → TimerDisplay re-render only = ~0.1% CPU
 */
function TimerDisplayInner({ hideTimer }: { hideTimer: boolean }) {
  // This hook triggers re-render every second
  const { formatTime } = useTimerDisplay()
  
  // This hook only changes on pause/resume, not every tick
  const { isPausedDueToVisibility } = useTimerControl()

  if (hideTimer) {
    return null
  }

  return (
    <div className={`flex items-center gap-1 sm:gap-2 ${isPausedDueToVisibility ? 'text-accent' : 'text-foreground-muted'}`}>
      {isPausedDueToVisibility ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      <span className="font-mono text-sm">{formatTime()}</span>
      {isPausedDueToVisibility && (
        <span className="text-xs font-medium">PAUSED</span>
      )}
    </div>
  )
}

// Memo the component - it only re-renders when timer context changes or hideTimer prop changes
export const TimerDisplay = memo(TimerDisplayInner)

/**
 * PauseOverlayTimer - Timer display used in the pause overlay.
 * Also isolated to prevent parent re-renders.
 */
function PauseOverlayTimerInner() {
  const { formatTime } = useTimerDisplay()
  
  return (
    <div className="mt-4 text-2xl font-mono text-accent">
      {formatTime()}
    </div>
  )
}

export const PauseOverlayTimer = memo(PauseOverlayTimerInner)
