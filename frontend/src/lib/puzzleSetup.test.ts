import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolvePuzzleSetup } from './puzzleSetup'

vi.mock('./scores', () => ({
  isTodayCompleted: vi.fn(() => false),
  getTodayUTC: vi.fn(() => '2024-03-15'),
  getScores: vi.fn(() => []),
}))

import { isTodayCompleted, getTodayUTC, getScores } from './scores'
import type { Score } from './scores'

const mockedIsTodayCompleted = vi.mocked(isTodayCompleted)
const mockedGetTodayUTC = vi.mocked(getTodayUTC)
const mockedGetScores = vi.mocked(getScores)

describe('resolvePuzzleSetup', () => {
  beforeEach(() => {
    mockedIsTodayCompleted.mockReset()
    mockedGetTodayUTC.mockReset()
    mockedGetScores.mockReset()
    mockedIsTodayCompleted.mockReturnValue(false)
    mockedGetTodayUTC.mockReturnValue('2024-03-15')
    mockedGetScores.mockReturnValue([])
  })

  it('treats seed as effectiveSeed, coercing empty string to undefined', () => {
    const setup = resolvePuzzleSetup({
      seed: undefined,
      encoded: undefined,
      pathname: '/',
      difficultyParam: 'medium',
    })
    expect(setup.effectiveSeed).toBeUndefined()
  })

  it('preserves a provided seed as effectiveSeed', () => {
    const setup = resolvePuzzleSetup({
      seed: 'abc-123',
      encoded: undefined,
      pathname: '/abc-123',
      difficultyParam: 'hard',
    })
    expect(setup.effectiveSeed).toBe('abc-123')
  })

  describe('isEncodedCustom', () => {
    it('is true on a /c/ path with an encoded segment', () => {
      expect(
        resolvePuzzleSetup({
          seed: undefined,
          encoded: 'Zm9v',
          pathname: '/c/Zm9v',
          difficultyParam: null,
        }).isEncodedCustom,
      ).toBe(true)
    })

    it('is false on a /c/ path with no encoded segment', () => {
      expect(
        resolvePuzzleSetup({
          seed: undefined,
          encoded: undefined,
          pathname: '/c/',
          difficultyParam: null,
        }).isEncodedCustom,
      ).toBe(false)
    })

    it('is false on a non-/c/ path even when encoded is present', () => {
      expect(
        resolvePuzzleSetup({
          seed: 'daily-x',
          encoded: 'Zm9v',
          pathname: '/daily-x',
          difficultyParam: null,
        }).isEncodedCustom,
      ).toBe(false)
    })
  })

  describe('needsDifficultyChoice', () => {
    it('is false when a difficulty query param is supplied', () => {
      expect(
        resolvePuzzleSetup({
          seed: 's',
          encoded: undefined,
          pathname: '/s',
          difficultyParam: 'hard',
        }).needsDifficultyChoice,
      ).toBe(false)
    })

    it('is false for an encoded custom puzzle', () => {
      expect(
        resolvePuzzleSetup({
          seed: undefined,
          encoded: 'Zm9v',
          pathname: '/c/Zm9v',
          difficultyParam: null,
        }).needsDifficultyChoice,
      ).toBe(false)
    })

    it('is false for a custom- prefixed seed', () => {
      expect(
        resolvePuzzleSetup({
          seed: 'custom-1',
          encoded: undefined,
          pathname: '/custom-1',
          difficultyParam: null,
        }).needsDifficultyChoice,
      ).toBe(false)
    })

    it('is false for a practice- prefixed seed', () => {
      expect(
        resolvePuzzleSetup({
          seed: 'practice-1',
          encoded: undefined,
          pathname: '/practice-1',
          difficultyParam: null,
        }).needsDifficultyChoice,
      ).toBe(false)
    })

    it('is true for a plain seed with no difficulty param and no custom/encoded markers', () => {
      expect(
        resolvePuzzleSetup({
          seed: 'daily-2024-03-14',
          encoded: undefined,
          pathname: '/daily-2024-03-14',
          difficultyParam: null,
        }).needsDifficultyChoice,
      ).toBe(true)
    })
  })

  describe('alreadyCompletedToday and completedDailyScore', () => {
    it("is false and undefined when the seed is not today's daily puzzle", () => {
      mockedGetTodayUTC.mockReturnValue('2024-03-15')
      const setup = resolvePuzzleSetup({
        seed: 'daily-2024-03-14',
        encoded: undefined,
        pathname: '/daily-2024-03-14',
        difficultyParam: 'medium',
      })
      expect(setup.alreadyCompletedToday).toBe(false)
      expect(setup.completedDailyScore).toBeUndefined()
    })

    it("is false when the seed is today's daily puzzle but it has not been completed", () => {
      mockedGetTodayUTC.mockReturnValue('2024-03-15')
      mockedIsTodayCompleted.mockReturnValue(false)
      const setup = resolvePuzzleSetup({
        seed: 'daily-2024-03-15',
        encoded: undefined,
        pathname: '/daily-2024-03-15',
        difficultyParam: 'medium',
      })
      expect(setup.alreadyCompletedToday).toBe(false)
      expect(setup.completedDailyScore).toBeUndefined()
    })

    it("is true and returns the matching score when today's daily puzzle was completed", () => {
      mockedGetTodayUTC.mockReturnValue('2024-03-15')
      mockedIsTodayCompleted.mockReturnValue(true)
      const score: Score = {
        seed: 'daily-2024-03-15',
        difficulty: 'medium',
        timeMs: 12345,
        hintsUsed: 0,
        techniqueHintsUsed: 0,
        mistakes: 0,
        completedAt: '2024-03-15T00:00:00.000Z',
        autoFillUsed: false,
        autoSolveUsed: false,
      }
      mockedGetScores.mockReturnValue([score])
      const setup = resolvePuzzleSetup({
        seed: 'daily-2024-03-15',
        encoded: undefined,
        pathname: '/daily-2024-03-15',
        difficultyParam: 'medium',
      })
      expect(setup.alreadyCompletedToday).toBe(true)
      expect(setup.completedDailyScore).toEqual(score)
    })

    it('returns undefined for completedDailyScore when no stored score matches the seed', () => {
      mockedGetTodayUTC.mockReturnValue('2024-03-15')
      mockedIsTodayCompleted.mockReturnValue(true)
      mockedGetScores.mockReturnValue([])
      const setup = resolvePuzzleSetup({
        seed: 'daily-2024-03-15',
        encoded: undefined,
        pathname: '/daily-2024-03-15',
        difficultyParam: 'medium',
      })
      expect(setup.alreadyCompletedToday).toBe(true)
      expect(setup.completedDailyScore).toBeUndefined()
    })
  })
})
