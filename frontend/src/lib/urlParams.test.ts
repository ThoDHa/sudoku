import { describe, expect, it } from 'vitest'
import { parseNumericParam } from './urlParams'

describe('parseNumericParam', () => {
  it('returns 0 for a null input (absent URL parameter)', () => {
    expect(parseNumericParam(null)).toBe(0)
  })

  it('returns 0 for an empty string', () => {
    expect(parseNumericParam('')).toBe(0)
  })

  it('parses a valid base-10 integer without falling back', () => {
    expect(parseNumericParam('65000')).toBe(65000)
  })

  it('returns 0 for a non-numeric string that makes parseInt return NaN', () => {
    expect(parseNumericParam('abc')).toBe(0)
  })

  it('keeps the leading numeric prefix of a partially numeric value', () => {
    expect(parseNumericParam('1200abc')).toBe(1200)
  })

  it('parses in base 10, so a hex-style value yields its decimal prefix', () => {
    expect(parseNumericParam('0x1F')).toBe(0)
  })
})
