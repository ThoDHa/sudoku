import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface WorkerGlobalMock {
  postMessage: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  onmessage: ((e: { data: unknown }) => void) | null
}

interface PostedMessage {
  type: string
  id?: string
  success?: boolean
  error?: string
  data?: unknown
}

// Shared sink for worker -> main messages captured during each test.
let posted: PostedMessage[] = []
let mockWasmApi: { findNextMove: ReturnType<typeof vi.fn>; solveAll: ReturnType<typeof vi.fn> }

// Mutates the jsdom global (self === globalThis === window) so the worker
// module can attach its onmessage handler and post messages back.
function installWorkerGlobals(): WorkerGlobalMock {
  const sink: WorkerGlobalMock = {
    postMessage: vi.fn((msg: unknown) => {
      posted.push(msg as PostedMessage)
    }),
    close: vi.fn(),
    onmessage: null,
  }
  Object.defineProperty(globalThis, 'postMessage', {
    value: sink.postMessage,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'close', {
    value: sink.close,
    configurable: true,
    writable: true,
  })
  return sink
}

function installWasmRuntimeMocks(): {
  importScripts: ReturnType<typeof vi.fn>
  fetchMock: ReturnType<typeof vi.fn>
} {
  const importScripts = vi.fn()
  Object.defineProperty(globalThis, 'importScripts', {
    value: importScripts,
    configurable: true,
    writable: true,
  })

  mockWasmApi = {
    findNextMove: vi.fn(() => ({
      move: { technique: 'naked-single' },
      board: { cells: [1, 2], candidates: [[], []] },
      solved: false,
    })),
    solveAll: vi.fn(() => ({
      moves: [],
      solved: true,
      finalBoard: [1, 2, 3],
    })),
  }

  // The Go constructor mock sets the global SudokuWasm synchronously inside
  // run(), so the worker's ready-poll resolves on its immediate check.
  class GoMock {
    importObject = {}
    run() {
      Object.defineProperty(globalThis, 'SudokuWasm', {
        value: mockWasmApi,
        configurable: true,
        writable: true,
      })
    }
  }
  Object.defineProperty(globalThis, 'Go', {
    value: GoMock,
    configurable: true,
    writable: true,
  })

  const okResponse = { ok: true } as Response
  const fetchMock = vi.fn().mockResolvedValue(okResponse)
  Object.defineProperty(globalThis, 'fetch', {
    value: fetchMock,
    configurable: true,
    writable: true,
  })

  const instantiateStreaming = vi.fn().mockResolvedValue({ instance: {} })
  Object.defineProperty(WebAssembly, 'instantiateStreaming', {
    value: instantiateStreaming,
    configurable: true,
    writable: true,
  })

  return { importScripts, fetchMock }
}

function clearWorkerGlobals() {
  posted = []
  vi.resetModules()
  for (const key of ['postMessage', 'close', 'importScripts', 'Go', 'SudokuWasm', 'fetch']) {
    try {
      Object.defineProperty(globalThis, key, { value: undefined, configurable: true })
    } catch {
      // ignore
    }
  }
}

function post(data: unknown) {
  const handler = (globalThis as unknown as WorkerGlobalMock).onmessage
  if (!handler) throw new Error('worker onmessage not attached')
  handler({ data })
}

describe('wasm.worker message protocol', () => {
  let sink: WorkerGlobalMock

  beforeEach(async () => {
    posted = []
    sink = installWorkerGlobals()
    installWasmRuntimeMocks()
  })

  afterEach(() => {
    clearWorkerGlobals()
  })

  async function loadWorker() {
    await import('./wasm.worker')
  }

  it('posts a loaded signal when the worker script finishes loading', async () => {
    await loadWorker()
    expect(sink.postMessage).toHaveBeenCalledWith({ type: 'loaded' })
  })

  it('responds with ready after a successful init message', async () => {
    await loadWorker()
    post({ type: 'init', id: 'init-1' })
    // initializeWasm resolves synchronously enough; await a microtask flush
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: 'ready', id: 'init-1' })
    })
  })

  it('returns a findNextMove result for an initialized worker', async () => {
    await loadWorker()
    post({ type: 'init', id: 'init-1' })
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: 'ready', id: 'init-1' })
    })
    posted.length = 0

    post({
      type: 'findNextMove',
      id: 'move-1',
      payload: { cells: [0], candidates: [[]], givens: [0] },
    })
    await vi.waitFor(() => {
      expect(posted).toContainEqual({
        type: 'result',
        id: 'move-1',
        success: true,
        data: {
          move: { technique: 'naked-single' },
          board: [1, 2],
          candidates: [[], []],
          solved: false,
        },
      })
    })
  })

  it('returns a solveAll result for an initialized worker', async () => {
    await loadWorker()
    post({ type: 'init', id: 'init-1' })
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: 'ready', id: 'init-1' })
    })
    posted.length = 0

    post({
      type: 'solveAll',
      id: 'solve-1',
      payload: { cells: [0], candidates: [[]], givens: [0] },
    })
    await vi.waitFor(() => {
      expect(posted).toContainEqual({
        type: 'result',
        id: 'solve-1',
        success: true,
        data: { moves: [], solved: true, finalBoard: [1, 2, 3] },
      })
    })
  })

  it('cleans up and closes the worker on a terminate message', async () => {
    await loadWorker()
    post({ type: 'init', id: 'init-1' })
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: 'ready', id: 'init-1' })
    })
    posted.length = 0

    post({ type: 'terminate', id: 'term-1' })
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: 'result', id: 'term-1', success: true })
    })
    expect(sink.close).toHaveBeenCalled()
  })

  it('replies with an error for an unknown message type', async () => {
    await loadWorker()
    post({ type: 'bogus', id: 'x-1' })
    await vi.waitFor(() => {
      expect(posted).toContainEqual({
        type: 'error',
        id: 'x-1',
        success: false,
        error: 'Unknown message type: bogus',
      })
    })
  })
})

