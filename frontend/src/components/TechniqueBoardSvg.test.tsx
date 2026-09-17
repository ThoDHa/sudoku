import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TechniqueBoardSvg from './TechniqueBoardSvg'
import type { DiagramCell } from '../lib/techniques'

const CELL = 20

const makeCell = (overrides: Partial<DiagramCell> & { row: number; col: number }): DiagramCell => ({
  ...overrides,
})

/** Finds the grid rect for a board cell, excluding the outer border rect. */
const cellRect = (container: HTMLElement, row: number, col: number): SVGRectElement => {
  const rect = Array.from(container.querySelectorAll('rect')).find(
    (el) =>
      Number(el.getAttribute('x')) === col * CELL &&
      Number(el.getAttribute('y')) === row * CELL &&
      el.getAttribute('width') === String(CELL),
  )
  if (!rect) throw new Error(`No cell rect rendered for row ${row} col ${col}`)
  return rect
}

const textsAtFontSize = (container: HTMLElement, fontSize: string): SVGTextElement[] =>
  Array.from(container.querySelectorAll('text')).filter(
    (el) => el.getAttribute('font-size') === fontSize,
  )

const candidateText = (container: HTMLElement, digit: number): SVGTextElement => {
  const text = textsAtFontSize(container, '5').find((el) => el.textContent === String(digit))
  if (!text) throw new Error(`No candidate text rendered for digit ${digit}`)
  return text
}

const valueText = (container: HTMLElement, digit: number): SVGTextElement => {
  const text = textsAtFontSize(container, '12').find((el) => el.textContent === String(digit))
  if (!text) throw new Error(`No value text rendered for digit ${digit}`)
  return text
}

/** The candidate sub-grid centre for digit `d` inside the cell at (row, col). */
const expectedCandidateCentre = (row: number, col: number, d: number) => {
  const candidateSize = CELL / 3
  return {
    x: col * CELL + ((d - 1) % 3) * candidateSize + candidateSize / 2,
    y: row * CELL + Math.floor((d - 1) / 3) * candidateSize + candidateSize / 2 + 1.5,
  }
}

