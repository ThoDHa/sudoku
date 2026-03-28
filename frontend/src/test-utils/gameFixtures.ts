/**
 * Common puzzle and board fixtures for Sudoku tests
 */

export const createTestPuzzle = (): number[] => {
  const board = Array(81).fill(0)
  board[0] = 5
  board[1] = 3
  board[4] = 7
  board[9] = 6
  board[12] = 1
  board[13] = 9
  board[14] = 5
  board[18] = 9
  board[19] = 8
  board[25] = 6
  return board
}

export const createCompletePuzzle = (): number[] => [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
]

export const createNearlyCompletePuzzle = (): number[] => {
  const complete = createCompletePuzzle()
  complete[80] = 0
  return complete
}

export const createEmptyPuzzle = (): number[] => Array(81).fill(0)
