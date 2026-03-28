import React, { useCallback, useMemo, useRef } from 'react'
import {
  hasCandidate,
  addCandidate,
  removeCandidate,
  countCandidates,
  toggleCandidate,
  type CandidateMask
} from '../lib/candidatesUtils'
import { BOARD_SIZE, TOTAL_CELLS, MIN_DIGIT, MAX_DIGIT } from '../lib/constants'
import { useCandidates } from './useCandidates'
import { useBoardHistory, type Move } from './useBoardHistory'
import { useBoardState } from './useBoardState'
import { useCompletion } from './useCompletion'
import { isValidSolution } from '../lib/validationUtils'
import { createStateDiff } from '../lib/diffUtils'

export type { Move } from './useBoardHistory'

interface UseSudokuGameOptions {
  initialBoard: number[]
  onComplete?: () => void
}

export interface UseSudokuGameReturn {
  board: number[]
  candidates: Uint16Array
  candidatesVersion: number
  history: Move[]
  historyIndex: number
  canUndo: boolean
  canRedo: boolean
  isComplete: boolean
  digitCounts: number[]
  setCell: (idx: number, digit: number, isNotesMode: boolean) => void
  setCellMultiple: (indices: number[], digit: number, isNotesMode: boolean) => void
  eraseCell: (idx: number) => void
  undo: () => void
  redo: () => void
  resetGame: () => void
  clearAll: () => void
  clearCandidates: () => void
  applyExternalMove: (newBoard: number[], newCandidates: Uint16Array, move: Move) => void
  setIsComplete: (complete: boolean) => void
  restoreState: (savedBoard: number[], savedCandidates: Uint16Array, savedHistory: Move[]) => void
  setBoardState: (newBoard: number[], newCandidates: Uint16Array) => void
  isGivenCell: (idx: number) => boolean
  calculateCandidatesForCell: (idx: number, currentBoard: number[]) => CandidateMask
  fillAllCandidates: () => Uint16Array
  areCandidatesFilled: () => boolean
  checkNotes: () => { valid: boolean; wrongNotes: { idx: number; digit: number }[]; missingNotes: { idx: number; digit: number }[]; cellsWithNotes: number }
}

