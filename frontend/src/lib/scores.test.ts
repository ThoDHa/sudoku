import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { 
  formatTime, 
  generateShareText, 
  generatePuzzleUrl, 
  getScores,
  saveScore,
  getBestScoresPure,
  getBestScoresAssisted,
  getRecentScores,
  isDailySeed,
  getDailyDate,
  getTodayUTC,
  getDailyCompletions,
  isTodayCompleted,
  getDailyStreak,
  markDailyCompleted,
  type Score 
} from './scores'
import { STORAGE_KEYS, MAX_STORED_SCORES } from './constants'

// Mock localStorage - use an object wrapper so we can clear it properly
const mockStoreWrapper = { store: {} as Record<string, string> }

const localStorageMock = {
  getItem: vi.fn((key: string) => mockStoreWrapper.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockStoreWrapper.store[key] = value }),
  removeItem: vi.fn((key: string) => { delete mockStoreWrapper.store[key] }),
  clear: vi.fn(() => { mockStoreWrapper.store = {} })
}

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Mock window.location for generatePuzzleUrl
Object.defineProperty(globalThis, 'window', {
  value: {
    location: {
      origin: 'https://example.com'
    }
  },
  writable: true
})

describe('scores', () => {
  beforeEach(() => {
    // Clear the mock store completely
    mockStoreWrapper.store = {}
    // Reset all mock call history
    vi.clearAllMocks()
    // Restore the default implementations
    localStorageMock.getItem.mockImplementation((key: string) => mockStoreWrapper.store[key] ?? null)
    localStorageMock.setItem.mockImplementation((key: string, value: string) => { mockStoreWrapper.store[key] = value })
  })

  describe('formatTime', () => {
    it('should format seconds correctly', () => {
      expect(formatTime(0)).toBe('0:00')
      expect(formatTime(1000)).toBe('0:01')
      expect(formatTime(30000)).toBe('0:30')
      expect(formatTime(59000)).toBe('0:59')
    })

    it('should format minutes correctly', () => {
      expect(formatTime(60000)).toBe('1:00')
      expect(formatTime(90000)).toBe('1:30')
      expect(formatTime(600000)).toBe('10:00')
      expect(formatTime(3599000)).toBe('59:59')
    })

    it('should format hours correctly', () => {
      expect(formatTime(3600000)).toBe('1:00:00')
      expect(formatTime(3661000)).toBe('1:01:01')
      expect(formatTime(7200000)).toBe('2:00:00')
      expect(formatTime(36000000)).toBe('10:00:00')
    })

    it('should round down partial seconds', () => {
      expect(formatTime(1500)).toBe('0:01')
      expect(formatTime(1999)).toBe('0:01')
    })
  })

  describe('generateShareText', () => {
    const baseScore: Score = {
      seed: 'daily-2024-01-15',
      difficulty: 'medium',
      timeMs: 300000, // 5 minutes
      hintsUsed: 0,
      mistakes: 0,
      completedAt: '2024-01-15T12:00:00Z'
    }

    it('should generate text for daily puzzle', () => {
      const text = generateShareText(baseScore, 'https://example.com')
      
      expect(text).toContain('Daily Sudoku 2024-01-15')
      expect(text).toContain('Medium')
      expect(text).toContain('5:00')
      expect(text).toContain('https://example.com')
    })

    it('should include streak for daily puzzles', () => {
      const text = generateShareText(baseScore, 'https://example.com', 5)
      
      expect(text).toContain('Daily Sudoku 2024-01-15')
      expect(text).toContain('🔥 5 day streak')
    })

    it('should not include streak of 1', () => {
      const text = generateShareText(baseScore, 'https://example.com', 1)
      
      expect(text).not.toContain('streak')
    })

    it('should generate text for practice puzzle', () => {
      const score = { ...baseScore, seed: 'abc123' }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('Sudoku')
      expect(text).not.toContain('(Practice)')
      expect(text).not.toContain('2024')
    })

    it('should generate text for custom puzzle', () => {
      const score = { ...baseScore, seed: 'custom123', difficulty: 'custom' }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('Sudoku (Custom)')
    })

    it('should include hints if used', () => {
      const score = { ...baseScore, hintsUsed: 3 }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('3 hints')
    })

    it('should include singular hint', () => {
      const score = { ...baseScore, hintsUsed: 1 }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('1 hint')
      expect(text).not.toContain('hints')
    })

    it('should include auto-fill indicator', () => {
      const score = { ...baseScore, autoFillUsed: true }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('auto-fill')
    })

    it('should include auto-solve indicator', () => {
      const score = { ...baseScore, autoSolveUsed: true }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('solved')
    })

    it('should show auto-solve instead of hints when both used', () => {
      const score = { ...baseScore, hintsUsed: 5, autoSolveUsed: true }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('solved')
      expect(text).not.toContain('5 hints')
    })

    it('should combine multiple assists', () => {
      const score = { ...baseScore, hintsUsed: 2, autoFillUsed: true }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('2 hints')
      expect(text).toContain('auto-fill')
    })

    it('should include technique hints if used', () => {
      const score = { ...baseScore, techniqueHintsUsed: 3 }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('3 technique hints')
    })

    it('should include singular technique hint', () => {
      const score = { ...baseScore, techniqueHintsUsed: 1 }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('1 technique hint')
      expect(text).not.toContain('technique hints')
    })

    it('should combine hints and technique hints', () => {
      const score = { ...baseScore, hintsUsed: 2, techniqueHintsUsed: 3 }
      const text = generateShareText(score, 'https://example.com')
      
      expect(text).toContain('2 hints')
      expect(text).toContain('3 technique hints')
    })
  })

  describe('generatePuzzleUrl', () => {
    const baseScore: Score = {
      seed: '2024-01-15',
      difficulty: 'medium',
      timeMs: 300000,
      hintsUsed: 0,
      mistakes: 0,
      completedAt: '2024-01-15T12:00:00Z'
    }

    it('should generate URL for daily/practice puzzle', () => {
      const url = generatePuzzleUrl(baseScore)
      
      // Uses window.location.origin + import.meta.env.BASE_URL
      // Routes are now /:seed (no /p/ prefix)
      expect(url).toContain('/2024-01-15')
      expect(url).not.toContain('/p/')
    })

    it('should generate URL for custom puzzle with encoded data', () => {
      const score = { 
        ...baseScore, 
        difficulty: 'custom',
        encodedPuzzle: 'sABCDEF123'
      }
      const url = generatePuzzleUrl(score)
      
      expect(url).toContain('/c/sABCDEF123')
    })

    it('should generate URL for custom puzzle without encoded data', () => {
      const score = { ...baseScore, difficulty: 'custom' }
      const url = generatePuzzleUrl(score)
      
      expect(url).toContain('/custom')
    })

    it('should NOT include difficulty in URL - recipient chooses their own', () => {
      const easyScore = { ...baseScore, difficulty: 'easy' }
      const hardScore = { ...baseScore, difficulty: 'hard' }
      
      // URLs should NOT contain difficulty param - recipient chooses
      expect(generatePuzzleUrl(easyScore)).not.toContain('d=')
      expect(generatePuzzleUrl(hardScore)).not.toContain('d=')
      // But should contain the seed (routes are now /:seed, no /p/ prefix)
      expect(generatePuzzleUrl(easyScore)).toContain('/2024-01-15')
      expect(generatePuzzleUrl(hardScore)).toContain('/2024-01-15')
      // Should NOT have the old /p/ prefix
      expect(generatePuzzleUrl(easyScore)).not.toContain('/p/')
      expect(generatePuzzleUrl(hardScore)).not.toContain('/p/')
    })
  })

  // =========================================================================
  // NEW TESTS FOR UNTESTED FUNCTIONS
  // =========================================================================

  describe('getScores', () => {
    it('should return empty array when no scores in localStorage', () => {
      expect(getScores()).toEqual([])
    })

    it('should return parsed scores from localStorage', () => {
      const mockScores: Score[] = [
        {
          seed: 'test-seed',
          difficulty: 'easy',
          timeMs: 60000,
          hintsUsed: 0,
          mistakes: 0,
          completedAt: '2024-01-15T12:00:00Z'
        }
      ]
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(mockScores)
      
      const result = getScores()
      expect(result).toEqual(mockScores)
      expect(localStorageMock.getItem).toHaveBeenCalledWith(STORAGE_KEYS.SCORES)
    })

    it('should return empty array on JSON parse error', () => {
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = 'invalid json {{{'
      expect(getScores()).toEqual([])
    })
  })

  describe('saveScore', () => {
    it('should save a new score to localStorage', () => {
      const newScore: Score = {
        seed: 'new-seed',
        difficulty: 'medium',
        timeMs: 120000,
        hintsUsed: 1,
        mistakes: 2,
        completedAt: '2024-01-16T12:00:00Z'
      }
      
      saveScore(newScore)
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.SCORES,
        expect.stringContaining('new-seed')
      )
    })

    it('should prepend new score to existing scores', () => {
      const existingScores: Score[] = [
        {
          seed: 'old-seed',
          difficulty: 'easy',
          timeMs: 60000,
          hintsUsed: 0,
          mistakes: 0,
          completedAt: '2024-01-15T12:00:00Z'
        }
      ]
      // Pre-populate the store
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(existingScores)
      
      const newScore: Score = {
        seed: 'new-seed',
        difficulty: 'medium',
        timeMs: 120000,
        hintsUsed: 0,
        mistakes: 0,
        completedAt: '2024-01-16T12:00:00Z'
      }
      
      saveScore(newScore)
      
      const savedData = JSON.parse(mockStoreWrapper.store[STORAGE_KEYS.SCORES])
      expect(savedData[0].seed).toBe('new-seed')
      expect(savedData[1].seed).toBe('old-seed')
    })

    it('should trim scores to MAX_STORED_SCORES', () => {
      // Create array of MAX_STORED_SCORES existing scores
      const existingScores: Score[] = Array.from({ length: MAX_STORED_SCORES }, (_, i) => ({
        seed: `seed-${i}`,
        difficulty: 'easy',
        timeMs: 60000,
        hintsUsed: 0,
        mistakes: 0,
        completedAt: '2024-01-15T12:00:00Z'
      }))
      // Pre-populate the store
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(existingScores)
      
      const newScore: Score = {
        seed: 'newest-seed',
        difficulty: 'hard',
        timeMs: 180000,
        hintsUsed: 0,
        mistakes: 0,
        completedAt: '2024-01-17T12:00:00Z'
      }
      
      saveScore(newScore)
      
      const savedData = JSON.parse(mockStoreWrapper.store[STORAGE_KEYS.SCORES])
      expect(savedData.length).toBe(MAX_STORED_SCORES)
      expect(savedData[0].seed).toBe('newest-seed')
      // The last old score should be trimmed
      expect(savedData[MAX_STORED_SCORES - 1].seed).toBe(`seed-${MAX_STORED_SCORES - 2}`)
    })
  })

  describe('getBestScoresPure', () => {
    it('should return empty object when no scores', () => {
      expect(getBestScoresPure()).toEqual({})
    })

    it('should return best score per difficulty without assists', () => {
      const scores: Score[] = [
        { seed: 's1', difficulty: 'easy', timeMs: 120000, hintsUsed: 0, mistakes: 0, completedAt: '' },
        { seed: 's2', difficulty: 'easy', timeMs: 60000, hintsUsed: 0, mistakes: 0, completedAt: '' },  // Best easy
        { seed: 's3', difficulty: 'medium', timeMs: 180000, hintsUsed: 0, mistakes: 0, completedAt: '' },
      ]
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getBestScoresPure()
      expect(result['easy']?.timeMs).toBe(60000)
      expect(result['medium']?.timeMs).toBe(180000)
    })

    it('should exclude scores with hints used', () => {
      const scores: Score[] = [
        { seed: 's1', difficulty: 'easy', timeMs: 30000, hintsUsed: 1, mistakes: 0, completedAt: '' }, // Has hints
        { seed: 's2', difficulty: 'easy', timeMs: 60000, hintsUsed: 0, mistakes: 0, completedAt: '' }, // Pure
      ]
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getBestScoresPure()
      expect(result['easy']?.timeMs).toBe(60000)
    })

    it('should exclude scores with technique hints used', () => {
      const scores: Score[] = [
        { seed: 's1', difficulty: 'easy', timeMs: 30000, hintsUsed: 0, techniqueHintsUsed: 2, mistakes: 0, completedAt: '' },
        { seed: 's2', difficulty: 'easy', timeMs: 60000, hintsUsed: 0, mistakes: 0, completedAt: '' },
      ]
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getBestScoresPure()
      expect(result['easy']?.timeMs).toBe(60000)
    })

    it('should exclude scores with auto-solve used', () => {
      const scores: Score[] = [
        { seed: 's1', difficulty: 'easy', timeMs: 10000, hintsUsed: 0, autoSolveUsed: true, mistakes: 0, completedAt: '' },
        { seed: 's2', difficulty: 'easy', timeMs: 60000, hintsUsed: 0, mistakes: 0, completedAt: '' },
      ]
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getBestScoresPure()
      expect(result['easy']?.timeMs).toBe(60000)
    })
  })

  describe('getBestScoresAssisted', () => {
    it('should return empty object when no scores', () => {
      expect(getBestScoresAssisted()).toEqual({})
    })

    it('should only include assisted scores', () => {
      const scores: Score[] = [
        { seed: 's1', difficulty: 'easy', timeMs: 60000, hintsUsed: 0, mistakes: 0, completedAt: '' }, // Pure - excluded
        { seed: 's2', difficulty: 'easy', timeMs: 90000, hintsUsed: 2, mistakes: 0, completedAt: '' }, // Assisted
        { seed: 's3', difficulty: 'medium', timeMs: 120000, hintsUsed: 0, autoSolveUsed: true, mistakes: 0, completedAt: '' },
      ]
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getBestScoresAssisted()
      expect(result['easy']?.timeMs).toBe(90000)
      expect(result['medium']?.timeMs).toBe(120000)
    })

    it('should return best assisted score per difficulty', () => {
      const scores: Score[] = [
        { seed: 's1', difficulty: 'hard', timeMs: 300000, hintsUsed: 5, mistakes: 0, completedAt: '' },
        { seed: 's2', difficulty: 'hard', timeMs: 200000, hintsUsed: 3, mistakes: 0, completedAt: '' }, // Best
        { seed: 's3', difficulty: 'hard', timeMs: 250000, hintsUsed: 1, mistakes: 0, completedAt: '' },
      ]
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getBestScoresAssisted()
      expect(result['hard']?.timeMs).toBe(200000)
    })

    it('should include scores with technique hints', () => {
      const scores: Score[] = [
        { seed: 's1', difficulty: 'easy', timeMs: 60000, hintsUsed: 0, techniqueHintsUsed: 1, mistakes: 0, completedAt: '' },
      ]
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getBestScoresAssisted()
      expect(result['easy']?.timeMs).toBe(60000)
    })
  })

  describe('getRecentScores', () => {
    it('should return empty array when no scores', () => {
      expect(getRecentScores()).toEqual([])
    })

    it('should return default 10 scores', () => {
      const scores: Score[] = Array.from({ length: 15 }, (_, i) => ({
        seed: `seed-${i}`,
        difficulty: 'easy',
        timeMs: 60000,
        hintsUsed: 0,
        mistakes: 0,
        completedAt: ''
      }))
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getRecentScores()
      expect(result.length).toBe(10)
      expect(result[0].seed).toBe('seed-0')
    })

    it('should return custom limit of scores', () => {
      const scores: Score[] = Array.from({ length: 15 }, (_, i) => ({
        seed: `seed-${i}`,
        difficulty: 'easy',
        timeMs: 60000,
        hintsUsed: 0,
        mistakes: 0,
        completedAt: ''
      }))
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getRecentScores(5)
      expect(result.length).toBe(5)
    })

    it('should return all scores if less than limit', () => {
      const scores: Score[] = [
        { seed: 's1', difficulty: 'easy', timeMs: 60000, hintsUsed: 0, mistakes: 0, completedAt: '' },
        { seed: 's2', difficulty: 'easy', timeMs: 60000, hintsUsed: 0, mistakes: 0, completedAt: '' },
      ]
      mockStoreWrapper.store[STORAGE_KEYS.SCORES] = JSON.stringify(scores)
      
      const result = getRecentScores(10)
      expect(result.length).toBe(2)
    })
  })

  describe('isDailySeed', () => {
    it('should return true for valid daily seed format', () => {
      expect(isDailySeed('daily-2024-01-15')).toBe(true)
      expect(isDailySeed('daily-2025-12-31')).toBe(true)
      expect(isDailySeed('daily-1999-06-05')).toBe(true)
    })

    it('should return false for invalid daily seed formats', () => {
      expect(isDailySeed('2024-01-15')).toBe(false)
      expect(isDailySeed('daily-24-01-15')).toBe(false)
      expect(isDailySeed('daily-2024-1-15')).toBe(false)
      expect(isDailySeed('daily-2024-01-5')).toBe(false)
      expect(isDailySeed('practice-2024-01-15')).toBe(false)
      expect(isDailySeed('daily-2024-01-15-extra')).toBe(false)
      expect(isDailySeed('abc123')).toBe(false)
      expect(isDailySeed('')).toBe(false)
    })
  })

  describe('getDailyDate', () => {
    it('should extract date from valid daily seed', () => {
      expect(getDailyDate('daily-2024-01-15')).toBe('2024-01-15')
      expect(getDailyDate('daily-2025-12-31')).toBe('2025-12-31')
    })

    it('should return null for invalid daily seed', () => {
      expect(getDailyDate('2024-01-15')).toBe(null)
      expect(getDailyDate('practice-2024-01-15')).toBe(null)
      expect(getDailyDate('abc123')).toBe(null)
      expect(getDailyDate('')).toBe(null)
    })
  })

  describe('getTodayUTC', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return current UTC date in YYYY-MM-DD format', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      expect(getTodayUTC()).toBe('2024-06-15')
    })

    it('should handle month and day padding', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-05T10:00:00Z'))
      
      expect(getTodayUTC()).toBe('2024-01-05')
    })

    it('should handle year boundary', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-12-31T23:59:59Z'))
      
      expect(getTodayUTC()).toBe('2024-12-31')
    })
  })

  describe('getDailyCompletions', () => {
    it('should return empty set when no completions', () => {
      const result = getDailyCompletions()
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })

    it('should return set of completed dates', () => {
      const completions = ['2024-01-15', '2024-01-16', '2024-01-17']
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_COMPLETIONS] = JSON.stringify(completions)
      
      const result = getDailyCompletions()
      expect(result.size).toBe(3)
      expect(result.has('2024-01-15')).toBe(true)
      expect(result.has('2024-01-16')).toBe(true)
      expect(result.has('2024-01-17')).toBe(true)
    })

    it('should return empty set on JSON parse error', () => {
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_COMPLETIONS] = 'invalid json'
      
      const result = getDailyCompletions()
      expect(result.size).toBe(0)
    })
  })

  describe('isTodayCompleted', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return false when no completions', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      expect(isTodayCompleted()).toBe(false)
    })

    it('should return true when today is completed', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      const completions = ['2024-06-14', '2024-06-15']
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_COMPLETIONS] = JSON.stringify(completions)
      
      expect(isTodayCompleted()).toBe(true)
    })

    it('should return false when today is not completed', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      const completions = ['2024-06-13', '2024-06-14']
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_COMPLETIONS] = JSON.stringify(completions)
      
      expect(isTodayCompleted()).toBe(false)
    })
  })

  describe('getDailyStreak', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return default streak when no data', () => {
      const result = getDailyStreak()
      expect(result).toEqual({
        currentStreak: 0,
        longestStreak: 0,
        lastCompletedDate: null
      })
    })

    it('should return saved streak when last completed is today', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      const streakData = {
        currentStreak: 5,
        longestStreak: 10,
        lastCompletedDate: '2024-06-15'
      }
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK] = JSON.stringify(streakData)
      
      const result = getDailyStreak()
      expect(result).toEqual(streakData)
    })

    it('should return saved streak when last completed is yesterday', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      const streakData = {
        currentStreak: 5,
        longestStreak: 10,
        lastCompletedDate: '2024-06-14'
      }
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK] = JSON.stringify(streakData)
      
      const result = getDailyStreak()
      expect(result).toEqual(streakData)
    })

    it('should reset current streak when last completed is older than yesterday', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      const streakData = {
        currentStreak: 5,
        longestStreak: 10,
        lastCompletedDate: '2024-06-13' // 2 days ago - streak broken
      }
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK] = JSON.stringify(streakData)
      
      const result = getDailyStreak()
      expect(result).toEqual({
        currentStreak: 0,
        longestStreak: 10, // Preserved
        lastCompletedDate: '2024-06-13'
      })
    })

    it('should return default streak on JSON parse error', () => {
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK] = 'invalid json'
      
      const result = getDailyStreak()
      expect(result).toEqual({
        currentStreak: 0,
        longestStreak: 0,
        lastCompletedDate: null
      })
    })
  })

  describe('markDailyCompleted', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('should add today to completions and start new streak', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      // No existing completions or streak data
      
      markDailyCompleted()
      
      // Check completions were saved
      const savedCompletions = JSON.parse(mockStoreWrapper.store[STORAGE_KEYS.DAILY_COMPLETIONS])
      expect(savedCompletions).toContain('2024-06-15')
      
      // Check streak was saved
      const savedStreak = JSON.parse(mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK])
      expect(savedStreak.currentStreak).toBe(1)
      expect(savedStreak.lastCompletedDate).toBe('2024-06-15')
    })

    it('should continue streak when completed yesterday', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      // Set up existing data
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_COMPLETIONS] = JSON.stringify(['2024-06-14'])
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK] = JSON.stringify({
        currentStreak: 3,
        longestStreak: 5,
        lastCompletedDate: '2024-06-14'
      })
      
      markDailyCompleted()
      
      // Check streak was incremented
      const savedStreak = JSON.parse(mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK])
      expect(savedStreak.currentStreak).toBe(4)
      expect(savedStreak.lastCompletedDate).toBe('2024-06-15')
    })

    it('should update longest streak when current exceeds it', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      // Set up existing data where current equals longest
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_COMPLETIONS] = JSON.stringify(['2024-06-14'])
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK] = JSON.stringify({
        currentStreak: 5,
        longestStreak: 5,
        lastCompletedDate: '2024-06-14'
      })
      
      markDailyCompleted()
      
      const savedStreak = JSON.parse(mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK])
      expect(savedStreak.currentStreak).toBe(6)
      expect(savedStreak.longestStreak).toBe(6)
    })

    it('should not save if already completed today', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      // Already completed today
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_COMPLETIONS] = JSON.stringify(['2024-06-15'])
      const originalStreak = JSON.stringify({
        currentStreak: 3,
        longestStreak: 5,
        lastCompletedDate: '2024-06-15'
      })
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK] = originalStreak
      
      markDailyCompleted()
      
      // Streak should not have changed
      expect(mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK]).toBe(originalStreak)
    })

    it('should start new streak when previous streak is broken', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      
      // Old completion, streak broken
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_COMPLETIONS] = JSON.stringify(['2024-06-10'])
      mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK] = JSON.stringify({
        currentStreak: 3,
        longestStreak: 10,
        lastCompletedDate: '2024-06-10'
      })
      
      markDailyCompleted()
      
      const savedStreak = JSON.parse(mockStoreWrapper.store[STORAGE_KEYS.DAILY_STREAK])
      expect(savedStreak.currentStreak).toBe(1) // New streak started
      expect(savedStreak.longestStreak).toBe(10) // Preserved
    })
  })
})
