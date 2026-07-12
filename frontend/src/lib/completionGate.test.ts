import { describe, it, expect } from 'vitest'
import { resolveCompletionAction, type CompletionGateInputs } from './completionGate'

describe('resolveCompletionAction', () => {
  const PLAYER_COMPLETING: CompletionGateInputs = {
    isComplete: true,
    restoredAsComplete: false,
  }

  describe('recording a legitimate play-time completion exactly once', () => {
    it("records when the player places the final digit themselves (no restore flag)", () => {
      expect(resolveCompletionAction(PLAYER_COMPLETING)).toBe('record')
    })

    it("records after a restored-complete board is undone and re-finished (flag cleared)", () => {
      expect(resolveCompletionAction({ isComplete: true, restoredAsComplete: false })).toBe('record')
    })
  })

  describe('suppressing recording for a restored already-complete board', () => {
    it("returns show-only when a saved game is restored already solved", () => {
      expect(
        resolveCompletionAction({ isComplete: true, restoredAsComplete: true }),
      ).toBe('show-only')
    })

    it("returns show-only so saveScore and markDailyCompleted are never called on reload", () => {
      const action = resolveCompletionAction({
        isComplete: true,
        restoredAsComplete: true,
      })
      expect(action).not.toBe('record')
    })
  })

  describe('suppressing recording for a shared already-solved board', () => {
    it("returns show-only so the recipient sees the result view but records nothing", () => {
      expect(
        resolveCompletionAction({ isComplete: true, restoredAsComplete: true }),
      ).toBe('show-only')
    })

    it("never returns record for a shared solved board even though isComplete is true", () => {
      expect(
        resolveCompletionAction({ isComplete: true, restoredAsComplete: true }),
      ).not.toBe('record')
    })
  })

  describe('clearing the restored flag while the board is incomplete', () => {
    it("returns none when the board is not complete so the flag can be cleared", () => {
      expect(resolveCompletionAction({ isComplete: false, restoredAsComplete: true })).toBe('none')
    })

    it("returns none for an in-progress board with no restore flag", () => {
      expect(resolveCompletionAction({ isComplete: false, restoredAsComplete: false })).toBe('none')
    })
  })
})
