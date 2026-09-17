import { TOTAL_CELLS } from './constants'

export interface PastedBoardParse {
  cells: number[]
  isComplete: boolean
}

export function parsePastedBoard(text: string): PastedBoardParse {
  const cells = text
    .replace(/[^0-9.]/g, '')
    .split('')
    .map((c) => (c === '.' ? 0 : parseInt(c, 10)))
  return { cells, isComplete: cells.length === TOTAL_CELLS }
}
