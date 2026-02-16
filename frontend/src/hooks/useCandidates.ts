import React, { useState, useCallback, useRef, useMemo } from 'react'
import {
  hasCandidate,
  addCandidate,
  removeCandidate,
  countCandidates,
  type CandidateMask
} from '../lib/candidatesUtils'
import {
  BOARD_SIZE,
  SUBGRID_SIZE,
  TOTAL_CELLS,
  MIN_DIGIT,
  MAX_DIGIT
} from '../lib/constants'

export interface UseCandidatesReturn {
  candidates: Uint16Array
  candidatesVersion: number

  calculateCandidatesForCell: (idx: number, currentBoard: number[]) => CandidateMask
  calculateAllCandidatesForBoard: (board: number[]) => Uint16Array
  fillAllCandidates: () => Uint16Array
  areCandidatesFilled: () => boolean
  eliminateFromPeers: (candidates: Uint16Array, idx: number, digit: number) => Uint16Array

  checkNotes: (board: number[], candidates: Uint16Array) => {
    valid: boolean
    wrongNotes: { idx: number; digit: number }[]
    missingNotes: { idx: number; digit: number }[]
    cellsWithNotes: number
  }

  setCandidates: (newCandidates: Uint16Array) => void
}

export function useCandidates(board: number[]): UseCandidatesReturn {
  const [candidates, setCandidatesState] = useState<Uint16Array>(
    () => new Uint16Array(TOTAL_CELLS)
  )
  
  const [candidatesVersion, setCandidatesVersion] = useState(0)
  
  const candidatesRef = useRef(candidates)

  React.useEffect(() => { candidatesRef.current = candidates }, [candidates])

  const setCandidates = useCallback((newCandidates: Uint16Array) => {
    setCandidatesState(newCandidates)
    setCandidatesVersion(v => v + 1)
  }, [])
  
  const calculateCandidatesForCell = useCallback((idx: number, currentBoard: number[]): CandidateMask => {
    const row = Math.floor(idx / BOARD_SIZE)
    const col = idx % BOARD_SIZE
    const boxRow = Math.floor(row / SUBGRID_SIZE) * SUBGRID_SIZE
    const boxCol = Math.floor(col / SUBGRID_SIZE) * SUBGRID_SIZE
    let validCandidates = 0

    for (let d = MIN_DIGIT; d <= MAX_DIGIT; d++) {
      let canPlace = true
      for (let c = 0; c < BOARD_SIZE && canPlace; c++) {
        if (currentBoard[row * BOARD_SIZE + c] === d) canPlace = false
      }
      for (let r = 0; r < BOARD_SIZE && canPlace; r++) {
        if (currentBoard[r * BOARD_SIZE + col] === d) canPlace = false
      }
      for (let r = boxRow; r < boxRow + SUBGRID_SIZE && canPlace; r++) {
        for (let c = boxCol; c < boxCol + SUBGRID_SIZE && canPlace; c++) {
          if (currentBoard[r * BOARD_SIZE + c] === d) canPlace = false
        }
      }
      if (canPlace) validCandidates = addCandidate(validCandidates, d)
    }
    return validCandidates
  }, [])

  const calculateAllCandidatesForBoard = useCallback((boardToCalculate: number[]): Uint16Array => {
    const newCandidates = new Uint16Array(TOTAL_CELLS)
    
    for (let idx = 0; idx < TOTAL_CELLS; idx++) {
      if (boardToCalculate[idx] !== 0) {
        newCandidates[idx] = 0
        continue
      }
      newCandidates[idx] = calculateCandidatesForCell(idx, boardToCalculate)
    }
    return newCandidates
  }, [calculateCandidatesForCell])

  const fillAllCandidates = useCallback((): Uint16Array => {
    const calculated = calculateAllCandidatesForBoard(board)
    setCandidates(calculated)
    return calculated
  }, [calculateAllCandidatesForBoard, board, setCandidates])

  const areCandidatesFilled = useCallback((): boolean => {
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

  const eliminateFromPeers = useCallback((
    candidatesToEliminate: Uint16Array,
    idx: number,
    digit: number
  ): Uint16Array => {
    const result = new Uint16Array(candidatesToEliminate)
    const row = Math.floor(idx / BOARD_SIZE)
    const col = idx % BOARD_SIZE
    const boxRow = Math.floor(row / SUBGRID_SIZE) * SUBGRID_SIZE
    const boxCol = Math.floor(col / SUBGRID_SIZE) * SUBGRID_SIZE

    result[idx] = 0

    for (let c = 0; c < BOARD_SIZE; c++) {
      const cellIdx = row * BOARD_SIZE + c
      result[cellIdx] = removeCandidate(result[cellIdx] || 0, digit)
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
      const cellIdx = r * BOARD_SIZE + col
      result[cellIdx] = removeCandidate(result[cellIdx] || 0, digit)
    }
    for (let r = boxRow; r < boxRow + SUBGRID_SIZE; r++) {
      for (let c = boxCol; c < boxCol + SUBGRID_SIZE; c++) {
        const cellIdx = r * BOARD_SIZE + c
        result[cellIdx] = removeCandidate(result[cellIdx] || 0, digit)
      }
    }
    
    return result
  }, [])

  const checkNotes = useCallback((
    boardToCheck: number[],
    candidatesToCheck: Uint16Array
  ): {
    valid: boolean
    wrongNotes: { idx: number; digit: number }[]
    missingNotes: { idx: number; digit: number }[]
    cellsWithNotes: number
  } => {
    const wrongNotes: { idx: number; digit: number }[] = []
    const missingNotes: { idx: number; digit: number }[] = []
    let cellsWithNotes = 0

    for (let idx = 0; idx < TOTAL_CELLS; idx++) {
      if (boardToCheck[idx] !== 0) continue

      const userNotesMask = candidatesToCheck[idx] || 0
      const validCandidatesMask = calculateCandidatesForCell(idx, boardToCheck)

      if (countCandidates(userNotesMask) > 0) {
        cellsWithNotes++
      }

      for (let digit = MIN_DIGIT; digit <= MAX_DIGIT; digit++) {
        if (hasCandidate(userNotesMask, digit) && !hasCandidate(validCandidatesMask, digit)) {
          wrongNotes.push({ idx, digit })
        }
      }

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
  }, [calculateCandidatesForCell])

  return useMemo(() => ({
    candidates,
    candidatesVersion,
    calculateCandidatesForCell,
    calculateAllCandidatesForBoard,
    fillAllCandidates,
    areCandidatesFilled,
    eliminateFromPeers,
    checkNotes,
    setCandidates,
  }), [
    candidates,
    candidatesVersion,
    calculateCandidatesForCell,
    calculateAllCandidatesForBoard,
    fillAllCandidates,
    areCandidatesFilled,
    eliminateFromPeers,
    checkNotes,
    setCandidates,
  ])
}
