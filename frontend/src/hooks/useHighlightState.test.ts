import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useHighlightState } from './useHighlightState'
import { createMockMoveHighlight } from '../test-utils'

type HookResult = { current: ReturnType<typeof useHighlightState> }
type Api = HookResult['current']

function actClearAfterCellSelection(
  result: HookResult,
  ...args: Parameters<Api['clearAfterCellSelection']>
) {
  act(() => {
    result.current.clearAfterCellSelection(...args)
  })
}

function actClearAfterDigitPlacement(
  result: HookResult,
  ...args: Parameters<Api['clearAfterDigitPlacement']>
) {
  act(() => {
    result.current.clearAfterDigitPlacement(...args)
  })
}

function actClearAfterDigitToggle(
  result: HookResult,
  ...args: Parameters<Api['clearAfterDigitToggle']>
) {
  act(() => {
    result.current.clearAfterDigitToggle(...args)
  })
}

function actClearAfterErase(result: HookResult, ...args: Parameters<Api['clearAfterErase']>) {
  act(() => {
    result.current.clearAfterErase(...args)
  })
}

function actClearAfterUserCandidateOp(
  result: HookResult,
  ...args: Parameters<Api['clearAfterUserCandidateOp']>
) {
  act(() => {
    result.current.clearAfterUserCandidateOp(...args)
  })
}

function actClearAll(result: HookResult, ...args: Parameters<Api['clearAll']>) {
  act(() => {
    result.current.clearAll(...args)
  })
}

function actClearAllAndDeselect(
  result: HookResult,
  ...args: Parameters<Api['clearAllAndDeselect']>
) {
  act(() => {
    result.current.clearAllAndDeselect(...args)
  })
}

function actClearDigitHighlight(
  result: HookResult,
  ...args: Parameters<Api['clearDigitHighlight']>
) {
  act(() => {
    result.current.clearDigitHighlight(...args)
  })
}

function actClearHighlightsKeepSelection(
  result: HookResult,
  ...args: Parameters<Api['clearHighlightsKeepSelection']>
) {
  act(() => {
    result.current.clearHighlightsKeepSelection(...args)
  })
}

function actClearMoveHighlight(result: HookResult, ...args: Parameters<Api['clearMoveHighlight']>) {
  act(() => {
    result.current.clearMoveHighlight(...args)
  })
}

function actClearOnModeChange(result: HookResult, ...args: Parameters<Api['clearOnModeChange']>) {
  act(() => {
    result.current.clearOnModeChange(...args)
  })
}

function actClickGivenCell(result: HookResult, ...args: Parameters<Api['clickGivenCell']>) {
  act(() => {
    result.current.clickGivenCell(...args)
  })
}

function actDeselectCell(result: HookResult, ...args: Parameters<Api['deselectCell']>) {
  act(() => {
    result.current.deselectCell(...args)
  })
}

function actDispatch(result: HookResult, ...args: Parameters<Api['dispatch']>) {
  act(() => {
    result.current.dispatch(...args)
  })
}

function actSelectCell(result: HookResult, ...args: Parameters<Api['selectCell']>) {
  act(() => {
    result.current.selectCell(...args)
  })
}

function actSelectMultipleCells(
  result: HookResult,
  ...args: Parameters<Api['selectMultipleCells']>
) {
  act(() => {
    result.current.selectMultipleCells(...args)
  })
}

function actSetDigitHighlight(result: HookResult, ...args: Parameters<Api['setDigitHighlight']>) {
  act(() => {
    result.current.setDigitHighlight(...args)
  })
}

function actSetMoveHighlight(result: HookResult, ...args: Parameters<Api['setMoveHighlight']>) {
  act(() => {
    result.current.setMoveHighlight(...args)
  })
}

