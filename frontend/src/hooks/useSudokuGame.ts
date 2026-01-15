import React, { useState, useCallback, useMemo, useRef } from 'react'
import {
  hasCandidate,
  addCandidate,
  removeCandidate,
  toggleCandidate as toggleCandidateBit,
  countCandidates,
  arraysToCandidates,
  type CandidateMask
} from '../lib/candidatesUtils'
import {
  createStateDiff,
  applyStateDiff,
  unapplyStateDiff,
  type StateDiff
} from '../lib/diffUtils'
import { 
  MAX_MOVE_HISTORY,
  BOARD_SIZE,
  SUBGRID_SIZE, 
  TOTAL_CELLS,
  MIN_DIGIT,
  MAX_DIGIT
} from '../lib/constants'

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
  /** Callback when game is completed */
  onComplete?: () => void
}

interface UseSudokuGameReturn {
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
  eraseCell: (idx: number) => void
  toggleCandidate: (idx: number, digit: number) => void
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

  // Store a stable reference to the initial board (the puzzle givens)
  // This is updated only when resetGame is called or when the initialBoard prop changes
  const [givenCells, setGivenCells] = useState<number[]>([...initialBoard])

  // Core state
  const [board, setBoard] = useState<number[]>([...initialBoard])
  const [candidates, setCandidates] = useState<Uint16Array>(
    () => new Uint16Array(TOTAL_CELLS)
  )
  
  // VERSION COUNTER: Force React to detect Uint16Array mutations
  // Problem: Uint16Array is a typed array. Even when we create a new instance,
  // React's shallow comparison might not detect the change on all platforms
  // (particularly mobile Safari). Components wouldn't re-render to show updated notes.
  // Solution: Increment a version counter alongside every candidates update.
  // Components that depend on candidates also depend on candidatesVersion,
  // guaranteeing a re-render when candidates change.
  const [candidatesVersion, setCandidatesVersion] = useState(0)
  
  // Helper to update candidates with version bump - always use this, never setCandidates directly
  const updateCandidates = useCallback((newCandidates: Uint16Array) => {
    setCandidates(newCandidates)
    setCandidatesVersion(v => v + 1)
  }, [])
  
  // Helper to limit history size to prevent unbounded memory growth
  // When history exceeds MAX_MOVE_HISTORY, remove oldest entries
  const limitHistory = useCallback((historyArray: Move[], currentIndex: number): { history: Move[], index: number } => {
    if (historyArray.length <= MAX_MOVE_HISTORY) {
      return { history: historyArray, index: currentIndex }
    }
    
    // Remove oldest entries to stay within limit
    const excess = historyArray.length - MAX_MOVE_HISTORY
    const trimmedHistory = historyArray.slice(excess)
    const adjustedIndex = Math.max(0, currentIndex - excess)
    
    return { history: trimmedHistory, index: adjustedIndex }
  }, [])
  
