import { useState, useCallback, useMemo } from 'react'
import {
  hasCandidate,
  addCandidate,
  removeCandidate,
  countCandidates,
  type CandidateMask,
} from '../lib/candidatesUtils'
import { BOARD_SIZE, SUBGRID_SIZE, TOTAL_CELLS, MIN_DIGIT, MAX_DIGIT } from '../lib/constants'

// Returns true when `digit` does not already appear in the cell's row, column, or box.
const isDigitPlaceable = (
  board: number[],
  row: number,
  col: number,
  boxRow: number,
  boxCol: number,
  digit: number,
): boolean => {
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (board[row * BOARD_SIZE + c] === digit) return false
  }
  // Stryker disable next-line EqualityOperator: the extra r=9 iteration reads board[81+col] (undefined); `undefined === digit` is false, so the early-return result is unchanged
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r * BOARD_SIZE + col] === digit) return false
  }
  for (let r = boxRow; r < boxRow + SUBGRID_SIZE; r++) {
    for (let c = boxCol; c < boxCol + SUBGRID_SIZE; c++) {
      if (board[r * BOARD_SIZE + c] === digit) return false
    }
  }
  return true
}

type NoteList = { idx: number; digit: number }[]

// Compare a cell's user notes against the valid candidate mask, returning
// notes the user added that are wrong plus notes they omitted.
const diffCellNotes = (
  idx: number,
  userMask: CandidateMask,
  validMask: CandidateMask,
): { wrong: NoteList; missing: NoteList } => {
  const wrong: NoteList = []
  for (let digit = MIN_DIGIT; digit <= MAX_DIGIT; digit++) {
    if (hasCandidate(userMask, digit) && !hasCandidate(validMask, digit)) {
      wrong.push({ idx, digit })
    }
  }
  const missing: NoteList = []
  if (countCandidates(userMask) > 0) {
    for (let digit = MIN_DIGIT; digit <= MAX_DIGIT; digit++) {
      if (hasCandidate(validMask, digit) && !hasCandidate(userMask, digit)) {
        missing.push({ idx, digit })
      }
    }
  }
  return { wrong, missing }
}

export interface UseCandidatesReturn {
  candidates: Uint16Array
  candidatesVersion: number

  calculateCandidatesForCell: (idx: number, currentBoard: number[]) => CandidateMask
  calculateAllCandidatesForBoard: (board: number[]) => Uint16Array
  fillAllCandidates: () => Uint16Array
  areCandidatesFilled: () => boolean
  eliminateFromPeers: (candidates: Uint16Array, idx: number, digit: number) => Uint16Array

  checkNotes: (
    board: number[],
    candidates: Uint16Array,
  ) => {
    valid: boolean
    wrongNotes: { idx: number; digit: number }[]
    missingNotes: { idx: number; digit: number }[]
    cellsWithNotes: number
  }

  setCandidates: (newCandidates: Uint16Array) => void
}