export function useSudokuGame(options: UseSudokuGameOptions): UseSudokuGameReturn {
  const { initialBoard, onComplete } = options

  const { board, givenCells, boardRef, isGivenCell, updateBoard, setBoard, setGivenCells } = useBoardState({ initialBoard })
  const candidatesHook = useCandidates(board)
  const candidatesRef = useRef<Uint16Array>(candidatesHook.candidates)
  React.useEffect(() => { candidatesRef.current = candidatesHook.candidates }, [candidatesHook.candidates])
  const { isComplete, setIsComplete, checkCompletion } = useCompletion({ onComplete })
  const { history, historyIndex, canUndo, canRedo, historyRef, historyIndexRef, setHistory, setHistoryIndex, limitHistory, undo: historyUndo, redo: historyRedo } = useBoardHistory({ setBoard, setCandidates: candidatesHook.setCandidates, boardRef, candidatesRef })

  const lastNoteToggle = useRef<{ idx: number; digit: number; time: number } | null>(null)

  const digitCounts = useMemo(() => {
    const counts = Array(MAX_DIGIT).fill(0)
    for (const val of board) if (val >= MIN_DIGIT && val <= MAX_DIGIT) counts[val - 1]++
    return counts
  }, [board])

  const createMove = useCallback((
    technique: string, action: string, digit: number, targets: { row: number; col: number }[],
    explanation: string, newBoard: number[], newCandidates: Uint16Array, isUserMove = true
  ): Move => ({
    step_index: historyRef.current.length,
    technique, action, digit, targets, explanation,
    refs: { title: '', slug: '', url: '' },
    highlights: { primary: [] },
    isUserMove,
    stateDiff: createStateDiff(boardRef.current, newBoard, candidatesHook.candidates, newCandidates),
  }), [candidatesHook.candidates, boardRef, historyRef])

  const addToHistory = useCallback((move: Move) => {
    const truncated = historyRef.current.slice(0, historyIndexRef.current + 1)
    const newHistory = [...truncated, move]
    const { history: limited, index } = limitHistory(newHistory, newHistory.length - 1)
    setHistory(limited)
    setHistoryIndex(index)
    historyRef.current = limited
    historyIndexRef.current = index
  }, [setHistory, setHistoryIndex, limitHistory, historyRef, historyIndexRef])

  const setCell = useCallback((idx: number, digit: number, isNotesMode: boolean) => {
    if (isGivenCell(idx)) return
    const currentBoard = boardRef.current
    const currentCandidates = candidatesHook.candidates

    if (isNotesMode) {
      if (currentBoard[idx] !== 0) return
      const now = Date.now()
      if (lastNoteToggle.current?.idx === idx && lastNoteToggle.current?.digit === digit && now - lastNoteToggle.current.time < 100) return
      lastNoteToggle.current = { idx, digit, time: now }

      const row = Math.floor(idx / BOARD_SIZE), col = idx % BOARD_SIZE
      const hadCandidate = hasCandidate(currentCandidates[idx] || 0, digit)
      const newCandidates = new Uint16Array(currentCandidates)
      newCandidates[idx] = toggleCandidate(newCandidates[idx] || 0, digit)

      const noteMove = createMove('User Input', hadCandidate ? 'eliminate' : 'note', digit, [{ row, col }],
        hadCandidate ? `Removed note ${digit} from R${row + 1}C${col + 1}` : `Added note ${digit} to R${row + 1}C${col + 1}`,
        currentBoard, newCandidates)
      addToHistory(noteMove)
      candidatesHook.setCandidates(newCandidates)
    } else {
      const row = Math.floor(idx / BOARD_SIZE), col = idx % BOARD_SIZE
      const newBoard = [...currentBoard]
      newBoard[idx] = digit
      const newCandidates = candidatesHook.eliminateFromPeers(currentCandidates, idx, digit)

      const userMove = createMove('User Input', 'place', digit, [{ row, col }], `Placed ${digit} at R${row + 1}C${col + 1}`, newBoard, newCandidates)
      addToHistory(userMove)
      updateBoard(newBoard)
      candidatesHook.setCandidates(newCandidates)
      checkCompletion(newBoard)
      boardRef.current = newBoard
    }
  }, [isGivenCell, candidatesHook, createMove, addToHistory, updateBoard, checkCompletion, boardRef])

  const setCellMultiple = useCallback((indices: number[], digit: number, isNotesMode: boolean) => {
    if (!isNotesMode) return
    const currentBoard = boardRef.current
    const currentCandidates = candidatesHook.candidates
    const validIndices = indices.filter(idx => !isGivenCell(idx) && currentBoard[idx] === 0)
    if (validIndices.length === 0) return

    const newCandidates = new Uint16Array(currentCandidates)
    const targets: { row: number; col: number }[] = []
    const allHave = validIndices.every(idx => hasCandidate(currentCandidates[idx] || 0, digit))

    validIndices.forEach(idx => {
      newCandidates[idx] = allHave ? removeCandidate(newCandidates[idx] || 0, digit) : addCandidate(newCandidates[idx] || 0, digit)
      targets.push({ row: Math.floor(idx / BOARD_SIZE), col: idx % BOARD_SIZE })
    })

    const action = allHave ? 'eliminate' : 'note'
    const move = createMove('User Input', action, digit, targets, action === 'note' ? `Added note ${digit} to ${targets.length} cells` : `Removed note ${digit} from ${targets.length} cells`, currentBoard, newCandidates)
    addToHistory(move)
    candidatesHook.setCandidates(newCandidates)
  }, [isGivenCell, candidatesHook, createMove, addToHistory, boardRef])

  const handleToggleCandidate = useCallback((idx: number, digit: number) => {
    if (boardRef.current[idx] !== 0 || isGivenCell(idx)) return
    const currentCandidates = candidatesRef.current
    const row = Math.floor(idx / BOARD_SIZE), col = idx % BOARD_SIZE
    const hadCandidate = hasCandidate(currentCandidates[idx] || 0, digit)
    const newCandidates = new Uint16Array(currentCandidates)
    newCandidates[idx] = toggleCandidate(newCandidates[idx] || 0, digit)

    const noteMove = createMove('User Input', hadCandidate ? 'eliminate' : 'note', digit, [{ row, col }],
      hadCandidate ? `Removed note ${digit} from R${row + 1}C${col + 1}` : `Added note ${digit} to R${row + 1}C${col + 1}`, boardRef.current, newCandidates)
    addToHistory(noteMove)
    candidatesHook.setCandidates(newCandidates)
    candidatesRef.current = newCandidates
  }, [isGivenCell, candidatesHook, createMove, addToHistory, boardRef])

  const eraseCell = useCallback((idx: number) => {
    if (isGivenCell(idx)) return
    const currentBoard = boardRef.current
    const currentCandidates = candidatesHook.candidates
    const cellValue = currentBoard[idx] ?? 0
    const cellCandidates = currentCandidates[idx] || 0
    if (cellValue === 0 && countCandidates(cellCandidates) === 0) return

    const row = Math.floor(idx / BOARD_SIZE), col = idx % BOARD_SIZE
    const newBoard = [...currentBoard]
    newBoard[idx] = 0
    const newCandidates = new Uint16Array(currentCandidates)
    newCandidates[idx] = 0

    const eraseMove = createMove('User Input', 'erase', cellValue, [{ row, col }],
      cellValue > 0 ? `Erased ${cellValue} from R${row + 1}C${col + 1}` : `Cleared notes from R${row + 1}C${col + 1}`, newBoard, newCandidates)
    addToHistory(eraseMove)
    setBoard(newBoard)
    candidatesHook.setCandidates(newCandidates)
    boardRef.current = newBoard
  }, [isGivenCell, candidatesHook, createMove, addToHistory, setBoard, boardRef])

  const resetGame = useCallback(() => {
    setGivenCells([...initialBoard])
    setBoard([...initialBoard])
    candidatesHook.setCandidates(new Uint16Array(TOTAL_CELLS))
    setHistory([])
    setHistoryIndex(-1)
    setIsComplete(false)
  }, [initialBoard, candidatesHook, setGivenCells, setBoard, setHistory, setHistoryIndex, setIsComplete])

  const clearAll = useCallback(() => {
    setBoard([...givenCells])
    candidatesHook.setCandidates(new Uint16Array(TOTAL_CELLS))
    setHistory([])
    setHistoryIndex(-1)
  }, [givenCells, candidatesHook, setBoard, setHistory, setHistoryIndex])

  const clearCandidates = useCallback(() => {
    const newCandidates = new Uint16Array(TOTAL_CELLS)
    const move = createMove('Clear Notes', 'clear-candidates', 0, [], 'Cleared all notes', boardRef.current, newCandidates)
    addToHistory(move)
    candidatesHook.setCandidates(newCandidates)
  }, [candidatesHook, createMove, addToHistory, boardRef])

  const applyExternalMove = useCallback((newBoard: number[], newCandidates: Uint16Array, move: Move) => {
    const stateDiff = createStateDiff(boardRef.current, newBoard, candidatesHook.candidates, newCandidates)
    const truncated = historyRef.current.slice(0, historyIndexRef.current + 1)
    const newHistory = [...truncated, { ...move, stateDiff }]
    const { history: limited, index } = limitHistory(newHistory, newHistory.length - 1)
    setHistory(limited)
    setHistoryIndex(index)
    updateBoard(newBoard)
    candidatesHook.setCandidates(newCandidates)
    checkCompletion(newBoard)
    boardRef.current = newBoard
    historyRef.current = limited
    historyIndexRef.current = index
  }, [updateBoard, candidatesHook, checkCompletion, setHistory, setHistoryIndex, limitHistory, boardRef, historyRef, historyIndexRef])

  const restoreState = useCallback((savedBoard: number[], savedCandidates: Uint16Array, savedHistory: Move[]) => {
    updateBoard(savedBoard)
    candidatesHook.setCandidates(savedCandidates)
    setHistory(savedHistory)
    setHistoryIndex(savedHistory.length - 1)
    setIsComplete(savedBoard.every((v: number) => v !== 0) && isValidSolution(savedBoard))
  }, [updateBoard, candidatesHook, setHistory, setHistoryIndex, setIsComplete])

  const setBoardState = useCallback((newBoard: number[], newCandidates: Uint16Array) => {
    updateBoard(newBoard)
    candidatesHook.setCandidates(newCandidates)
  }, [updateBoard, candidatesHook])

  const handleUndo = useCallback(() => {
    historyUndo()
    const newBoard = boardRef.current
    if (!newBoard.every((v: number) => v !== 0) || !isValidSolution(newBoard)) setIsComplete(false)
  }, [historyUndo, setIsComplete, boardRef])

  const handleRedo = useCallback(() => {
    historyRedo()
    checkCompletion(boardRef.current)
  }, [historyRedo, checkCompletion, boardRef])

  const checkNotes = useCallback(() => candidatesHook.checkNotes(board, candidatesHook.candidates), [board, candidatesHook])

  const fillAllCandidates = useCallback((): Uint16Array => candidatesHook.calculateAllCandidatesForBoard(boardRef.current), [candidatesHook, boardRef])

  const areCandidatesFilled = useCallback((): boolean => candidatesHook.areCandidatesFilled(), [candidatesHook])

  return useMemo(() => ({
    board, candidates: candidatesHook.candidates, candidatesVersion: candidatesHook.candidatesVersion,
    history, historyIndex, canUndo, canRedo, isComplete, digitCounts,
    setCell, setCellMultiple, eraseCell, toggleCandidate: handleToggleCandidate,
    undo: handleUndo, redo: handleRedo, resetGame, clearAll, clearCandidates,
    applyExternalMove, setIsComplete, restoreState, setBoardState,
    isGivenCell, calculateCandidatesForCell: candidatesHook.calculateCandidatesForCell,
    fillAllCandidates, areCandidatesFilled, checkNotes,
  }), [
    board, candidatesHook, history, historyIndex, canUndo, canRedo, isComplete, digitCounts,
    setCell, setCellMultiple, eraseCell, handleToggleCandidate, handleUndo, handleRedo,
    resetGame, clearAll, clearCandidates, applyExternalMove, restoreState, setBoardState,
    isGivenCell, fillAllCandidates, areCandidatesFilled, checkNotes
  ])
}
