import { describe, it, expect } from 'vitest'
import { parsePastedBoard } from './boardPasteParse'
import { TOTAL_CELLS } from './constants'

describe('parsePastedBoard', () => {
  it('accepts exactly 81 digit characters as complete', () => {
    const text = '1'.repeat(TOTAL_CELLS)

    const result = parsePastedBoard(text)

    expect(result.isComplete).toBe(true)
    expect(result.cells).toEqual(Array<number>(TOTAL_CELLS).fill(1))
  })

  it('rejects an 80-cell paste as too short', () => {
    const result = parsePastedBoard('123456789'.repeat(8) + '12345678')

    expect(result.cells).toHaveLength(80)
    expect(result.isComplete).toBe(false)
  })

  it('rejects an 82-cell paste as too long', () => {
    const result = parsePastedBoard(`${'123456789'.repeat(9)}1`)

    expect(result.cells).toHaveLength(82)
    expect(result.isComplete).toBe(false)
  })

  it('maps dot placeholders to zero', () => {
    const result = parsePastedBoard('.9.9.')

    expect(result.cells).toEqual([0, 9, 0, 9, 0])
  })

  it('maps zero characters to zero rather than a dot-like sentinel', () => {
    const result = parsePastedBoard('000')

    expect(result.cells).toEqual([0, 0, 0])
  })

  it('strips non-digit characters before counting', () => {
    const text = '1-2\t3\n4 5|6,7.8.9'

    const result = parsePastedBoard(text)

    expect(result.cells).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8, 0, 9])
    expect(result.isComplete).toBe(false)
  })

  it('parses each decimal digit with its face value', () => {
    const result = parsePastedBoard('123456789')

    expect(result.cells).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('treats text with no digits or dots as an empty incomplete board', () => {
    const result = parsePastedBoard('no digits here!')

    expect(result.cells).toEqual([])
    expect(result.isComplete).toBe(false)
  })

  it('treats the empty string as an empty incomplete board', () => {
    const result = parsePastedBoard('')

    expect(result.cells).toEqual([])
    expect(result.isComplete).toBe(false)
  })

  it('accepts an 81-cell paste that mixes digits and dot placeholders', () => {
    const wikiPaste =
      '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
    const text = `${wikiPaste.slice(0, 80)}.`

    const result = parsePastedBoard(text)

    expect(result.cells).toHaveLength(81)
    expect(result.isComplete).toBe(true)
    expect(result.cells[0]).toBe(5)
    expect(result.cells[80]).toBe(0)
  })
})
