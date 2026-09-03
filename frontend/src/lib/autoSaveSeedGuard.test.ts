import { describe, it, expect } from 'vitest'
import { shouldAllowStaleSave, type AutoSaveSeedGuardInputs } from './autoSaveSeedGuard'

describe('shouldAllowStaleSave', () => {
  describe('allowing a legitimate in-flight save for the active puzzle', () => {
    it('allows the save when the scheduled seed still matches the current seed', () => {
      expect(shouldAllowStaleSave({ scheduledSeed: 'P123', currentSeed: 'P123' })).toBe(true)
    })

    it('allows a daily seed save that has not been navigated away from', () => {
      expect(
        shouldAllowStaleSave({
          scheduledSeed: 'daily-2026-07-10',
          currentSeed: 'daily-2026-07-10',
        }),
      ).toBe(true)
    })
  })

  describe('autoSaveSeedGuard blocks a stale save after navigating to a new puzzle', () => {
    it('blocks the stale save so clearOtherGamesForMode cannot delete the new puzzle save', () => {
      expect(shouldAllowStaleSave({ scheduledSeed: 'P123', currentSeed: 'P456' })).toBe(false)
    })

    it('blocks the stale save when navigating between daily puzzles of different dates', () => {
      expect(
        shouldAllowStaleSave({
          scheduledSeed: 'daily-2026-07-10',
          currentSeed: 'daily-2026-07-11',
        }),
      ).toBe(false)
    })

    it('blocks the stale save when moving from a practice puzzle to a daily puzzle', () => {
      expect(shouldAllowStaleSave({ scheduledSeed: 'P123', currentSeed: 'daily-2026-07-10' })).toBe(
        false,
      )
    })
  })

  describe('autoSaveSeedGuard blocks a stale save after the puzzle unloads', () => {
    it('blocks the stale save when the current seed has cleared to null on unmount', () => {
      expect(shouldAllowStaleSave({ scheduledSeed: 'P123', currentSeed: null })).toBe(false)
    })

    it('blocks the stale save when no seed was scheduled (defensive null scheduledSeed)', () => {
      const inputs: AutoSaveSeedGuardInputs = { scheduledSeed: null, currentSeed: 'P123' }
      expect(shouldAllowStaleSave(inputs)).toBe(false)
    })

    it('blocks when both seeds are null so a fully torn-down component cannot write', () => {
      expect(shouldAllowStaleSave({ scheduledSeed: null, currentSeed: null })).toBe(false)
    })
  })
})
