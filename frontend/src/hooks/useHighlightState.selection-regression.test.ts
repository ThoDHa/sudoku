/**
 * Selection State Regression Tests
 * 
 * REGRESSION TEST FORTRESS - Prevents Selection Demons from Returning
 * 
 * Created by Sun Wukong - Tôn Ngộ Không to guard against the return of selection state demons
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useHighlightState } from './useHighlightState'

describe('Selection State Regression Tests - Demon Prevention', () => {
  let hookResult: any

  beforeEach(() => {
    hookResult = renderHook(() => useHighlightState())
  })

  describe('Cell Selection Behavior', () => {
    it('selects cell when selectCell is called', () => {
      act(() => {
        hookResult.result.current.selectCell(42)
      })
      
      expect(hookResult.result.current.selectedCell).toBe(42)
    })

    it('deselects cell when deselectCell is called', () => {
      // First select a cell
      act(() => {
        hookResult.result.current.selectCell(25)
      })
      expect(hookResult.result.current.selectedCell).toBe(25)

      // Then deselect it
      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()
    })

    it('changes selection when selecting different cell', () => {
      act(() => {
        hookResult.result.current.selectCell(10)
      })
      expect(hookResult.result.current.selectedCell).toBe(10)

      act(() => {
        hookResult.result.current.selectCell(50)
      })
      expect(hookResult.result.current.selectedCell).toBe(50)
    })

    it('handles selection of same cell (idempotent)', () => {
      act(() => {
        hookResult.result.current.selectCell(30)
      })
      expect(hookResult.result.current.selectedCell).toBe(30)

      act(() => {
        hookResult.result.current.selectCell(30)
      })
      expect(hookResult.result.current.selectedCell).toBe(30)
    })
  })

  describe('Multiple Deselection Calls', () => {
    it('handles multiple deselectCell calls gracefully', () => {
      // Select a cell
      act(() => {
        hookResult.result.current.selectCell(15)
      })
      expect(hookResult.result.current.selectedCell).toBe(15)

      // Deselect multiple times
      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()

      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()

      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()
    })

    it('can select after deselection', () => {
      // Select, deselect, then select again
      act(() => {
        hookResult.result.current.selectCell(20)
      })
      expect(hookResult.result.current.selectedCell).toBe(20)

      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()

      act(() => {
        hookResult.result.current.selectCell(40)
      })
      expect(hookResult.result.current.selectedCell).toBe(40)
    })
  })

  describe('Edge Cases', () => {
    it('handles selection of cell 0 (first cell)', () => {
      act(() => {
        hookResult.result.current.selectCell(0)
      })
      expect(hookResult.result.current.selectedCell).toBe(0)

      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()
    })

    it('handles selection of cell 80 (last cell)', () => {
      act(() => {
        hookResult.result.current.selectCell(80)
      })
      expect(hookResult.result.current.selectedCell).toBe(80)

      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()
    })

    it('handles negative cell indices gracefully', () => {
      act(() => {
        hookResult.result.current.selectCell(-1)
      })
      expect(hookResult.result.current.selectedCell).toBe(-1)

      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()
    })

    it('handles large cell indices gracefully', () => {
      act(() => {
        hookResult.result.current.selectCell(999)
      })
      expect(hookResult.result.current.selectedCell).toBe(999)

      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()
    })
  })

  describe('Version Tracking for React Re-renders', () => {
    it('increments version on selection', () => {
      const initialVersion = hookResult.result.current.version

      act(() => {
        hookResult.result.current.selectCell(35)
      })

      expect(hookResult.result.current.version).toBe(initialVersion + 1)
    })

    it('increments version on deselection', () => {
      // Select first to have something to deselect
      act(() => {
        hookResult.result.current.selectCell(35)
      })
      const versionAfterSelect = hookResult.result.current.version

      act(() => {
        hookResult.result.current.deselectCell()
      })

      expect(hookResult.result.current.version).toBe(versionAfterSelect + 1)
    })

    it('increments version on each selection change', () => {
      const initialVersion = hookResult.result.current.version

      act(() => {
        hookResult.result.current.selectCell(10)
      })
      expect(hookResult.result.current.version).toBe(initialVersion + 1)

      act(() => {
        hookResult.result.current.selectCell(20)
      })
      expect(hookResult.result.current.version).toBe(initialVersion + 2)

      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.version).toBe(initialVersion + 3)
    })
  })

  describe('Selection State Consistency', () => {
    it('maintains selection state across multiple operations', () => {
      // Perform a complex sequence of operations
      act(() => {
        hookResult.result.current.selectCell(15)
      })
      expect(hookResult.result.current.selectedCell).toBe(15)

      // Simulate other operations that might affect state
      act(() => {
        hookResult.result.current.setDigitHighlight(5)
      })
      expect(hookResult.result.current.selectedCell).toBe(15) // Should still be selected

      act(() => {
        hookResult.result.current.clearDigitHighlight()
      })
      expect(hookResult.result.current.selectedCell).toBe(15) // Should still be selected

      // Only deselect when explicitly called
      act(() => {
        hookResult.result.current.deselectCell()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()
    })

    it('preserves null selection state across operations', () => {
      // Start with no selection
      expect(hookResult.result.current.selectedCell).toBeNull()

      // Perform operations that should not affect selection
      act(() => {
        hookResult.result.current.setDigitHighlight(3)
      })
      expect(hookResult.result.current.selectedCell).toBeNull()

      act(() => {
        hookResult.result.current.clearDigitHighlight()
      })
      expect(hookResult.result.current.selectedCell).toBeNull()

      // Selection should remain null until explicitly set
      act(() => {
        hookResult.result.current.selectCell(25)
      })
      expect(hookResult.result.current.selectedCell).toBe(25)
    })
  })
})