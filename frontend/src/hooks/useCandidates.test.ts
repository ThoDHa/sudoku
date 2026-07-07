import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useCandidates } from './useCandidates'
import {
  hasCandidate,
  addCandidate,
  removeCandidate,
  countCandidates,
} from '../lib/candidatesUtils'
import { BOARD_SIZE, SUBGRID_SIZE, TOTAL_CELLS, MIN_DIGIT, MAX_DIGIT } from '../lib/constants'

const WIKIPEDIA_BOARD = [
  5, 3, 0, 0, 7, 0, 0, 0, 0, 6, 0, 0, 1, 9, 5, 0, 0, 0, 0, 9, 8, 0, 0, 0, 0, 6, 0, 8, 0, 0, 0, 6, 0,
  0, 0, 3, 4, 0, 0, 8, 0, 3, 0, 0, 1, 7, 0, 0, 0, 2, 0, 0, 0, 6, 0, 6, 0, 0, 0, 0, 2, 8, 0, 0, 0, 0,
  4, 1, 9, 0, 0, 5, 0, 0, 0, 0, 8, 0, 0, 7, 9,
]

const emptyBoard = () => new Array(TOTAL_CELLS).fill(0)

const fullMask = () => {
  let m = 0
  for (let d = MIN_DIGIT; d <= MAX_DIGIT; d++) m = addCandidate(m, d)
  return m
}

const maskDigits = (mask: number): number[] => {
  const out: number[] = []
  for (let d = MIN_DIGIT; d <= MAX_DIGIT; d++) if (hasCandidate(mask, d)) out.push(d)
  return out
}

