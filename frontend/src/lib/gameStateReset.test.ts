import { describe, it, expect } from 'vitest'
import { buildFreshTrackingState } from './gameStateReset'

describe('buildFreshTrackingState', () => {
  describe('reset values for each tracking variable', () => {
    it('resets hintsUsed to zero so a new game starts uncounted', () => {
      expect(buildFreshTrackingState().hintsUsed).toBe(0)
    })

    it('resets techniqueHintsUsed to zero', () => {
      expect(buildFreshTrackingState().techniqueHintsUsed).toBe(0)
    })

    it('resets autoFillUsed to false so the fill action is available again', () => {
      expect(buildFreshTrackingState().autoFillUsed).toBe(false)
    })

    it('resets autoSolveUsed to false', () => {
      expect(buildFreshTrackingState().autoSolveUsed).toBe(false)
    })

    it('resets autoSolveStepsUsed to zero', () => {
      expect(buildFreshTrackingState().autoSolveStepsUsed).toBe(0)
    })

    it('resets autoSolveErrorsFixed to zero', () => {
      expect(buildFreshTrackingState().autoSolveErrorsFixed).toBe(0)
    })
  })

  it('returns exactly the six tracking fields so a new variable cannot be silently unreset', () => {
    const fresh = buildFreshTrackingState()

    expect(Object.keys(fresh).sort()).toEqual(
      [
        'autoFillUsed',
        'autoSolveErrorsFixed',
        'autoSolveStepsUsed',
        'autoSolveUsed',
        'hintsUsed',
        'techniqueHintsUsed',
      ].sort(),
    )
  })

  it('returns a fresh object each call so callers cannot mutate shared state', () => {
    const first = buildFreshTrackingState()
    first.hintsUsed = 99

    const second = buildFreshTrackingState()

    expect(second.hintsUsed).toBe(0)
  })
})
