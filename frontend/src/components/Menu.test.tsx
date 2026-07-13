import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, afterEach } from 'vitest'
import Menu from './Menu'
import { dispatchKeyDown } from '../test-utils'

type MenuProps = React.ComponentProps<typeof Menu>

function defaultProps(overrides: Partial<MenuProps> = {}): MenuProps {
  return {
    isOpen: true,
    onClose: vi.fn(),
    mode: 'light',
    colorTheme: 'tokyonight',
    fontSize: 'medium',
    onSetMode: vi.fn(),
    onSetColorTheme: vi.fn(),
    onSetFontSize: vi.fn(),
    onCopyDebugInfo: vi.fn(),
    ...overrides,
  }
}

function renderMenu(props: Partial<MenuProps> = {}) {
  return render(
    <MemoryRouter>
      <Menu {...defaultProps(props)} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

describe('Menu escape key handling', () => {
  it('calls onClose when Escape is pressed while the menu is open', () => {
    const onClose = vi.fn()
    renderMenu({ isOpen: true, onClose })

    dispatchKeyDown({ key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the menu is closed', () => {
    const onClose = vi.fn()
    renderMenu({ isOpen: false, onClose })

    dispatchKeyDown({ key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call onClose for non-Escape keys', () => {
    const onClose = vi.fn()
    renderMenu({ isOpen: true, onClose })

    dispatchKeyDown({ key: 'Enter' })

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Menu callback wiring', () => {
  it('calls onClose when the header close button is clicked', () => {
    const onClose = vi.fn()
    renderMenu({ onClose })

    const menuLabel = screen.getByText('Menu')
    const closeButton = menuLabel.parentElement!.querySelector('button')!
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    renderMenu({ onClose })

    const backdrop = document.querySelector('[data-overlay-backdrop]')!
    fireEvent.click(backdrop)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onCopyDebugInfo and onClose when Copy Debug Info is clicked', () => {
    const onCopyDebugInfo = vi.fn()
    const onClose = vi.fn()
    renderMenu({ onCopyDebugInfo, onClose })

    fireEvent.click(screen.getByText('Copy Debug Info'))

    expect(onCopyDebugInfo).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onSetColorTheme when a color theme swatch is clicked', () => {
    const onSetColorTheme = vi.fn()
    renderMenu({ onSetColorTheme })

    fireEvent.click(screen.getByTitle('Dracula'))

    expect(onSetColorTheme).toHaveBeenCalledWith('dracula')
  })

  it('calls onFeatureRequest and onClose when Request Feature is clicked', () => {
    const onFeatureRequest = vi.fn()
    const onClose = vi.fn()
    renderMenu({ onFeatureRequest, onClose })

    fireEvent.click(screen.getByRole('button', { name: 'Request Feature' }))

    expect(onFeatureRequest).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
