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

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

// The light-only stubMatchMedia above cannot tell which query string the
// provider subscribed to, so a mutant that swaps the query goes unnoticed.
// This stub answers per query and keeps change listeners per query string,
// letting tests pin the actual subscription and unsubscribe behaviour.
function stubSystemMatchMedia() {
  const listeners = new Map<string, Set<(e: MediaQueryListEvent) => void>>()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => {
      let queryListeners = listeners.get(query)
      if (!queryListeners) {
        queryListeners = new Set()
        listeners.set(query, queryListeners)
      }
      return {
        matches: query === COLOR_SCHEME_QUERY,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            queryListeners.add(cb)
          }
        }),
        removeEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            queryListeners.delete(cb)
          }
        }),
        dispatchEvent: vi.fn(),
      }
    }),
  })
  return {
    fireChange: (query: string, matches: boolean) => {
      listeners.get(query)?.forEach((cb) => cb({ matches } as MediaQueryListEvent))
    },
    changeListenerCount: (query: string) => listeners.get(query)?.size ?? 0,
  }
}

// Each provider run writes CSS variables and classes onto the shared jsdom
// documentElement, which persists across tests; clear it so assertions see
// only what the provider under test applied.
function clearAppliedThemeState() {
  document.documentElement.style.cssText = ''
  document.documentElement.className = ''
}

function mountProvider() {
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
  return { ctx: () => ctx!, unmount }
}

describe('ThemeProvider color palette application', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAppliedThemeState()
    stubMatchMedia()
  })

  it('applies the stored color theme palette instead of the default', () => {
    localStorage.setItem('colorTheme', 'dracula')

    render(<ThemeProvider>child</ThemeProvider>)

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#f8f8f2')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#bd93f9')
  })

  it('re-applies the palette when the color theme changes after mount', () => {
    const { ctx, unmount } = mountProvider()

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#e1e2e7')

    act(() => ctx().setColorTheme('nord'))

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#eceff4')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#5e81ac')
    unmount()
  })

  it('applies the dark palette when the resolved mode is dark', () => {
    localStorage.setItem('colorTheme', 'dracula')
    localStorage.setItem('modePreference', 'dark')

    render(<ThemeProvider>child</ThemeProvider>)

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#282a36')
    expect(document.documentElement.style.getPropertyValue('--btn-bg')).toBe('#343746')
  })
})

describe('ThemeProvider dark mode class', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAppliedThemeState()
    stubMatchMedia()
  })

  it('adds the dark class when the resolved mode is dark', () => {
    localStorage.setItem('modePreference', 'dark')

    render(<ThemeProvider>child</ThemeProvider>)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes the dark class when the mode resolves back to light', () => {
    localStorage.setItem('modePreference', 'dark')
    const { ctx, unmount } = mountProvider()

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => ctx().setMode('light'))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    unmount()
  })
})

describe('ThemeProvider explicit mode resolution', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAppliedThemeState()
  })

  it('resolves an explicit light preference even when the system scheme is dark', () => {
    stubSystemMatchMedia()
    localStorage.setItem('modePreference', 'light')

    const { ctx, unmount } = mountProvider()

    expect(ctx().mode).toBe('light')
    unmount()
  })

  it('resolves an explicit dark preference even when the system scheme is light', () => {
    stubMatchMedia()
    localStorage.setItem('modePreference', 'dark')

    const { ctx, unmount } = mountProvider()

    expect(ctx().mode).toBe('dark')
    unmount()
  })
})

describe('ThemeProvider system scheme query subscription', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAppliedThemeState()
  })

  it('initializes the system mode from the dark color-scheme query', () => {
    stubSystemMatchMedia()

    const { ctx, unmount } = mountProvider()

    expect(ctx().mode).toBe('dark')
    unmount()
  })

  it('re-resolves the mode when the color-scheme query flips', () => {
    const media = stubSystemMatchMedia()
    const { ctx, unmount } = mountProvider()

    expect(ctx().mode).toBe('dark')

    act(() => media.fireChange(COLOR_SCHEME_QUERY, false))

    expect(ctx().mode).toBe('light')
    unmount()
  })

  it('unsubscribes from the color-scheme query when the provider unmounts', () => {
    const media = stubSystemMatchMedia()
    const { unmount } = mountProvider()

    expect(media.changeListenerCount(COLOR_SCHEME_QUERY)).toBe(1)

    unmount()

    expect(media.changeListenerCount(COLOR_SCHEME_QUERY)).toBe(0)
  })
})

