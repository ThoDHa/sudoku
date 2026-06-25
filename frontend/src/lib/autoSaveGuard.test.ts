import { describe, it, expect } from 'vitest'
import { shouldSuppressAutoSave } from './autoSaveGuard'

const ALLOWED = {
  hasPuzzle: true,
  hasRestoredSavedState: true,
  isComplete: false,
  autoSaveEnabled: true,
} as const

describe('shouldSuppressAutoSave', () => {
  describe('suppressing auto-save during restoration and edge states', () => {
    it('suppresses while the restoration flag is false so a freshly restored game is not overwritten', () => {
      expect(shouldSuppressAutoSave({ ...ALLOWED, hasRestoredSavedState: false })).toBe(true)
    })

    it('suppresses when no puzzle is loaded', () => {
      expect(shouldSuppressAutoSave({ ...ALLOWED, hasPuzzle: false })).toBe(true)
    })

    it('suppresses once the puzzle is complete', () => {
      expect(shouldSuppressAutoSave({ ...ALLOWED, isComplete: true })).toBe(true)
    })

    it('suppresses when the user has auto-save disabled', () => {
      expect(shouldSuppressAutoSave({ ...ALLOWED, autoSaveEnabled: false })).toBe(true)
    })
  })

  describe('allowing auto-save once restoration has completed', () => {
    it('does not suppress when restoration is complete, a puzzle is loaded, and the game is in progress', () => {
      expect(shouldSuppressAutoSave(ALLOWED)).toBe(false)
    })

    it('does not suppress the very first save after the restoration flag flips to true', () => {
      expect(shouldSuppressAutoSave({ ...ALLOWED, hasRestoredSavedState: true })).toBe(false)
    })
  })
})
