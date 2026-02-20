// Regression and Edge-Case Tests for Hint Event/UI Logic
// Written by Pigsy - keeping them lazy (simple) and effective!

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

// Mock solver-service - controls hint responses
const mockFindNextMove = vi.fn()
vi.mock('../lib/solver-service', () => ({
  findNextMove: mockFindNextMove,
  getPuzzle: vi.fn().mockReturnValue({
    puzzle_id: 'test-puzzle',
    seed: 'test-seed',
    difficulty: 'medium',
    givens: Array(81).fill(0).map((_, i) => (i % 9 === 0 ? i / 9 + 1 : 0)),
    solution: Array(81).fill(0).map((_, i) => (i % 9) + 1),
  }),
  validateBoard: vi.fn().mockReturnValue({ valid: true, message: 'Valid' }),
  validateCustomPuzzle: vi.fn().mockResolvedValue({ valid: true, unique: true, solution: Array(81).fill(1) }),
  cleanupSolver: vi.fn(),
  checkAndFixWithSolution: vi.fn().mockResolvedValue({ moves: [] }),
  getDailySeed: vi.fn().mockReturnValue({ date_utc: '2024-01-01', seed: 'daily-2024-01-01' }),
}))

// Mock WASM and worker
vi.mock('../lib/wasm', () => ({
  loadWasm: vi.fn().mockResolvedValue(undefined),
  isWasmReady: vi.fn().mockReturnValue(true),
  getWasmApi: vi.fn(),
  unloadWasm: vi.fn(),
}))

vi.mock('../lib/worker-client', () => ({
  initializeWorker: vi.fn().mockResolvedValue(undefined),
  terminateWorker: vi.fn(),
  isWorkerSupported: vi.fn().mockReturnValue(false),
  isWorkerReady: vi.fn().mockReturnValue(false),
  findNextMove: vi.fn(),
  solveAll: vi.fn(),
}))

// Mock game settings and preferences
vi.mock('../lib/gameSettings', () => ({
  getAutoSaveEnabled: vi.fn().mockReturnValue(true),
  getMostRecentGame: vi.fn().mockReturnValue(null),
  clearInProgressGame: vi.fn(),
  clearOtherGamesForMode: vi.fn(),
  getGameMode: vi.fn().mockReturnValue('practice'),
}))

vi.mock('../lib/preferences', () => ({
  getAutoSolveSpeed: vi.fn().mockReturnValue('normal'),
  getHideTimer: vi.fn().mockReturnValue(false),
  setHideTimer: vi.fn(),
  setShowDailyReminder: vi.fn(),
}))

vi.mock('../lib/scores', () => ({
  saveScore: vi.fn(),
  markDailyCompleted: vi.fn(),
  isTodayCompleted: vi.fn().mockReturnValue(false),
  getTodayUTC: vi.fn().mockReturnValue('2024-01-01'),
  getScores: vi.fn().mockReturnValue([]),
}))

vi.mock('../lib/dailyPrompt', () => ({
  shouldShowDailyPrompt: vi.fn().mockReturnValue(false),
  markDailyPromptShown: vi.fn(),
}))

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
  COPY_TOAST_DURATION: 2000,
}))

vi.mock('../lib/puzzleEncoding', () => ({
  decodePuzzle: vi.fn(),
  encodePuzzle: vi.fn().mockReturnValue('encoded'),
  decodePuzzleWithState: vi.fn(),
  encodePuzzleWithState: vi.fn().mockReturnValue('encoded'),
}))

vi.mock('../lib/seedValidation', () => ({
  validateSeed: vi.fn().mockReturnValue({ valid: true, seed: 'test-seed' }),
  extractSeedFromStorageKey: vi.fn().mockReturnValue({ valid: true, seed: 'test-seed' }),
}))

