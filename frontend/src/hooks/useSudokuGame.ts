import React, { useState, useCallback, useMemo, useRef } from 'react'
import {
  hasCandidate,
  addCandidate,
  removeCandidate,
  countCandidates,
  toggleCandidate,
  type CandidateMask
} from '../lib/candidatesUtils'
import {
  BOARD_SIZE,
  TOTAL_CELLS,
  MIN_DIGIT,
  MAX_DIGIT
} from '../lib/constants'
import { useCandidates } from './useCandidates'
import { useBoardHistory } from './useBoardHistory'
import { isValidSolution } from '../lib/validationUtils'
import {
  createStateDiff,
  type StateDiff
} from '../lib/diffUtils'

// Move can be either a solver technique or a user action
export interface Move {
  step_index: number
  technique: string
  action: string
  digit: number
  targets: { row: number; col: number }[]
  eliminations?: { row: number; col: number; digit: number }[]
  explanation: string
  refs: { title: string; slug: string; url: string }
  highlights: {
    primary: { row: number; col: number }[]
    secondary?: { row: number; col: number }[]
  }
  isUserMove?: boolean
  // Compact diff instead of full board states (new approach)
  stateDiff?: StateDiff
  // Legacy fields for backward compatibility with saves
  boardBefore?: number[]
  candidatesBefore?: number[][] // Serialized for storage
}

interface UseSudokuGameOptions {
  /** Initial givens (the starting puzzle) */
  initialBoard: number[]
  /** Callback fired when puzzle is completed successfully */
  onComplete?: () => void
}

export interface UseSudokuGameReturn {
  // State
  board: number[]
  candidates: Uint16Array
  /** Version counter - increments on every candidates change for reliable React detection */
  candidatesVersion: number
  history: Move[]
  historyIndex: number
  canUndo: boolean
  canRedo: boolean
  isComplete: boolean
  
  // Computed
  digitCounts: number[]
  
  // Actions
  setCell: (idx: number, digit: number, isNotesMode: boolean) => void
  setCellMultiple: (indices: number[], digit: number, isNotesMode: boolean) => void
  eraseCell: (idx: number) => void
  undo: () => void
  redo: () => void
  resetGame: () => void
  clearAll: () => void
  clearCandidates: () => void
  
  // For external updates (e.g., from hints/auto-solve)
  applyExternalMove: (
    newBoard: number[],
    newCandidates: Uint16Array,
    move: Move
  ) => void
  setIsComplete: (complete: boolean) => void
  
  // For restoring saved game state
  restoreState: (
    savedBoard: number[],
    savedCandidates: Uint16Array,
    savedHistory: Move[]
  ) => void
  
  // For setting board state without modifying history (e.g., auto-solve rewind)
  setBoardState: (
    newBoard: number[],
    newCandidates: Uint16Array
  ) => void
  
  // Helpers
  isGivenCell: (idx: number) => boolean
  calculateCandidatesForCell: (idx: number, currentBoard: number[]) => CandidateMask
  fillAllCandidates: () => Uint16Array
  areCandidatesFilled: () => boolean
  checkNotes: () => {
    valid: boolean
    wrongNotes: { idx: number; digit: number }[]
    missingNotes: { idx: number; digit: number }[]
    cellsWithNotes: number
  }
}

/**
 * Core Sudoku game state management hook.
 * Handles board state, candidates, undo/redo, and move history.
 */
