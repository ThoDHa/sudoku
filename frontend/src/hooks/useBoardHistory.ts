import React, { useState, useCallback, useRef } from 'react'
import {
  applyStateDiff,
  unapplyStateDiff,
  type StateDiff
} from '../lib/diffUtils'
import {
  MAX_MOVE_HISTORY
} from '../lib/constants'

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
  stateDiff?: StateDiff
  boardBefore?: number[]
  candidatesBefore?: number[][]
}

export interface UseBoardHistoryOptions {
  setBoard: (board: number[]) => void
  setCandidates: (candidates: Uint16Array) => void
  boardRef: React.RefObject<number[]>
  candidatesRef: React.RefObject<Uint16Array>
}

export interface UseBoardHistoryReturn {
  history: Move[]
  historyIndex: number
  historyRef: React.RefObject<Move[]>
  historyIndexRef: React.RefObject<number>
  setHistory: React.Dispatch<React.SetStateAction<Move[]>>
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  limitHistory: (history: Move[], index: number) => { history: Move[]; index: number }
}

export function useBoardHistory(options: UseBoardHistoryOptions): UseBoardHistoryReturn {
  const { setBoard, setCandidates, boardRef, candidatesRef } = options

  const [history, _setHistory] = useState<Move[]>([])
  const [historyIndex, _setHistoryIndex] = useState(-1)

  const historyRef = useRef(history)
  const historyIndexRef = useRef(historyIndex)

  React.useEffect(() => { historyRef.current = history }, [history])
  React.useEffect(() => { historyIndexRef.current = historyIndex }, [historyIndex])

  const limitHistory = useCallback((
    historyArray: Move[],
    currentIndex: number
  ): { history: Move[], index: number } => {
    if (historyArray.length <= MAX_MOVE_HISTORY) {
      return { history: historyArray, index: currentIndex }
    }

    const excess = historyArray.length - MAX_MOVE_HISTORY
    const trimmedHistory = historyArray.slice(excess)
    const adjustedIndex = Math.max(0, currentIndex - excess)

    return { history: trimmedHistory, index: adjustedIndex }
  }, [])

  const undo = useCallback(() => {
    const currentBoard = boardRef.current
    const currentCandidates = candidatesRef.current
    const currentHistory = historyRef.current
    const currentHistoryIndex = historyIndexRef.current

    if (currentHistoryIndex < 0) return

    const currentMove = currentHistory[currentHistoryIndex]
    if (!currentMove) return

    let prevBoard: number[]
    let prevCandidates: Uint16Array

    if (currentMove.stateDiff) {
      const result = unapplyStateDiff(currentBoard, currentCandidates, currentMove.stateDiff)
      prevBoard = result.board
      prevCandidates = result.candidates
      setBoard(prevBoard)
      setCandidates(prevCandidates)
      // CRITICAL: Update refs synchronously for rapid successive undo calls
      boardRef.current = prevBoard
      candidatesRef.current = prevCandidates
    } else if (currentMove.boardBefore && currentMove.candidatesBefore) {
      prevBoard = currentMove.boardBefore
      prevCandidates = new Uint16Array(currentMove.candidatesBefore.flat())
      setBoard(prevBoard)
      setCandidates(prevCandidates)
      // CRITICAL: Update refs synchronously for rapid successive undo calls
      boardRef.current = prevBoard
      candidatesRef.current = prevCandidates
    } else {
      prevBoard = currentBoard
      prevCandidates = currentCandidates
    }

    const newHistoryIndex = currentHistoryIndex - 1
    _setHistoryIndex(newHistoryIndex)
    historyIndexRef.current = newHistoryIndex
  }, [setBoard, setCandidates, boardRef, candidatesRef])

  const redo = useCallback(() => {
    const currentBoard = boardRef.current
    const currentCandidates = candidatesRef.current
    const currentHistory = historyRef.current
    const currentHistoryIndex = historyIndexRef.current

    if (currentHistoryIndex >= currentHistory.length - 1) return

    const nextMove = currentHistory[currentHistoryIndex + 1]
    if (!nextMove) return

    let newBoard: number[]
    let newCandidates: Uint16Array

    if (nextMove.stateDiff) {
      const result = applyStateDiff(currentBoard, currentCandidates, nextMove.stateDiff)
      newBoard = result.board
      newCandidates = result.candidates
      setBoard(newBoard)
      setCandidates(newCandidates)
      // CRITICAL: Update refs synchronously for rapid successive redo calls
      boardRef.current = newBoard
      candidatesRef.current = newCandidates
    } else {
      newBoard = currentBoard
      newCandidates = currentCandidates
    }

    const newHistoryIndex = currentHistoryIndex + 1
    _setHistoryIndex(newHistoryIndex)
    historyIndexRef.current = newHistoryIndex
  }, [setBoard, setCandidates, boardRef, candidatesRef])

  const canUndo = historyIndex >= 0
  const canRedo = historyIndex < history.length - 1

  return {
    history,
    historyIndex,
    historyRef,
    historyIndexRef,
    setHistory: _setHistory,
    setHistoryIndex: _setHistoryIndex,
    canUndo,
    canRedo,
    undo,
    redo,
    limitHistory,
  }
}
