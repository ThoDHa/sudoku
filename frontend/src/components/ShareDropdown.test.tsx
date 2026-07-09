import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import ShareDropdown from './ShareDropdown'

function renderDropdown(overrides: Partial<Parameters<typeof ShareDropdown>[0]> = {}) {
  const props = {
    isOpen: false,
    onToggle: vi.fn(),
    onSharePuzzle: vi.fn(),
    onShareState: vi.fn(),
    dropdownRef: createRef<HTMLDivElement>(),
    ...overrides,
  }
  render(<ShareDropdown {...props} />)
  return props
}

describe('ShareDropdown', () => {
  it('hides both options until opened', () => {
    renderDropdown({ isOpen: false })
    expect(screen.queryByText('Share puzzle')).toBeNull()
    expect(screen.queryByText('Share my current game')).toBeNull()
  })

  it('toggles open when the share button is clicked', () => {
    const props = renderDropdown({ isOpen: false })
    fireEvent.click(screen.getByTitle('Share the puzzle or your current game'))
    expect(props.onToggle).toHaveBeenCalledTimes(1)
  })

  it('shares the puzzle and closes when the first option is chosen', () => {
    const props = renderDropdown({ isOpen: true })
    fireEvent.click(screen.getByText('Share puzzle'))
    expect(props.onSharePuzzle).toHaveBeenCalledTimes(1)
    expect(props.onShareState).not.toHaveBeenCalled()
    expect(props.onToggle).toHaveBeenCalledTimes(1)
  })

  it('shares the current game and closes when the second option is chosen', () => {
    const props = renderDropdown({ isOpen: true })
    fireEvent.click(screen.getByText('Share my current game'))
    expect(props.onShareState).toHaveBeenCalledTimes(1)
    expect(props.onSharePuzzle).not.toHaveBeenCalled()
    expect(props.onToggle).toHaveBeenCalledTimes(1)
  })
})