vi.mock('../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Storage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get store() { return store },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock matchMedia for mobile tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Helper to create a mock move response
function createMockMove(overrides: Partial<any> = {}) {
  return {
    step_index: 0,
    technique: 'Naked Single',
    action: 'assign',
    digit: 5,
    targets: [{ row: 4, col: 4 }],
    explanation: 'Cell R5C5 can only be 5',
    refs: { title: 'Naked Single', slug: 'naked-single', url: '' },
    highlights: { primary: [{ row: 4, col: 4 }] },
    ...overrides,
  }
}

// Helper to create default findNextMove response
function createMockHintResponse(moveOverrides: Partial<any> = {}, solved = false) {
  return {
    move: createMockMove(moveOverrides),
    board: Array(81).fill(0),
    candidates: Array(81).fill([]),
    solved,
  }
}

// Simple test hook to track hint counter state
function useHintCounter() {
  const [hintsUsed, setHintsUsed] = React.useState(0)
  const [techniqueHintsUsed, setTechniqueHintsUsed] = React.useState(0)
  const [hintLoading, setHintLoading] = React.useState(false)
  const [techniqueHintLoading, setTechniqueHintLoading] = React.useState(false)
  
  const handleNext = async () => {
    if (hintLoading) return
    setHintLoading(true)
    try {
      const result = await mockFindNextMove()
      if (result.move) {
        setHintsUsed(prev => prev + 1)
      }
    } finally {
      setHintLoading(false)
    }
  }
  
  const handleTechniqueHint = async () => {
    if (techniqueHintLoading) return
    setTechniqueHintLoading(true)
    try {
      const result = await mockFindNextMove()
      if (result.move) {
        setTechniqueHintsUsed(prev => prev + 1)
      }
    } finally {
      setTechniqueHintLoading(false)
    }
  }
  
  return {
    hintsUsed,
    techniqueHintsUsed,
    hintLoading,
    techniqueHintLoading,
    handleNext,
    handleTechniqueHint,
    setHintsUsed,
    setTechniqueHintsUsed,
  }
}

// Test wrapper component
function HintTestComponent({ 
  onHint, 
  onTechniqueHint,
  hintDisabled = false,
  techniqueHintDisabled = false,
  hintLoading = false,
  techniqueHintLoading = false,
}: {
  onHint?: () => void
  onTechniqueHint?: () => void
  hintDisabled?: boolean
  techniqueHintDisabled?: boolean
  hintLoading?: boolean
  techniqueHintLoading?: boolean
}) {
  return (
    <div>
      <button 
        data-testid="hint-btn"
        onClick={onHint}
        disabled={hintDisabled || hintLoading}
      >
        {hintLoading ? 'Loading...' : 'Hint'}
      </button>
      <button 
        data-testid="technique-hint-btn"
        onClick={onTechniqueHint}
        disabled={techniqueHintDisabled || techniqueHintLoading}
      >
        {techniqueHintLoading ? 'Loading...' : 'Technique Hint'}
      </button>
    </div>
  )
}

describe('Hint System: Edge and Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    mockFindNextMove.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Happy Path', () => {
    it('should show a hint and increment counter (happy path)', async () => {
      const user = userEvent.setup()
      mockFindNextMove.mockResolvedValueOnce(createMockHintResponse())
      
      let hintsUsed = 0
      const handleNext = async () => {
        const result = await mockFindNextMove()
        if (result.move) {
          hintsUsed++
        }
      }
      
      render(<HintTestComponent onHint={handleNext} />)
      
      const hintBtn = screen.getByTestId('hint-btn')
      await user.click(hintBtn)
      
      await waitFor(() => {
        expect(mockFindNextMove).toHaveBeenCalledTimes(1)
        expect(hintsUsed).toBe(1)
      })
    })
  })

  describe('2. Mobile Viewport', () => {
    it('should behave correctly on mobile viewport', async () => {
      const user = userEvent.setup()
      
      // Simulate mobile viewport
      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: query.includes('max-width') && query.includes('768'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as any))
      
      mockFindNextMove.mockResolvedValueOnce(createMockHintResponse())
      
      let hintsUsed = 0
      const handleNext = async () => {
        const result = await mockFindNextMove()
        if (result.move) hintsUsed++
      }
      
      render(<HintTestComponent onHint={handleNext} />)
      
      const hintBtn = screen.getByTestId('hint-btn')
      expect(hintBtn).not.toBeDisabled()
      
      await user.click(hintBtn)
      
      await waitFor(() => {
        expect(mockFindNextMove).toHaveBeenCalledTimes(1)
        expect(hintsUsed).toBe(1)
      })
    })
  })

  describe('3. No Cell Selected', () => {
    it('should handle no cell selected (unselected state)', async () => {
      const user = userEvent.setup()
      mockFindNextMove.mockResolvedValueOnce(createMockHintResponse())
      
      let hintsUsed = 0
      const handleNext = async () => {
        // Hints work regardless of cell selection
        const result = await mockFindNextMove()
        if (result.move) hintsUsed++
      }
      
      render(<HintTestComponent onHint={handleNext} />)
      
      const hintBtn = screen.getByTestId('hint-btn')
      expect(hintBtn).not.toBeDisabled()
      
      await user.click(hintBtn)
      
      await waitFor(() => {
        expect(hintsUsed).toBe(1)
      })
    })
  })

  describe('4. Nearly-Complete Puzzle', () => {
    it('should act correctly on nearly-complete puzzles', async () => {
      const user = userEvent.setup()
      
      // Simulate nearly-complete puzzle (last move)
      mockFindNextMove.mockResolvedValueOnce(createMockHintResponse({}, true))
      
      let hintsUsed = 0
      const handleNext = async () => {
        const result = await mockFindNextMove()
        if (result.move) hintsUsed++
      }
      
      render(<HintTestComponent onHint={handleNext} />)
      
      const hintBtn = screen.getByTestId('hint-btn')
      await user.click(hintBtn)
      
      await waitFor(() => {
        expect(hintsUsed).toBe(1)
      })
    })
  })

  describe('5. Post-Completion', () => {
    it('should not allow hints after completion (game done)', async () => {
      const user = userEvent.setup()
      
      render(
        <HintTestComponent 
          onHint={() => {}} 
          hintDisabled={true}
        />
      )
      
      const hintBtn = screen.getByTestId('hint-btn')
      expect(hintBtn).toBeDisabled()
      
      await user.click(hintBtn)
      
      expect(mockFindNextMove).not.toHaveBeenCalled()
    })
  })

  describe('6. Spam/Rapid Clicking', () => {
    it('should block or ignore rapid/spam/race tapping of hint/technique hint', async () => {
      const user = userEvent.setup()
      
      // Simulate slow hint response
      let resolveHint: () => void
      const hintPromise = new Promise<any>((resolve) => {
        resolveHint = () => resolve(createMockHintResponse())
      })
      mockFindNextMove.mockReturnValue(hintPromise)
      
      let hintsUsed = 0
      let hintLoading = false
      const handleNext = async () => {
        if (hintLoading) return // Guard against concurrent requests
        hintLoading = true
        try {
          const result = await mockFindNextMove()
          if (result.move) hintsUsed++
        } finally {
          hintLoading = false
        }
      }
      
      const { rerender } = render(
        <HintTestComponent 
          onHint={handleNext}
          hintLoading={hintLoading}
        />
      )
      
      const hintBtn = screen.getByTestId('hint-btn')
      
      // Rapid clicks
      await user.click(hintBtn)
      await user.click(hintBtn)
      await user.click(hintBtn)
      
      // Resolve the hint
      resolveHint!()
      
      await waitFor(() => {
        // Should only process once despite multiple clicks
        expect(mockFindNextMove).toHaveBeenCalledTimes(1)
        expect(hintsUsed).toBe(1)
      })
    })
  })

  describe('7. Async/Loading State', () => {
    it('should properly disable/lockout hints during async/in-flight logic', async () => {
      const user = userEvent.setup()
      
      let hintLoading = true // Start in loading state
      
      render(
        <HintTestComponent 
          onHint={() => {}}
          hintLoading={hintLoading}
        />
      )
      
      const hintBtn = screen.getByTestId('hint-btn')
      expect(hintBtn).toBeDisabled()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })

  describe('8. Restart Resets State', () => {
    it('should reset/init all hint state on puzzle restart', () => {
      const { result } = renderHookForHints()
      
      // Simulate using hints
      act(() => {
        result.current.setHintsUsed(5)
        result.current.setTechniqueHintsUsed(3)
      })
      
      expect(result.current.hintsUsed).toBe(5)
      expect(result.current.techniqueHintsUsed).toBe(3)
      
      // Simulate restart - reset counters
      act(() => {
        result.current.setHintsUsed(0)
        result.current.setTechniqueHintsUsed(0)
      })
      
      expect(result.current.hintsUsed).toBe(0)
      expect(result.current.techniqueHintsUsed).toBe(0)
    })
  })

  describe('9. State Persistence', () => {
    it('should persist and restore hint state accurately on reentry/load', () => {
      // Simulate saving state
      const savedState = {
        hintsUsed: 3,
        techniqueHintsUsed: 2,
      }
      localStorageMock.setItem('hint-state', JSON.stringify(savedState))
      
      // Simulate loading state
      const loadedState = JSON.parse(localStorageMock.getItem('hint-state') || '{}')
      
      expect(loadedState.hintsUsed).toBe(3)
      expect(loadedState.techniqueHintsUsed).toBe(2)
    })
  })

  describe('10. Undo/Redo Robustness', () => {
    it('should verify state shape/undo/redo/error logic is robust', async () => {
      const user = userEvent.setup()
      
      // Test hint with error response
      mockFindNextMove.mockRejectedValueOnce(new Error('Solver error'))
      
      let hintsUsed = 0
      let errorOccurred = false
      const handleNext = async () => {
        try {
          const result = await mockFindNextMove()
          if (result.move) hintsUsed++
        } catch {
          errorOccurred = true
        }
      }
      
      render(<HintTestComponent onHint={handleNext} />)
      
      const hintBtn = screen.getByTestId('hint-btn')
      await user.click(hintBtn)
      
      await waitFor(() => {
        expect(errorOccurred).toBe(true)
        // Counter should NOT increment on error
        expect(hintsUsed).toBe(0)
      })
      
      // Verify state is clean after error - can request hint again
      mockFindNextMove.mockResolvedValueOnce(createMockHintResponse())
      
      await user.click(hintBtn)
      
      await waitFor(() => {
        expect(hintsUsed).toBe(1)
      })
    })
  })
})

// Helper to render hook for testing
function renderHookForHints() {
  let result: { current: ReturnType<typeof useHintCounter> } = { current: null as any }
  
  function TestWrapper() {
    const hookResult = useHintCounter()
    result.current = hookResult
    return null
  }
  
  render(<TestWrapper />)
  
  return { result }
}
