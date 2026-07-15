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

describe('ThemeProvider preference restore', () => {
  beforeEach(() => {
    localStorage.clear()
    stubMatchMedia()
  })

  it('restores a valid modePreference from localStorage', () => {
    localStorage.setItem('modePreference', 'dark')

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

    expect(ctx!.modePreference).toBe('dark')
    unmount()
  })

  it('migrates the legacy mode key to modePreference', () => {
    localStorage.setItem('mode', 'light')

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

    expect(ctx!.modePreference).toBe('light')
    unmount()
  })

  it('responds to system color-scheme changes', () => {
    let trigger: ((e: MediaQueryListEvent) => void) | null = null
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') trigger = cb
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

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

    expect(ctx!.mode).toBe('light')

    act(() => {
      trigger!({ matches: true } as MediaQueryListEvent)
    })

    expect(ctx!.mode).toBe('dark')

    act(() => {
      trigger!({ matches: false } as MediaQueryListEvent)
    })

    expect(ctx!.mode).toBe('light')
    unmount()
  })

  it('defaults to system mode when modePreference holds an unrecognized string', () => {
    localStorage.setItem('modePreference', 'banana')

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
    unmount()
  })

  it('defaults to system when the legacy mode key holds an unrecognized string', () => {
    localStorage.setItem('mode', 'banana')

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
    unmount()
  })

  it('resolves the system mode as dark when matchMedia reports dark', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

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

    expect(ctx!.mode).toBe('dark')
    unmount()
  })

  it('falls back to the default font var set when setFontSize receives an unrecognized value', () => {
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

    expect(() => act(() => ctx!.setFontSize('nonexistent' as never))).not.toThrow()

    expect(document.documentElement.style.getPropertyValue('--cell-font-size')).toBe('1.625rem')
    unmount()
  })
})