describe('wasm.worker init failure', () => {
  beforeEach(() => {
    posted = []
    installWorkerGlobals()
    installWasmRuntimeMocks()
    // Force the "Go runtime not available" branch: remove Go after the mocks
    // installed it, so the worker sees typeof Go === 'undefined'.
    Object.defineProperty(globalThis, 'Go', { value: undefined, configurable: true })
  })

  afterEach(() => {
    clearWorkerGlobals()
  })

  it('posts an error when the Go runtime is unavailable', async () => {
    await import('./wasm.worker')
    post({ type: 'init', id: 'init-fail' })
    await vi.waitFor(() => {
      expect(posted).toContainEqual({
        type: 'error',
        id: 'init-fail',
        success: false,
        error: 'Go runtime not available after loading wasm_exec.js',
      })
    })
  })
})

describe('wasm.worker init polling timeout', () => {
  let sink: WorkerGlobalMock

  beforeEach(() => {
    posted = []
    vi.useFakeTimers()
    sink = installWorkerGlobals()
    installWasmRuntimeMocks()

    class SilentGoMock {
      importObject = {}
      run() {}
    }
    Object.defineProperty(globalThis, 'Go', {
      value: SilentGoMock,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'SudokuWasm', {
      value: undefined,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    clearWorkerGlobals()
  })

  it('posts an init-timeout error when SudokuWasm never appears', async () => {
    await import('./wasm.worker')
    posted.length = 0

    post({ type: 'init', id: 'init-timeout' })

    await vi.advanceTimersByTimeAsync(5100)

    expect(posted).toContainEqual({
      type: 'error',
      id: 'init-timeout',
      success: false,
      error: 'WASM initialization timeout',
    })
    expect(sink.close).not.toHaveBeenCalled()
  })
})

describe('wasm.worker mutation kills', () => {
  let runtime: ReturnType<typeof installWasmRuntimeMocks>

  beforeEach(() => {
    posted = []
    installWorkerGlobals()
    runtime = installWasmRuntimeMocks()
  })

  afterEach(() => {
    clearWorkerGlobals()
  })

  async function load() {
    await import('./wasm.worker')
  }

  async function waitForReady(id: string) {
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: 'ready', id })
    })
  }

  const streamingMock = () =>
    WebAssembly.instantiateStreaming as unknown as ReturnType<typeof vi.fn>

  it('does not re-instantiate WASM on a second init when wasmApi is already set (L129)', async () => {
    await load()
    post({ type: 'init', id: 'i1' })
    await waitForReady('i1')

    posted.length = 0
    post({ type: 'init', id: 'i2' })
    await waitForReady('i2')

    expect(streamingMock()).toHaveBeenCalledTimes(1)
  })

  it('loads wasm_exec.js via importScripts with the exact path (L148)', async () => {
    await load()
    post({ type: 'init', id: 'i3' })
    await waitForReady('i3')

    expect(runtime.importScripts).toHaveBeenCalledWith('/wasm_exec.js')
  })

  it('fetches the WASM binary from the exact path (L174)', async () => {
    await load()
    post({ type: 'init', id: 'i4' })
    await waitForReady('i4')

    expect(runtime.fetchMock).toHaveBeenCalledWith('/sudoku.wasm')
  })

  it('posts an error when the WASM response is not ok (L175)', async () => {
    runtime.fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response)
    await load()
    posted.length = 0
    post({ type: 'init', id: 'i5' })

    await vi.waitFor(() => {
      expect(posted).toContainEqual({
        type: 'error',
        id: 'i5',
        success: false,
        error: 'Failed to fetch WASM: 500',
      })
    })
  })

  it('falls back to buffer instantiation when streaming is unavailable (L181)', async () => {
    Object.defineProperty(WebAssembly, 'instantiateStreaming', {
      value: undefined,
      configurable: true,
    })
    const instantiateMock = vi.fn().mockResolvedValue({ instance: {} })
    Object.defineProperty(WebAssembly, 'instantiate', {
      value: instantiateMock,
      configurable: true,
    })
    runtime.fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response)

    await load()
    post({ type: 'init', id: 'i6' })
    await waitForReady('i6')

    expect(instantiateMock).toHaveBeenCalledTimes(1)
  })

  it('fetches wasm_exec.js fallback when importScripts throws (L156)', async () => {
    runtime.importScripts.mockImplementation(() => {
      throw new Error('importScripts denied')
    })
    runtime.fetchMock.mockImplementation(
      async () => ({ ok: true, text: async () => '' }) as Response,
    )

    await load()
    posted.length = 0
    post({ type: 'init', id: 'i7' })

    await vi.waitFor(() => {
      expect(runtime.fetchMock).toHaveBeenCalledWith('/wasm_exec.js')
    })
  })

  it('auto-initializes on findNextMove when wasmApi is null (L252)', async () => {
    await load()
    posted.length = 0
    post({
      type: 'findNextMove',
      id: 'fnm-1',
      payload: { cells: [0], candidates: [[]], givens: [0] },
    })

    await vi.waitFor(() => {
      expect(posted.find((m) => m.type === 'result' && m.id === 'fnm-1')).toBeTruthy()
    })
    expect(posted.find((m) => m.type === 'error')).toBeUndefined()
  })

  it('auto-initializes on solveAll when wasmApi is null (L281)', async () => {
    await load()
    posted.length = 0
    post({
      type: 'solveAll',
      id: 'sa-1',
      payload: { cells: [0], candidates: [[]], givens: [0] },
    })

    await vi.waitFor(() => {
      expect(posted.find((m) => m.type === 'result' && m.id === 'sa-1')).toBeTruthy()
    })
    expect(posted.find((m) => m.type === 'error')).toBeUndefined()
  })
})

