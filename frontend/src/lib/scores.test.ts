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
      seed: '2024-01-15',
      difficulty: 'medium',
      timeMs: 300000, // 5 minutes
      hintsUsed: 0,
      mistakes: 0,
      completedAt: '2024-01-15T12:00:00Z'
    }

    it('should generate text for daily puzzle', () => {
      const text = generateShareText(baseScore, 'https://example.com')
      
      expect(text).toContain('Sudoku 2024-01-15')
      expect(text).toContain('Medium')
      expect(text).toContain('5:00')
      expect(text).toContain('https://example.com')
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
      const url = generatePuzzleUrl(baseScore, 'https://example.com')
      
      expect(url).toBe('https://example.com/game/2024-01-15?d=medium')
    })

    it('should generate URL for custom puzzle with encoded data', () => {
      const score = { 
        ...baseScore, 
        difficulty: 'custom',
        encodedPuzzle: 'sABCDEF123'
      }
      const url = generatePuzzleUrl(score, 'https://example.com')
      
      expect(url).toBe('https://example.com/c/sABCDEF123')
    })

    it('should generate URL for custom puzzle without encoded data', () => {
      const score = { ...baseScore, difficulty: 'custom' }
      const url = generatePuzzleUrl(score, 'https://example.com')
      
      expect(url).toBe('https://example.com/custom')
    })

    it('should include difficulty in query string', () => {
      const easyScore = { ...baseScore, difficulty: 'easy' }
      const hardScore = { ...baseScore, difficulty: 'hard' }
      
      expect(generatePuzzleUrl(easyScore, 'https://example.com')).toContain('d=easy')
      expect(generatePuzzleUrl(hardScore, 'https://example.com')).toContain('d=hard')
    })
  })
})
