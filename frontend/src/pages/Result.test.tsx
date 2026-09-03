import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Result from './Result'

function renderResultAt(search: string) {
  render(
    <MemoryRouter initialEntries={[`/result?${search}`]}>
      <Result />
    </MemoryRouter>,
  )
}

describe('Result page guards URL params against NaN', () => {
  it('falls back to 0 for a non-numeric time param without rendering NaN', () => {
    renderResultAt('s=daily-2026-07-13&d=easy&t=abc&h=2&th=3')

    expect(screen.getByText(/Puzzle Complete/i)).toBeInTheDocument()

    const sharePreview = screen.getByText(/Share your result/i).parentElement
    expect(sharePreview?.textContent).not.toMatch(/NaN/)
  })

  it('falls back to 0 for non-numeric hints and technique-hints params', () => {
    renderResultAt('s=daily-2026-07-13&d=easy&t=1000&h=xyz&th=!@#')

    expect(screen.getByText(/Puzzle Complete/i)).toBeInTheDocument()

    const sharePreview = screen.getByText(/Share your result/i).parentElement
    expect(sharePreview?.textContent).not.toMatch(/NaN/)
  })

  it('renders valid numeric params without falling back', () => {
    renderResultAt('s=daily-2026-07-13&d=easy&t=65000&h=1&th=2')

    expect(screen.getByText(/Puzzle Complete/i)).toBeInTheDocument()

    const sharePreview = screen.getByText(/Share your result/i).parentElement
    expect(sharePreview?.textContent).toMatch(/1:05/)
    expect(sharePreview?.textContent).not.toMatch(/NaN/)
  })

  it('treats empty param values as 0 rather than NaN', () => {
    renderResultAt('s=daily-2026-07-13&d=easy&t=&h=&th=')

    expect(screen.getByText(/Puzzle Complete/i)).toBeInTheDocument()

    const sharePreview = screen.getByText(/Share your result/i).parentElement
    expect(sharePreview?.textContent).not.toMatch(/NaN/)
  })
})