describe('useCandidates', () => {
  describe('calculateCandidatesForCell exact-mask assertions', () => {
    it('returns {1,2,4} for Wikipedia cell (0,2) (L21:15, L24:15 row/col index mutants)', () => {
      const { result } = renderHook(() => useCandidates(WIKIPEDIA_BOARD))
      const mask = result.current.calculateCandidatesForCell(2, WIKIPEDIA_BOARD)
      expect(mask).toBe(22)
      expect(maskDigits(mask)).toEqual([1, 2, 4])
    })

    it('returns {2,4,8} for Wikipedia cell (0,8), killing column-scan index mutant (L24:15)', () => {
      const { result } = renderHook(() => useCandidates(WIKIPEDIA_BOARD))
      const mask = result.current.calculateCandidatesForCell(8, WIKIPEDIA_BOARD)
      expect(mask).toBe(276)
      expect(maskDigits(mask)).toEqual([2, 4, 8])
    })

    it('returns {1,2,5,9} for Wikipedia cell (3,2), asserting exact column-derived mask', () => {
      const { result } = renderHook(() => useCandidates(WIKIPEDIA_BOARD))
      const mask = result.current.calculateCandidatesForCell(29, WIKIPEDIA_BOARD)
      expect(mask).toBe(550)
      expect(maskDigits(mask)).toEqual([1, 2, 5, 9])
    })

    it('row-scan bound is exclusive: reads only the target row (L20:19 c<=BOARD_SIZE)', () => {
      const board = emptyBoard()
      board[9] = 5
      const { result } = renderHook(() => useCandidates(board))
      const mask = result.current.calculateCandidatesForCell(5, board)
      expect(mask).toBe(fullMask())
      expect(hasCandidate(mask, 5)).toBe(true)
    })

    it('row-scan index is row*BOARD_SIZE+c, not subtraction or division (L21:15)', () => {
      const board = emptyBoard()
      board[8] = 4
      const { result } = renderHook(() => useCandidates(board))
      const mask = result.current.calculateCandidatesForCell(14, board)
      expect(mask).toBe(fullMask())
      expect(hasCandidate(mask, 4)).toBe(true)
    })

    it('box-row bound is exclusive of the next box row (L26:24 r<=boxRow+SUBGRID_SIZE)', () => {
      // board[28] = cell (3,1): inside the mutant's extra box-row iteration
      // (r=3, c=1) but outside col 0 / row 0 / box (0,0) of the target cell 0.
      const board = emptyBoard()
      board[28] = 7
      const { result } = renderHook(() => useCandidates(board))
      const mask = result.current.calculateCandidatesForCell(0, board)
      expect(hasCandidate(mask, 7)).toBe(true)
    })

    it('box-col bound is exclusive of the next box col (L27:26 c<=boxCol+SUBGRID_SIZE)', () => {
      const board = emptyBoard()
      board[12] = 9
      const { result } = renderHook(() => useCandidates(board))
      const mask = result.current.calculateCandidatesForCell(0, board)
      expect(hasCandidate(mask, 9)).toBe(true)
    })
  })

  describe('calculateAllCandidatesForBoard', () => {
    it('produces exact per-cell masks for the Wikipedia puzzle', () => {
      const { result } = renderHook(() => useCandidates(WIKIPEDIA_BOARD))
      const all = result.current.calculateAllCandidatesForBoard(WIKIPEDIA_BOARD)
      expect(all.length).toBe(TOTAL_CELLS)
      expect(all[2]).toBe(22)
      expect(all[8]).toBe(276)
      expect(all[29]).toBe(550)
      expect(all[0]).toBe(0)
      expect(all[80]).toBe(0)
    })

    it('empty cells on an empty board all carry the full candidate set', () => {
      const board = emptyBoard()
      const { result } = renderHook(() => useCandidates(board))
      const all = result.current.calculateAllCandidatesForBoard(board)
      expect(all[0]).toBe(fullMask())
      expect(all[40]).toBe(fullMask())
    })
  })

  describe('eliminateFromPeers', () => {
    it('clears the target cell and removes the digit from row, col, and box peers only (L163-L174)', () => {
      const initial = new Uint16Array(TOTAL_CELLS)
      initial[5] = 6 // {1,2} row-only peer of cell 0
      initial[36] = 10 // {1,3} col-only peer of cell 0
      initial[10] = 6 // {1,2} box-only peer of cell 0
      initial[40] = 1022 // non-peer

      const { result } = renderHook(() => useCandidates(emptyBoard()))
      const out = result.current.eliminateFromPeers(initial, 0, 1)

      expect(out[0]).toBe(0)
      expect(out[5]).toBe(4) // removeCandidate({1,2}, 1) -> {2}
      expect(out[36]).toBe(8) // removeCandidate({1,3}, 1) -> {3}
      expect(out[10]).toBe(4) // removeCandidate({1,2}, 1) -> {2}
      expect(out[40]).toBe(1022) // non-peer untouched
    })

    it('preserves peer digits other than the eliminated one (L165:43, L169:43, L174:45 || 0 mutants)', () => {
      const initial = new Uint16Array(TOTAL_CELLS)
      initial[1] = 14 // {1,2,3} row peer of cell 0
      initial[9] = 14 // {1,2,3} col/box peer of cell 0

      const { result } = renderHook(() => useCandidates(emptyBoard()))
      const out = result.current.eliminateFromPeers(initial, 0, 1)

      expect(out[1]).toBe(12) // {2,3} preserved
      expect(out[9]).toBe(12) // {2,3} preserved
    })
  })

  describe('areCandidatesFilled', () => {
    it('skips filled cells even if they carry a non-zero candidate mask (L142:11)', () => {
      const board = emptyBoard()
      board[0] = 5
      const initial = new Uint16Array(TOTAL_CELLS)
      initial[0] = 2 // mask on a FILLED cell

      const { result } = renderHook(() => useCandidates(board))
      act(() => {
        result.current.setCandidates(initial)
      })
      expect(result.current.areCandidatesFilled()).toBe(false)
    })

    it('returns true when at least one empty cell has valid-mask candidates', () => {
      const board = emptyBoard()
      const initial = new Uint16Array(TOTAL_CELLS)
      initial[10] = 6

      const { result } = renderHook(() => useCandidates(board))
      act(() => {
        result.current.setCandidates(initial)
      })
      expect(result.current.areCandidatesFilled()).toBe(true)
    })

    it('ignores invalid bit-0-only masks with no real candidates (L145:11 ||, L145:29)', () => {
      const board = emptyBoard()
      const initial = new Uint16Array(TOTAL_CELLS)
      initial[0] = 1 // bit 0 set, no valid digit bits

      const { result } = renderHook(() => useCandidates(board))
      act(() => {
        result.current.setCandidates(initial)
      })
      expect(result.current.areCandidatesFilled()).toBe(false)
    })
  })

  describe('checkNotes', () => {
    it('reports wrong, missing, and cellsWithNotes exactly, including digit-9 boundary (L44:31, L51:33, L52, L53)', () => {
      const notes = new Uint16Array(TOTAL_CELLS)
      notes[2] = addCandidate(addCandidate(0, 1), 5) // {1,5}: 5 is wrong, {2,4} missing
      notes[8] = addCandidate(0, 9) // {9}: 9 is wrong, {2,4,8} missing
      notes[29] = addCandidate(0, 1) // {1}: {2,5,9} missing (9 boundary)

      const { result } = renderHook(() => useCandidates(WIKIPEDIA_BOARD))
      const out = result.current.checkNotes(WIKIPEDIA_BOARD, notes)

      expect(out.valid).toBe(false)
      expect(out.cellsWithNotes).toBe(3)
      expect(out.wrongNotes).toContainEqual({ idx: 2, digit: 5 })
      expect(out.wrongNotes).toContainEqual({ idx: 8, digit: 9 }) // digit-9 boundary (L44:31)
      expect(out.missingNotes).toContainEqual({ idx: 2, digit: 2 })
      expect(out.missingNotes).toContainEqual({ idx: 2, digit: 4 })
      expect(out.missingNotes).toContainEqual({ idx: 29, digit: 9 }) // digit-9 boundary (L51:33)
    })

    it('returns a correct wrongNotes/missingNotes shape with idx and digit (L53:22 ObjectLiteral)', () => {
      const notes = new Uint16Array(TOTAL_CELLS)
      notes[2] = addCandidate(0, 5) // {5} all wrong

      const { result } = renderHook(() => useCandidates(WIKIPEDIA_BOARD))
      const out = result.current.checkNotes(WIKIPEDIA_BOARD, notes)

      expect(out.wrongNotes.length).toBe(1)
      expect(out.wrongNotes[0]).toEqual({ idx: 2, digit: 5 })
    })

    it('skips filled cells so their notes do not inflate cellsWithNotes (L198:13)', () => {
      const notes = new Uint16Array(TOTAL_CELLS)
      notes[0] = addCandidate(0, 1) // notes on a filled cell (idx 0 is a given)

      const { result } = renderHook(() => useCandidates(WIKIPEDIA_BOARD))
      const out = result.current.checkNotes(WIKIPEDIA_BOARD, notes)

      expect(out.cellsWithNotes).toBe(0)
      expect(out.wrongNotes).toHaveLength(0)
      expect(out.missingNotes).toHaveLength(0)
    })

    it('returns valid=true when user notes match valid candidates exactly', () => {
      const { result } = renderHook(() => useCandidates(WIKIPEDIA_BOARD))
      const validMask2 = result.current.calculateCandidatesForCell(2, WIKIPEDIA_BOARD)
      const notes = new Uint16Array(TOTAL_CELLS)
      notes[2] = validMask2

      const out = result.current.checkNotes(WIKIPEDIA_BOARD, notes)
      expect(out.valid).toBe(true)
      expect(out.wrongNotes).toHaveLength(0)
    })
  })

  describe('fillAllCandidates', () => {
    it('recomputes against the latest board after rerender (L137:6 deps mutant)', () => {
      let board = emptyBoard()
      const { result, rerender } = renderHook(({ b }: { b: number[] }) => useCandidates(b), {
        initialProps: { b: board },
      })

      board = [...board]
      board[0] = 5
      rerender({ b: board })

      let filled: Uint16Array = new Uint16Array(TOTAL_CELLS)
      act(() => {
        filled = result.current.fillAllCandidates()
      })
      expect(filled[0]).toBe(0) // filled cell has no candidates
      // Cell 1 (0,1) is in row 0 which now contains 5, so digit 5 must be
      // excluded. Under the stale-board mutant (deps []), fillAllCandidates
      // would use the initial empty board and return fullMask 1022 here.
      expect(filled[1]).toBe(990)
      expect(hasCandidate(filled[1], 5)).toBe(false)
      expect(result.current.areCandidatesFilled()).toBe(true)
    })

    it('increments candidatesVersion each time setCandidates runs', () => {
      const { result } = renderHook(() => useCandidates(emptyBoard()))
      const before = result.current.candidatesVersion

      act(() => {
        result.current.fillAllCandidates()
      })
      expect(result.current.candidatesVersion).toBe(before + 1)
    })
  })

  describe('setCandidates', () => {
    it('stores the supplied Uint16Array and bumps the version', () => {
      const { result } = renderHook(() => useCandidates(emptyBoard()))
      const replacement = new Uint16Array(TOTAL_CELLS)
      replacement[5] = 42

      act(() => {
        result.current.setCandidates(replacement)
      })
      expect(result.current.candidates[5]).toBe(42)
      expect(result.current.candidatesVersion).toBeGreaterThan(0)
    })
  })

  describe('loop bounds exclusive of TOTAL_CELLS (L121:25, L141:25, L197:25 equivalents)', () => {
    it('calculateAllCandidatesForBoard yields exactly TOTAL_CELLS entries', () => {
      const { result } = renderHook(() => useCandidates(emptyBoard()))
      const out = result.current.calculateAllCandidatesForBoard(emptyBoard())
      expect(out.length).toBe(TOTAL_CELLS)
      expect(out.every((v) => v === fullMask())).toBe(true)
    })
  })
})

