import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type PostMessage = (msg: unknown) => void

interface WorkerGlobalMock {
  postMessage: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  onmessage: ((e: { data: unknown }) => void) | null
}

// Shared sink for worker -> main messages captured during each test.
let posted: unknown[] = []
let mockWasmApi: { findNextMove: ReturnType<typeof vi.fn>; solveAll: ReturnType<typeof vi.fn> }

// Mutates the jsdom global (self === globalThis === window) so the worker
// module can attach its onmessage handler and post messages back.
function installWorkerGlobals(): WorkerGlobalMock {
  const sink: WorkerGlobalMock = {
    postMessage: vi.fn((msg: unknown) => {
      posted.push(msg)
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
  let sink: WorkerGlobalMock

  beforeEach(() => {
    posted = []
    sink = installWorkerGlobals()
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
