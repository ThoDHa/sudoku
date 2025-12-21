import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useHighlightState, type MoveHighlight } from './useHighlightState'

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Create a mock MoveHighlight for testing
 */
const createMockMoveHighlight = (overrides?: Partial<MoveHighlight>): MoveHighlight => ({
  step_index: 0,
  technique: 'Naked Single',
  action: 'place',
  digit: 5,
  targets: [{ row: 0, col: 2 }],
  explanation: 'Test move explanation',
  refs: { title: 'Naked Single', slug: 'naked-single', url: '/techniques/naked-single' },
  highlights: {
    primary: [{ row: 0, col: 2 }],
    secondary: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  },
  ...overrides,
})

// =============================================================================
// TESTS
// =============================================================================

describe('useHighlightState', () => {
  // ===========================================================================
  // INITIAL STATE TESTS
  // ===========================================================================
  describe('Initial State', () => {
    it('initializes with no selected cell', () => {
      const { result } = renderHook(() => useHighlightState())
      
      expect(result.current.selectedCell).toBeNull()
    })

    it('initializes with no highlighted digit', () => {
      const { result } = renderHook(() => useHighlightState())
      
      expect(result.current.highlightedDigit).toBeNull()
    })

    it('initializes with no current highlight', () => {
      const { result } = renderHook(() => useHighlightState())
      
      expect(result.current.currentHighlight).toBeNull()
    })

    it('initializes with no selected move index', () => {
      const { result } = renderHook(() => useHighlightState())
      
      expect(result.current.selectedMoveIndex).toBeNull()
    })

    it('initializes with version 0', () => {
      const { result } = renderHook(() => useHighlightState())
      
      expect(result.current.version).toBe(0)
    })

    it('provides state object with all initial values', () => {
      const { result } = renderHook(() => useHighlightState())
      
      expect(result.current.state).toEqual({
        selectedCell: null,
        highlightedDigit: null,
        currentHighlight: null,
        selectedMoveIndex: null,
        version: 0,
      })
    })
  })

  // ===========================================================================
  // CELL SELECTION TESTS
  // ===========================================================================
  describe('Cell Selection', () => {
    it('selects a cell with selectCell', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.selectCell(42)
      })
      
      expect(result.current.selectedCell).toBe(42)
    })

    it('selects cell at index 0', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.selectCell(0)
      })
      
      expect(result.current.selectedCell).toBe(0)
    })

    it('selects cell at index 80 (last cell)', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.selectCell(80)
      })
      
      expect(result.current.selectedCell).toBe(80)
    })

    it('changes selection when different cell is selected', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.selectCell(10)
      })
      expect(result.current.selectedCell).toBe(10)
      
      act(() => {
        result.current.selectCell(50)
      })
      expect(result.current.selectedCell).toBe(50)
    })

    it('clears highlighted digit when selecting a cell', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setDigitHighlight(5)
      })
      expect(result.current.highlightedDigit).toBe(5)
      
      act(() => {
        result.current.selectCell(10)
      })
      expect(result.current.highlightedDigit).toBeNull()
    })

    it('clears current highlight when selecting a cell', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setMoveHighlight(createMockMoveHighlight())
      })
      expect(result.current.currentHighlight).not.toBeNull()
      
      act(() => {
        result.current.selectCell(10)
      })
      expect(result.current.currentHighlight).toBeNull()
    })

    it('deselects cell with deselectCell', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.selectCell(25)
      })
      expect(result.current.selectedCell).toBe(25)
      
      act(() => {
        result.current.deselectCell()
      })
      expect(result.current.selectedCell).toBeNull()
    })

    it('increments version on selectCell', () => {
      const { result } = renderHook(() => useHighlightState())
      
      const versionBefore = result.current.version
      
      act(() => {
        result.current.selectCell(10)
      })
      
      expect(result.current.version).toBe(versionBefore + 1)
    })

    it('increments version on deselectCell', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.selectCell(10)
      })
      const versionBefore = result.current.version
      
      act(() => {
        result.current.deselectCell()
      })
      
      expect(result.current.version).toBe(versionBefore + 1)
    })
  })

  // ===========================================================================
  // DIGIT HIGHLIGHTING TESTS
  // ===========================================================================
  describe('Digit Highlighting', () => {
    it('sets highlighted digit with setDigitHighlight', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setDigitHighlight(7)
      })
      
      expect(result.current.highlightedDigit).toBe(7)
    })

    it('sets digit 1 as highlighted', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setDigitHighlight(1)
      })
      
      expect(result.current.highlightedDigit).toBe(1)
    })

    it('sets digit 9 as highlighted', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setDigitHighlight(9)
      })
      
      expect(result.current.highlightedDigit).toBe(9)
    })

    it('changes highlighted digit when different digit is set', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setDigitHighlight(3)
      })
      expect(result.current.highlightedDigit).toBe(3)
      
      act(() => {
        result.current.setDigitHighlight(8)
      })
      expect(result.current.highlightedDigit).toBe(8)
    })

    it('clears current highlight when setting digit highlight', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setMoveHighlight(createMockMoveHighlight())
      })
      expect(result.current.currentHighlight).not.toBeNull()
      
      act(() => {
        result.current.setDigitHighlight(5)
      })
      expect(result.current.currentHighlight).toBeNull()
    })

    it('clears highlighted digit with clearDigitHighlight', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setDigitHighlight(4)
      })
      expect(result.current.highlightedDigit).toBe(4)
      
      act(() => {
        result.current.clearDigitHighlight()
      })
      expect(result.current.highlightedDigit).toBeNull()
    })

    it('toggles digit highlight on with toggleDigitHighlight', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.toggleDigitHighlight(6)
      })
      
      expect(result.current.highlightedDigit).toBe(6)
    })

    it('toggles digit highlight off when same digit is toggled', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.toggleDigitHighlight(6)
      })
      expect(result.current.highlightedDigit).toBe(6)
      
      act(() => {
        result.current.toggleDigitHighlight(6)
      })
      expect(result.current.highlightedDigit).toBeNull()
    })

    it('changes digit when different digit is toggled', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.toggleDigitHighlight(2)
      })
      expect(result.current.highlightedDigit).toBe(2)
      
      act(() => {
        result.current.toggleDigitHighlight(9)
      })
      expect(result.current.highlightedDigit).toBe(9)
    })

    it('increments version on setDigitHighlight', () => {
      const { result } = renderHook(() => useHighlightState())
      
      const versionBefore = result.current.version
      
      act(() => {
        result.current.setDigitHighlight(5)
      })
      
      expect(result.current.version).toBe(versionBefore + 1)
    })
  })

  // ===========================================================================
  // MOVE HIGHLIGHTING TESTS
  // ===========================================================================
  describe('Move Highlighting', () => {
    it('sets move highlight with setMoveHighlight', () => {
      const { result } = renderHook(() => useHighlightState())
      const mockMove = createMockMoveHighlight()
      
      act(() => {
        result.current.setMoveHighlight(mockMove)
      })
      
      expect(result.current.currentHighlight).toEqual(mockMove)
    })

    it('sets move highlight with index', () => {
      const { result } = renderHook(() => useHighlightState())
      const mockMove = createMockMoveHighlight()
      
      act(() => {
        result.current.setMoveHighlight(mockMove, 5)
      })
      
      expect(result.current.currentHighlight).toEqual(mockMove)
      expect(result.current.selectedMoveIndex).toBe(5)
    })

    it('preserves existing selectedMoveIndex when not provided', () => {
      const { result } = renderHook(() => useHighlightState())
      const mockMove1 = createMockMoveHighlight({ step_index: 0 })
      const mockMove2 = createMockMoveHighlight({ step_index: 1 })
      
      act(() => {
        result.current.setMoveHighlight(mockMove1, 3)
      })
      expect(result.current.selectedMoveIndex).toBe(3)
      
      act(() => {
        result.current.setMoveHighlight(mockMove2) // No index provided
      })
      expect(result.current.selectedMoveIndex).toBe(3) // Should preserve
    })

    it('stores move highlight with eliminations', () => {
      const { result } = renderHook(() => useHighlightState())
      const mockMove = createMockMoveHighlight({
        action: 'eliminate',
        eliminations: [
          { row: 1, col: 0, digit: 5 },
          { row: 1, col: 1, digit: 5 },
        ],
      })
      
      act(() => {
        result.current.setMoveHighlight(mockMove)
      })
      
      expect(result.current.currentHighlight?.eliminations).toHaveLength(2)
    })

    it('clears move highlight with clearMoveHighlight', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setMoveHighlight(createMockMoveHighlight(), 2)
      })
      expect(result.current.currentHighlight).not.toBeNull()
      expect(result.current.selectedMoveIndex).toBe(2)
      
      act(() => {
        result.current.clearMoveHighlight()
      })
      expect(result.current.currentHighlight).toBeNull()
      expect(result.current.selectedMoveIndex).toBeNull()
    })

    it('increments version on setMoveHighlight', () => {
      const { result } = renderHook(() => useHighlightState())
      
      const versionBefore = result.current.version
      
      act(() => {
        result.current.setMoveHighlight(createMockMoveHighlight())
      })
      
      expect(result.current.version).toBe(versionBefore + 1)
    })
  })

  // ===========================================================================
  // COMPOUND ACTIONS TESTS
  // ===========================================================================
  describe('Compound Actions', () => {
    describe('clearAll', () => {
      it('clears highlighted digit', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setDigitHighlight(5)
        })
        
        act(() => {
          result.current.clearAll()
        })
        
        expect(result.current.highlightedDigit).toBeNull()
      })

      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })
        
        act(() => {
          result.current.clearAll()
        })
        
        expect(result.current.currentHighlight).toBeNull()
      })

      it('clears selected move index', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight(), 5)
        })
        
        act(() => {
          result.current.clearAll()
        })
        
        expect(result.current.selectedMoveIndex).toBeNull()
      })

      it('preserves selected cell', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.selectCell(42)
          result.current.setDigitHighlight(5)
        })
        
        act(() => {
          result.current.clearAll()
        })
        
        expect(result.current.selectedCell).toBe(42)
      })
    })

    describe('clearAllAndDeselect', () => {
      it('clears all highlights and deselects cell', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.selectCell(30)
          result.current.setDigitHighlight(7)
          result.current.setMoveHighlight(createMockMoveHighlight(), 2)
        })
        
        act(() => {
          result.current.clearAllAndDeselect()
        })
        
        expect(result.current.selectedCell).toBeNull()
        expect(result.current.highlightedDigit).toBeNull()
        expect(result.current.currentHighlight).toBeNull()
        expect(result.current.selectedMoveIndex).toBeNull()
      })
    })

    describe('clearAfterUserCandidateOp', () => {
      it('clears move highlight and selected move index', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight(), 3)
        })
        
        act(() => {
          result.current.clearAfterUserCandidateOp()
        })
        
        expect(result.current.currentHighlight).toBeNull()
        expect(result.current.selectedMoveIndex).toBeNull()
      })

      it('preserves digit highlight for multi-fill workflow', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setDigitHighlight(4)
          result.current.setMoveHighlight(createMockMoveHighlight())
        })
        
        act(() => {
          result.current.clearAfterUserCandidateOp()
        })
        
        expect(result.current.highlightedDigit).toBe(4)
      })

      it('preserves selected cell', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.selectCell(15)
        })
        
        act(() => {
          result.current.clearAfterUserCandidateOp()
        })
        
        expect(result.current.selectedCell).toBe(15)
      })
    })

    describe('clearAfterDigitPlacement', () => {
      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })
        
        act(() => {
          result.current.clearAfterDigitPlacement()
        })
        
        expect(result.current.currentHighlight).toBeNull()
      })

      it('preserves digit highlight for multi-fill', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setDigitHighlight(8)
        })
        
        act(() => {
          result.current.clearAfterDigitPlacement()
        })
        
        expect(result.current.highlightedDigit).toBe(8)
      })
    })

    describe('clearAfterCellSelection', () => {
      it('clears digit highlight', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setDigitHighlight(3)
        })
        
        act(() => {
          result.current.clearAfterCellSelection()
        })
        
        expect(result.current.highlightedDigit).toBeNull()
      })

      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })
        
        act(() => {
          result.current.clearAfterCellSelection()
        })
        
        expect(result.current.currentHighlight).toBeNull()
      })

      it('preserves selected cell', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.selectCell(60)
        })
        
        act(() => {
          result.current.clearAfterCellSelection()
        })
        
        expect(result.current.selectedCell).toBe(60)
      })
    })

    describe('clearAfterErase', () => {
      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })
        
        act(() => {
          result.current.clearAfterErase()
        })
        
        expect(result.current.currentHighlight).toBeNull()
      })

      it('preserves digit highlight', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setDigitHighlight(2)
        })
        
        act(() => {
          result.current.clearAfterErase()
        })
        
        expect(result.current.highlightedDigit).toBe(2)
      })
    })

    describe('clearOnModeChange', () => {
      it('clears all state including selected cell', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.selectCell(45)
          result.current.setDigitHighlight(6)
          result.current.setMoveHighlight(createMockMoveHighlight())
        })
        
        act(() => {
          result.current.clearOnModeChange()
        })
        
        expect(result.current.selectedCell).toBeNull()
        expect(result.current.highlightedDigit).toBeNull()
        expect(result.current.currentHighlight).toBeNull()
      })
    })

    describe('clearAfterDigitToggle', () => {
      it('clears digit highlight', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setDigitHighlight(1)
        })
        
        act(() => {
          result.current.clearAfterDigitToggle()
        })
        
        expect(result.current.highlightedDigit).toBeNull()
      })

      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })
        
        act(() => {
          result.current.clearAfterDigitToggle()
        })
        
        expect(result.current.currentHighlight).toBeNull()
      })

      it('clears selected move index', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight(), 7)
        })
        
        act(() => {
          result.current.clearAfterDigitToggle()
        })
        
        expect(result.current.selectedMoveIndex).toBeNull()
      })
    })

    describe('clearHighlightsKeepSelection', () => {
      it('clears highlights but keeps selected cell', () => {
        const { result } = renderHook(() => useHighlightState())
        
        act(() => {
          result.current.selectCell(20)
          result.current.setDigitHighlight(4)
          result.current.setMoveHighlight(createMockMoveHighlight(), 1)
        })
        
        act(() => {
          result.current.clearHighlightsKeepSelection()
        })
        
        expect(result.current.selectedCell).toBe(20)
        expect(result.current.highlightedDigit).toBeNull()
        expect(result.current.currentHighlight).toBeNull()
        expect(result.current.selectedMoveIndex).toBeNull()
      })
    })
  })

  // ===========================================================================
  // CLICK GIVEN CELL TESTS
  // ===========================================================================
  describe('clickGivenCell', () => {
    it('sets both digit highlight and selected cell', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.clickGivenCell(5, 10)
      })
      
      expect(result.current.selectedCell).toBe(10)
      expect(result.current.highlightedDigit).toBe(5)
    })

    it('clears current highlight', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.setMoveHighlight(createMockMoveHighlight())
      })
      
      act(() => {
        result.current.clickGivenCell(3, 0)
      })
      
      expect(result.current.currentHighlight).toBeNull()
    })

    it('works for all digits 1-9', () => {
      const { result } = renderHook(() => useHighlightState())
      
      for (let digit = 1; digit <= 9; digit++) {
        act(() => {
          result.current.clickGivenCell(digit, digit * 5)
        })
        
        expect(result.current.highlightedDigit).toBe(digit)
        expect(result.current.selectedCell).toBe(digit * 5)
      }
    })
  })

  // ===========================================================================
  // VERSION COUNTER TESTS
  // ===========================================================================
  describe('Version Counter', () => {
    it('increments on every action', () => {
      const { result } = renderHook(() => useHighlightState())
      
      expect(result.current.version).toBe(0)
      
      act(() => result.current.selectCell(0))
      expect(result.current.version).toBe(1)
      
      act(() => result.current.setDigitHighlight(5))
      expect(result.current.version).toBe(2)
      
      act(() => result.current.clearAll())
      expect(result.current.version).toBe(3)
      
      act(() => result.current.deselectCell())
      expect(result.current.version).toBe(4)
    })

    it('always increases, never resets', () => {
      const { result } = renderHook(() => useHighlightState())
      
      // Perform many actions
      for (let i = 0; i < 10; i++) {
        act(() => result.current.selectCell(i))
      }
      
      expect(result.current.version).toBe(10)
      
      act(() => result.current.clearAllAndDeselect())
      expect(result.current.version).toBe(11)
    })
  })

  // ===========================================================================
  // DISPATCH ACCESS TESTS
  // ===========================================================================
  describe('Dispatch Access', () => {
    it('exposes dispatch for direct action dispatching', () => {
      const { result } = renderHook(() => useHighlightState())
      
      expect(result.current.dispatch).toBeDefined()
      expect(typeof result.current.dispatch).toBe('function')
    })

    it('dispatch works with SELECT_CELL action', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.dispatch({ type: 'SELECT_CELL', cell: 55 })
      })
      
      expect(result.current.selectedCell).toBe(55)
    })

    it('dispatch works with SET_DIGIT_HIGHLIGHT action', () => {
      const { result } = renderHook(() => useHighlightState())
      
      act(() => {
        result.current.dispatch({ type: 'SET_DIGIT_HIGHLIGHT', digit: 7 })
      })
      
      expect(result.current.highlightedDigit).toBe(7)
    })
  })

  // ===========================================================================
  // MEMOIZATION TESTS
  // ===========================================================================
  describe('Action Stability', () => {
    it('action functions have stable references across renders', () => {
      const { result, rerender } = renderHook(() => useHighlightState())
      
      const selectCell1 = result.current.selectCell
      const setDigitHighlight1 = result.current.setDigitHighlight
      const clearAll1 = result.current.clearAll
      
      // Trigger a re-render
      rerender()
      
      expect(result.current.selectCell).toBe(selectCell1)
      expect(result.current.setDigitHighlight).toBe(setDigitHighlight1)
      expect(result.current.clearAll).toBe(clearAll1)
    })

    it('action functions remain stable after state changes', () => {
      const { result } = renderHook(() => useHighlightState())
      
      const selectCell1 = result.current.selectCell
      
      act(() => {
        result.current.selectCell(10)
      })
      
      expect(result.current.selectCell).toBe(selectCell1)
    })
  })
})