describe('ThemeProvider stored mode preference', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAppliedThemeState()
    stubMatchMedia()
  })

  it('restores a stored light preference', () => {
    localStorage.setItem('modePreference', 'light')

    const { ctx, unmount } = mountProvider()

    expect(ctx().modePreference).toBe('light')
    unmount()
  })

  it('keeps a stored system preference ahead of the legacy mode key', () => {
    localStorage.setItem('modePreference', 'system')
    localStorage.setItem('mode', 'light')

    const { ctx, unmount } = mountProvider()

    expect(ctx().modePreference).toBe('system')
    unmount()
  })

  it('migrates a legacy dark mode key', () => {
    localStorage.setItem('mode', 'dark')

    const { ctx, unmount } = mountProvider()

    expect(ctx().modePreference).toBe('dark')
    unmount()
  })
})

describe('ThemeProvider storage persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAppliedThemeState()
    stubMatchMedia()
  })

  it('persists the resolved theme state under the documented keys and drops the legacy key', () => {
    localStorage.setItem('mode', 'light')

    render(<ThemeProvider>child</ThemeProvider>)

    expect(localStorage.getItem('colorTheme')).toBe('tokyonight')
    expect(localStorage.getItem('modePreference')).toBe('light')
    expect(localStorage.getItem('fontSize')).toBe('xl')
    expect(localStorage.getItem('mode')).toBeNull()
  })
})

const FONT_SIZE_VAR_EXPECTATIONS: Array<{ tier: string; vars: Record<string, string> }> = [
  {
    tier: 'xs',
    vars: {
      '--cell-font-size': '0.875rem',
      '--cell-font-size-sm': '1rem',
      '--cell-font-size-md': '1.125rem',
      '--candidate-font-size': '6px',
      '--candidate-font-size-sm': '7px',
      '--candidate-font-size-md': '8px',
      '--control-btn-size': '2.25rem',
      '--control-font-size': '0.875rem',
    },
  },
  {
    tier: 'small',
    vars: {
      '--cell-font-size': '1rem',
      '--cell-font-size-sm': '1.125rem',
      '--cell-font-size-md': '1.25rem',
      '--candidate-font-size': '7px',
      '--candidate-font-size-sm': '8px',
      '--candidate-font-size-md': '10px',
      '--control-btn-size': '2.5rem',
      '--control-font-size': '1rem',
    },
  },
  {
    tier: 'medium',
    vars: {
      '--cell-font-size': '1.125rem',
      '--cell-font-size-sm': '1.375rem',
      '--cell-font-size-md': '1.625rem',
      '--candidate-font-size': '8px',
      '--candidate-font-size-sm': '9px',
      '--candidate-font-size-md': '11px',
      '--control-btn-size': '3rem',
      '--control-font-size': '1.125rem',
    },
  },
  {
    tier: 'large',
    vars: {
      '--cell-font-size': '1.375rem',
      '--cell-font-size-sm': '1.625rem',
      '--cell-font-size-md': '2rem',
      '--candidate-font-size': '9px',
      '--candidate-font-size-sm': '11px',
      '--candidate-font-size-md': '13px',
      '--control-btn-size': '3.5rem',
      '--control-font-size': '1.375rem',
    },
  },
  {
    tier: 'xl',
    vars: {
      '--cell-font-size': '1.625rem',
      '--cell-font-size-sm': '1.875rem',
      '--cell-font-size-md': '2.25rem',
      '--candidate-font-size': '10px',
      '--candidate-font-size-sm': '12px',
      '--candidate-font-size-md': '14px',
      '--control-btn-size': '4rem',
      '--control-font-size': '1.5rem',
    },
  },
]

describe('ThemeProvider font size variable sets', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAppliedThemeState()
    stubMatchMedia()
  })

  it.each(FONT_SIZE_VAR_EXPECTATIONS)(
    'applies the $tier font size variable set',
    ({ tier, vars }) => {
      localStorage.setItem('fontSize', tier)

      render(<ThemeProvider>child</ThemeProvider>)

      for (const [name, value] of Object.entries(vars)) {
        expect(document.documentElement.style.getPropertyValue(name)).toBe(value)
      }
    },
  )
})
