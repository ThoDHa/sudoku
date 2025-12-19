import { renderHook } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useHighlightManager } from './useHighlightManager'

describe('useHighlightManager', () => {
  const mockSetHighlightedDigit = vi.fn()
  const mockSetCurrentHighlight = vi.fn()
  const mockSetSelectedCell = vi.fn()
  const mockSetSelectedMoveIndex = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderHighlightManager = () => {
    return renderHook(() =>
      useHighlightManager({
        setHighlightedDigit: mockSetHighlightedDigit,
        setCurrentHighlight: mockSetCurrentHighlight,
        setSelectedCell: mockSetSelectedCell,
        setSelectedMoveIndex: mockSetSelectedMoveIndex,
      })
    )
  }

  describe('clearAfterUserCandidateOperation', () => {
    it('preserves digit highlight for multi-fill workflow', () => {
      const { result } = renderHighlightManager()

      result.current.clearAfterUserCandidateOperation()

      // CRITICAL: digit highlight should NOT be cleared
      // This allows multi-fill workflow where user selects a digit and adds/removes it from multiple cells
      expect(mockSetHighlightedDigit).not.toHaveBeenCalled()
    })

    it('clears currentHighlight to remove technique/hint backgrounds', () => {
      const { result } = renderHighlightManager()

      result.current.clearAfterUserCandidateOperation()

      expect(mockSetCurrentHighlight).toHaveBeenCalledWith(null)
    })

    it('clears selectedMoveIndex to deselect history items', () => {
      const { result } = renderHighlightManager()

      result.current.clearAfterUserCandidateOperation()

      expect(mockSetSelectedMoveIndex).toHaveBeenCalledWith(null)
    })
  })

  describe('clearAfterCandidateOperation', () => {
    it('clears both digit highlight and current highlight', () => {
      const { result } = renderHighlightManager()

      result.current.clearAfterCandidateOperation()

      expect(mockSetHighlightedDigit).toHaveBeenCalledWith(null)
      expect(mockSetCurrentHighlight).toHaveBeenCalledWith(null)
    })
  })

  describe('clearAfterDigitPlacement', () => {
    it('preserves digit highlight for multi-fill workflow', () => {
      const { result } = renderHighlightManager()

      result.current.clearAfterDigitPlacement()

      expect(mockSetHighlightedDigit).not.toHaveBeenCalled()
      expect(mockSetCurrentHighlight).toHaveBeenCalledWith(null)
    })
  })

  describe('clearAllAndDeselect', () => {
    it('clears all highlights and selection', () => {
      const { result } = renderHighlightManager()

      result.current.clearAllAndDeselect()

      expect(mockSetHighlightedDigit).toHaveBeenCalledWith(null)
      expect(mockSetCurrentHighlight).toHaveBeenCalledWith(null)
      expect(mockSetSelectedCell).toHaveBeenCalledWith(null)
    })
  })

  describe('setDigitHighlight', () => {
    it('sets digit highlight and clears current highlight', () => {
      const { result } = renderHighlightManager()

      result.current.setDigitHighlight(5)

      expect(mockSetHighlightedDigit).toHaveBeenCalledWith(5)
      expect(mockSetCurrentHighlight).toHaveBeenCalledWith(null)
    })

    it('clears current highlight when deselecting digit', () => {
      const { result } = renderHighlightManager()

      result.current.setDigitHighlight(null)

      expect(mockSetHighlightedDigit).toHaveBeenCalledWith(null)
      expect(mockSetCurrentHighlight).toHaveBeenCalledWith(null)
    })
  })
})
