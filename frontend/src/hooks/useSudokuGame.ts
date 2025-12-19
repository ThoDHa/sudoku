import React, { useState, useCallback, useMemo, useRef } from 'react'
import {
  hasCandidate,
  addCandidate,
  removeCandidate,
  toggleCandidate as toggleCandidateBit,
  countCandidates,
  candidatesToArrays,
  arraysToCandidates,
  type CandidateMask
} from '../lib/candidatesUtils'

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
  // Board state before this move was applied (for undo)
  boardBefore?: number[]
  candidatesBefore?: number[][] // Serialized Set<number>[] for storage
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
  fillAllCandidates: (currentBoard: number[]) => Uint16Array
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
    () => new Uint16Array(81)
  )
  
  // Move history (serves as undo stack - each move stores boardBefore/candidatesBefore)
  const [history, setHistory] = useState<Move[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  
  // Completion state
  const [isComplete, setIsComplete] = useState(false)
  
  // Guard against rapid double-calls (e.g., from click + focus events)
  const lastNoteToggle = useRef<{ idx: number; digit: number; time: number } | null>(null)

  // Update givenCells when initialBoard prop changes (new puzzle loaded)
  React.useEffect(() => {
    if (initialBoard.length === 81 && initialBoard.some(v => v !== 0)) {
      setGivenCells([...initialBoard])
    }
  }, [initialBoard])

  // ============================================================
  // COMPUTED VALUES
  // ============================================================

  const digitCounts = useMemo(() => {
    const counts = Array(9).fill(0)
    for (const val of board) {
      if (val >= 1 && val <= 9) {
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
    const row = Math.floor(idx / 9)
    const col = idx % 9
    const boxRow = Math.floor(row / 3) * 3
    const boxCol = Math.floor(col / 3) * 3
    let validCandidates = 0

    for (let d = 1; d <= 9; d++) {
      let canPlace = true
      // Check row
      for (let c = 0; c < 9 && canPlace; c++) {
        if (currentBoard[row * 9 + c] === d) canPlace = false
      }
      // Check column
      for (let r = 0; r < 9 && canPlace; r++) {
        if (currentBoard[r * 9 + col] === d) canPlace = false
      }
      // Check box
      for (let r = boxRow; r < boxRow + 3 && canPlace; r++) {
        for (let c = boxCol; c < boxCol + 3 && canPlace; c++) {
          if (currentBoard[r * 9 + c] === d) canPlace = false
        }
      }
      if (canPlace) validCandidates = addCandidate(validCandidates, d)
    }
    return validCandidates
  }, [])

  const fillAllCandidates = useCallback((currentBoard: number[]): Uint16Array => {
    const newCandidates = new Uint16Array(81)
    
    for (let idx = 0; idx < 81; idx++) {
      if (currentBoard[idx] !== 0) {
        newCandidates[idx] = 0 // clearAll()
        continue
      }
      newCandidates[idx] = calculateCandidatesForCell(idx, currentBoard)
    }
    return newCandidates
  }, [calculateCandidatesForCell])

  const areCandidatesFilled = useCallback((): boolean => {
    // Check if candidates have been filled by seeing if any empty cell has candidates
    // We don't re-check against "valid" candidates because eliminations may have 
    // legitimately removed some candidates through solving techniques
    let hasAnyCandidates = false
    for (let idx = 0; idx < 81; idx++) {
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
    const row = Math.floor(idx / 9)
    const col = idx % 9
    const boxRow = Math.floor(row / 3) * 3
    const boxCol = Math.floor(col / 3) * 3

    // Clear the placed cell
    newCandidates[idx] = 0 // clearAll()

    // Eliminate from row
    for (let c = 0; c < 9; c++) {
      const cellIdx = row * 9 + c
      newCandidates[cellIdx] = removeCandidate(newCandidates[cellIdx] || 0, digit)
    }
    // Eliminate from column
    for (let r = 0; r < 9; r++) {
      const cellIdx = r * 9 + col
      newCandidates[cellIdx] = removeCandidate(newCandidates[cellIdx] || 0, digit)
    }
    // Eliminate from box
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        const cellIdx = r * 9 + c
        newCandidates[cellIdx] = removeCandidate(newCandidates[cellIdx] || 0, digit)
      }
    }
  }, [])

  // Check for valid solution
  const isValidSolution = useCallback((b: number[]): boolean => {
    // Check rows
    for (let row = 0; row < 9; row++) {
      const seen = new Set<number>()
      for (let col = 0; col < 9; col++) {
        const val = b[row * 9 + col] ?? 0
        if (val === 0 || seen.has(val)) return false
        seen.add(val)
      }
    }
    // Check columns
    for (let col = 0; col < 9; col++) {
      const seen = new Set<number>()
      for (let row = 0; row < 9; row++) {
        const val = b[row * 9 + col] ?? 0
        if (val === 0 || seen.has(val)) return false
        seen.add(val)
      }
    }
    // Check boxes
    for (let box = 0; box < 9; box++) {
      const seen = new Set<number>()
      const boxRow = Math.floor(box / 3) * 3
      const boxCol = (box % 3) * 3
      for (let r = boxRow; r < boxRow + 3; r++) {
        for (let c = boxCol; c < boxCol + 3; c++) {
          const val = b[r * 9 + c] ?? 0
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

  // ============================================================
  // CORE ACTIONS
  // ============================================================

  const setCell = useCallback((idx: number, digit: number, isNotesMode: boolean) => {
    if (isGivenCell(idx)) return

    if (isNotesMode) {
      // Notes can only be added to empty cells
      if (board[idx] !== 0) return
      
      // Guard against rapid double-calls that would toggle the note twice
      const now = Date.now()
      if (lastNoteToggle.current && 
          lastNoteToggle.current.idx === idx && 
          lastNoteToggle.current.digit === digit &&
          now - lastNoteToggle.current.time < 100) {
        return // Ignore duplicate call within 100ms
      }
      lastNoteToggle.current = { idx, digit, time: now }
      
      // Truncate history if we're in the middle
      const truncatedHistory = history.slice(0, historyIndex + 1)
      
      const row = Math.floor(idx / 9)
      const col = idx % 9
      const existingCellCandidates = candidates[idx] || 0
      const hadCandidate = hasCandidate(existingCellCandidates, digit)
      
      // Toggle candidate
      const newCandidates = new Uint16Array(candidates)
      newCandidates[idx] = toggleCandidateBit(newCandidates[idx] || 0, digit)
      
       // Add note toggle move to history with board state before
       const noteMove: Move = {
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
         boardBefore: [...board],
         candidatesBefore: candidatesToArrays(candidates),
       }
      const newHistory = [...truncatedHistory, noteMove]
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
      setCandidates(newCandidates)
    } else {
      const row = Math.floor(idx / 9)
      const col = idx % 9

      // Truncate history if we're in the middle
      const truncatedHistory = history.slice(0, historyIndex + 1)

        // Add user move to history with board state before
        const userMove: Move = {
          step_index: truncatedHistory.length,
          technique: 'User Input',
          action: 'place',
          digit,
          targets: [{ row, col }],
          explanation: `Placed ${digit} at R${row + 1}C${col + 1}`,
          refs: { title: '', slug: '', url: '' },
          highlights: { primary: [] }, // No highlights for user moves
          isUserMove: true,
          boardBefore: [...board],
          candidatesBefore: candidatesToArrays(candidates),
        }
      const newHistory = [...truncatedHistory, userMove]
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)

      const newBoard = [...board]
      newBoard[idx] = digit
      setBoard(newBoard)

      // Eliminate candidates from peers
      const newCandidates = new Uint16Array(candidates)
      eliminateFromPeers(newCandidates, idx, digit)
      setCandidates(newCandidates)

      checkCompletion(newBoard)
    }
  }, [
    board, candidates, history, historyIndex, isGivenCell,
    eliminateFromPeers, checkCompletion
  ])

  const toggleCandidate = useCallback((idx: number, digit: number) => {
    if (isGivenCell(idx) || board[idx] !== 0) return

    const row = Math.floor(idx / 9)
    const col = idx % 9
    const cellCandidates = candidates[idx] || 0
    const hadCandidate = hasCandidate(cellCandidates, digit)
    
    // Truncate history if we're in the middle
    const truncatedHistory = history.slice(0, historyIndex + 1)
    
    const newCandidates = new Uint16Array(candidates)
    newCandidates[idx] = toggleCandidateBit(newCandidates[idx] || 0, digit)
    
    // Add toggle move to history with board state before
    const toggleMove: Move = {
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
      boardBefore: [...board],
      candidatesBefore: candidatesToArrays(candidates),
    }
    const newHistory = [...truncatedHistory, toggleMove]
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setCandidates(newCandidates)
  }, [board, candidates, history, historyIndex, isGivenCell])

  const eraseCell = useCallback((idx: number) => {
    if (isGivenCell(idx)) return
    // Nothing to erase if cell is empty and has no candidates
    const cellCandidates = candidates[idx] || 0
    const cellValue = board[idx] ?? 0
    if (cellValue === 0 && countCandidates(cellCandidates) === 0) return

    const row = Math.floor(idx / 9)
    const col = idx % 9
    const erasedDigit = cellValue
    
    // Truncate history if we're in the middle
    const truncatedHistory = history.slice(0, historyIndex + 1)
    
     // Add erase move to history with board state before
     const eraseMove: Move = {
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
       boardBefore: [...board],
       candidatesBefore: candidatesToArrays(candidates),
     }
    const newHistory = [...truncatedHistory, eraseMove]
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)

    const newBoard = [...board]
    newBoard[idx] = 0
    setBoard(newBoard)

    // Recalculate valid candidates for the erased cell
    const newCandidates = new Uint16Array(candidates)
    newCandidates[idx] = calculateCandidatesForCell(idx, newBoard)
    setCandidates(newCandidates)
  }, [board, candidates, history, historyIndex, isGivenCell, calculateCandidatesForCell])

  const undo = useCallback(() => {
    // Can't undo if no moves in history or at the beginning
    if (historyIndex < 0) return
    
    const currentMove = history[historyIndex]
    if (!currentMove) return
    
    // Restore board state from before this move
    if (currentMove.boardBefore && currentMove.candidatesBefore) {
      setBoard(currentMove.boardBefore)
      setCandidates(arraysToCandidates(currentMove.candidatesBefore))
    }
    
    // Move back in history
    setHistoryIndex(historyIndex - 1)
    
    // If puzzle was complete, mark as incomplete
    if (isComplete) {
      setIsComplete(false)
    }
  }, [history, historyIndex, isComplete])

  const redo = useCallback(() => {
    // Can't redo if at the end of history
    if (historyIndex >= history.length - 1) return
    
    const nextMove = history[historyIndex + 1]
    if (!nextMove) return
    
    // We need to replay this move to get the "after" state
    // The move stores "before" state, so the "after" state is what we had when historyIndex was at this position
    // We need to reapply the move's effects
    
    // For now, we'll need to replay from boardBefore through the action
    // This is complex, so let's store the "after" state too, or replay the move
    
    // Simpler approach: store the current board/candidates as the "after" state in the NEXT move's boardBefore
    // Actually, the "after" state of move N is the "before" state of move N+1
    // And for the last move, the current board/candidates IS the after state
    
    // So for redo: if there's a move after, use its boardBefore as our target
    // If it's the last move, we need to replay the move
    
    if (historyIndex + 2 < history.length) {
      // There's a move after the one we're redoing - use its boardBefore
      const moveAfterNext = history[historyIndex + 2]
      if (moveAfterNext?.boardBefore && moveAfterNext.candidatesBefore) {
        setBoard(moveAfterNext.boardBefore)
        setCandidates(arraysToCandidates(moveAfterNext.candidatesBefore))
      }
    } else {
      // Redoing the last move - need to replay it
      // For simplicity, store afterBoard/afterCandidates too, or compute it
      // For now, let's just replay based on the action type
      replayMove(nextMove)
    }
    
    setHistoryIndex(historyIndex + 1)
  }, [history, historyIndex])
  
  // Helper to replay a move's effects
  const replayMove = useCallback((move: Move) => {
    if (!move.boardBefore || !move.candidatesBefore) return
    
    const newBoard = [...move.boardBefore]
    const newCandidates = arraysToCandidates(move.candidatesBefore)
    
    if (move.action === 'place' && move.targets.length > 0) {
      const target = move.targets[0]
      if (!target) return
      const { row, col } = target
      const idx = row * 9 + col
      newBoard[idx] = move.digit
      // Eliminate from peers
      eliminateFromPeers(newCandidates, idx, move.digit)
    } else if (move.action === 'eliminate' && move.eliminations) {
      for (const elim of move.eliminations) {
        const idx = elim.row * 9 + elim.col
        newCandidates[idx] = removeCandidate(newCandidates[idx] || 0, elim.digit)
      }
    } else if (move.action === 'note' && move.targets.length > 0) {
      const target = move.targets[0]
      if (!target) return
      const { row, col } = target
      const idx = row * 9 + col
      newCandidates[idx] = addCandidate(newCandidates[idx] || 0, move.digit)
    } else if (move.action === 'erase' && move.targets.length > 0) {
      const target = move.targets[0]
      if (!target) return
      const { row, col } = target
      const idx = row * 9 + col
      newBoard[idx] = 0
      newCandidates[idx] = calculateCandidatesForCell(idx, newBoard)
    } else if (move.action === 'candidate') {
      // Fill candidates - this is handled by just setting the candidates
      // The move should have the resulting state in the next move's boardBefore
      // or we need to recalculate
      const filled = fillAllCandidates(newBoard)
      // Copy filled candidates to newCandidates
      for (let i = 0; i < 81; i++) {
        newCandidates[i] = filled[i] || 0
      }
    }
    
    setBoard(newBoard)
    setCandidates(newCandidates)
  }, [eliminateFromPeers, calculateCandidatesForCell, fillAllCandidates])

  const resetGame = useCallback(() => {
    setGivenCells([...initialBoard])
    setBoard([...initialBoard])
    setCandidates(new Uint16Array(81))
    setHistory([])
    setHistoryIndex(-1)
    setIsComplete(false)
  }, [initialBoard])

  const clearAll = useCallback(() => {
    setBoard([...givenCells])
    setCandidates(new Uint16Array(81))
    setHistory([])
    setHistoryIndex(-1)
  }, [givenCells])

  const clearCandidates = useCallback(() => {
    // Truncate history if we're in the middle
    const truncatedHistory = history.slice(0, historyIndex + 1)
    
     // Add clear candidates move to history
     const clearMove: Move = {
       step_index: truncatedHistory.length,
       technique: 'Clear Notes',
       action: 'clear-candidates',
       digit: 0,
       targets: [],
       explanation: 'Cleared all notes',
       refs: { title: '', slug: '', url: '' },
       highlights: { primary: [] }, // Already no highlights
       isUserMove: true,
       boardBefore: [...board],
       candidatesBefore: candidatesToArrays(candidates),
     }
    const newHistory = [...truncatedHistory, clearMove]
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    
    setCandidates(new Uint16Array(81))
  }, [board, candidates, history, historyIndex])

  // For external updates (hints, auto-solve)
  const applyExternalMove = useCallback((
    newBoard: number[],
    newCandidates: Uint16Array,
    move: Move
  ) => {
    // Capture board state before this move for undo
    const moveWithState: Move = {
      ...move,
      boardBefore: [...board],
      candidatesBefore: candidatesToArrays(candidates),
    }
    
    const truncatedHistory = history.slice(0, historyIndex + 1)
    const newHistory = [...truncatedHistory, moveWithState]
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    
    setBoard(newBoard)
    setCandidates(newCandidates)
    
    checkCompletion(newBoard)
  }, [board, candidates, history, historyIndex, checkCompletion])

  // Restore saved game state (for auto-save/resume functionality)
  const restoreState = useCallback((
    savedBoard: number[],
    savedCandidates: Uint16Array,
    savedHistory: Move[]
  ) => {
    setBoard(savedBoard)
    setCandidates(savedCandidates)
    setHistory(savedHistory)
    setHistoryIndex(savedHistory.length - 1)
    setIsComplete(false)
  }, [])

  // Set board state without modifying history (for auto-solve rewind)
  const setBoardState = useCallback((
    newBoard: number[],
    newCandidates: Uint16Array
  ) => {
    setBoard(newBoard)
    setCandidates(newCandidates)
  }, [])

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

    for (let idx = 0; idx < 81; idx++) {
      // Skip filled cells
      if (board[idx] !== 0) continue
      
      const userNotesMask = candidates[idx] || 0
      const validCandidatesMask = calculateCandidatesForCell(idx, board)
      
      if (countCandidates(userNotesMask) > 0) {
        cellsWithNotes++
      }
      
      // Check for wrong notes (user has a note that's not a valid candidate)
      for (let digit = 1; digit <= 9; digit++) {
        if (hasCandidate(userNotesMask, digit) && !hasCandidate(validCandidatesMask, digit)) {
          wrongNotes.push({ idx, digit })
        }
      }
      
      // Check for missing notes (valid candidate that user doesn't have)
      // Only check cells where user has added at least one note
      if (countCandidates(userNotesMask) > 0) {
        for (let digit = 1; digit <= 9; digit++) {
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

  return {
    // State
    board,
    candidates,
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
  }
}