describe('useCandidates guard against off-by-one peer elimination (L163:23, L167:23)', () => {
  it('does not zero out peers when only the source digit is gone (L165:43 false mutant)', () => {
    const initial = new Uint16Array(TOTAL_CELLS)
    // row peer of cell 4 (row 0, col 4, box (0,3)): cell 5 (0,5) is row peer, same box
    initial[5] = 6 // {1,2}
    initial[13] = 6 // {1,2} col peer of cell 4 (col 4), different box (1,3)
    initial[50] = 1022 // (5,5) non-peer of cell 4

    const { result } = renderHook(() => useCandidates(emptyBoard()))
    const out = result.current.eliminateFromPeers(initial, 4, 1)

    expect(out[4]).toBe(0)
    expect(out[5]).toBe(4) // {2} after removing 1
    expect(out[13]).toBe(4)
    expect(out[50]).toBe(1022)
    expect(countCandidates(out[5])).toBe(1)
  })
})

describe('useCandidates eliminateFromPeers loop bounds stay inside the peer set', () => {
  it('row loop bound is exclusive so a row>0 cell does not leak into the next row (L163 c<=BOARD_SIZE)', () => {
    // Cell 13 = (row 1, col 4). Its row peers are 9..17. The mutant's extra c=9
    // iteration would touch cell 18 (row 2, col 0), which is NOT a peer.
    const initial = new Uint16Array(TOTAL_CELLS).fill(0) as unknown as Uint16Array
    initial.fill(1022) // every cell carries all digits
    const { result } = renderHook(() => useCandidates(emptyBoard()))

    const out = result.current.eliminateFromPeers(initial, 13, 1)

    // cell 18 is not a peer of cell 13; digit 1 must survive there.
    expect(hasCandidate(out[18], 1)).toBe(true)
    // sanity: a real row peer (cell 10) does lose digit 1.
    expect(hasCandidate(out[10], 1)).toBe(false)
  })

  it('row index is row*BOARD_SIZE+c, not row/BOARD_SIZE+c, for row>0 (L164 ArithmeticOperator)', () => {
    // For row 1 the mutant row/BOARD_SIZE+c yields fractional indices (no-op writes),
    // so row peers would keep digit 1.
    const initial = new Uint16Array(TOTAL_CELLS).fill(0) as unknown as Uint16Array
    initial.fill(1022)
    const { result } = renderHook(() => useCandidates(emptyBoard()))

    const out = result.current.eliminateFromPeers(initial, 13, 1)

    expect(hasCandidate(out[9], 1)).toBe(false) // row peer of cell 13
    expect(hasCandidate(out[17], 1)).toBe(false) // row peer of cell 13
  })

  it('box-row bound is exclusive of the next box row (L171 r<=boxRow+SUBGRID_SIZE)', () => {
    // Cell 0 = box (0,0). The mutant extra r=3 iteration touches cell 28 (row 3, col 1),
    // which is NOT a peer of cell 0.
    const initial = new Uint16Array(TOTAL_CELLS).fill(0) as unknown as Uint16Array
    initial.fill(1022)
    const { result } = renderHook(() => useCandidates(emptyBoard()))

    const out = result.current.eliminateFromPeers(initial, 0, 1)

    expect(hasCandidate(out[28], 1)).toBe(true) // non-peer, digit survives
  })

  it('box-col bound is exclusive of the next box col (L172 c<=boxCol+SUBGRID_SIZE)', () => {
    // Cell 0 = box (0,0). The mutant extra c=3 iteration touches cell 12 (row 1, col 3),
    // which is NOT a peer of cell 0.
    const initial = new Uint16Array(TOTAL_CELLS).fill(0) as unknown as Uint16Array
    initial.fill(1022)
    const { result } = renderHook(() => useCandidates(emptyBoard()))

    const out = result.current.eliminateFromPeers(initial, 0, 1)

    expect(hasCandidate(out[12], 1)).toBe(true) // non-peer, digit survives
  })
})
// =============================================================================
// Mutation-killing tests added for cluster F4 retry (iteration 2).
// =============================================================================

describe('mutation-killing: diffCellNotes missing-list is exact (L53)', () => {
  it('reports only the genuinely missing digits, not every digit', () => {
    // Cell 2 of the Wikipedia board has validMask {1,2,4}. User notes {1,5}
    // make 5 a wrong note and {2,4} the missing set. Forcing the L53 condition
    // true (or &&->||) inflates the missing list; the original yields exactly 2.
    const notes = new Uint16Array(TOTAL_CELLS)
    notes[2] = addCandidate(addCandidate(0, 1), 5)
    const { result } = renderHook(() => useCandidates(WIKIPEDIA_BOARD))
    const out = result.current.checkNotes(WIKIPEDIA_BOARD, notes)
    expect(out.missingNotes).toHaveLength(2)
    expect(out.missingNotes).toEqual([
      { idx: 2, digit: 2 },
      { idx: 2, digit: 4 },
    ])
  })
})