function actToggleDigitHighlight(
  result: HookResult,
  ...args: Parameters<Api['toggleDigitHighlight']>
) {
  act(() => {
    result.current.toggleDigitHighlight(...args)
  })
}

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
        selectedCells: new Set<number>(),
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

      actSelectCell(result, 42)

      expect(result.current.selectedCell).toBe(42)
    })

    it('selects cell at index 0', () => {
      const { result } = renderHook(() => useHighlightState())

      actSelectCell(result, 0)

      expect(result.current.selectedCell).toBe(0)
    })

    it('selects cell at index 80 (last cell)', () => {
      const { result } = renderHook(() => useHighlightState())

      actSelectCell(result, 80)

      expect(result.current.selectedCell).toBe(80)
    })

    it('changes selection when different cell is selected', () => {
      const { result } = renderHook(() => useHighlightState())

      actSelectCell(result, 10)
      expect(result.current.selectedCell).toBe(10)

      actSelectCell(result, 50)
      expect(result.current.selectedCell).toBe(50)
    })

    it('clears highlighted digit when selecting a cell', () => {
      const { result } = renderHook(() => useHighlightState())

      actSetDigitHighlight(result, 5)
      expect(result.current.highlightedDigit).toBe(5)

      actSelectCell(result, 10)
      expect(result.current.highlightedDigit).toBeNull()
    })

    it('clears current highlight when selecting a cell', () => {
      const { result } = renderHook(() => useHighlightState())

      act(() => {
        result.current.setMoveHighlight(createMockMoveHighlight())
      })
      expect(result.current.currentHighlight).not.toBeNull()

      actSelectCell(result, 10)
      expect(result.current.currentHighlight).toBeNull()
    })

    it('deselects cell with deselectCell', () => {
      const { result } = renderHook(() => useHighlightState())

      actSelectCell(result, 25)
      expect(result.current.selectedCell).toBe(25)

      actDeselectCell(result)
      expect(result.current.selectedCell).toBeNull()
    })

    it('increments version on selectCell', () => {
      const { result } = renderHook(() => useHighlightState())

      const versionBefore = result.current.version

      actSelectCell(result, 10)

      expect(result.current.version).toBe(versionBefore + 1)
    })

    it('increments version on deselectCell', () => {
      const { result } = renderHook(() => useHighlightState())

      actSelectCell(result, 10)
      const versionBefore = result.current.version

      actDeselectCell(result)

      expect(result.current.version).toBe(versionBefore + 1)
    })
  })

  // ===========================================================================
  // DIGIT HIGHLIGHTING TESTS
  // ===========================================================================
  describe('Digit Highlighting', () => {
    it('sets highlighted digit with setDigitHighlight', () => {
      const { result } = renderHook(() => useHighlightState())

      actSetDigitHighlight(result, 7)

      expect(result.current.highlightedDigit).toBe(7)
    })

    it('sets digit 1 as highlighted', () => {
      const { result } = renderHook(() => useHighlightState())

      actSetDigitHighlight(result, 1)

      expect(result.current.highlightedDigit).toBe(1)
    })

    it('sets digit 9 as highlighted', () => {
      const { result } = renderHook(() => useHighlightState())

      actSetDigitHighlight(result, 9)

      expect(result.current.highlightedDigit).toBe(9)
    })

    it('changes highlighted digit when different digit is set', () => {
      const { result } = renderHook(() => useHighlightState())

      actSetDigitHighlight(result, 3)
      expect(result.current.highlightedDigit).toBe(3)

      actSetDigitHighlight(result, 8)
      expect(result.current.highlightedDigit).toBe(8)
    })

    it('clears current highlight when setting digit highlight', () => {
      const { result } = renderHook(() => useHighlightState())

      act(() => {
        result.current.setMoveHighlight(createMockMoveHighlight())
      })
      expect(result.current.currentHighlight).not.toBeNull()

      actSetDigitHighlight(result, 5)
      expect(result.current.currentHighlight).toBeNull()
    })

    it('clears highlighted digit with clearDigitHighlight', () => {
      const { result } = renderHook(() => useHighlightState())

      actSetDigitHighlight(result, 4)
      expect(result.current.highlightedDigit).toBe(4)

      actClearDigitHighlight(result)
      expect(result.current.highlightedDigit).toBeNull()
    })

    it('toggles digit highlight on with toggleDigitHighlight', () => {
      const { result } = renderHook(() => useHighlightState())

      actToggleDigitHighlight(result, 6)

      expect(result.current.highlightedDigit).toBe(6)
    })

    it('toggles digit highlight off when same digit is toggled', () => {
      const { result } = renderHook(() => useHighlightState())

      actToggleDigitHighlight(result, 6)
      expect(result.current.highlightedDigit).toBe(6)

      actToggleDigitHighlight(result, 6)
      expect(result.current.highlightedDigit).toBeNull()
    })

    it('changes digit when different digit is toggled', () => {
      const { result } = renderHook(() => useHighlightState())

      actToggleDigitHighlight(result, 2)
      expect(result.current.highlightedDigit).toBe(2)

      actToggleDigitHighlight(result, 9)
      expect(result.current.highlightedDigit).toBe(9)
    })

    it('increments version on setDigitHighlight', () => {
      const { result } = renderHook(() => useHighlightState())

      const versionBefore = result.current.version

      actSetDigitHighlight(result, 5)

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

      actSetMoveHighlight(result, mockMove)

      expect(result.current.currentHighlight).toEqual(mockMove)
    })

    it('sets move highlight with index', () => {
      const { result } = renderHook(() => useHighlightState())
      const mockMove = createMockMoveHighlight()

      actSetMoveHighlight(result, mockMove, 5)

      expect(result.current.currentHighlight).toEqual(mockMove)
      expect(result.current.selectedMoveIndex).toBe(5)
    })

    it('preserves existing selectedMoveIndex when not provided', () => {
      const { result } = renderHook(() => useHighlightState())
      const mockMove1 = createMockMoveHighlight({ step_index: 0 })
      const mockMove2 = createMockMoveHighlight({ step_index: 1 })

      actSetMoveHighlight(result, mockMove1, 3)
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

      actSetMoveHighlight(result, mockMove)

      expect(result.current.currentHighlight?.eliminations).toHaveLength(2)
    })

    it('clears move highlight with clearMoveHighlight', () => {
      const { result } = renderHook(() => useHighlightState())

      act(() => {
        result.current.setMoveHighlight(createMockMoveHighlight(), 2)
      })
      expect(result.current.currentHighlight).not.toBeNull()
      expect(result.current.selectedMoveIndex).toBe(2)

      actClearMoveHighlight(result)
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

        actSetDigitHighlight(result, 5)

        actClearAll(result)

        expect(result.current.highlightedDigit).toBeNull()
      })

      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })

        actClearAll(result)

        expect(result.current.currentHighlight).toBeNull()
      })

      it('clears selected move index', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight(), 5)
        })

        actClearAll(result)

        expect(result.current.selectedMoveIndex).toBeNull()
      })

      it('preserves selected cell', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.selectCell(42)
          result.current.setDigitHighlight(5)
        })

        actClearAll(result)

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

        actClearAllAndDeselect(result)

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

        actClearAfterUserCandidateOp(result)

        expect(result.current.currentHighlight).toBeNull()
        expect(result.current.selectedMoveIndex).toBeNull()
      })

      it('preserves digit highlight for multi-fill workflow', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.setDigitHighlight(4)
          result.current.setMoveHighlight(createMockMoveHighlight())
        })

        actClearAfterUserCandidateOp(result)

        expect(result.current.highlightedDigit).toBe(4)
      })

      it('preserves selected cell', () => {
        const { result } = renderHook(() => useHighlightState())

        actSelectCell(result, 15)

        actClearAfterUserCandidateOp(result)

        expect(result.current.selectedCell).toBe(15)
      })
    })

    describe('clearAfterDigitPlacement', () => {
      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })

        actClearAfterDigitPlacement(result)

        expect(result.current.currentHighlight).toBeNull()
      })

      it('preserves digit highlight for multi-fill', () => {
        const { result } = renderHook(() => useHighlightState())

        actSetDigitHighlight(result, 8)

        actClearAfterDigitPlacement(result)

        expect(result.current.highlightedDigit).toBe(8)
      })
    })

    describe('clearAfterCellSelection', () => {
      it('clears digit highlight', () => {
        const { result } = renderHook(() => useHighlightState())

        actSetDigitHighlight(result, 3)

        actClearAfterCellSelection(result)

        expect(result.current.highlightedDigit).toBeNull()
      })

      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })

        actClearAfterCellSelection(result)

        expect(result.current.currentHighlight).toBeNull()
      })

      it('preserves selected cell', () => {
        const { result } = renderHook(() => useHighlightState())

        actSelectCell(result, 60)

        actClearAfterCellSelection(result)

        expect(result.current.selectedCell).toBe(60)
      })
    })

    describe('clearAfterErase', () => {
      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })

        actClearAfterErase(result)

        expect(result.current.currentHighlight).toBeNull()
      })

      it('preserves digit highlight', () => {
        const { result } = renderHook(() => useHighlightState())

        actSetDigitHighlight(result, 2)

        actClearAfterErase(result)

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

        actClearOnModeChange(result)

        expect(result.current.selectedCell).toBeNull()
        expect(result.current.highlightedDigit).toBeNull()
        expect(result.current.currentHighlight).toBeNull()
      })
    })

    describe('clearAfterDigitToggle', () => {
      it('clears digit highlight', () => {
        const { result } = renderHook(() => useHighlightState())

        actSetDigitHighlight(result, 1)

        actClearAfterDigitToggle(result)

        expect(result.current.highlightedDigit).toBeNull()
      })

      it('clears current highlight', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight())
        })

        actClearAfterDigitToggle(result)

        expect(result.current.currentHighlight).toBeNull()
      })

      it('clears selected move index', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.setMoveHighlight(createMockMoveHighlight(), 7)
        })

        actClearAfterDigitToggle(result)

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

        actClearHighlightsKeepSelection(result)

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

      actClickGivenCell(result, 5, 10)

      expect(result.current.selectedCell).toBe(10)
      expect(result.current.highlightedDigit).toBe(5)
    })

    it('clears current highlight', () => {
      const { result } = renderHook(() => useHighlightState())

      act(() => {
        result.current.setMoveHighlight(createMockMoveHighlight())
      })

      actClickGivenCell(result, 3, 0)

      expect(result.current.currentHighlight).toBeNull()
    })

    it('works for all digits 1-9', () => {
      const { result } = renderHook(() => useHighlightState())

      for (let digit = 1; digit <= 9; digit++) {
        actClickGivenCell(result, digit, digit * 5)

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

      actDispatch(result, { type: 'SELECT_CELL', cell: 55 })

      expect(result.current.selectedCell).toBe(55)
    })

    it('dispatch works with SET_DIGIT_HIGHLIGHT action', () => {
      const { result } = renderHook(() => useHighlightState())

      actDispatch(result, { type: 'SET_DIGIT_HIGHLIGHT', digit: 7 })

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

      actSelectCell(result, 10)

      expect(result.current.selectCell).toBe(selectCell1)
    })
  })

  // ===========================================================================
  // MULTI-SELECT STATE MANAGEMENT TESTS
  // ===========================================================================
  describe('Multi-Select State Management', () => {
    describe('selectedCells Property', () => {
      it('initializes with empty set (no cells selected)', () => {
        const { result } = renderHook(() => useHighlightState())

        expect(result.current.state.selectedCells).toBeInstanceOf(Set)
        expect(result.current.state.selectedCells.size).toBe(0)
      })

      it('provides selectedCells getter for backward compatibility', () => {
        const { result } = renderHook(() => useHighlightState())

        // Single-element set should be accessible via selectedCell getter
        actSelectCell(result, 42)

        expect(result.current.state.selectedCells).toEqual(new Set([42]))
      })
    })

    describe('selectMultipleCells Action', () => {
      it('should be available in hook return', () => {
        const { result } = renderHook(() => useHighlightState())

        expect(result.current.selectMultipleCells).toBeDefined()
        expect(typeof result.current.selectMultipleCells).toBe('function')
      })

      it('selects multiple cells at once', () => {
        const { result } = renderHook(() => useHighlightState())

        actSelectMultipleCells(result, [10, 20, 30])

        expect(result.current.state.selectedCells).toEqual(new Set([10, 20, 30]))
      })

      it('handles empty array (clears selection)', () => {
        const { result } = renderHook(() => useHighlightState())

        actSelectMultipleCells(result, [10, 20])
        expect(result.current.state.selectedCells.size).toBe(2)

        actSelectMultipleCells(result, [])
        expect(result.current.state.selectedCells.size).toBe(0)
      })

      it('clears other highlights when selecting multiple cells', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.setDigitHighlight(5)
          result.current.setMoveHighlight(createMockMoveHighlight())
        })

        actSelectMultipleCells(result, [10, 20])

        expect(result.current.highlightedDigit).toBeNull()
        expect(result.current.currentHighlight).toBeNull()
      })

      it('increments version on multi-select', () => {
        const { result } = renderHook(() => useHighlightState())

        const versionBefore = result.current.version

        actSelectMultipleCells(result, [10, 20, 30])

        expect(result.current.version).toBe(versionBefore + 1)
      })
    })

    describe('Backward Compatibility', () => {
      it('selectCell still works for single cell selection', () => {
        const { result } = renderHook(() => useHighlightState())

        actSelectCell(result, 42)

        expect(result.current.state.selectedCells).toEqual(new Set([42]))
        expect(result.current.selectedCell).toBe(42)
      })

      it('deselectCell clears multi-select state', () => {
        const { result } = renderHook(() => useHighlightState())

        actSelectMultipleCells(result, [10, 20, 30])

        actDeselectCell(result)

        expect(result.current.state.selectedCells.size).toBe(0)
        expect(result.current.selectedCell).toBeNull()
      })

      it('clearAllAndDeselect clears multi-select state', () => {
        const { result } = renderHook(() => useHighlightState())

        act(() => {
          result.current.selectMultipleCells([10, 20])
          result.current.setDigitHighlight(5)
        })

        actClearAllAndDeselect(result)

        expect(result.current.state.selectedCells.size).toBe(0)
        expect(result.current.selectedCell).toBeNull()
        expect(result.current.highlightedDigit).toBeNull()
      })

      it('clearOnModeChange clears multi-select state', () => {
        const { result } = renderHook(() => useHighlightState())

        actSelectMultipleCells(result, [5, 15, 25])

        actClearOnModeChange(result)

        expect(result.current.state.selectedCells.size).toBe(0)
        expect(result.current.selectedCell).toBeNull()
      })
    })

    describe('Single vs Multi-Selection Detection', () => {
      it('detects single selection when one cell is selected', () => {
        const { result } = renderHook(() => useHighlightState())

        actSelectMultipleCells(result, [42])

        expect(result.current.state.selectedCells.size).toBe(1)
        expect(result.current.selectedCell).toBe(42)
      })

      it('detects multi-selection when multiple cells selected', () => {
        const { result } = renderHook(() => useHighlightState())

        actSelectMultipleCells(result, [10, 20, 30])

        expect(result.current.state.selectedCells.size).toBeGreaterThan(1)
        // When multiple cells are selected, selectedCell is set to the first
        // cell in the array (used as the "primary" cell for the outline styling)
        expect(result.current.selectedCell).toBe(10)
      })
    })
  })
})
// =============================================================================
// Mutation-killing tests added for cluster F4 retry (iteration 2).
// =============================================================================