  // Move history (serves as undo stack - each move stores boardBefore/candidatesBefore)
  const [history, setHistory] = useState<Move[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  
  // Completion state
  const [isComplete, setIsComplete] = useState(false)
  
  // Guard against rapid double-calls (e.g., from click + focus events)
  const lastNoteToggle = useRef<{ idx: number; digit: number; time: number } | null>(null)

  // ============================================================
  // REFS FOR STABLE CALLBACKS (RACE CONDITION PREVENTION)
  // ============================================================
  // PATTERN: Ref-based state access for race condition prevention
  //
  // Problem: React's setState is async. When user clicks rapidly (e.g., toggle
  // candidate twice within 50ms), the second click's callback may still see
  // the OLD state value from its closure, causing the toggle to appear to "skip".
  //
  // Solution: All state-mutating callbacks read from refs instead of closure values.
  // After each setState, we ALSO update the ref synchronously. This ensures:
  //   1. The next rapid call sees the updated value immediately
  //   2. Callbacks don't need state in deps (stable references, no recreation)
  //   3. No stale closure bugs even under rapid user input
  //
  // Example flow for rapid toggleCandidate(idx, 5) calls:
  //   Call 1: reads candidatesRef → has candidate → removes it → updates ref
  //   Call 2: reads candidatesRef → no candidate (ref updated!) → adds it → updates ref
  //   Result: Correct toggle behavior even if React hasn't re-rendered yet
  //
  // This pattern is critical for mobile where touch events can fire rapidly.
  const candidatesRef = useRef(candidates)
  const boardRef = useRef(board)
  const historyRef = useRef(history)
  const historyIndexRef = useRef(historyIndex)

  // Keep refs in sync with state after React processes the update
  // (Effects run after render, but refs are also updated synchronously in callbacks)
  React.useEffect(() => { candidatesRef.current = candidates }, [candidates])
  React.useEffect(() => { boardRef.current = board }, [board])
  React.useEffect(() => { historyRef.current = history }, [history])
  React.useEffect(() => { historyIndexRef.current = historyIndex }, [historyIndex])

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

  const isGivenCell = useCallback((idx: number): boolean => {
    return givenCells[idx] !== 0
  }, [givenCells])

  const calculateCandidatesForCell = useCallback((idx: number, currentBoard: number[]): CandidateMask => {
    const row = Math.floor(idx / BOARD_SIZE)
    const col = idx % BOARD_SIZE
    const boxRow = Math.floor(row / SUBGRID_SIZE) * SUBGRID_SIZE
    const boxCol = Math.floor(col / SUBGRID_SIZE) * SUBGRID_SIZE
    let validCandidates = 0

    for (let d = MIN_DIGIT; d <= MAX_DIGIT; d++) {
      let canPlace = true
      // Check row
      for (let c = 0; c < BOARD_SIZE && canPlace; c++) {
        if (currentBoard[row * BOARD_SIZE + c] === d) canPlace = false
      }
      // Check column
      for (let r = 0; r < BOARD_SIZE && canPlace; r++) {
        if (currentBoard[r * BOARD_SIZE + col] === d) canPlace = false
      }
      // Check box
      for (let r = boxRow; r < boxRow + SUBGRID_SIZE && canPlace; r++) {
        for (let c = boxCol; c < boxCol + SUBGRID_SIZE && canPlace; c++) {
          if (currentBoard[r * BOARD_SIZE + c] === d) canPlace = false
        }
      }
      if (canPlace) validCandidates = addCandidate(validCandidates, d)
    }
    return validCandidates
  }, [])

  // Pure helper: Calculate all candidates for a given board state
  // Used by legacy replay code that works with local board copies
  const calculateAllCandidatesForBoard = useCallback((board: number[]): Uint16Array => {
    const newCandidates = new Uint16Array(TOTAL_CELLS)
    
    for (let idx = 0; idx < TOTAL_CELLS; idx++) {
      if (board[idx] !== 0) {
        newCandidates[idx] = 0 // clearAll()
        continue
      }
      newCandidates[idx] = calculateCandidatesForCell(idx, board)
    }
    return newCandidates
  }, [calculateCandidatesForCell])

  const fillAllCandidates = useCallback((): Uint16Array => {
    // CRITICAL: Read from ref to get fresh board state, preventing race conditions
    // when called rapidly after setCell (e.g., place digit then immediately fill candidates)
    const currentBoard = boardRef.current
    return calculateAllCandidatesForBoard(currentBoard)
  }, [calculateAllCandidatesForBoard])

  const areCandidatesFilled = useCallback((): boolean => {
    // Check if candidates have been filled by seeing if any empty cell has candidates
    // We don't re-check against "valid" candidates because eliminations may have 
    // legitimately removed some candidates through solving techniques
    let hasAnyCandidates = false
    for (let idx = 0; idx < TOTAL_CELLS; idx++) {
      if (board[idx] !== 0) continue
      
      const cellCandidates = candidates[idx]
      if (cellCandidates && countCandidates(cellCandidates) > 0) {
        hasAnyCandidates = true
        break
      }
    }
    return hasAnyCandidates
  }, [board, candidates])

  // Helper to eliminate candidates from peers after placing a digit
  const eliminateFromPeers = useCallback((
    newCandidates: Uint16Array,
    idx: number,
    digit: number
  ) => {
    const row = Math.floor(idx / BOARD_SIZE)
    const col = idx % BOARD_SIZE
    const boxRow = Math.floor(row / SUBGRID_SIZE) * SUBGRID_SIZE
    const boxCol = Math.floor(col / SUBGRID_SIZE) * SUBGRID_SIZE

    // Clear the placed cell
    newCandidates[idx] = 0 // clearAll()

    // Eliminate from row
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cellIdx = row * BOARD_SIZE + c
      newCandidates[cellIdx] = removeCandidate(newCandidates[cellIdx] || 0, digit)
    }
    // Eliminate from column
    for (let r = 0; r < BOARD_SIZE; r++) {
      const cellIdx = r * BOARD_SIZE + col
      newCandidates[cellIdx] = removeCandidate(newCandidates[cellIdx] || 0, digit)
    }
    // Eliminate from box
    for (let r = boxRow; r < boxRow + SUBGRID_SIZE; r++) {
      for (let c = boxCol; c < boxCol + SUBGRID_SIZE; c++) {
        const cellIdx = r * BOARD_SIZE + c
        newCandidates[cellIdx] = removeCandidate(newCandidates[cellIdx] || 0, digit)
      }
    }
  }, [])

