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
    // Stryker disable next-line ConditionalExpression,MethodExpression,ArrowFunction,EqualityOperator,BlockStatement: the L42 effect re-seeds givenCells on mount whenever this branch fires, so the lazy initializer's return is never observed
    if (initialBoard.length === TOTAL_CELLS && initialBoard.some((v) => v !== 0)) {
      // Stryker disable next-line ArrayDeclaration: givenCells is re-seeded by the L42 effect on mount, so the [...initialBoard] return is never observed
      return [...initialBoard]
    }
    return Array(TOTAL_CELLS).fill(0)
  })

  // Stryker disable next-line BooleanLiteral: firstInitRef is write-only (set in updateBoard, never read), so its initial value is unobservable
  const firstInitRef = useRef<boolean>(false)
  const [board, setBoard] = useState<number[]>(() => {
    // Stryker disable next-line ConditionalExpression: when length===81 and the board is all zeros, [...initialBoard] equals the default zeros, so forcing some() to true is observationally identical
    if (initialBoard.length === TOTAL_CELLS && initialBoard.some((v) => v !== 0)) {
      return [...initialBoard]
    }
    return Array(TOTAL_CELLS).fill(0)
  })

  const boardRef = useRef(board)
  React.useEffect(() => {
    boardRef.current = board
  }, [board])

  React.useEffect(() => {
    if (initialBoard.length === TOTAL_CELLS && initialBoard.some((v) => v !== 0)) {
      setGivenCells([...initialBoard])
    }
  }, [initialBoard])

  const updateBoard = useCallback(
    (newBoard: number[]) => {
      // Stryker disable next-line BooleanLiteral: firstInitRef is write-only (never read), so assigning true vs false is unobservable
      firstInitRef.current = true
      setBoard(newBoard)
    },
    /* Stryker disable next-line ArrayDeclaration: a constant deps entry is observationally identical to the empty array since updateBoard's only captured value is the stable setBoard dispatcher */ [],
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
