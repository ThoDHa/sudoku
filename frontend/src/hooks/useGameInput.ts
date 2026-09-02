import { useMemo } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { commitCellAction } from '../lib/commitCellAction'
import { isDigitComplete } from '../lib/digitCompletion'
import type { UseSudokuGameReturn } from './useSudokuGame'
import type { useAutoSolve } from './useAutoSolve'

// Input-handler braid extracted from Game.tsx. Reads current state exclusively
// from the mirror refs passed in (selectedCellRef / selectedCellsRef /
// notesModeRef / eraseModeRef / highlightedDigitRef / gameRef /
// autoSolveRef); the only React state it owns is the extended-pause flag,
// kept here because resumeFromExtendedPause is wired into every entry point.
// Under the React Compiler these handlers are memoized automatically.

export interface UseGameInputOptions {
  // Mirror refs owned by Game; the hook only reads them.
  selectedCellRef: RefObject<number | null>
  selectedCellsRef: RefObject<Set<number>>
  notesModeRef: RefObject<boolean>
  eraseModeRef: RefObject<boolean>
  highlightedDigitRef: RefObject<number | null>
  gameRef: RefObject<UseSudokuGameReturn | null>
  autoSolveRef: RefObject<ReturnType<typeof useAutoSolve> | null>

  // Highlight-state callbacks (from useHighlightState).
  selectCell: (idx: number) => void
  deselectCell: () => void
  clearAllAndDeselect: () => void
  clickGivenCell: (digit: number, idx: number) => void
  selectMultipleCells: (cells: number[]) => void
  toggleDigitHighlight: (digit: number) => void
  clearAfterUserCandidateOp: () => void
  clearAfterDigitPlacement: () => void
  clearAfterErase: () => void
  clearAfterDigitToggle: () => void
  clearDigitHighlight: () => void
  clearMoveHighlight: () => void

  // State setters from Game. Dispatch<SetStateAction<...>> matches the
  // signature passed by useState, so both `setValue(false)` and
  // `setValue(prev => !prev)` work through the same prop.
  setNotesMode: Dispatch<SetStateAction<boolean>>
  setEraseMode: Dispatch<SetStateAction<boolean>>
  setAutoSolveStepsUsed: Dispatch<SetStateAction<number>>
  setAutoSolveErrorsFixed: Dispatch<SetStateAction<number>>

  // Hint-cache invalidation from useHints.
  resetHintTracking: () => void

  // Extended pause: the hook flips it back to false on any user input.
  isExtendedPaused: boolean
  setIsExtendedPaused: Dispatch<SetStateAction<boolean>>
}

export interface UseGameInputReturn {
  handleCellClick: (idx: number) => void
  handleCellChange: (idx: number, value: number) => void
  handleDigitInput: (digit: number) => void
  handleCellSelectMultiple: (cells: number[]) => void
  handleDragEnd: (cells: number[]) => void
  handleNotesToggle: () => void
  handleEraseMode: () => void
  handleUndo: () => void
  handleRedo: () => void
}

type GameApi = NonNullable<UseSudokuGameReturn>