  // Check for valid solution
  const isValidSolution = useCallback((b: number[]): boolean => {
    // Check rows
    for (let row = 0; row < BOARD_SIZE; row++) {
      const seen = new Set<number>()
      for (let col = 0; col < BOARD_SIZE; col++) {
        const val = b[row * BOARD_SIZE + col] ?? 0
        if (val === 0 || seen.has(val)) return false
        seen.add(val)
      }
    }
    // Check columns
    for (let col = 0; col < BOARD_SIZE; col++) {
      const seen = new Set<number>()
      for (let row = 0; row < BOARD_SIZE; row++) {
        const val = b[row * BOARD_SIZE + col] ?? 0
        if (val === 0 || seen.has(val)) return false
        seen.add(val)
      }
    }
    // Check boxes
    for (let box = 0; box < BOARD_SIZE; box++) {
      const seen = new Set<number>()
      const boxRow = Math.floor(box / SUBGRID_SIZE) * SUBGRID_SIZE
      const boxCol = (box % SUBGRID_SIZE) * SUBGRID_SIZE
      for (let r = boxRow; r < boxRow + SUBGRID_SIZE; r++) {
        for (let c = boxCol; c < boxCol + SUBGRID_SIZE; c++) {
          const val = b[r * BOARD_SIZE + c] ?? 0
          if (val === 0 || seen.has(val)) return false
          seen.add(val)
        }
      }
    }
    return true
  }, [])

  // Check completion after board change
  const checkCompletion = useCallback((newBoard: number[]) => {
    const allFilled = newBoard.every(v => v !== 0)
    if (allFilled && !isComplete && isValidSolution(newBoard)) {
      setIsComplete(true)
      onComplete?.()
    }
  }, [isComplete, isValidSolution, onComplete])

  // Helper to create move with state diff for compact history
  // Note: We no longer store boardBefore/candidatesBefore for new moves (saves ~50% memory)
  // Legacy fields are still READ by undo/redo for backward compatibility with old saves
  const createMoveWithDiff = useCallback((
    moveBase: Omit<Move, 'stateDiff' | 'boardBefore' | 'candidatesBefore'>,
    newBoard: number[],
    newCandidates: Uint16Array
  ): Move => {
    const stateDiff = createStateDiff(board, newBoard, candidates, newCandidates)
    return {
      ...moveBase,
      stateDiff,
      // No longer storing legacy fields - stateDiff is sufficient
      // Undo/redo will fall back to legacy fields only for old saved games
    }
  }, [board, candidates])

  // ============================================================
  // CORE ACTIONS
  // ============================================================