describe('mutation-killing: CLEAR_MOVE_HIGHLIGHT preserves highlightedDigit (L161 case)', () => {
  it('keeps the digit highlight when only the move highlight is cleared', () => {
    const { result } = renderHook(() => useHighlightState())

    actSetDigitHighlight(result, 7)
    actSetMoveHighlight(result, createMockMoveHighlight())

    actClearMoveHighlight(result)

    // CLEAR_MOVE_HIGHLIGHT must preserve highlightedDigit. If the case falls
    // through to CLEAR_ALL, highlightedDigit is cleared instead.
    expect(result.current.highlightedDigit).toBe(7)
  })
})

describe('mutation-killing: CLICK_GIVEN_CELL populates selectedCells (L267 Set)', () => {
  it('adds the clicked cell to the selectedCells set, not an empty set', () => {
    const { result } = renderHook(() => useHighlightState())

    actClickGivenCell(result, 5, 42)

    expect(result.current.selectedCells).toEqual(new Set([42]))
    expect(result.current.state.selectedCells.has(42)).toBe(true)
  })
})

describe('mutation-killing: dispatch of an unknown action preserves state (L273 default)', () => {
  it('returns the state unchanged for an unrecognized action type', () => {
    const { result } = renderHook(() => useHighlightState())

    actSelectCell(result, 10)
    actSetDigitHighlight(result, 4)
    const versionBefore = result.current.version

    // The default case must return state unchanged. Removing it makes the
    // reducer return undefined, collapsing state.
    actDispatch(result, { type: 'UNKNOWN_ACTION' as never })

    expect(result.current.selectedCell).toBe(10)
    expect(result.current.highlightedDigit).toBe(4)
    expect(result.current.version).toBe(versionBefore)
  })
})