export function useGameInput(options: UseGameInputOptions): UseGameInputReturn {
  const {
    selectedCellRef,
    selectedCellsRef,
    notesModeRef,
    eraseModeRef,
    highlightedDigitRef,
    gameRef,
    autoSolveRef,
    selectCell,
    deselectCell,
    clearAllAndDeselect,
    clickGivenCell,
    selectMultipleCells,
    toggleDigitHighlight,
    clearAfterUserCandidateOp,
    clearAfterDigitPlacement,
    clearAfterErase,
    clearAfterDigitToggle,
    clearDigitHighlight,
    clearMoveHighlight,
    setNotesMode,
    setEraseMode,
    setAutoSolveStepsUsed,
    setAutoSolveErrorsFixed,
    resetHintTracking,
    isExtendedPaused,
    setIsExtendedPaused,
  } = options

  // Resume from extended pause on user interaction
  const resumeFromExtendedPause = () => {
    if (isExtendedPaused) {
      setIsExtendedPaused(false)
    }
  }

  // Shared digit placement logic - unifies mobile and desktop behavior
  const placeDigitAndClear = (cellIndex: number, digit: number, notesMode: boolean) => {
    /* istanbul ignore next -- callers pre-check gameRef.current before routing here */
    // Stryker disable next-line ConditionalExpression: the forced-false half is equivalent because every caller pre-checks gameRef.current before routing here, so the guard never fires on a reachable path; the forced-true half returns early from every placement and dies to the input tests
    if (!gameRef.current) return

    // Use setCellMultiple when multiple cells selected AND in notes mode
    const currentSelectedCells = selectedCellsRef.current
    const isMultiSelect = notesMode && currentSelectedCells.size > 1

    if (isMultiSelect) {
      // Convert Set to array for setCellMultiple
      const selectedCellsArray = Array.from(currentSelectedCells)
      gameRef.current.setCellMultiple(selectedCellsArray, digit, notesMode)
    } else {
      // Single cell: use original setCell logic
      gameRef.current.setCell(cellIndex, digit, notesMode)
    }

    if (notesMode) {
      clearAfterUserCandidateOp()
    } else {
      clearAfterDigitPlacement()
      deselectCell()
    }

    // Clear highlight when the placed digit becomes complete
    // Check if the digit we just placed is now complete (all 9 instances on board)
    if (!notesMode) {
      const digitCounts = gameRef.current.digitCounts
      if (isDigitComplete(digit, digitCounts)) {
        clearDigitHighlight()
      }
    }

    resetHintTracking()
  }

  // Multi-select callback for drag selection on Board
  const handleCellSelectMultiple = (cells: number[]) => {
    selectMultipleCells(cells)
  }

  // Drag end callback: when a multi-cell drag completes and a digit is highlighted
  // in notes mode, auto-insert/toggle that candidate on all selected cells.
  const handleDragEnd = (cells: number[]) => {
    const currentHighlightedDigit = highlightedDigitRef.current
    const currentNotesMode = notesModeRef.current
    const currentGame = gameRef.current

    if (!currentGame || !currentNotesMode || currentHighlightedDigit === null) return
    if (cells.length === 0) return

    currentGame.setCellMultiple(cells, currentHighlightedDigit, true)
  }

  // Erase-mode click: if active and the cell is erasable, erase it (keeping
  // erase mode on); otherwise just select the cell and exit erase mode.
  const handleEraseClick = (idx: number, game: GameApi): boolean => {
    if (!eraseModeRef.current) return false
    if (game.board[idx] !== 0 && !game.isGivenCell(idx)) {
      commitCellAction('erase', {
        idx,
        game,
        clearAfterErase,
        deselectCell,
        setEraseMode,
        setAutoSolveStepsUsed,
        setAutoSolveErrorsFixed,
      })
      resetHintTracking()
      return true
    }
    selectCell(idx)
    setEraseMode(false)
    return true
  }

  // Place (or toggle) the highlighted digit on a cell. In notes mode toggles
  // the candidate; otherwise places the digit, or erases if the cell already
  // holds that digit.
  const handleHighlightedPlacement = (
    idx: number,
    game: GameApi,
    highlightedDigit: number,
    notesMode: boolean,
  ): void => {
    if (isDigitComplete(highlightedDigit, game.digitCounts)) {
      clearDigitHighlight()
      return
    }
    if (notesMode) {
      if (game.board[idx] === 0) {
        placeDigitAndClear(idx, highlightedDigit, notesMode)
      }
      return
    }
    if (game.board[idx] === highlightedDigit) {
      commitCellAction('erase', {
        idx,
        game,
        clearAfterErase,
        deselectCell,
        setEraseMode,
        setAutoSolveStepsUsed,
        setAutoSolveErrorsFixed,
      })
      resetHintTracking()
    } else {
      placeDigitAndClear(idx, highlightedDigit, notesMode)
    }
  }

  // Cell click handler - reads from refs so React Compiler can keep it stable.
  const handleCellClick = (idx: number) => {
    resumeFromExtendedPause()

    // Read current state from refs
    const currentHighlightedDigit = highlightedDigitRef.current
    const currentSelectedCell = selectedCellRef.current
    const currentNotesMode = notesModeRef.current
    const currentGame = gameRef.current

    if (!currentGame) return

    if (handleEraseClick(idx, currentGame)) return

    // If a digit is already highlighted and we're clicking a given cell,
    // only block if we're NOT coming from another given cell (allow given-to-given navigation)
    if (currentHighlightedDigit !== null && currentGame.isGivenCell(idx)) {
      if (currentSelectedCell === null || !currentGame.isGivenCell(currentSelectedCell)) {
        return
      }
    }

    // Given cells: highlight the digit AND select the cell for peer highlighting
    if (currentGame.isGivenCell(idx)) {
      const cellDigit = currentGame.board[idx]
      // Stryker disable next-line ConditionalExpression: the forced-true half is equivalent on the given-cell domain (isGivenCell cells hold clue values 1-9, never 0); the forced-false half skips every given-cell highlight and dies to the digit-select tests
      if (cellDigit) {
        if (currentSelectedCell === idx) {
          clearAllAndDeselect()
        } else {
          clickGivenCell(cellDigit, idx)
        }
      }
      setEraseMode(false)
      return
    }

    // Toggle selection: clicking the same cell again deselects it.
    // In notes mode with a highlighted digit, instead toggle that candidate.
    if (currentSelectedCell === idx) {
      if (currentNotesMode && currentHighlightedDigit !== null && currentGame.board[idx] === 0) {
        currentGame.setCell(idx, currentHighlightedDigit, currentNotesMode)
        clearAfterUserCandidateOp()
        resetHintTracking()
        return
      }
      clearAllAndDeselect()
      return
    }

    if (currentHighlightedDigit !== null) {
      handleHighlightedPlacement(idx, currentGame, currentHighlightedDigit, currentNotesMode)
      return
    }

    // Select the cell (works for both empty and user-filled cells)
    // selectCell atomically selects and clears highlights
    selectCell(idx)
    setEraseMode(false)
  }

  // Digit input handler - reads from refs so React Compiler can keep it stable.
  const handleDigitInput = (digit: number) => {
    resumeFromExtendedPause()
    // Clear erase mode when selecting a digit
    setEraseMode(false)

    const currentSelectedCell = selectedCellRef.current
    const currentNotesMode = notesModeRef.current
    const currentGame = gameRef.current

    if (!currentGame) return

    // Block selection of complete digits
    // Don't allow selecting/placing digits that have all 9 instances on the board
    if (isDigitComplete(digit, currentGame.digitCounts)) {
      return
    }

    // Multi-select in notes mode: route to bulk note entry
    // selectedCell is null during multi-select (by design), so check selectedCells directly
    const currentSelectedCells = selectedCellsRef.current
    if (currentNotesMode && currentSelectedCells.size > 1) {
      placeDigitAndClear(0, digit, currentNotesMode)
      return
    }

    if (currentSelectedCell === null) {
      toggleDigitHighlight(digit)
      return
    }

    // If a given cell is selected, deselect it and toggle digit highlight for multi-fill mode
    if (currentGame.isGivenCell(currentSelectedCell)) {
      deselectCell()
      toggleDigitHighlight(digit)
      return
    }

    // If cell already has this digit, erase it
    if (currentGame.board[currentSelectedCell] === digit) {
      commitCellAction('erase', {
        idx: currentSelectedCell,
        game: currentGame,
        clearAfterErase: clearAfterDigitToggle,
        deselectCell,
        setEraseMode,
        setAutoSolveStepsUsed,
        setAutoSolveErrorsFixed,
      })
      resetHintTracking()
      return
    }

    placeDigitAndClear(currentSelectedCell, digit, currentNotesMode)

    // Cell deselects after digit entry (per requirements)
    // Keep digit highlighted for adding candidates (multi-fill)
  }

  // Keyboard cell change handler (from Board component)
  const handleCellChange = (idx: number, value: number) => {
    resumeFromExtendedPause()

    const currentGame = gameRef.current
    const currentNotesMode = notesModeRef.current

    if (!currentGame) return
    if (currentGame.isGivenCell(idx)) return

    if (value === 0) {
      commitCellAction('erase', {
        idx,
        game: currentGame,
        clearAfterErase,
        deselectCell,
        setEraseMode,
        setAutoSolveStepsUsed,
        setAutoSolveErrorsFixed,
      })
      resetHintTracking()
    } else {
      if (currentNotesMode) {
        currentGame.setCell(idx, value, currentNotesMode)

        // Clear all move-related highlights (cell backgrounds) but preserve digit highlight for multi-fill
        clearAfterUserCandidateOp()
      } else {
        currentGame.setCell(idx, value, currentNotesMode)
        clearAfterDigitPlacement()
        deselectCell()
      }
      // Reset last hint tracking so next hint counts as new
      resetHintTracking()
    }
  }

  // Toggle notes mode handler
  const handleNotesToggle = () => {
    setNotesMode((prev) => !prev)
  }

  // Toggle erase mode handler
  const handleEraseMode = () => {
    setEraseMode((prev) => !prev)
    // DO NOT call clearOnModeChange - preserve selection during mode toggle
  }

  // Undo handler - reads from refs so React Compiler can keep it stable.
  const handleUndo = () => {
    const currentAutoSolve = autoSolveRef.current
    const currentGame = gameRef.current
    if (currentAutoSolve?.isAutoSolving) {
      currentAutoSolve.stepBack()
    } else if (currentGame) {
      commitCellAction('undo', {
        game: currentGame,
        deselectCell,
        clearMoveHighlight,
      })
    }
  }

  // Redo handler - reads from refs so React Compiler can keep it stable.
  const handleRedo = () => {
    const currentAutoSolve = autoSolveRef.current
    const currentGame = gameRef.current
    if (currentAutoSolve?.isAutoSolving) {
      currentAutoSolve.stepForward()
    } else if (currentGame) {
      commitCellAction('redo', {
        game: currentGame,
        clearAllAndDeselect,
      })
    }
  }

  return useMemo(
    () => ({
      handleCellClick,
      handleCellChange,
      handleDigitInput,
      handleCellSelectMultiple,
      handleDragEnd,
      handleNotesToggle,
      handleEraseMode,
      handleUndo,
      handleRedo,
    }),
    [
      handleCellClick,
      handleCellChange,
      handleDigitInput,
      handleCellSelectMultiple,
      handleDragEnd,
      handleNotesToggle,
      handleEraseMode,
      handleUndo,
      handleRedo,
    ],
  )
}