describe('TechniqueBoardSvg', () => {
  it('renders an 81-cell rect grid', () => {
    const { container } = render(<TechniqueBoardSvg cells={[]} />)
    const gridRects = Array.from(container.querySelectorAll('rect')).filter(
      (el) => el.getAttribute('width') === String(CELL),
    )
    expect(gridRects).toHaveLength(81)
  })

  it('fills cells absent from the cells list with the default background', () => {
    const { container } = render(<TechniqueBoardSvg cells={[]} />)
    expect(cellRect(container, 4, 4).getAttribute('fill')).toBe('var(--cell-bg)')
  })

  it('fills a primary-highlighted cell with the primary color', () => {
    const { container } = render(
      <TechniqueBoardSvg cells={[makeCell({ row: 0, col: 0, highlight: 'primary' })]} />,
    )
    expect(cellRect(container, 0, 0).getAttribute('fill')).toBe('var(--cell-primary)')
  })

  it('fills a secondary-highlighted cell with the secondary color', () => {
    const { container } = render(
      <TechniqueBoardSvg cells={[makeCell({ row: 1, col: 3, highlight: 'secondary' })]} />,
    )
    expect(cellRect(container, 1, 3).getAttribute('fill')).toBe('var(--cell-secondary)')
  })

  it('fills an elimination-highlighted cell with the accent light color', () => {
    const { container } = render(
      <TechniqueBoardSvg cells={[makeCell({ row: 8, col: 8, highlight: 'elimination' })]} />,
    )
    expect(cellRect(container, 8, 8).getAttribute('fill')).toBe('var(--accent-light)')
  })

  it('gives the fill precedence to the highlight when both cells of the same key are listed, last entry winning', () => {
    const { container } = render(
      <TechniqueBoardSvg
        cells={[
          makeCell({ row: 2, col: 2, highlight: 'primary' }),
          makeCell({ row: 2, col: 2, highlight: 'secondary' }),
        ]}
      />,
    )
    expect(cellRect(container, 2, 2).getAttribute('fill')).toBe('var(--cell-secondary)')
  })

  it('renders a given value centred in its cell with the given text color', () => {
    const { container } = render(
      <TechniqueBoardSvg cells={[makeCell({ row: 3, col: 5, value: 7 })]} />,
    )
    const text = valueText(container, 7)
    expect(Number(text.getAttribute('x'))).toBe(5 * CELL + CELL / 2)
    expect(Number(text.getAttribute('y'))).toBe(3 * CELL + CELL / 2 + 4)
    expect(text.getAttribute('fill')).toBe('var(--text-given)')
  })

  it('renders each candidate at its sub-grid position', () => {
    const { container } = render(
      <TechniqueBoardSvg
        cells={[makeCell({ row: 1, col: 2, candidates: [1, 2, 3, 4, 5, 6, 7, 8, 9] })]}
      />,
    )
    for (let d = 1; d <= 9; d += 1) {
      const text = candidateText(container, d)
      const expected = expectedCandidateCentre(1, 2, d)
      expect(Number(text.getAttribute('x'))).toBe(expected.x)
      expect(Number(text.getAttribute('y'))).toBe(expected.y)
    }
  })

  it('renders corner digits 1, 3, 7 and 9 in distinct sub-grid corners and 5 in the centre', () => {
    const { container } = render(
      <TechniqueBoardSvg cells={[makeCell({ row: 0, col: 0, candidates: [1, 3, 5, 7, 9] })]} />,
    )
    const centre = expectedCandidateCentre(0, 0, 5)
    expect(Number(candidateText(container, 5).getAttribute('x'))).toBe(centre.x)
    expect(Number(candidateText(container, 5).getAttribute('y'))).toBe(centre.y)
    expect(Number(candidateText(container, 1).getAttribute('y'))).toBeLessThan(centre.y)
    expect(Number(candidateText(container, 9).getAttribute('y'))).toBeGreaterThan(centre.y)
    expect(Number(candidateText(container, 3).getAttribute('x'))).toBeGreaterThan(centre.x)
    expect(Number(candidateText(container, 7).getAttribute('x'))).toBeLessThan(centre.x)
  })

  it('renders unhighlighted candidates with the candidate text color', () => {
    const { container } = render(
      <TechniqueBoardSvg cells={[makeCell({ row: 0, col: 0, candidates: [4] })]} />,
    )
    expect(candidateText(container, 4).getAttribute('fill')).toBe('var(--text-candidate)')
  })

  it('renders candidates of a primary-highlighted cell with the on-highlight color', () => {
    const { container } = render(
      <TechniqueBoardSvg
        cells={[makeCell({ row: 0, col: 0, candidates: [4], highlight: 'primary' })]}
      />,
    )
    expect(candidateText(container, 4).getAttribute('fill')).toBe('var(--text-on-highlight)')
  })

  it('renders candidates of a secondary-highlighted cell with the on-highlight color', () => {
    const { container } = render(
      <TechniqueBoardSvg
        cells={[makeCell({ row: 0, col: 0, candidates: [4], highlight: 'secondary' })]}
      />,
    )
    expect(candidateText(container, 4).getAttribute('fill')).toBe('var(--text-on-highlight)')
  })

  it('renders an eliminated candidate struck through in the error color regardless of highlight', () => {
    const { container } = render(
      <TechniqueBoardSvg
        cells={[
          makeCell({
            row: 0,
            col: 0,
            candidates: [4, 6],
            highlight: 'primary',
            eliminatedCandidates: [4],
          }),
        ]}
      />,
    )
    const eliminated = candidateText(container, 4)
    expect(eliminated.getAttribute('fill')).toBe('var(--error-text)')
    expect(eliminated.getAttribute('font-weight')).toBe('700')
    expect(eliminated.getAttribute('style')).toContain('line-through')
    expect(candidateText(container, 6).getAttribute('fill')).toBe('var(--text-on-highlight)')
  })

  it('keeps elimination-cell candidates in the candidate color by default', () => {
    const { container } = render(
      <TechniqueBoardSvg
        cells={[makeCell({ row: 0, col: 0, candidates: [4], highlight: 'elimination' })]}
      />,
    )
    expect(candidateText(container, 4).getAttribute('fill')).toBe('var(--text-candidate)')
  })

  it('renders elimination-cell candidates with the on-highlight color when highlightElimination is set', () => {
    const { container } = render(
      <TechniqueBoardSvg
        cells={[makeCell({ row: 0, col: 0, candidates: [4], highlight: 'elimination' })]}
        highlightElimination
      />,
    )
    expect(candidateText(container, 4).getAttribute('fill')).toBe('var(--text-on-highlight)')
  })

  it('renders neither values nor candidates for a cell with only a highlight', () => {
    const { container } = render(
      <TechniqueBoardSvg cells={[makeCell({ row: 0, col: 0, highlight: 'primary' })]} />,
    )
    expect(textsAtFontSize(container, '5')).toHaveLength(0)
    expect(textsAtFontSize(container, '12')).toHaveLength(0)
  })

  it('renders no candidate content for a cell absent from the cells list', () => {
    const { container } = render(<TechniqueBoardSvg cells={[]} />)
    expect(textsAtFontSize(container, '5')).toHaveLength(0)
    expect(textsAtFontSize(container, '12')).toHaveLength(0)
  })

  it('applies the className prop to the root svg', () => {
    const { container } = render(<TechniqueBoardSvg cells={[]} className="transition-opacity" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('transition-opacity')
  })
})
