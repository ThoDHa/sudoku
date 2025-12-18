import { useCallback } from 'react'

export interface UseHighlightManagerOptions {
  setHighlightedDigit: (digit: number | null) => void
  setCurrentHighlight: (highlight: any) => void  // Using any for flexibility with different highlight types
  setSelectedCell: (cell: number | null) => void
}

export interface HighlightManager {
  // Core clearing operations
  clearAll: () => void
  clearDigitHighlight: () => void
  clearCurrentHighlight: () => void
  clearSelection: () => void
  
  // Semantic clearing operations for specific contexts
  clearAfterCandidateOperation: () => void
  clearAfterDigitPlacement: () => void
  clearAfterDigitToggle: () => void
  clearAfterCellSelection: () => void
  clearAfterEraseOperation: () => void
  clearOnModeChange: () => void
  
  // Multi-operation clearing
  clearAllAndDeselect: () => void
  clearHighlightsKeepSelection: () => void
  
  // Highlight setting with automatic clearing context
  setDigitHighlight: (digit: number | null, context?: 'multi-fill' | 'single-fill') => void
}

/**
 * Centralized highlight management hook for consistent behavior across the game.
 * 
 * Design principles:
 * 1. Always clear highlights after candidate operations (add/remove)
 * 2. Preserve highlights for multi-fill mode (when no cell selected)
 * 3. Clear highlights when changing modes or erasing
 * 4. Provide semantic methods for different interaction contexts
 */
export function useHighlightManager(options: UseHighlightManagerOptions): HighlightManager {
  const { setHighlightedDigit, setCurrentHighlight, setSelectedCell } = options

  // Core clearing operations
  const clearDigitHighlight = useCallback(() => {
    setHighlightedDigit(null)
  }, [setHighlightedDigit])

  const clearCurrentHighlight = useCallback(() => {
    setCurrentHighlight(null)
  }, [setCurrentHighlight])

  const clearSelection = useCallback(() => {
    setSelectedCell(null)
  }, [setSelectedCell])

  const clearAll = useCallback(() => {
    setHighlightedDigit(null)
    setCurrentHighlight(null)
  }, [setHighlightedDigit, setCurrentHighlight])

  // Semantic clearing operations for specific contexts
  const clearAfterCandidateOperation = useCallback(() => {
    // Always clear digit highlight after any candidate operation (add/remove)
    // This fixes the persistent highlighting bug
    setHighlightedDigit(null)
    setCurrentHighlight(null)
  }, [setHighlightedDigit, setCurrentHighlight])

  const clearAfterDigitPlacement = useCallback(() => {
    // Clear move highlights but preserve digit highlight for multi-fill
    setCurrentHighlight(null)
    // Note: digit highlight is preserved for multi-fill workflow
  }, [setCurrentHighlight])

  const clearAfterDigitToggle = useCallback(() => {
    // When user toggles the same digit (erases it), clear highlights
    setHighlightedDigit(null)
    setCurrentHighlight(null)
  }, [setHighlightedDigit, setCurrentHighlight])

  const clearAfterCellSelection = useCallback(() => {
    // When selecting a cell, clear digit highlight but preserve cell selection
    setHighlightedDigit(null)
    setCurrentHighlight(null)
  }, [setHighlightedDigit, setCurrentHighlight])

  const clearAfterEraseOperation = useCallback(() => {
    // When erasing, clear highlights to show the action is complete
    setCurrentHighlight(null)
    // Note: digit highlight is preserved for continued operations
  }, [setCurrentHighlight])

  const clearOnModeChange = useCallback(() => {
    // When switching modes (notes/placement/erase), clear all highlights
    setHighlightedDigit(null)
    setCurrentHighlight(null)
    setSelectedCell(null)
  }, [setHighlightedDigit, setCurrentHighlight, setSelectedCell])

  // Multi-operation clearing
  const clearAllAndDeselect = useCallback(() => {
    setHighlightedDigit(null)
    setCurrentHighlight(null)
    setSelectedCell(null)
  }, [setHighlightedDigit, setCurrentHighlight, setSelectedCell])

  const clearHighlightsKeepSelection = useCallback(() => {
    setHighlightedDigit(null)
    setCurrentHighlight(null)
  }, [setHighlightedDigit, setCurrentHighlight])

  // Advanced highlight setting with context awareness
  const setDigitHighlight = useCallback((digit: number | null, _context: 'multi-fill' | 'single-fill' = 'single-fill') => {
    setHighlightedDigit(digit)
    
    // Clear other highlights when setting a new digit highlight
    if (digit !== null) {
      setCurrentHighlight(null)
    }
  }, [setHighlightedDigit, setCurrentHighlight])

  return {
    // Core operations
    clearAll,
    clearDigitHighlight,
    clearCurrentHighlight,
    clearSelection,
    
    // Semantic operations
    clearAfterCandidateOperation,
    clearAfterDigitPlacement,
    clearAfterDigitToggle,
    clearAfterCellSelection,
    clearAfterEraseOperation,
    clearOnModeChange,
    
    // Multi-operation
    clearAllAndDeselect,
    clearHighlightsKeepSelection,
    
    // Advanced setting
    setDigitHighlight
  }
}