  const setCell = useCallback((idx: number, digit: number, isNotesMode: boolean) => {
    if (isGivenCell(idx)) return

    // Read from refs to get the latest state values
    // This prevents stale closure issues when multiple rapid calls happen
    const currentBoard = boardRef.current
    const currentCandidates = candidatesRef.current
    const currentHistory = historyRef.current
    const currentHistoryIndex = historyIndexRef.current

    if (isNotesMode) {
      // Notes can only be added to empty cells
      if (currentBoard[idx] !== 0) return
      
      // DEBOUNCE GUARD: Prevent double-toggles from rapid events
      // On mobile especially, a single tap can trigger multiple events (touchstart,
      // click, focus) that all call this function. Without this guard, the note
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
      
      // Truncate history if we're in the middle
      const truncatedHistory = currentHistory.slice(0, currentHistoryIndex + 1)
      
      const row = Math.floor(idx / BOARD_SIZE)
      const col = idx % BOARD_SIZE
      const existingCellCandidates = currentCandidates[idx] || 0
      const hadCandidate = hasCandidate(existingCellCandidates, digit)
      
      // Toggle candidate
      const newCandidates = new Uint16Array(currentCandidates)
      newCandidates[idx] = toggleCandidateBit(newCandidates[idx] || 0, digit)
      
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
         highlights: { primary: [] }, // No highlights for user moves
         isUserMove: true,
       }, currentBoard, newCandidates)
      const newHistory = [...truncatedHistory, noteMove]
      const { history: limitedHistory, index: limitedIndex } = limitHistory(newHistory, newHistory.length - 1)
       setHistory(limitedHistory)
      setHistoryIndex(limitedIndex)
      updateCandidates(newCandidates)
      
      // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
      // This prevents stale closure issues when multiple clicks happen before React re-renders
      candidatesRef.current = newCandidates
      historyRef.current = limitedHistory
      historyIndexRef.current = limitedIndex
    } else {
      const row = Math.floor(idx / BOARD_SIZE)
      const col = idx % BOARD_SIZE

      // Truncate history if we're in the middle
      const truncatedHistory = currentHistory.slice(0, currentHistoryIndex + 1)

      // Calculate new state first
      const newBoard = [...currentBoard]
      newBoard[idx] = digit
      
      // Eliminate candidates from peers
      const newCandidates = new Uint16Array(currentCandidates)
      eliminateFromPeers(newCandidates, idx, digit)

      // Add user move to history with compact diff
      const userMove = createMoveWithDiff({
        step_index: truncatedHistory.length,
        technique: 'User Input',
        action: 'place',
        digit,
        targets: [{ row, col }],
        explanation: `Placed ${digit} at R${row + 1}C${col + 1}`,
        refs: { title: '', slug: '', url: '' },
        highlights: { primary: [] }, // No highlights for user moves
        isUserMove: true,
      }, newBoard, newCandidates)
      
      const newHistory = [...truncatedHistory, userMove]
      const { history: limitedHistory, index: limitedIndex } = limitHistory(newHistory, newHistory.length - 1)
      setHistory(limitedHistory)
      setHistoryIndex(limitedIndex)

      setBoard(newBoard)
      updateCandidates(newCandidates)

      // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
      boardRef.current = newBoard
      candidatesRef.current = newCandidates
      historyRef.current = limitedHistory
      historyIndexRef.current = limitedIndex

      checkCompletion(newBoard)
    }
  }, [
    isGivenCell, eliminateFromPeers, checkCompletion, createMoveWithDiff, updateCandidates, limitHistory
  ])

  const toggleCandidate = useCallback((idx: number, digit: number) => {
    // Read from refs for fresh values (prevents stale closure issues with rapid calls)
    const currentBoard = boardRef.current
    const currentCandidates = candidatesRef.current
    const currentHistory = historyRef.current
    const currentHistoryIndex = historyIndexRef.current
    
    if (isGivenCell(idx) || currentBoard[idx] !== 0) return

    const row = Math.floor(idx / 9)
    const col = idx % 9
    const cellCandidates = currentCandidates[idx] || 0
    const hadCandidate = hasCandidate(cellCandidates, digit)
    
    // Truncate history if we're in the middle
    const truncatedHistory = currentHistory.slice(0, currentHistoryIndex + 1)
    
    const newCandidates = new Uint16Array(currentCandidates)
    newCandidates[idx] = toggleCandidateBit(newCandidates[idx] || 0, digit)
    
    // Add toggle move to history with compact diff
    const toggleMove = createMoveWithDiff({
      step_index: truncatedHistory.length,
      technique: 'User Input',
      action: hadCandidate ? 'eliminate' : 'note',
      digit,
      targets: [{ row, col }],
      explanation: hadCandidate 
        ? `Removed note ${digit} from R${row + 1}C${col + 1}`
        : `Added note ${digit} to R${row + 1}C${col + 1}`,
      refs: { title: '', slug: '', url: '' },
      highlights: { primary: [{ row, col }] },
      isUserMove: true,
    }, currentBoard, newCandidates)
    
    const newHistory = [...truncatedHistory, toggleMove]
    const { history: limitedHistory, index: limitedIndex } = limitHistory(newHistory, newHistory.length - 1)
    setHistory(limitedHistory)
    setHistoryIndex(limitedIndex)
    updateCandidates(newCandidates)
    
    // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
    candidatesRef.current = newCandidates
    historyRef.current = limitedHistory
    historyIndexRef.current = limitedIndex
  }, [isGivenCell, updateCandidates, createMoveWithDiff, limitHistory])

  const eraseCell = useCallback((idx: number) => {

    // Read from refs for fresh values (prevents stale closure issues with rapid calls)
    const currentBoard = boardRef.current
    const currentCandidates = candidatesRef.current
    const currentHistory = historyRef.current
    const currentHistoryIndex = historyIndexRef.current
    
    if (isGivenCell(idx)) return
    // Nothing to erase if cell is empty and has no candidates
    const cellCandidates = currentCandidates[idx] || 0
    const cellValue = currentBoard[idx] ?? 0
    if (cellValue === 0 && countCandidates(cellCandidates) === 0) return

    const row = Math.floor(idx / BOARD_SIZE)
    const col = idx % BOARD_SIZE
    const erasedDigit = cellValue
    
    // Truncate history if we're in the middle
    const truncatedHistory = currentHistory.slice(0, currentHistoryIndex + 1)
    
    // Calculate new state first
    const newBoard = [...currentBoard]
    newBoard[idx] = 0
    
    // Clear candidates for the erased cell - don't auto-populate
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
     }, newBoard, newCandidates)
     
    const newHistory = [...truncatedHistory, eraseMove]
    const { history: limitedHistory, index: limitedIndex } = limitHistory(newHistory, newHistory.length - 1)
    setHistory(limitedHistory)
    setHistoryIndex(limitedIndex)

    setBoard(newBoard)
    updateCandidates(newCandidates)

    // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
    boardRef.current = newBoard
    candidatesRef.current = newCandidates
    historyRef.current = limitedHistory
    historyIndexRef.current = limitedIndex
  }, [isGivenCell, updateCandidates, createMoveWithDiff, limitHistory])

  const undo = useCallback(() => {
    // Read from refs for fresh values (prevents stale closure issues with rapid calls)
    const currentBoard = boardRef.current
    const currentCandidates = candidatesRef.current
    const currentHistory = historyRef.current
    const currentHistoryIndex = historyIndexRef.current
    
    // Can't undo if no moves in history or at the beginning
    if (currentHistoryIndex < 0) return
    
    const currentMove = currentHistory[currentHistoryIndex]
    if (!currentMove) return
    
    let prevBoard: number[]
    let prevCandidates: Uint16Array
    
    // Use diff-based undo if available, fallback to legacy approach
    if (currentMove.stateDiff) {
      const result = unapplyStateDiff(currentBoard, currentCandidates, currentMove.stateDiff)
      prevBoard = result.board
      prevCandidates = result.candidates
      setBoard(prevBoard)
      updateCandidates(prevCandidates)
    } else if (currentMove.boardBefore && currentMove.candidatesBefore) {
      // Legacy fallback
      prevBoard = currentMove.boardBefore
      prevCandidates = arraysToCandidates(currentMove.candidatesBefore)
      setBoard(prevBoard)
      updateCandidates(prevCandidates)
    } else {
      // No state to restore
      prevBoard = currentBoard
      prevCandidates = currentCandidates
    }
    
    // Move back in history
    const newHistoryIndex = currentHistoryIndex - 1
    setHistoryIndex(newHistoryIndex)
    
    // If puzzle was complete, mark as incomplete
    if (isComplete) {
      setIsComplete(false)
    }
    
    // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
    boardRef.current = prevBoard
    candidatesRef.current = prevCandidates
    historyIndexRef.current = newHistoryIndex
  }, [isComplete, updateCandidates])

  // Helper to replay a move's effects (defined before redo which uses it)
  const replayMove = useCallback((move: Move) => {
    if (!move.boardBefore || !move.candidatesBefore) return
    
    const newBoard = [...move.boardBefore]
    const newCandidates = arraysToCandidates(move.candidatesBefore)
    
    if (move.action === 'place' && move.targets.length > 0) {
      const target = move.targets[0]
      if (!target) return
      const { row, col } = target
      const idx = row * BOARD_SIZE + col
      newBoard[idx] = move.digit
      // Eliminate from peers
      eliminateFromPeers(newCandidates, idx, move.digit)
    } else if (move.action === 'eliminate' && move.eliminations) {
      for (const elim of move.eliminations) {
        const idx = elim.row * BOARD_SIZE + elim.col
        newCandidates[idx] = removeCandidate(newCandidates[idx] || 0, elim.digit)
      }
    } else if (move.action === 'note' && move.targets.length > 0) {
      const target = move.targets[0]
      if (!target) return
      const { row, col } = target
      const idx = row * BOARD_SIZE + col
      newCandidates[idx] = addCandidate(newCandidates[idx] || 0, move.digit)
    } else if (move.action === 'erase' && move.targets.length > 0) {
      const target = move.targets[0]
      if (!target) return
      const { row, col } = target
      const idx = row * BOARD_SIZE + col
      newBoard[idx] = 0
      newCandidates[idx] = calculateCandidatesForCell(idx, newBoard)
    } else if (move.action === 'candidate') {
      // Fill candidates - this is handled by just setting the candidates
      // The move should have the resulting state in the next move's boardBefore
      // or we need to recalculate
      // Use pure helper since we're working with local newBoard state
      const filled = calculateAllCandidatesForBoard(newBoard)
      // Copy filled candidates to newCandidates
      for (let i = 0; i < TOTAL_CELLS; i++) {
        newCandidates[i] = filled[i] || 0
      }
    }
    
    setBoard(newBoard)
    updateCandidates(newCandidates)
  }, [eliminateFromPeers, calculateCandidatesForCell, calculateAllCandidatesForBoard, updateCandidates])

  const redo = useCallback(() => {
    // Read from refs for fresh values (prevents stale closure issues with rapid calls)
    const currentBoard = boardRef.current
    const currentCandidates = candidatesRef.current
    const currentHistory = historyRef.current
    const currentHistoryIndex = historyIndexRef.current
    
    // Can't redo if at the end of history
    if (currentHistoryIndex >= currentHistory.length - 1) return
    
    const nextMove = currentHistory[currentHistoryIndex + 1]
    if (!nextMove) return
    
    let newBoard: number[]
    let newCandidates: Uint16Array
    
    // Use diff-based redo if available, fallback to legacy approach
    if (nextMove.stateDiff) {
      const result = applyStateDiff(currentBoard, currentCandidates, nextMove.stateDiff)
      newBoard = result.board
      newCandidates = result.candidates
      setBoard(newBoard)
      updateCandidates(newCandidates)
    } else {
      // Legacy fallback - replay the move
      // Note: replayMove updates board/candidates internally
      replayMove(nextMove)
      // We need to get the new values from refs after replayMove updates them
      newBoard = boardRef.current
      newCandidates = candidatesRef.current
    }
    
    const newHistoryIndex = currentHistoryIndex + 1
    setHistoryIndex(newHistoryIndex)
    
    // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
    boardRef.current = newBoard
    candidatesRef.current = newCandidates
    historyIndexRef.current = newHistoryIndex
  }, [updateCandidates, replayMove])

  const resetGame = useCallback(() => {
    setGivenCells([...initialBoard])
    setBoard([...initialBoard])
    updateCandidates(new Uint16Array(TOTAL_CELLS))
    setHistory([])
    setHistoryIndex(-1)
    setIsComplete(false)
  }, [initialBoard, updateCandidates])

  const clearAll = useCallback(() => {
    setBoard([...givenCells])
    updateCandidates(new Uint16Array(TOTAL_CELLS))
    setHistory([])
    setHistoryIndex(-1)
  }, [givenCells, updateCandidates])

  const clearCandidates = useCallback(() => {
    // Read from refs for fresh values (prevents stale closure issues with rapid calls)
    const currentBoard = boardRef.current
    const currentHistory = historyRef.current
    const currentHistoryIndex = historyIndexRef.current
    
    // Truncate history if we're in the middle
    const truncatedHistory = currentHistory.slice(0, currentHistoryIndex + 1)
    
    // Calculate new state (cleared candidates)
    const newCandidates = new Uint16Array(TOTAL_CELLS)
    
     // Add clear candidates move to history with compact diff
     const clearMove = createMoveWithDiff({
       step_index: truncatedHistory.length,
       technique: 'Clear Notes',
       action: 'clear-candidates',
       digit: 0,
       targets: [],
       explanation: 'Cleared all notes',
       refs: { title: '', slug: '', url: '' },
       highlights: { primary: [] }, // Already no highlights
       isUserMove: true,
     }, currentBoard, newCandidates)
     
    const newHistory = [...truncatedHistory, clearMove]
    const { history: limitedHistory, index: limitedIndex } = limitHistory(newHistory, newHistory.length - 1)
    setHistory(limitedHistory)
    setHistoryIndex(limitedIndex)
    
    updateCandidates(newCandidates)
    
    // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
    candidatesRef.current = newCandidates
    historyRef.current = limitedHistory
    historyIndexRef.current = limitedIndex
  }, [updateCandidates, createMoveWithDiff, limitHistory])

  // For external updates (hints, auto-solve)
  const applyExternalMove = useCallback((
    newBoard: number[],
    newCandidates: Uint16Array,
    move: Move
  ) => {
    // Read from refs for fresh values (prevents stale closure issues with rapid calls)
    const currentBoard = boardRef.current
    const currentCandidates = candidatesRef.current
    const currentHistory = historyRef.current
    const currentHistoryIndex = historyIndexRef.current
    
    // Create move with compact diff only (no legacy fields for new moves)
    const stateDiff = createStateDiff(currentBoard, newBoard, currentCandidates, newCandidates)
    const moveWithState: Move = {
      ...move,
      stateDiff,
      // No longer storing legacy fields - stateDiff is sufficient
    }
    
    const truncatedHistory = currentHistory.slice(0, currentHistoryIndex + 1)
    const newHistory = [...truncatedHistory, moveWithState]
    const { history: limitedHistory, index: limitedIndex } = limitHistory(newHistory, newHistory.length - 1)
    setHistory(limitedHistory)
    setHistoryIndex(limitedIndex)
    
    setBoard(newBoard)
    updateCandidates(newCandidates)
    
    checkCompletion(newBoard)
    
    // CRITICAL: Update refs synchronously so subsequent rapid calls see the new values
    boardRef.current = newBoard
    candidatesRef.current = newCandidates
    historyRef.current = limitedHistory
    historyIndexRef.current = limitedIndex
  }, [checkCompletion, updateCandidates, limitHistory])

  // Restore saved game state (for auto-save/resume functionality)
  const restoreState = useCallback((
    savedBoard: number[],
    savedCandidates: Uint16Array,
    savedHistory: Move[]
  ) => {
    setBoard(savedBoard)
    updateCandidates(savedCandidates)
    setHistory(savedHistory)
    setHistoryIndex(savedHistory.length - 1)
    
    // Check if restored board is already complete
    const allFilled = savedBoard.every((v: number) => v !== 0)
    if (allFilled && isValidSolution(savedBoard)) {
      setIsComplete(true)
    } else {
      setIsComplete(false)
    }
  }, [updateCandidates, isValidSolution])

  const setBoardState = useCallback((
    newBoard: number[],
    newCandidates: Uint16Array
  ) => {
    setBoard(newBoard)
    updateCandidates(newCandidates)
  }, [updateCandidates])

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
      
      const userNotesMask = candidates[idx] || 0
      const validCandidatesMask = calculateCandidatesForCell(idx, board)
      
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
  }, [board, candidates, calculateCandidatesForCell])

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference, causing all
  // consumers to re-render unnecessarily.
  return useMemo(() => ({
    // State
    board,
    candidates,
    candidatesVersion,
    history,
    historyIndex,
    canUndo: historyIndex >= 0,
    canRedo: historyIndex < history.length - 1,
    isComplete,
    
    // Computed
    digitCounts,
    
    // Actions
    setCell,
    eraseCell,
    toggleCandidate,
    undo,
    redo,
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
    calculateCandidatesForCell,
    fillAllCandidates,
    areCandidatesFilled,
    checkNotes,
  }), [
    board, candidates, candidatesVersion, history, historyIndex, isComplete,
    digitCounts, setCell, eraseCell, toggleCandidate, undo, redo, resetGame,
    clearAll, clearCandidates, applyExternalMove, setIsComplete, restoreState,
    setBoardState, isGivenCell, calculateCandidatesForCell, fillAllCandidates,
    areCandidatesFilled, checkNotes
  ])
}