describe('wasm.worker polling timeout boundary', () => {
  beforeEach(() => {
    posted = []
    vi.useFakeTimers()
    installWorkerGlobals()
    installWasmRuntimeMocks()

    class SilentGoMock {
      importObject = {}
      run() {}
    }
    Object.defineProperty(globalThis, 'Go', { value: SilentGoMock, configurable: true })
    Object.defineProperty(globalThis, 'SudokuWasm', { value: undefined, configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    clearWorkerGlobals()
  })

  it('rejects exactly at maxAttempts, not before and not after (L213)', async () => {
    await import('./wasm.worker')
    posted.length = 0

    post({ type: 'init', id: 'tb-1' })

    // 49 ticks (4900ms): no timeout yet under the original >= comparison
    await vi.advanceTimersByTimeAsync(4900)
    expect(posted.find((m) => m.type === 'error')).toBeUndefined()

    // tick 50 (5000ms total): original rejects; the > mutant would still be waiting
    await vi.advanceTimersByTimeAsync(100)
    expect(posted).toContainEqual({
      type: 'error',
      id: 'tb-1',
      success: false,
      error: 'WASM initialization timeout',
    })
  })
})

describe('wasm.worker mutation-kill: parallel init and edge paths', () => {
  let runtime: ReturnType<typeof installWasmRuntimeMocks>

  beforeEach(() => {
    posted = []
    installWorkerGlobals()
    runtime = installWasmRuntimeMocks()
  })

  afterEach(() => {
    clearWorkerGlobals()
  })

  async function load() {
    await import('./wasm.worker')
  }

  async function waitForReady(id: string) {
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: 'ready', id })
    })
  }

  const streamingMock = () =>
    WebAssembly.instantiateStreaming as unknown as ReturnType<typeof vi.fn>

  it('deduplicates concurrent init messages to a single WASM instantiation (L133,L137)', async () => {
    await load()
    // Send two init messages back-to-back, BEFORE either resolves. The original
    // returns the in-flight initPromise to the second caller; the `if (false)` and
    // empty-block mutants create a second init promise, invoking instantiateStreaming twice.
    post({ type: 'init', id: 'init-a' })
    post({ type: 'init', id: 'init-b' })

    await waitForReady('init-a')
    await waitForReady('init-b')

    expect(streamingMock()).toHaveBeenCalledTimes(1)
  })

  it('uses fetch fallback when importScripts is undefined (L145)', async () => {
    // Remove importScripts entirely. The original enters the fallback fetch path
    // (loadedWasmExec stays false); the `= true` mutant skips the fallback, leaving
    // Go undefined so init fails.
    Object.defineProperty(globalThis, 'importScripts', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    runtime.fetchMock.mockImplementation(async (url: string) => {
      if (url === '/wasm_exec.js') return { ok: true, text: async () => '' } as Response
      return { ok: true } as Response
    })

    await load()
    posted.length = 0
    post({ type: 'init', id: 'i-fb' })

    await waitForReady('i-fb')
    expect(runtime.fetchMock).toHaveBeenCalledWith('/wasm_exec.js')
  })

  it('does not throw when wasm_exec.js fallback response is ok (L159)', async () => {
    // Make importScripts throw so the fallback fetch path runs. The mutant
    // `if (resp.ok)` inverts the check and throws on a successful response.
    runtime.importScripts.mockImplementation(() => {
      throw new Error('denied')
    })
    runtime.fetchMock.mockImplementation(async (url: string) => {
      if (url === '/wasm_exec.js') return { ok: true, text: async () => '' } as Response
      return { ok: true } as Response
    })

    await load()
    posted.length = 0
    post({ type: 'init', id: 'i-ok' })

    await waitForReady('i-ok')
  })

  it('throws when wasm_exec.js fallback response is not ok (L159,L160)', async () => {
    runtime.importScripts.mockImplementation(() => {
      throw new Error('denied')
    })
    runtime.fetchMock.mockImplementation(async (url: string) => {
      if (url === '/wasm_exec.js') return { ok: false, status: 503 } as Response
      return { ok: true } as Response
    })

    await load()
    posted.length = 0
    post({ type: 'init', id: 'i-bad' })

    await vi.waitFor(() => {
      expect(posted).toContainEqual({
        type: 'error',
        id: 'i-bad',
        success: false,
        error: 'Failed to fetch wasm_exec.js: 503',
      })
    })
  })

  it('throws "WASM API not available" when init fails before findNextMove (L257,L258)', async () => {
    // Force initialization to fail by removing Go after the mocks install it,
    // so initializeWasm rejects and wasmApi stays null when findNextMove runs.
    runtime.importScripts.mockImplementation(() => {
      throw new Error('denied')
    })
    runtime.fetchMock.mockImplementation(async () => {
      return { ok: true, text: async () => '' } as Response
    })
    Object.defineProperty(globalThis, 'Go', { value: undefined, configurable: true })

    await load()
    posted.length = 0
    post({ type: 'findNextMove', id: 'fnm-fail', payload: { cells: [0], candidates: [[]], givens: [0] } })

    await vi.waitFor(() => {
      const err = posted.find((m) => m.type === 'error' && m.id === 'fnm-fail')
      expect(err).toBeDefined()
      // The original throws the exact 'WASM API not available...' message after init failure.
      // The `if (false)` mutant would crash on null.findNextMove, producing a different error.
      expect(err?.error).toBe('Go runtime not available after loading wasm_exec.js')
    })
  })

  it('throws "WASM API not available" when init fails before solveAll (L286,L287)', async () => {
    runtime.importScripts.mockImplementation(() => {
      throw new Error('denied')
    })
    runtime.fetchMock.mockImplementation(async () => {
      return { ok: true, text: async () => '' } as Response
    })
    Object.defineProperty(globalThis, 'Go', { value: undefined, configurable: true })

    await load()
    posted.length = 0
    post({ type: 'solveAll', id: 'sa-fail', payload: { cells: [0], candidates: [[]], givens: [0] } })

    await vi.waitFor(() => {
      const err = posted.find((m) => m.type === 'error' && m.id === 'sa-fail')
      expect(err).toBeDefined()
      expect(err?.error).toBe('Go runtime not available after loading wasm_exec.js')
    })
  })
})
