import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildDebugInfo, formatDebugJson, isLocalStorageAvailable, type DebugInfo } from './debugInfo'

vi.mock('./scores', () => ({
  getScores: vi.fn(() => [
    { seed: 'a', difficulty: 'easy', timeMs: 1000, hintsUsed: 0, completedAt: '2026-01-01' },
    { seed: 'b', difficulty: 'medium', timeMs: 2000, hintsUsed: 1, completedAt: '2026-01-02' },
    { seed: 'c', difficulty: 'hard', timeMs: 3000, hintsUsed: 0, completedAt: '2026-01-03' },
  ]),
  getDailyStreak: vi.fn(() => ({
    currentStreak: 5,
    longestStreak: 12,
    lastCompletedDate: '2026-03-28',
  })),
  getDailyCompletions: vi.fn(() => new Set(['2026-03-26', '2026-03-27', '2026-03-28'])),
}))

describe('debugInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildDebugInfo', () => {
    it('should return an object with all required top-level keys', () => {
      const result = buildDebugInfo('/', 'blue', 'dark', 'daily')

      expect(result).toHaveProperty('timestamp')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('settings')
      expect(result).toHaveProperty('stats')
      expect(result).toHaveProperty('browser')
      expect(result).toHaveProperty('storage')
    })

    it('should include a valid ISO timestamp', () => {
      const result = buildDebugInfo('/', 'blue', 'dark', 'daily')
      const parsed = new Date(result.timestamp)

      expect(parsed.toISOString()).toBe(result.timestamp)
      expect(parsed.getTime()).not.toBeNaN()
    })

    it('should reflect the provided page pathname', () => {
      const result = buildDebugInfo('/leaderboard', 'blue', 'dark', 'daily')
      expect(result.page).toBe('/leaderboard')
    })

    it('should reflect the provided settings', () => {
      const result = buildDebugInfo('/', 'green', 'light', 'game')

      expect(result.settings.colorTheme).toBe('green')
      expect(result.settings.mode).toBe('light')
      expect(result.settings.homepageMode).toBe('game')
    })

    it('should include stats from scores and streak data', () => {
      const result = buildDebugInfo('/', 'blue', 'dark', 'daily')

      expect(result.stats.totalGamesPlayed).toBe(3)
      expect(result.stats.dailyStreak).toBe(5)
      expect(result.stats.longestStreak).toBe(12)
      expect(result.stats.dailyCompletions).toBe(3)
    })

    it('should include browser info with expected types', () => {
      const result = buildDebugInfo('/', 'blue', 'dark', 'daily')

      expect(typeof result.browser.userAgent).toBe('string')
      expect(typeof result.browser.language).toBe('string')
      expect(typeof result.browser.cookiesEnabled).toBe('boolean')
      expect(typeof result.browser.onLine).toBe('boolean')
      expect(result.browser.screenSize).toMatch(/^\d+x\d+$/)
      expect(result.browser.viewportSize).toMatch(/^\d+x\d+$/)
      expect(typeof result.browser.devicePixelRatio).toBe('number')
    })

    it('should include storage availability check', () => {
      const result = buildDebugInfo('/', 'blue', 'dark', 'daily')

      expect(typeof result.storage.localStorageAvailable).toBe('boolean')
    })
  })

  describe('formatDebugJson', () => {
    it('should produce valid JSON that can be parsed', () => {
      const debugInfo = buildDebugInfo('/', 'blue', 'dark', 'daily')
      const json = formatDebugJson(debugInfo)

      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should produce JSON that round-trips to the same structure', () => {
      const debugInfo = buildDebugInfo('/', 'blue', 'dark', 'daily')
      const json = formatDebugJson(debugInfo)
      const parsed = JSON.parse(json)

      expect(parsed).toEqual(debugInfo)
    })

    it('should use 2-space indentation', () => {
      const debugInfo = buildDebugInfo('/', 'blue', 'dark', 'daily')
      const json = formatDebugJson(debugInfo)

      // First line should be opening brace, second should be indented with 2 spaces
      const lines = json.split('\n')
      expect(lines[0]).toBe('{')
      expect(lines[1]).toMatch(/^ {2}"timestamp":/)
    })

    it('should handle empty scores gracefully', async () => {
      const { getScores } = await import('./scores')
      vi.mocked(getScores).mockReturnValueOnce([])

      const debugInfo = buildDebugInfo('/', 'blue', 'dark', 'daily')
      const json = formatDebugJson(debugInfo)
      const parsed = JSON.parse(json)

      expect(parsed.stats.totalGamesPlayed).toBe(0)
    })

    it('should produce output that fits a bug report template', () => {
      const debugInfo = buildDebugInfo('/c/abc123', 'blue', 'dark', 'game')
      const json = formatDebugJson(debugInfo)
      const parsed = JSON.parse(json)

      // Verify a user filing a bug report would have useful fields
      expect(parsed.timestamp).toBeTruthy()
      expect(parsed.page).toBeTruthy()
      expect(parsed.settings).toBeTruthy()
      expect(parsed.browser.userAgent).toBeTruthy()
    })
  })

  describe('isLocalStorageAvailable', () => {
    it('should return true when localStorage works', () => {
      expect(isLocalStorageAvailable()).toBe(true)
    })

    it('should return false when localStorage throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      expect(isLocalStorageAvailable()).toBe(false)

      spy.mockRestore()
    })
  })
})
