import { describe, expect, it } from 'vitest'
import {
  areControlsPropsEqual,
  getDigitButtonState,
  type ControlsProps,
  type DigitStateContext,
} from './controlsDigitState'

const noop = () => {}

const makeProps = (overrides: Partial<ControlsProps> = {}): ControlsProps => ({
  notesMode: false,
  onNotesToggle: noop,
  onDigit: noop,
  onEraseMode: noop,
  onUndo: noop,
  onRedo: noop,
  canUndo: false,
  canRedo: false,
  eraseMode: false,
  digitCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  highlightedDigit: null,
  isComplete: false,
  isSolving: false,
  ...overrides,
})

const makeContext = (overrides: Partial<DigitStateContext> = {}): DigitStateContext => ({
  digitCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  highlightedDigit: null,
  isComplete: false,
  isSolving: false,
  ...overrides,
})

const MUTED_SELECTED =
  'bg-accent text-btn-active-text ring-2 ring-accent ring-offset-2 ring-offset-background opacity-60 cursor-not-allowed'
const DISABLED = 'bg-btn-bg text-foreground-muted opacity-40 cursor-not-allowed'
const SELECTED =
  'bg-accent text-btn-active-text ring-2 ring-accent ring-offset-2 ring-offset-background'
const BASE = 'bg-btn-bg text-foreground'

describe('getDigitButtonState derivation', () => {
  it('computes remaining as nine minus the placed count', () => {
    expect(
      getDigitButtonState(1, makeContext({ digitCounts: [3, 0, 0, 0, 0, 0, 0, 0, 0] })).remaining,
    ).toBe(6)
    expect(
      getDigitButtonState(9, makeContext({ digitCounts: [0, 0, 0, 0, 0, 0, 0, 0, 2] })).remaining,
    ).toBe(7)
  })

  it('treats a missing count as zero placements', () => {
    expect(getDigitButtonState(1, makeContext({ digitCounts: [] })).remaining).toBe(9)
    expect(getDigitButtonState(5, makeContext({ digitCounts: [0, 0, 0, 0] })).remaining).toBe(9)
  })

  it('marks the digit complete only when no instance remains', () => {
    expect(
      getDigitButtonState(1, makeContext({ digitCounts: [9, 0, 0, 0, 0, 0, 0, 0, 0] }))
        .digitComplete,
    ).toBe(true)
    expect(
      getDigitButtonState(1, makeContext({ digitCounts: [8, 0, 0, 0, 0, 0, 0, 0, 0] }))
        .digitComplete,
    ).toBe(false)
  })

  it('selects only the digit matching highlightedDigit', () => {
    const state = getDigitButtonState(4, makeContext({ highlightedDigit: 4 }))
    expect(state.isSelected).toBe(true)
    expect(getDigitButtonState(3, makeContext({ highlightedDigit: 4 })).isSelected).toBe(false)
    expect(getDigitButtonState(4, makeContext()).isSelected).toBe(false)
  })

  it('disables the button when the digit is complete', () => {
    const state = getDigitButtonState(1, makeContext({ digitCounts: [9, 0, 0, 0, 0, 0, 0, 0, 0] }))
    expect(state.isDisabled).toBe(true)
  })

  it('disables the button when the puzzle is complete', () => {
    expect(getDigitButtonState(1, makeContext({ isComplete: true })).isDisabled).toBe(true)
  })

  it('disables the button while auto-solve runs', () => {
    expect(getDigitButtonState(1, makeContext({ isSolving: true })).isDisabled).toBe(true)
  })

  it('enables the button when none of the disable conditions hold', () => {
    expect(getDigitButtonState(1, makeContext()).isDisabled).toBe(false)
  })

  it('shows the muted selected state only when selected, solving and incomplete', () => {
    const selected = { highlightedDigit: 5 }
    expect(
      getDigitButtonState(5, makeContext({ ...selected, isSolving: true })).showSelectedMuted,
    ).toBe(true)
    expect(getDigitButtonState(5, makeContext(selected)).showSelectedMuted).toBe(false)
    expect(getDigitButtonState(4, makeContext({ isSolving: true })).showSelectedMuted).toBe(false)
    expect(
      getDigitButtonState(
        5,
        makeContext({ ...selected, isSolving: true, digitCounts: [0, 0, 0, 0, 9, 0, 0, 0, 0] }),
      ).showSelectedMuted,
    ).toBe(false)
  })
})

