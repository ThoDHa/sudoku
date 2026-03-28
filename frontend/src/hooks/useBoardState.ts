import React, { useState, useCallback, useRef } from 'react'
import { TOTAL_CELLS } from '../lib/constants'

export interface UseBoardStateOptions {
  initialBoard: number[]
}

export interface UseBoardStateReturn {
  board: number[]
  givenCells: number[]
  boardRef: React.RefObject<number[]>
  isGivenCell: (idx: number) => boolean
  updateBoard: (newBoard: number[]) => void
  setBoard: React.Dispatch<React.SetStateAction<number[]>>
  setGivenCells: React.Dispatch<React.SetStateAction<number[]>>
}

export function useBoardState(options: UseBoardStateOptions): UseBoardStateReturn {
  const { initialBoard } = options

  const [givenCells, setGivenCells] = useState<number[]>(() => {
    if (initialBoard.length === TOTAL_CELLS && initialBoard.some(v => v !== 0)) {
      return [...initialBoard]
    }
    return Array(TOTAL_CELLS).fill(0)
  })

  const firstInitRef = useRef<boolean>(false)
  const [board, setBoard] = useState<number[]>(() => {
    if (initialBoard.length === TOTAL_CELLS && initialBoard.some(v => v !== 0)) {
      return [...initialBoard]
    }
    return Array(TOTAL_CELLS).fill(0)
  })

  const boardRef = useRef(board)
  React.useEffect(() => { boardRef.current = board }, [board])

  React.useEffect(() => {
    if (initialBoard.length === TOTAL_CELLS && initialBoard.some(v => v !== 0)) {
      setGivenCells([...initialBoard])
    }
  }, [initialBoard])

  const updateBoard = useCallback((newBoard: number[]) => {
    firstInitRef.current = true
    setBoard(newBoard)
  }, [])

  const isGivenCell = useCallback((idx: number): boolean => {
    return givenCells[idx] !== 0
  }, [givenCells])

  return {
    board,
    givenCells,
    boardRef,
    isGivenCell,
    updateBoard,
    setBoard,
    setGivenCells,
  }
}
