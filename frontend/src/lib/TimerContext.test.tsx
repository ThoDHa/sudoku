import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { TimerProvider, useTimer, useTimerControl, useTimerDisplay } from './TimerContext'
import { BackgroundManagerProvider } from './BackgroundManagerContext'

type TimerControl = ReturnType<typeof useTimerControl>

// jsdom does not implement window.matchMedia; BackgroundManagerProvider does
// not need it but keeping the stub matches the production browser environment.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// TimerProvider needs BackgroundManagerProvider as an ancestor; wrap once so
// each test mounts the hook consumer inside the full provider stack. Optional
// TimerProvider props let tests exercise the prop pass-through explicitly.
function mountWithProvider(
  node: React.ReactNode,
  timerProps: { autoStart?: boolean; pauseOnHidden?: boolean } = {},
) {
  return render(
    <BackgroundManagerProvider>
      <TimerProvider {...timerProps}>{node}</TimerProvider>
    </BackgroundManagerProvider>,
  )
}

describe('TimerContext defensive arms', () => {
  it('throws when useTimerControl is called outside a TimerProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Consumer = () => {
      useTimerControl()
      return null
    }

    expect(() => render(<Consumer />)).toThrow(
      'useTimerControl must be used within a TimerProvider',
    )
    spy.mockRestore()
  })

  it('throws when useTimerDisplay is called outside a TimerProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Consumer = () => {
      useTimerDisplay()
      return null
    }

    expect(() => render(<Consumer />)).toThrow(
      'useTimerDisplay must be used within a TimerProvider',
    )
    spy.mockRestore()
  })

  it('combines control and display values when useTimer is called inside a TimerProvider', () => {
    // Reads a value from each context so the combinator's spread of both
    // objects executes at least once under coverage.
    const Consumer = () => {
      const timer = useTimer()
      return (
        <div data-testid="consumer">
          {typeof timer.startTimer === 'function' ? 'has-start' : 'no-start'}
          {typeof timer.formatTime === 'function' ? 'has-format' : 'no-format'}
        </div>
      )
    }

    const { getByTestId } = mountWithProvider(<Consumer />)
    expect(getByTestId('consumer').textContent).toBe('has-starthas-format')
  })
})

// Captures the latest control-context value on every render so tests can call
// its action handlers and assert the rendered control state end to end.
let latestControl: TimerControl | undefined
function ControlCapture() {
  latestControl = useTimerControl()
  const runState = latestControl.isRunning ? 'running' : 'stopped'
  const pauseState = latestControl.isPausedDueToVisibility ? 'paused' : 'active'
  return <div data-testid="control">{`${runState}|${pauseState}`}</div>
}

describe('TimerProvider default props', () => {
  it('does not auto-start when autoStart is omitted (default false)', () => {
    const { getByTestId } = mountWithProvider(<ControlCapture />)
    expect(getByTestId('control').textContent).toBe('stopped|active')
  })

  it('auto-starts when autoStart is true', () => {
    const { getByTestId } = mountWithProvider(<ControlCapture />, { autoStart: true })
    expect(getByTestId('control').textContent).toBe('running|active')
  })

  it('pauses on window blur and resumes on focus when pauseOnHidden is omitted (default true)', () => {
    const { getByTestId } = mountWithProvider(<ControlCapture />)

    act(() => {
      latestControl!.startTimer()
    })
    expect(getByTestId('control').textContent).toBe('running|active')

    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(getByTestId('control').textContent).toBe('running|paused')

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(getByTestId('control').textContent).toBe('running|active')
  })

  it('stays active through window blur when pauseOnHidden is explicitly false', () => {
    const { getByTestId } = mountWithProvider(<ControlCapture />, { pauseOnHidden: false })

    act(() => {
      latestControl!.startTimer()
    })
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(getByTestId('control').textContent).toBe('running|active')
  })
})

describe('TimerProvider elapsed snapshot plumbing', () => {
  it('reflects setElapsedMs in getElapsedMs after the sync effect commits', () => {
    mountWithProvider(<ControlCapture />)

    act(() => {
      latestControl!.setElapsedMs(125000)
    })

    expect(latestControl!.getElapsedMs()).toBe(125000)
    expect(latestControl!.formatTime()).toBe('2:05')
  })
})
