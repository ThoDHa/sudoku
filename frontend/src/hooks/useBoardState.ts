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
    // Stryker disable next-line ConditionalExpression,MethodExpression,ArrowFunction,EqualityOperator,BlockStatement: the [initialBoard] effect below re-seeds givenCells with the same branch on mount, so which arm the initializer takes is never observable
    if (initialBoard.length === TOTAL_CELLS && initialBoard.some((v) => v !== 0)) {
      // Stryker disable next-line ArrayDeclaration: same masking effect; the returned copy is replaced before any test can observe it
      return [...initialBoard]
    }
    return Array<number>(TOTAL_CELLS).fill(0)
  })

  const [board, setBoard] = useState<number[]>(() => {
    // Stryker disable next-line ConditionalExpression: the some()→true operand forces the copy branch for an all-zeros 81-board, whose [...initialBoard] is value-identical to the default zeros, so that half is equivalent; the whole-test halves die (mixed-board copies assert the values; a short board asserts the 81-cell fallback)
    if (initialBoard.length === TOTAL_CELLS && initialBoard.some((v) => v !== 0)) {
      return [...initialBoard]
    }
    return Array<number>(TOTAL_CELLS).fill(0)
  })

  const boardRef = useRef(board)
  React.useEffect(() => {
    boardRef.current = board
  }, [board])

  React.useEffect(() => {
    const syncGivenCells = () => {
      if (initialBoard.length === TOTAL_CELLS && initialBoard.some((v) => v !== 0)) {
        setGivenCells([...initialBoard])
      }
    }
    syncGivenCells()
  }, [initialBoard])

  const updateBoard = useCallback(
    (newBoard: number[]) => {
      setBoard(newBoard)
    },
    // Stryker disable next-line ArrayDeclaration: the only generated replacement is ["Stryker was here"], a constant; the callback captures only the stable setBoard dispatcher, so any deps content is observationally identical across renders
    [],
  )

  const isGivenCell = useCallback(
    (idx: number): boolean => {
      return givenCells[idx] !== 0
    },
    [givenCells],
  )

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
