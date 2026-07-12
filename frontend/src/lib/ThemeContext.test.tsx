import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { ThemeProvider, getValidFontSize, useTheme } from './ThemeContext'

describe('getValidFontSize', () => {
  it('passes each valid font size through unchanged', () => {
    expect(getValidFontSize('xs')).toBe('xs')
    expect(getValidFontSize('small')).toBe('small')
    expect(getValidFontSize('medium')).toBe('medium')
    expect(getValidFontSize('large')).toBe('large')
    expect(getValidFontSize('xl')).toBe('xl')
  })

  it('returns the default xl for null and empty input', () => {
    expect(getValidFontSize(null)).toBe('xl')
    expect(getValidFontSize('')).toBe('xl')
  })

  it('returns the default xl for an unrecognized string', () => {
    expect(getValidFontSize('huge')).toBe('xl')
    expect(getValidFontSize('XXL')).toBe('xl')
    expect(getValidFontSize('100')).toBe('xl')
  })
})

// jsdom does not implement matchMedia, which ThemeProvider uses to resolve the
// system color-scheme. Provide a stub so the provider mounts in tests.
function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('ThemeProvider fontSize restore safety', () => {
  beforeEach(() => {
    localStorage.clear()
    stubMatchMedia()
  })

  it('mounts without throwing and applies the default font size when localStorage holds an invalid value', () => {
    localStorage.setItem('fontSize', 'gigantic')

    render(<ThemeProvider>child</ThemeProvider>)

    expect(document.documentElement.classList.contains('font-xl')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--cell-font-size')).toBe('1.625rem')
  })

  it('applies the default font size when localStorage has no fontSize entry', () => {
    render(<ThemeProvider>child</ThemeProvider>)

    expect(document.documentElement.classList.contains('font-xl')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--cell-font-size')).toBe('1.625rem')
  })

  it('honors a valid stored fontSize instead of resetting it', () => {
    localStorage.setItem('fontSize', 'small')

    render(<ThemeProvider>child</ThemeProvider>)

    expect(document.documentElement.classList.contains('font-small')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--cell-font-size')).toBe('1rem')
  })
})

describe('ThemeProvider mode controls', () => {
  beforeEach(() => {
    localStorage.clear()
    stubMatchMedia()
  })

  it('toggleMode cycles through all three modes', () => {
    let ctx: ReturnType<typeof useTheme> | null = null
    const Consumer = () => {
      ctx = useTheme()
      return null
    }

    const { unmount } = render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )

    expect(ctx!.modePreference).toBe('system')

    act(() => ctx!.toggleMode())
    expect(ctx!.modePreference).toBe('light')

    act(() => ctx!.toggleMode())
    expect(ctx!.modePreference).toBe('dark')

    act(() => ctx!.toggleMode())
    expect(ctx!.modePreference).toBe('system')

    unmount()
  })

  it('setMode sets the mode preference directly', () => {
    let ctx: ReturnType<typeof useTheme> | null = null
    const Consumer = () => {
      ctx = useTheme()
      return null
    }

    const { unmount } = render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )

    act(() => ctx!.setMode('dark'))
    expect(ctx!.modePreference).toBe('dark')

    unmount()
  })
})

describe('useTheme', () => {
  it('throws when used outside a ThemeProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Consumer = () => {
      useTheme()
      return null
    }

    expect(() => render(<Consumer />)).toThrow('useTheme must be used within a ThemeProvider')
    spy.mockRestore()
  })
})