export function useCandidates(board: number[]): UseCandidatesReturn {
  const [candidates, setCandidatesState] = useState<Uint16Array>(() => new Uint16Array(TOTAL_CELLS))

  const [candidatesVersion, setCandidatesVersion] = useState(0)

  const setCandidates = useCallback((newCandidates: Uint16Array) => {
    setCandidatesState(newCandidates)
    setCandidatesVersion((v) => v + 1)
  }, /* Stryker disable next-line ArrayDeclaration: setCandidates captures only stable setState dispatchers, so a constant deps entry is observationally identical to the empty array */ [])

  const calculateCandidatesForCell = useCallback(
    (idx: number, currentBoard: number[]): CandidateMask => {
      const row = Math.floor(idx / BOARD_SIZE)
      const col = idx % BOARD_SIZE
      const boxRow = Math.floor(row / SUBGRID_SIZE) * SUBGRID_SIZE
      const boxCol = Math.floor(col / SUBGRID_SIZE) * SUBGRID_SIZE
      let validCandidates = 0

      for (let d = MIN_DIGIT; d <= MAX_DIGIT; d++) {
        if (isDigitPlaceable(currentBoard, row, col, boxRow, boxCol, d)) {
          validCandidates = addCandidate(validCandidates, d)
        }
      }
      return validCandidates
    },
    // Stryker disable next-line ArrayDeclaration: calculateCandidatesForCell captures no external values, so a constant deps entry is observationally identical to the empty array
    [],
  )

  const calculateAllCandidatesForBoard = useCallback(
    (boardToCalculate: number[]): Uint16Array => {
      const newCandidates = new Uint16Array(TOTAL_CELLS)

      // Stryker disable next-line EqualityOperator: idx=81 reads boardToCalculate[81] (undefined); `undefined !== 0` is true so the branch writes newCandidates[81]=0 (no-op on a length-81 typed array) and continues, leaving the result unchanged
      for (let idx = 0; idx < TOTAL_CELLS; idx++) {
        if (boardToCalculate[idx] !== 0) {
          newCandidates[idx] = 0
          continue
        }
        newCandidates[idx] = calculateCandidatesForCell(idx, boardToCalculate)
      }
      return newCandidates
    },
    // Stryker disable next-line ArrayDeclaration: calculateCandidatesForCell has empty deps and is therefore stable forever, so capturing it once via [] is observationally identical to [calculateCandidatesForCell]
    [calculateCandidatesForCell],
  )

  const fillAllCandidates = useCallback((): Uint16Array => {
    const calculated = calculateAllCandidatesForBoard(board)
    setCandidates(calculated)
    return calculated
  }, [calculateAllCandidatesForBoard, board, setCandidates])

  const areCandidatesFilled = useCallback((): boolean => {
    let hasAnyCandidates = false
    // Stryker disable next-line EqualityOperator: idx=81 reads board[81] (undefined); `undefined !== 0` is true so the loop continues without touching hasAnyCandidates
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

  const eliminateFromPeers = useCallback(
    (candidatesToEliminate: Uint16Array, idx: number, digit: number): Uint16Array => {
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
      // Stryker disable next-line EqualityOperator: r=9 gives cellIdx=81+col, out of bounds for the length-81 result typed array; both the read (|| 0) and the write are no-ops
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
    },
    // Stryker disable next-line ArrayDeclaration: eliminateFromPeers captures no external values, so a constant deps entry is observationally identical to the empty array
    [],
  )

  const checkNotes = useCallback(
    (
      boardToCheck: number[],
      candidatesToCheck: Uint16Array,
    ): {
      valid: boolean
      wrongNotes: { idx: number; digit: number }[]
      missingNotes: { idx: number; digit: number }[]
      cellsWithNotes: number
    } => {
      const wrongNotes: { idx: number; digit: number }[] = []
      const missingNotes: { idx: number; digit: number }[] = []
      let cellsWithNotes = 0

      // Stryker disable next-line EqualityOperator: idx=81 reads boardToCheck[81] (undefined); `undefined !== 0` is true so the loop continues without touching the accumulators
      for (let idx = 0; idx < TOTAL_CELLS; idx++) {
        if (boardToCheck[idx] !== 0) continue

        const userNotesMask = candidatesToCheck[idx] || 0
        const validCandidatesMask = calculateCandidatesForCell(idx, boardToCheck)

        if (countCandidates(userNotesMask) > 0) {
          cellsWithNotes++
        }

        const { wrong, missing } = diffCellNotes(idx, userNotesMask, validCandidatesMask)
        wrongNotes.push(...wrong)
        missingNotes.push(...missing)
      }

      return {
        valid: wrongNotes.length === 0,
        wrongNotes,
        missingNotes,
        cellsWithNotes,
      }
    },
    // Stryker disable next-line ArrayDeclaration: calculateCandidatesForCell has empty deps and is therefore stable forever, so capturing it once via [] is observationally identical to [calculateCandidatesForCell]
    [calculateCandidatesForCell],
  )

  return useMemo(
    () => ({
      candidates,
      candidatesVersion,
      calculateCandidatesForCell,
      calculateAllCandidatesForBoard,
      fillAllCandidates,
      areCandidatesFilled,
      eliminateFromPeers,
      checkNotes,
      setCandidates,
    }),
    [
      candidates,
      candidatesVersion,
      calculateCandidatesForCell,
      calculateAllCandidatesForBoard,
      fillAllCandidates,
      areCandidatesFilled,
      eliminateFromPeers,
      checkNotes,
      setCandidates,
    ],
  )
}