export function useSudokuGame(options: UseSudokuGameOptions): UseSudokuGameReturn {
  const { initialBoard, onComplete } = options

  // Store onComplete in ref to avoid stale closure issues
  const onCompleteRef = useRef(onComplete)
  React.useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Store a stable reference to the initial board (the puzzle givens)
  // This is updated only when resetGame is called or when the initialBoard prop changes
  const [givenCells, setGivenCells] = useState<number[]>([...initialBoard])

  // Core state
  const firstInitRef = useRef<boolean>(false)
  const [board, setBoard] = useState<number[]>(() => {
    if (initialBoard.length === 81 && initialBoard.some(v => v !== 0)) {
      return [...initialBoard]
    }
    return Array(81).fill(0)
  })

  // Board ref for stable access in callbacks
  const boardRef = useRef(board)

  const candidatesHook = useCandidates(board)
  
  // Candidates ref for stable access in callbacks (used by useBoardHistory)
  const candidatesRef = useRef<Uint16Array>(candidatesHook.candidates)
  
  // Keep candidatesRef in sync
  React.useEffect(() => { candidatesRef.current = candidatesHook.candidates }, [candidatesHook.candidates])

  const { history, historyIndex, historyRef: historyHookHistoryRef, historyIndexRef: historyHookIndexRef, limitHistory: historyHookLimitHistory, setHistory: historyHookSetHistory, setHistoryIndex: historyHookSetHistoryIndex, canUndo: historyHookCanUndo, canRedo: historyHookCanRedo, undo: historyHookUndo, redo: historyHookRedo } = useBoardHistory({
    setBoard,
    setCandidates: candidatesHook.setCandidates,
    boardRef,
    candidatesRef,
  })

  // Helper to update board without overwriting on remount
  // Prevents useState re-initialization from erasing restored state
  const updateBoard = useCallback((newBoard: number[]) => {
    firstInitRef.current = true
    setBoard(newBoard)
  }, [])

  // Helper to create a move with compact state diff
  // Creates diff between old and new board/candidates states and attaches to move
  const createMoveWithDiff = useCallback((
    move: Move,
    oldBoard: number[],
    newBoard: number[],
    newCandidates: Uint16Array
  ): Move => {
    const stateDiff = createStateDiff(oldBoard, newBoard, candidatesHook.candidates, newCandidates)
    return {
      ...move,
      stateDiff,
    }
  }, [candidatesHook.candidates])

  // Completion state
  const [isComplete, setIsComplete] = useState(false)

  // Helper to check if board is complete and valid
  // Checks completion and validity of current board state
  const checkCompletion = useCallback((newBoard: number[]) => {
    const allFilled = newBoard.every((v: number) => v !== 0)
    if (allFilled && isValidSolution(newBoard)) {
      setIsComplete(true)
      onCompleteRef.current?.()
    } else {
      setIsComplete(false)
    }
   }, [setIsComplete])
  
  // Guard against rapid double-calls (e.g., from click + focus events)
  const lastNoteToggle = useRef<{ idx: number; digit: number; time: number } | null>(null)

  // ============================================================
  // REFS FOR STABLE CALLBACKS (RACE CONDITION PREVENTION)
  // ============================================================
  // PATTERN: Ref-based state access for race condition prevention
  //
  // Problem: React's setState is async. When user clicks rapidly (e.g., toggle
  // candidate twice within 50ms), the second click's callback may still see
  // OLD state value from its closure, causing toggle to appear to "skip".
  //
  // Solution: All state-mutating callbacks read from refs instead of closure values.
  // After each setState, we ALSO update the ref synchronously. This ensures:
  //   1. The next rapid call sees updated value immediately
  //   2. Callbacks don't need state in deps (stable references, no recreation)
  //   3. No stale closure bugs even under rapid user input
  //
  // Example flow for rapid toggleCandidate(idx, 5) calls:
  //   Call 1: reads candidatesRef → has candidate → removes it → updates ref
  //   Call 2: reads candidatesRef → no candidate (ref updated!) → adds it → updates ref
  // Result: Correct toggle behavior even if React hasn't re-rendered yet
  //
  // This pattern is critical for mobile where touch events can fire rapidly.

  // Keep refs in sync with state after React processes update
  // (Effects run after render, but refs are also updated synchronously in callbacks)
  React.useEffect(() => { boardRef.current = board }, [board])

  React.useEffect(() => {
    if (initialBoard.length === TOTAL_CELLS && initialBoard.some(v => v !== 0)) {
      setGivenCells([...initialBoard])
    }
  }, [initialBoard])

  // ============================================================
  // COMPUTED VALUES
  // ============================================================

  const digitCounts = useMemo(() => {
    const counts = Array(MAX_DIGIT).fill(0)
    for (const val of board) {
      if (val >= MIN_DIGIT && val <= MAX_DIGIT) {
        counts[val - 1]++
      }
    }
    return counts
  }, [board])

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  const calculateAllCandidatesForBoard = useCallback((board: number[]): Uint16Array => {
    const newCandidates = new Uint16Array(TOTAL_CELLS)

    for (let idx = 0; idx < TOTAL_CELLS; idx++) {
      if (board[idx] !== 0) {
        newCandidates[idx] = 0 // clearAll()
        continue
      }
      newCandidates[idx] = candidatesHook.calculateCandidatesForCell(idx, board)
    }
    return newCandidates
  }, [candidatesHook])

  const _fillAllCandidates = useCallback((): Uint16Array => {
    const currentBoard = boardRef.current
    return calculateAllCandidatesForBoard(currentBoard)
  }, [calculateAllCandidatesForBoard])

  const _areCandidatesFilled = useCallback((): boolean => {
    let hasAnyCandidates = false
    for (let idx = 0; idx < TOTAL_CELLS; idx++) {
      if (board[idx] !== 0) continue

      const cellCandidates = candidatesHook.candidates[idx]
      if (cellCandidates && countCandidates(cellCandidates) > 0) {
        hasAnyCandidates = true
        break
      }
    }
    return hasAnyCandidates
  }, [board, candidatesHook.candidates])

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  const isGivenCell = useCallback((idx: number): boolean => {
    return givenCells[idx] !== 0
  }, [givenCells])

  // ============================================================
  // CORE ACTIONS
  // ============================================================

  const setCell = useCallback((idx: number, digit: number, isNotesMode: boolean) => {
    if (isGivenCell(idx)) return

    // Read from refs to get latest state values
    // This prevents stale closure issues when multiple rapid calls happen
    const currentBoard = boardRef.current
    const currentCandidates = candidatesHook.candidates

    if (isNotesMode) {
      // Notes can only be added to empty cells
      if (currentBoard[idx] !== 0) return

      // DEBOUNCE GUARD: Prevent double-toggles from rapid events
      // On mobile especially, a single tap can trigger multiple events (touchstart,
      // click, focus) that all call this function. Without this guard, note
      // would toggle ON then immediately OFF, appearing to do nothing.
      // 100ms window is enough to catch duplicate events but short enough to allow
      // intentional rapid sequential inputs on different cells/digits.
      const now = Date.now()
      if (lastNoteToggle.current &&
          lastNoteToggle.current.idx === idx &&
          lastNoteToggle.current.digit === digit &&
          now - lastNoteToggle.current.time < 100) {
        return // Ignore duplicate call within 100ms
      }
      lastNoteToggle.current = { idx, digit, time: now }

      // Truncate history if we're in middle
      const truncatedHistory = historyHookHistoryRef.current.slice(0, historyHookIndexRef.current + 1)

      const row = Math.floor(idx / BOARD_SIZE)
      const col = idx % BOARD_SIZE
      const existingCellCandidates = currentCandidates[idx] || 0
      const hadCandidate = hasCandidate(existingCellCandidates, digit)

      // Toggle candidate
      const newCandidates = new Uint16Array(currentCandidates)
      newCandidates[idx] = toggleCandidate(newCandidates[idx] || 0, digit)

       // Add note toggle move to history with compact diff
       const noteMove = createMoveWithDiff({
          step_index: truncatedHistory.length,
          technique: 'User Input',
          action: hadCandidate ? 'eliminate' : 'note',
          digit,
          targets: [{ row, col }],
          explanation: hadCandidate
            ? `Removed note ${digit} from R${row + 1}C${col + 1}`
            : `Added note ${digit} to R${row + 1}C${col + 1}`,
          refs: { title: '', slug: '', url: '' },
          highlights: { primary: [] },
          isUserMove: true,
       }, currentBoard, currentBoard, newCandidates)
        const newHistory = [...truncatedHistory, noteMove]
        const { history: limitedHistory, index: limitedIndex } = historyHookLimitHistory(newHistory, newHistory.length - 1)
         historyHookSetHistory(limitedHistory)
         historyHookSetHistoryIndex(limitedIndex)
         candidatesHook.setCandidates(newCandidates)

        // CRITICAL: Update refs synchronously so subsequent rapid calls see new values
        historyHookHistoryRef.current = limitedHistory
        historyHookIndexRef.current = limitedIndex
     } else {
       const row = Math.floor(idx / BOARD_SIZE)
       const col = idx % BOARD_SIZE

       // Truncate history if we're in middle
       const truncatedHistory = historyHookHistoryRef.current.slice(0, historyHookIndexRef.current + 1)

       // Calculate new state first
       const newBoard = [...currentBoard]
       newBoard[idx] = digit

        // Eliminate candidates from peers
        const newCandidates = candidatesHook.eliminateFromPeers(currentCandidates, idx, digit)

       // Add user move to history with compact diff
       const userMove = createMoveWithDiff({
         step_index: truncatedHistory.length,
          technique: 'User Input',
          action: 'place',
          digit,
          targets: [{ row, col }],
          explanation: `Placed ${digit} at R${row + 1}C${col + 1}`,
          refs: { title: '', slug: '', url: '' },
          highlights: { primary: [] },
          isUserMove: true,
       }, currentBoard, newBoard, newCandidates)

       const newHistory = [...truncatedHistory, userMove]
       const { history: limitedHistory, index: limitedIndex } = historyHookLimitHistory(newHistory, newHistory.length - 1)
       historyHookSetHistory(limitedHistory)
       historyHookSetHistoryIndex(limitedIndex)

        updateBoard(newBoard)
        candidatesHook.setCandidates(newCandidates)

        checkCompletion(newBoard)

        // CRITICAL: Update refs synchronously so subsequent rapid calls see new values
        boardRef.current = newBoard
        historyHookHistoryRef.current = limitedHistory
        historyHookIndexRef.current = limitedIndex
      }
    }, [
      isGivenCell, boardRef, candidatesHook, lastNoteToggle,
      historyHookHistoryRef, historyHookIndexRef, historyHookSetHistory,
      historyHookSetHistoryIndex, historyHookLimitHistory,
      createMoveWithDiff, updateBoard, checkCompletion
    ])

  const setCellMultiple = useCallback((indices: number[], digit: number, isNotesMode: boolean) => {
    // Bulk note entry only works in notes mode
    if (!isNotesMode) return

    const currentBoard = boardRef.current
    const currentCandidates = candidatesHook.candidates

    // Filter out given cells and non-empty cells
    const validIndices = indices.filter(idx => {
      if (isGivenCell(idx)) return false
      if (currentBoard[idx] !== 0) return false
      return true
    })

    // No valid cells to update
    if (validIndices.length === 0) return

    // Truncate history if we're in middle
    const truncatedHistory = historyHookHistoryRef.current.slice(0, historyHookIndexRef.current + 1)

    // Create new candidates array with fill-first-then-remove logic:
    // If ANY valid cell is MISSING the digit → ADD to all that don't have it
    // If ALL valid cells HAVE the digit → REMOVE from all
    const newCandidates = new Uint16Array(currentCandidates)
    const targets: { row: number; col: number }[] = []

    const allHaveCandidate = validIndices.every(idx =>
      hasCandidate(currentCandidates[idx] || 0, digit)
    )

    validIndices.forEach(idx => {
      if (allHaveCandidate) {
        newCandidates[idx] = removeCandidate(newCandidates[idx] || 0, digit)
      } else {
        newCandidates[idx] = addCandidate(newCandidates[idx] || 0, digit)
      }
      const row = Math.floor(idx / BOARD_SIZE)
      const col = idx % BOARD_SIZE
      targets.push({ row, col })
    })

    // Build targets for history
    const action = allHaveCandidate ? 'eliminate' : 'note'

    // Add bulk note operation to history with compact diff
    const bulkNoteMove = createMoveWithDiff({
      step_index: truncatedHistory.length,
      technique: 'User Input',
      action,
      digit,
      targets,
      explanation: action === 'note'
        ? `Added note ${digit} to ${targets.length} cells`
        : `Removed note ${digit} from ${targets.length} cells`,
      refs: { title: '', slug: '', url: '' },
      highlights: { primary: [] },
      isUserMove: true,
    }, currentBoard, currentBoard, newCandidates)

    const newHistory = [...truncatedHistory, bulkNoteMove]
    const { history: limitedHistory, index: limitedIndex } = historyHookLimitHistory(newHistory, newHistory.length - 1)
    historyHookSetHistory(limitedHistory)
    historyHookSetHistoryIndex(limitedIndex)
    candidatesHook.setCandidates(newCandidates)

    // CRITICAL: Update refs synchronously so subsequent rapid calls see new values
    historyHookHistoryRef.current = limitedHistory
    historyHookIndexRef.current = limitedIndex
  }, [
    isGivenCell, boardRef, candidatesHook,
    historyHookHistoryRef, historyHookIndexRef, historyHookSetHistory,
    historyHookSetHistoryIndex, historyHookLimitHistory,
    createMoveWithDiff
  ])

   const handleToggleCandidate = useCallback((idx: number, digit: number) => {
    const currentBoard = boardRef.current
    const currentCandidates = candidatesRef.current

    // Can only toggle candidates on empty cells
    if (currentBoard[idx] !== 0) return
    if (isGivenCell(idx)) return

    // Truncate history if we're in the middle
    const truncatedHistory = historyHookHistoryRef.current.slice(0, historyHookIndexRef.current + 1)

    const row = Math.floor(idx / BOARD_SIZE)
    const col = idx % BOARD_SIZE
    const existingCellCandidates = currentCandidates[idx] || 0
    const hadCandidate = hasCandidate(existingCellCandidates, digit)

    // Toggle candidate
    const newCandidates = new Uint16Array(currentCandidates)
    newCandidates[idx] = toggleCandidate(newCandidates[idx] || 0, digit)

    // Add note toggle move to history with compact diff
    const noteMove = createMoveWithDiff({
      step_index: truncatedHistory.length,
      technique: 'User Input',
      action: hadCandidate ? 'eliminate' : 'note',
      digit,
      targets: [{ row, col }],
      explanation: hadCandidate
        ? `Removed note ${digit} from R${row + 1}C${col + 1}`
        : `Added note ${digit} to R${row + 1}C${col + 1}`,
      refs: { title: '', slug: '', url: '' },
      highlights: { primary: [] },
      isUserMove: true,
    }, currentBoard, currentBoard, newCandidates)

    const newHistory = [...truncatedHistory, noteMove]
    const { history: limitedHistory, index: limitedIndex } = historyHookLimitHistory(newHistory, newHistory.length - 1)
    historyHookSetHistory(limitedHistory)
    historyHookSetHistoryIndex(limitedIndex)
    candidatesHook.setCandidates(newCandidates)

    // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
    candidatesRef.current = newCandidates
    historyHookHistoryRef.current = limitedHistory
    historyHookIndexRef.current = limitedIndex
  }, [
    isGivenCell,
    candidatesHook,
    createMoveWithDiff,
    historyHookHistoryRef,
    historyHookIndexRef,
    historyHookLimitHistory,
    historyHookSetHistory,
    historyHookSetHistoryIndex
  ])

  const eraseCell = useCallback((idx: number) => {
    const currentBoard = boardRef.current
    const currentCandidates = candidatesHook.candidates

    if (isGivenCell(idx)) return
    // Nothing to erase if cell is empty and has no candidates
    const cellCandidates = currentCandidates[idx] || 0
    const cellValue = currentBoard[idx] ?? 0
    if (cellValue === 0 && countCandidates(cellCandidates) === 0) return

    const row = Math.floor(idx / BOARD_SIZE)
    const col = idx % BOARD_SIZE
    const erasedDigit = cellValue

    // Truncate history if we're in the middle
    const truncatedHistory = historyHookHistoryRef.current.slice(0, historyHookIndexRef.current + 1)

    // Calculate new state first
    const newBoard = [...currentBoard]
    newBoard[idx] = 0

    // Clear candidates for erased cell - don't auto-populate
    // Candidates should only appear when user manually adds them or clicks "Fill Candidates"
    const newCandidates = new Uint16Array(currentCandidates)
    newCandidates[idx] = 0

    // Add erase move to history with compact diff
    const eraseMove = createMoveWithDiff({
      step_index: truncatedHistory.length,
      technique: 'User Input',
      action: 'erase',
      digit: erasedDigit,
      targets: [{ row, col }],
      explanation: erasedDigit > 0
        ? `Erased ${erasedDigit} from R${row + 1}C${col + 1}`
        : `Cleared notes from R${row + 1}C${col + 1}`,
      refs: { title: '', slug: '', url: '' },
      highlights: { primary: [] }, // No highlights for user moves
      isUserMove: true,
    }, currentBoard, newBoard, newCandidates)

    const newHistory = [...truncatedHistory, eraseMove]
    const { history: limitedHistory, index: limitedIndex } = historyHookLimitHistory(newHistory, newHistory.length - 1)
    historyHookSetHistory(limitedHistory)
    historyHookSetHistoryIndex(limitedIndex)

    setBoard(newBoard)
    candidatesHook.setCandidates(newCandidates)

    // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
    boardRef.current = newBoard
    historyHookHistoryRef.current = limitedHistory
    historyHookIndexRef.current = limitedIndex
  }, [isGivenCell, candidatesHook, createMoveWithDiff, historyHookHistoryRef, historyHookIndexRef, historyHookLimitHistory, historyHookSetHistory, historyHookSetHistoryIndex])

  const resetGame = useCallback(() => {
    setGivenCells([...initialBoard])
    setBoard([...initialBoard])
    candidatesHook.setCandidates(new Uint16Array(TOTAL_CELLS))
    historyHookSetHistory([])
    historyHookSetHistoryIndex(-1)
    setIsComplete(false)
  }, [initialBoard, candidatesHook, setIsComplete, historyHookSetHistory, historyHookSetHistoryIndex])

  const clearAll = useCallback(() => {
    setBoard([...givenCells])
    candidatesHook.setCandidates(new Uint16Array(TOTAL_CELLS))
    historyHookSetHistory([])
    historyHookSetHistoryIndex(-1)
  }, [givenCells, candidatesHook, historyHookSetHistory, historyHookSetHistoryIndex])

  const clearCandidates = useCallback(() => {
    const currentBoard = boardRef.current

    // Calculate new state (cleared candidates)
    const newCandidates = new Uint16Array(TOTAL_CELLS)

    // Add clear candidates move to history with compact diff
    const clearMove = createMoveWithDiff({
      step_index: historyHookHistoryRef.current.length,
      technique: 'Clear Notes',
      action: 'clear-candidates',
      digit: 0,
      targets: [],
      explanation: 'Cleared all notes',
      refs: { title: '', slug: '', url: '' },
      highlights: { primary: [] },
      isUserMove: true,
    }, currentBoard, currentBoard, newCandidates)

    const newHistory = [...historyHookHistoryRef.current, clearMove]
    const { history: limitedHistory, index: limitedIndex } = historyHookLimitHistory(newHistory, newHistory.length - 1)
    historyHookSetHistory(limitedHistory)
    historyHookSetHistoryIndex(limitedIndex)
    candidatesHook.setCandidates(newCandidates)
  }, [boardRef, candidatesHook, createMoveWithDiff, historyHookHistoryRef, historyHookLimitHistory, historyHookSetHistory, historyHookSetHistoryIndex])

  // For external updates (hints, auto-solve)
  const applyExternalMove = useCallback((
    newBoard: number[],
    newCandidates: Uint16Array,
    move: Move
  ) => {
    const currentBoard = boardRef.current
    const currentCandidates = candidatesHook.candidates

    const stateDiff = createStateDiff(currentBoard, newBoard, currentCandidates, newCandidates)
    const moveWithState: Move = {
      ...move,
      stateDiff,
    }

    const truncatedHistory = historyHookHistoryRef.current.slice(0, historyHookIndexRef.current + 1)
    const newHistory = [...truncatedHistory, moveWithState]
    const { history: limitedHistory, index: limitedIndex } = historyHookLimitHistory(newHistory, newHistory.length - 1)
    historyHookSetHistory(limitedHistory)
    historyHookSetHistoryIndex(limitedIndex)

    updateBoard(newBoard)
    candidatesHook.setCandidates(newCandidates)

    checkCompletion(newBoard)

    // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
    boardRef.current = newBoard
    historyHookHistoryRef.current = limitedHistory
    historyHookIndexRef.current = limitedIndex
  }, [checkCompletion, updateBoard, candidatesHook, historyHookHistoryRef, historyHookIndexRef, historyHookLimitHistory, historyHookSetHistory, historyHookSetHistoryIndex])

  // Restore saved game state (for auto-save/resume functionality)
  const restoreState = useCallback((
    savedBoard: number[],
    savedCandidates: Uint16Array,
    savedHistory: Move[]
  ) => {
    updateBoard(savedBoard)
    candidatesHook.setCandidates(savedCandidates)
    historyHookSetHistory(savedHistory)
    historyHookSetHistoryIndex(savedHistory.length - 1)

    // Check if restored board is already complete
    const allFilled = savedBoard.every((v: number) => v !== 0)
    if (allFilled && isValidSolution(savedBoard)) {
      setIsComplete(true)
    } else {
      setIsComplete(false)
    }
  }, [updateBoard, candidatesHook, setIsComplete, historyHookSetHistory, historyHookSetHistoryIndex])

  const setBoardState = useCallback((
    newBoard: number[],
    newCandidates: Uint16Array
  ) => {
    updateBoard(newBoard)
    candidatesHook.setCandidates(newCandidates)
  }, [updateBoard, candidatesHook])

  // Wrapped undo that also checks completion status
  const handleUndo = useCallback(() => {
    historyHookUndo()
    // Check if board is no longer complete after undo
    const newBoard = boardRef.current
    const allFilled = newBoard.every((v: number) => v !== 0)
    if (!allFilled || !isValidSolution(newBoard)) {
      setIsComplete(false)
    }
  }, [historyHookUndo, setIsComplete])

  // Wrapped redo that also checks completion status
  const handleRedo = useCallback(() => {
    historyHookRedo()
    // Check if board is complete after redo
    checkCompletion(boardRef.current)
  }, [historyHookRedo, checkCompletion])

  // Check notes for errors
  // Returns: { valid: true } if all notes are correct
  // Returns: { valid: false, wrongNotes: [...], missingNotes: [...] } if there are errors
  const checkNotes = useCallback((): {
    valid: boolean
    wrongNotes: { idx: number; digit: number }[]
    missingNotes: { idx: number; digit: number }[]
    cellsWithNotes: number
  } => {
    const wrongNotes: { idx: number; digit: number }[] = []
    const missingNotes: { idx: number; digit: number }[] = []
    let cellsWithNotes = 0

    for (let idx = 0; idx < TOTAL_CELLS; idx++) {
      // Skip filled cells
      if (board[idx] !== 0) continue

      const userNotesMask = candidatesHook.candidates[idx] || 0
      const validCandidatesMask = candidatesHook.calculateCandidatesForCell(idx, board)

      if (countCandidates(userNotesMask) > 0) {
        cellsWithNotes++
      }

      // Check for wrong notes (user has a note that's not a valid candidate)
      for (let digit = MIN_DIGIT; digit <= MAX_DIGIT; digit++) {
        if (hasCandidate(userNotesMask, digit) && !hasCandidate(validCandidatesMask, digit)) {
          wrongNotes.push({ idx, digit })
        }
      }

      // Check for missing notes (valid candidate that user doesn't have)
      // Only check cells where user has added at least one note
      if (countCandidates(userNotesMask) > 0) {
        for (let digit = MIN_DIGIT; digit <= MAX_DIGIT; digit++) {
          if (hasCandidate(validCandidatesMask, digit) && !hasCandidate(userNotesMask, digit)) {
            missingNotes.push({ idx, digit })
          }
        }
      }
    }

    return {
      valid: wrongNotes.length === 0,
      wrongNotes,
      missingNotes,
      cellsWithNotes,
    }
  }, [board, candidatesHook])

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference, causing all
  // consumers to re-render unnecessarily.
  return useMemo(() => ({
    // State
    board,
    candidates: candidatesHook.candidates,
    candidatesVersion: candidatesHook.candidatesVersion,
    history,
    historyIndex,
    canUndo: historyHookCanUndo,
    canRedo: historyHookCanRedo,
    isComplete,

    // Computed
    digitCounts,

    // Actions
    setCell,
    setCellMultiple,
    eraseCell,
    toggleCandidate: handleToggleCandidate,
    undo: handleUndo,
    redo: handleRedo,
    resetGame,
    clearAll,
    clearCandidates,

    // External updates
    applyExternalMove,
    setIsComplete,
    restoreState,
    setBoardState,

    // Helpers
    isGivenCell,
    calculateCandidatesForCell: candidatesHook.calculateCandidatesForCell,
    fillAllCandidates: _fillAllCandidates,
    areCandidatesFilled: _areCandidatesFilled,
    checkNotes,
  }), [
    board, candidatesHook, history, historyIndex, historyHookCanUndo, historyHookCanRedo, isComplete,
    digitCounts, setCell, setCellMultiple, eraseCell, handleToggleCandidate, handleUndo, handleRedo, resetGame,
    clearAll, clearCandidates, applyExternalMove, setIsComplete, restoreState,
    setBoardState, isGivenCell, _fillAllCandidates,
    _areCandidatesFilled, checkNotes
  ])
}
