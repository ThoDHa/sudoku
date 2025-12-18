import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  getPreferences, 
  setPreferences, 
  getHomepageMode, 
  setHomepageMode,
  getAutoSolveSpeed,
  setAutoSolveSpeed,
  getAutoSolveDelay,
  getHideTimer,
  setHideTimer,
  AUTO_SOLVE_SPEEDS,
  AUTO_SOLVE_SPEED_LABELS,
  type UserPreferences,
  type AutoSolveSpeed
} from './preferences'

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

describe('preferences', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('AUTO_SOLVE_SPEEDS', () => {
    it('should have correct delay values', () => {
      expect(AUTO_SOLVE_SPEEDS.slow).toBe(500)
      expect(AUTO_SOLVE_SPEEDS.normal).toBe(150)
      expect(AUTO_SOLVE_SPEEDS.fast).toBe(25)
      expect(AUTO_SOLVE_SPEEDS.instant).toBe(0)
    })
  })

  describe('AUTO_SOLVE_SPEED_LABELS', () => {
    it('should have correct labels', () => {
      expect(AUTO_SOLVE_SPEED_LABELS.slow).toBe('Slow')
      expect(AUTO_SOLVE_SPEED_LABELS.normal).toBe('Normal')
      expect(AUTO_SOLVE_SPEED_LABELS.fast).toBe('Fast')
      expect(AUTO_SOLVE_SPEED_LABELS.instant).toBe('Instant')
    })
  })

  describe('getPreferences', () => {
    it('should return default preferences when no data stored', () => {
      const prefs = getPreferences()
      
      expect(prefs.homepageMode).toBe('daily')
      expect(prefs.autoSolveSpeed).toBe('fast')
      expect(prefs.hideTimer).toBe(false)
    })

    it('should return stored preferences', () => {
      const stored: UserPreferences = {
        homepageMode: 'practice',
        autoSolveSpeed: 'slow',
        hideTimer: true
      }
      localStorageMock.setItem('sudoku_preferences', JSON.stringify(stored))
      
      const prefs = getPreferences()
      
      expect(prefs.homepageMode).toBe('practice')
      expect(prefs.autoSolveSpeed).toBe('slow')
      expect(prefs.hideTimer).toBe(true)
    })

    it('should merge with defaults for partial stored data', () => {
      const partial = { homepageMode: 'practice' }
      localStorageMock.setItem('sudoku_preferences', JSON.stringify(partial))
      
      const prefs = getPreferences()
      
      expect(prefs.homepageMode).toBe('practice')
      expect(prefs.autoSolveSpeed).toBe('fast') // default
      expect(prefs.hideTimer).toBe(false) // default
    })

    it('should return defaults on parse error', () => {
      localStorageMock.setItem('sudoku_preferences', 'invalid json')
      
      const prefs = getPreferences()
      
      expect(prefs.homepageMode).toBe('daily')
    })
  })

  describe('setPreferences', () => {
    it('should update preferences', () => {
      setPreferences({ homepageMode: 'practice' })
      
      const prefs = getPreferences()
      expect(prefs.homepageMode).toBe('practice')
    })

    it('should merge with existing preferences', () => {
      setPreferences({ homepageMode: 'practice' })
      setPreferences({ hideTimer: true })
      
      const prefs = getPreferences()
      expect(prefs.homepageMode).toBe('practice')
      expect(prefs.hideTimer).toBe(true)
    })
  })

  describe('getHomepageMode', () => {
    it('should return default homepage mode', () => {
      expect(getHomepageMode()).toBe('daily')
    })

    it('should return stored homepage mode', () => {
      setHomepageMode('practice')
      expect(getHomepageMode()).toBe('practice')
    })
  })

  describe('setHomepageMode', () => {
    it('should set homepage mode', () => {
      setHomepageMode('practice')
      expect(getHomepageMode()).toBe('practice')
      
      setHomepageMode('daily')
      expect(getHomepageMode()).toBe('daily')
    })
  })

  describe('getAutoSolveSpeed', () => {
    it('should return default speed', () => {
      expect(getAutoSolveSpeed()).toBe('fast')
    })

    it('should return stored speed', () => {
      setAutoSolveSpeed('slow')
      expect(getAutoSolveSpeed()).toBe('slow')
    })
  })

  describe('setAutoSolveSpeed', () => {
    it('should set all speed options', () => {
      const speeds: AutoSolveSpeed[] = ['slow', 'normal', 'fast', 'instant']
      
      for (const speed of speeds) {
        setAutoSolveSpeed(speed)
        expect(getAutoSolveSpeed()).toBe(speed)
      }
    })
  })

  describe('getAutoSolveDelay', () => {
    it('should return correct delay for each speed', () => {
      setAutoSolveSpeed('slow')
      expect(getAutoSolveDelay()).toBe(500)
      
      setAutoSolveSpeed('normal')
      expect(getAutoSolveDelay()).toBe(150)
      
      setAutoSolveSpeed('fast')
      expect(getAutoSolveDelay()).toBe(25)
      
      setAutoSolveSpeed('instant')
      expect(getAutoSolveDelay()).toBe(0)
    })
  })

  describe('getHideTimer', () => {
    it('should return default value', () => {
      expect(getHideTimer()).toBe(false)
    })

    it('should return stored value', () => {
      setHideTimer(true)
      expect(getHideTimer()).toBe(true)
    })
  })

  describe('setHideTimer', () => {
    it('should toggle hide timer', () => {
      expect(getHideTimer()).toBe(false)
      
      setHideTimer(true)
      expect(getHideTimer()).toBe(true)
      
      setHideTimer(false)
      expect(getHideTimer()).toBe(false)
    })
  })
})
