import { describe, it, expect, beforeEach, vi } from 'vitest'
import { formatTime, generateShareText, generatePuzzleUrl, type Score } from './scores'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} })
  }
})()

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
    localStorageMock.clear()
    vi.clearAllMocks()
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
      
      expect(text).toContain('Sudoku (Practice)')
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
})