describe('getDigitButtonState class precedence', () => {
  it('prefers the solving-muted class over every other branch', () => {
    const state = getDigitButtonState(5, makeContext({ highlightedDigit: 5, isSolving: true }))
    expect(state.className).toBe(`control-digit-btn ${MUTED_SELECTED}`)
  })

  it('prefers the disabled class over the selected class', () => {
    const state = getDigitButtonState(5, makeContext({ highlightedDigit: 5, isComplete: true }))
    expect(state.className).toBe(`control-digit-btn ${DISABLED}`)
  })

  it('prefers the disabled class over the solving-muted class when the digit is complete', () => {
    const state = getDigitButtonState(
      5,
      makeContext({
        highlightedDigit: 5,
        isSolving: true,
        digitCounts: [0, 0, 0, 0, 9, 0, 0, 0, 0],
      }),
    )
    expect(state.className).toBe(`control-digit-btn ${DISABLED}`)
  })

  it('uses the selected class for a highlighted, enabled digit', () => {
    const state = getDigitButtonState(5, makeContext({ highlightedDigit: 5 }))
    expect(state.className).toBe(`control-digit-btn ${SELECTED}`)
  })

  it('uses the base class when nothing special applies', () => {
    expect(getDigitButtonState(5, makeContext()).className).toBe(`control-digit-btn ${BASE}`)
  })

  it('uses the accent badge when the digit is complete and the light badge otherwise', () => {
    const complete = getDigitButtonState(
      1,
      makeContext({ digitCounts: [9, 0, 0, 0, 0, 0, 0, 0, 0] }),
    )
    expect(complete.badgeClassName).toBe('digit-remaining-badge bg-accent text-btn-active-text')
    const incomplete = getDigitButtonState(
      1,
      makeContext({ digitCounts: [8, 0, 0, 0, 0, 0, 0, 0, 0] }),
    )
    expect(incomplete.badgeClassName).toBe('digit-remaining-badge bg-accent-light text-accent')
  })

  it('formats the aria label with the digit and its remaining count', () => {
    expect(
      getDigitButtonState(7, makeContext({ digitCounts: [0, 0, 0, 0, 0, 0, 4, 0, 0] })).ariaLabel,
    ).toBe('Enter 7, 5 remaining')
  })
})

describe('areControlsPropsEqual', () => {
  describe('equality branches', () => {
    it('returns true for two distinct but fully equal props objects', () => {
      expect(areControlsPropsEqual(makeProps(), makeProps())).toBe(true)
    })

    it('returns true when digitCounts is a different reference with identical contents', () => {
      const prev = makeProps({ digitCounts: [1, 2, 3, 0, 0, 0, 0, 0, 0] })
      const next = makeProps({ digitCounts: [1, 2, 3, 0, 0, 0, 0, 0, 0] })
      expect(areControlsPropsEqual(prev, next)).toBe(true)
    })

    it('returns true when the optional isSolving is undefined on both sides', () => {
      const prev = makeProps()
      delete (prev as Partial<ControlsProps>).isSolving
      const next = makeProps()
      delete (next as Partial<ControlsProps>).isSolving
      expect(areControlsPropsEqual(prev, next)).toBe(true)
    })
  })

  describe('primitive inequality branches', () => {
    const primitiveCases: { name: string; next: Partial<ControlsProps> }[] = [
      { name: 'notesMode', next: { notesMode: true } },
      { name: 'eraseMode', next: { eraseMode: true } },
      { name: 'canUndo', next: { canUndo: true } },
      { name: 'canRedo', next: { canRedo: true } },
      { name: 'highlightedDigit (null to a digit)', next: { highlightedDigit: 3 } },
      { name: 'highlightedDigit (digit to another digit)', next: { highlightedDigit: 1 } },
      { name: 'isComplete', next: { isComplete: true } },
      { name: 'isSolving', next: { isSolving: true } },
    ]

    for (const { name, next } of primitiveCases) {
      it(`returns false when only ${name} changed`, () => {
        const prev = makeProps({ ...(next.highlightedDigit === 1 ? { highlightedDigit: 3 } : {}) })
        expect(areControlsPropsEqual(prev, makeProps(next))).toBe(false)
      })
    }

    it('returns false when isSolving changes from undefined to false', () => {
      const prev = makeProps()
      delete (prev as Partial<ControlsProps>).isSolving
      expect(areControlsPropsEqual(prev, makeProps({ isSolving: false }))).toBe(false)
    })
  })

  describe('digitCounts element-by-element comparison', () => {
    it('returns false when one element changes', () => {
      const prev = makeProps({ digitCounts: [1, 2, 3, 0, 0, 0, 0, 0, 0] })
      const next = makeProps({ digitCounts: [1, 2, 4, 0, 0, 0, 0, 0, 0] })
      expect(areControlsPropsEqual(prev, next)).toBe(false)
    })

    it('returns false when the last element changes', () => {
      const prev = makeProps({ digitCounts: [0, 0, 0, 0, 0, 0, 0, 0, 8] })
      const next = makeProps({ digitCounts: [0, 0, 0, 0, 0, 0, 0, 0, 9] })
      expect(areControlsPropsEqual(prev, next)).toBe(false)
    })

    it('returns false when the arrays have different lengths', () => {
      const prev = makeProps({ digitCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0] })
      const next = makeProps({ digitCounts: [0, 0, 0, 0, 0, 0, 0, 0] })
      expect(areControlsPropsEqual(prev, next)).toBe(false)
      expect(areControlsPropsEqual(next, prev)).toBe(false)
    })
  })

  describe('callback inequality branches', () => {
    const callbackCases: { name: keyof ControlsProps; next: () => void }[] = [
      { name: 'onNotesToggle', next: () => {} },
      { name: 'onDigit', next: () => {} },
      { name: 'onEraseMode', next: () => {} },
      { name: 'onUndo', next: () => {} },
      { name: 'onRedo', next: () => {} },
    ]

    for (const { name, next } of callbackCases) {
      it(`returns false when only ${name} changed`, () => {
        const prev = makeProps()
        const nextProps = makeProps({ [name]: next } as Partial<ControlsProps>)
        expect(areControlsPropsEqual(prev, nextProps)).toBe(false)
      })
    }
  })
})
