export interface FreshTrackingState {
  hintsUsed: number
  techniqueHintsUsed: number
  autoFillUsed: boolean
  autoSolveUsed: boolean
  autoSolveStepsUsed: number
  autoSolveErrorsFixed: number
}

export function buildFreshTrackingState(): FreshTrackingState {
  return {
    hintsUsed: 0,
    techniqueHintsUsed: 0,
    autoFillUsed: false,
    autoSolveUsed: false,
    autoSolveStepsUsed: 0,
    autoSolveErrorsFixed: 0,
  }
}
