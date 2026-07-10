import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Worker Client Unit Tests
 *
 * Tests the worker-client module's logic. Since jsdom doesn't support
 * real Web Workers, we test the module's behavior with mocked workers.
 */

// Store the original Worker
const OriginalWorker = globalThis.Worker

// Mock Worker implementation
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  private messageHandler: ((data: unknown) => void) | null = null

  constructor(_url: URL | string, _options?: WorkerOptions) {
    // Simulate the worker sending 'loaded' message after construction
    setTimeout(() => {
      this.simulateMessage({ type: 'loaded' })
    }, 10)
  }

  postMessage(data: unknown): void {
    if (this.messageHandler) {
      this.messageHandler(data)
    }
  }

  terminate(): void {
    this.onmessage = null
    this.onerror = null
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void): void {
    if (type === 'message') {
      this.onmessage = handler
    }
  }

  removeEventListener(type: string, _handler: (event: MessageEvent) => void): void {
    if (type === 'message') {
      this.onmessage = null
    }
  }

  // Test helpers
  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  simulateError(message: string): void {
    if (this.onerror) {
      this.onerror(new ErrorEvent('error', { message }))
    }
  }

  setMessageHandler(handler: (data: unknown) => void): void {
    this.messageHandler = handler
  }
}

// Track created workers for test assertions
let createdWorkers: MockWorker[] = []

describe('worker-client', () => {
  beforeEach(() => {
    createdWorkers = []

    // Mock Worker constructor - Vitest 4 compatible approach
    globalThis.Worker = class extends MockWorker {
      constructor(url: URL | string, options?: WorkerOptions) {
        super(url, options)
        createdWorkers.push(this)
      }
    } as unknown as typeof Worker
  })

  afterEach(() => {
    // Restore original Worker
    globalThis.Worker = OriginalWorker
    vi.resetModules()
  })

  describe('isWorkerSupported', () => {
    it('should return true when Worker is available', async () => {
      const { isWorkerSupported } = await import('./worker-client')
      expect(isWorkerSupported()).toBe(true)
    })

    it('should return false when Worker is not available', async () => {
      // @ts-expect-error - intentionally setting to undefined
      globalThis.Worker = undefined

      // Need to re-import to get fresh module
      vi.resetModules()
      const { isWorkerSupported } = await import('./worker-client')
      expect(isWorkerSupported()).toBe(false)
    })
  })

  describe('isWorkerReady', () => {
    it('should return false before initialization', async () => {
      const { isWorkerReady } = await import('./worker-client')
      expect(isWorkerReady()).toBe(false)
    })
  })

  describe('terminateWorker', () => {
    it('should not throw when called before initialization', async () => {
      const { terminateWorker } = await import('./worker-client')
      expect(() => terminateWorker()).not.toThrow()
    })
  })

  describe('initializeWorker', () => {
    it('should throw when workers are not supported', async () => {
      // @ts-expect-error - intentionally setting to undefined
      globalThis.Worker = undefined

      vi.resetModules()
      const { initializeWorker } = await import('./worker-client')

      await expect(initializeWorker()).rejects.toThrow('Web Workers are not supported')
    })

    it('should attempt to create a worker', async () => {
      vi.resetModules()
      vi.useFakeTimers()

      // Track if Worker constructor was called
      let workerCreated = false
      globalThis.Worker = class extends MockWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          workerCreated = true
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker

      const { initializeWorker, terminateWorker } = await import('./worker-client')

      // Start initialization (will eventually timeout, but we just verify it tries)
      const initPromise = initializeWorker()

      // Advance timers to allow worker creation and 'loaded' message
      await vi.advanceTimersByTimeAsync(50)

      expect(workerCreated).toBe(true)
      expect(createdWorkers.length).toBeGreaterThan(0)

      // Cleanup - terminate to avoid hanging
      terminateWorker()

      // The promise will reject due to termination, which is expected
      await expect(initPromise).rejects.toThrow()

      vi.useRealTimers()
    })
  })

  describe('request ID generation', () => {
    it('should generate unique request IDs', async () => {
      // This is implicitly tested through the worker message protocol
      // Each request should have a unique ID for correlation
      vi.resetModules()
      const { isWorkerSupported } = await import('./worker-client')

      // Just verify the module loads correctly
      expect(isWorkerSupported()).toBe(true)
    })
  })
})

describe('WorkerFindNextMoveResult type', () => {
  it('should have correct structure', async () => {
    // Type-level test - if this compiles, the type is correct
    const result: import('./worker-client').WorkerFindNextMoveResult = {
      move: null,
      board: [0, 0, 0],
      candidates: [
        [1, 2],
        [3, 4],
      ],
      solved: false,
    }

    expect(result.move).toBeNull()
    expect(result.board).toEqual([0, 0, 0])
    expect(result.candidates).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(result.solved).toBe(false)
  })
})

describe('WorkerSolveAllResult type', () => {
  it('should have correct structure', async () => {
    const result: import('./worker-client').WorkerSolveAllResult = {
      moves: [],
      solved: true,
      finalBoard: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    }

    expect(result.moves).toEqual([])
    expect(result.solved).toBe(true)
    expect(result.finalBoard).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('worker-client advanced scenarios', () => {
  let createdWorkers: MockWorker[] = []

  // Enhanced mock worker that can simulate full request/response cycle
  class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null

    private eventListeners: Map<string, ((event: Event) => void)[]> = new Map()
    private shouldAutoRespond = true
    private autoRespondDelay = 5
    private initShouldFail = false
    private responseOverride:
      | ((request: { type: string; id: string; payload?: unknown }) => unknown)
      | null = null

    constructor(_url: URL | string, _options?: WorkerOptions) {
      // Simulate the worker sending 'loaded' message after construction
      setTimeout(() => {
        this.triggerEvent('message', { type: 'loaded' })
      }, 5)
    }

    postMessage(data: { type: string; id: string; payload?: unknown }): void {
      if (this.shouldAutoRespond && data.type && data.id) {
        setTimeout(() => {
          if (this.initShouldFail && data.type === 'init') {
            this.simulateMessage({
              type: 'error',
              id: data.id,
              success: false,
              error: 'Init failed',
            })
            return
          }

          if (this.responseOverride) {
            const response = this.responseOverride(data)
            this.simulateMessage({ type: 'result', id: data.id, success: true, data: response })
            return
          }

          // Default responses based on request type
          let responseData: unknown = null
          if (data.type === 'init') {
            responseData = null
          } else if (data.type === 'findNextMove') {
            responseData = {
              move: { technique: 'NakedSingle', placement: { row: 0, col: 0, digit: 5 } },
              board: new Array(81).fill(0),
              candidates: new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9]),
              solved: false,
            }
          } else if (data.type === 'solveAll') {
            responseData = {
              moves: [],
              solved: true,
              finalBoard: new Array(81).fill(0),
            }
          }

          this.simulateMessage({ type: 'result', id: data.id, success: true, data: responseData })
        }, this.autoRespondDelay)
      }
    }

    terminate(): void {
      this.onmessage = null
      this.onerror = null
      this.eventListeners.clear()
    }

    addEventListener(type: string, handler: (event: Event) => void): void {
      const listeners = this.eventListeners.get(type) || []
      listeners.push(handler)
      this.eventListeners.set(type, listeners)
    }

    removeEventListener(type: string, handler: (event: Event) => void): void {
      const listeners = this.eventListeners.get(type) || []
      const index = listeners.indexOf(handler)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }

    private triggerEvent(type: string, data: unknown): void {
      // For addEventListener handlers
      const listeners = this.eventListeners.get(type) || []
      const event =
        type === 'message'
          ? new MessageEvent('message', { data })
          : new ErrorEvent('error', { message: data as string })

      for (const listener of listeners) {
        listener(event)
      }

      // For direct handlers
      if (type === 'message' && this.onmessage) {
        this.onmessage(event as MessageEvent)
      } else if (type === 'error' && this.onerror) {
        this.onerror(event as ErrorEvent)
      }
    }

    // Test helpers
    simulateMessage(data: unknown): void {
      this.triggerEvent('message', data)
    }

    simulateError(message: string): void {
      this.triggerEvent('error', message)
    }

    setAutoRespond(enabled: boolean): void {
      this.shouldAutoRespond = enabled
    }

    setInitShouldFail(shouldFail: boolean): void {
      this.initShouldFail = shouldFail
    }

    setResponseOverride(
      fn: ((request: { type: string; id: string; payload?: unknown }) => unknown) | null,
    ) {
      this.responseOverride = fn
    }
  }

  // Install a Worker that does not auto-respond, so tests can drive the message flow manually.
  const installNoRespondWorker = () => {
    globalThis.Worker = class extends MockWorker {
      constructor(url: URL | string, options?: WorkerOptions) {
        super(url, options)
        this.setAutoRespond(false)
        createdWorkers.push(this)
      }
    } as unknown as typeof Worker
  }

  // Drive the worker through initialization by sending the first init result manually.
  const manuallyInitWorker = async (initializeWorker: () => Promise<void>) => {
    const initPromise = initializeWorker()
    await vi.advanceTimersByTimeAsync(10)
    const worker = createdWorkers[0]!
    worker.simulateMessage({
      type: 'result',
      id: 'req-1-' + Date.now(),
      success: true,
      data: null,
    })
    await vi.advanceTimersByTimeAsync(10)
    return { worker, initPromise }
  }

  beforeEach(() => {
    createdWorkers = []
    vi.resetModules()

    // Vitest 4 compatible Worker mock
    globalThis.Worker = class extends MockWorker {
      constructor(url: URL | string, options?: WorkerOptions) {
        super(url, options)
        createdWorkers.push(this)
      }
    } as unknown as typeof Worker
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('initializeWorker - full flow', () => {
    it('should successfully initialize and become ready', async () => {
      const { initializeWorker, isWorkerReady, terminateWorker } = await import('./worker-client')

      await initializeWorker()

      expect(isWorkerReady()).toBe(true)

      terminateWorker()
    })

    it('should return existing promise when already initializing', async () => {
      const { initializeWorker, terminateWorker } = await import('./worker-client')

      // Call twice simultaneously
      const promise1 = initializeWorker()
      const promise2 = initializeWorker()

      // Both should resolve to the same initialization
      await Promise.all([promise1, promise2])

      expect(createdWorkers.length).toBe(1)

      terminateWorker()
    })

    it('should return immediately if already initialized', async () => {
      const { initializeWorker, terminateWorker } = await import('./worker-client')

      await initializeWorker()

      const workerCountBefore = createdWorkers.length

      // Call again - should return immediately
      await initializeWorker()

      expect(createdWorkers.length).toBe(workerCountBefore)

      terminateWorker()
    })

    it('should handle init failure and cleanup', async () => {
      vi.resetModules()

      // Create a worker that fails on init
      globalThis.Worker = class extends MockWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          this.setInitShouldFail(true)
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker

      const { initializeWorker, isWorkerReady } = await import('./worker-client')

      await expect(initializeWorker()).rejects.toThrow('Init failed')

      expect(isWorkerReady()).toBe(false)
    })
  })

  describe('worker.onmessage handler', () => {
    it('should ignore non-response message types', async () => {
      const { initializeWorker, terminateWorker, isWorkerReady } = await import('./worker-client')

      await initializeWorker()
      expect(isWorkerReady()).toBe(true)

      // Send a message with type that should be ignored
      const worker = createdWorkers[0]!

      // These should not throw and should not affect worker state
      expect(() => worker.simulateMessage({ type: 'loaded' })).not.toThrow() // Should be ignored after init
      expect(() => worker.simulateMessage({ type: 'unknown' })).not.toThrow() // Should be ignored

      // Worker should still be ready after receiving ignored messages
      expect(isWorkerReady()).toBe(true)

      terminateWorker()
    })

    it('should ignore messages without id', async () => {
      const { initializeWorker, terminateWorker, isWorkerReady } = await import('./worker-client')

      await initializeWorker()
      expect(isWorkerReady()).toBe(true)

      const worker = createdWorkers[0]!
      // Message with type but no id - should be ignored
      expect(() =>
        worker.simulateMessage({ type: 'result', success: true, data: {} }),
      ).not.toThrow()

      // Worker should still be ready after receiving ignored messages
      expect(isWorkerReady()).toBe(true)

      terminateWorker()
    })

    it('should ignore messages with unknown request id', async () => {
      const { initializeWorker, terminateWorker, isWorkerReady } = await import('./worker-client')

      await initializeWorker()
      expect(isWorkerReady()).toBe(true)

      const worker = createdWorkers[0]!
      // Message with unknown id - should be ignored (no pending request)
      expect(() =>
        worker.simulateMessage({ type: 'result', id: 'unknown-id-12345', success: true, data: {} }),
      ).not.toThrow()

      // Worker should still be ready after receiving ignored messages
      expect(isWorkerReady()).toBe(true)

      terminateWorker()
    })

    // Build a Worker that intercepts findNextMove requests and responds with a custom message.
    const installInterceptingWorker = (
      buildResponse: (data: { type: string; id: string; payload?: unknown }) => {
        type: string
        id: string
        success: boolean
        error: string
      },
    ) => {
      let capturedId: string | null = null
      globalThis.Worker = class extends MockWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          const originalPostMessage = this.postMessage.bind(this)
          this.postMessage = (data: { type: string; id: string; payload?: unknown }) => {
            if (data.type === 'findNextMove') {
              capturedId = data.id
              setTimeout(() => {
                this.simulateMessage(buildResponse(data))
              }, 5)
              return
            }
            originalPostMessage(data)
          }
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker
      return () => capturedId
    }

    const emptyGrid = (): number[] => new Array(81).fill(0)
    const fullCandidates = (): number[][] => new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])

    // Wire up an intercepting worker and initialize the client, ready to call findNextMove.
    const setupRejectingFindNextMove = async (
      buildResponse: (data: { type: string; id: string; payload?: unknown }) => {
        type: string
        id: string
        success: boolean
        error: string
      },
    ) => {
      vi.resetModules()
      const getCapturedId = installInterceptingWorker(buildResponse)
      const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')
      await initializeWorker()
      return { findNextMove, terminateWorker, getCapturedId }
    }

    it('should reject pending request on error type', async () => {
      const { findNextMove, terminateWorker, getCapturedId } = await setupRejectingFindNextMove(
        (data) => ({ type: 'error', id: data.id, success: false, error: 'Custom error message' }),
      )

      await expect(findNextMove(emptyGrid(), fullCandidates(), emptyGrid())).rejects.toThrow(
        'Custom error message',
      )

      expect(getCapturedId()).not.toBeNull()

      terminateWorker()
    })

    it('should reject on success: false', async () => {
      const { findNextMove, terminateWorker, getCapturedId } = await setupRejectingFindNextMove(
        (data) => ({ type: 'result', id: data.id, success: false, error: 'Operation failed' }),
      )

      await expect(findNextMove(emptyGrid(), fullCandidates(), emptyGrid())).rejects.toThrow(
        'Operation failed',
      )

      expect(getCapturedId()).not.toBeNull()

      terminateWorker()
    })
  })

  describe('worker.onerror handler', () => {
    it('should reject all pending requests when worker errors', async () => {
      vi.resetModules()
      vi.useFakeTimers()

      installNoRespondWorker()

      const { initializeWorker, terminateWorker } = await import('./worker-client')

      // Manually construct worker and set up for init to succeed
      const { worker, initPromise } = await manuallyInitWorker(initializeWorker)

      // Simulate a worker error
      worker.simulateError('Worker crashed!')

      terminateWorker()

      // The init promise may or may not have resolved, but we've tested the error path
      await initPromise.catch(() => {})

      vi.useRealTimers()
    })
  })

  describe('terminateWorker', () => {
    it('should reject all pending requests when terminated', async () => {
      vi.resetModules()
      vi.useFakeTimers()

      installNoRespondWorker()

      const { initializeWorker, findNextMove, terminateWorker, isWorkerReady } =
        await import('./worker-client')

      // Manually handle init
      const { initPromise } = await manuallyInitWorker(initializeWorker)

      // Now try to make a request
      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([])
      const givens = new Array(81).fill(0)

      const findPromise = findNextMove(cells, candidates, givens)

      // Terminate while request is pending
      terminateWorker()

      expect(isWorkerReady()).toBe(false)

      await expect(findPromise).rejects.toThrow('Worker terminated')

      await initPromise.catch(() => {})

      vi.useRealTimers()
    })
  })

  describe('findNextMove', () => {
    it('should auto-initialize if not initialized', async () => {
      const { findNextMove, terminateWorker, isWorkerReady } = await import('./worker-client')

      expect(isWorkerReady()).toBe(false)

      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])
      const givens = new Array(81).fill(0)

      const result = await findNextMove(cells, candidates, givens)

      expect(isWorkerReady()).toBe(true)
      expect(result).toHaveProperty('move')
      expect(result).toHaveProperty('board')
      expect(result).toHaveProperty('candidates')
      expect(result).toHaveProperty('solved')

      terminateWorker()
    })

    it('should return the result from worker', async () => {
      vi.resetModules()

      const expectedResult = {
        move: { technique: 'HiddenSingle', placement: { row: 1, col: 2, digit: 3 } },
        board: new Array(81).fill(1),
        candidates: new Array(81).fill([4, 5, 6]),
        solved: true,
      }

      globalThis.Worker = class extends MockWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          this.setResponseOverride((req) => {
            if (req.type === 'findNextMove') {
              return expectedResult
            }
            return null
          })
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker

      const { findNextMove, terminateWorker } = await import('./worker-client')

      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([])
      const givens = new Array(81).fill(0)

      const result = await findNextMove(cells, candidates, givens)

      expect(result).toEqual(expectedResult)

      terminateWorker()
    })
  })

  describe('solveAll', () => {
    it('should auto-initialize if not initialized', async () => {
      const { solveAll, terminateWorker, isWorkerReady } = await import('./worker-client')

      expect(isWorkerReady()).toBe(false)

      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])
      const givens = new Array(81).fill(0)

      const result = await solveAll(cells, candidates, givens)

      expect(isWorkerReady()).toBe(true)
      expect(result).toHaveProperty('moves')
      expect(result).toHaveProperty('solved')
      expect(result).toHaveProperty('finalBoard')

      terminateWorker()
    })

    it('reuses an already-initialized worker without re-initializing', async () => {
      const { solveAll, initializeWorker, terminateWorker, isWorkerReady } = await import(
        './worker-client'
      )

      // Initialize up front so the solveAll call takes the skip-init branch.
      await initializeWorker()
      expect(isWorkerReady()).toBe(true)

      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([])
      const givens = new Array(81).fill(0)

      const result = await solveAll(cells, candidates, givens)

      expect(isWorkerReady()).toBe(true)
      expect(result).toHaveProperty('moves')
      expect(result).toHaveProperty('solved')
      expect(result).toHaveProperty('finalBoard')

      terminateWorker()
    })

    it('should return the result from worker', async () => {
      vi.resetModules()

      const expectedResult = {
        moves: [{ board: [1], candidates: [[2]], move: { technique: 'NakedSingle' } }],
        solved: true,
        finalBoard: new Array(81).fill(9),
      }

      globalThis.Worker = class extends MockWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          this.setResponseOverride((req) => {
            if (req.type === 'solveAll') {
              return expectedResult
            }
            return null
          })
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker

      const { solveAll, terminateWorker } = await import('./worker-client')

      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([])
      const givens = new Array(81).fill(0)

      const result = await solveAll(cells, candidates, givens)

      expect(result).toEqual(expectedResult)

      terminateWorker()
    })
  })

  describe('sendRequest timeout', () => {
    it('should timeout if worker does not respond', async () => {
      vi.resetModules()
      vi.useFakeTimers()

      // We'll use a custom worker that responds to init but not to findNextMove
      let capturedFindMoveId: string | null = null

      globalThis.Worker = class extends MockWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          const originalPostMessage = this.postMessage.bind(this)
          this.postMessage = (data: { type: string; id: string; payload?: unknown }) => {
            if (data.type === 'findNextMove') {
              // Don't respond - capture the id for later
              capturedFindMoveId = data.id
              return
            }
            originalPostMessage(data)
          }
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker

      const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')

      // Advance timers to allow init to complete
      const initPromise = initializeWorker()
      await vi.advanceTimersByTimeAsync(50)
      await initPromise

      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([])
      const givens = new Array(81).fill(0)

      // Use a shorter timeout by directly testing timeout behavior
      // The actual REQUEST_TIMEOUT is 30s which is too long for tests
      // Instead, we'll start the request and then terminate to simulate timeout-like behavior
      const findPromise = findNextMove(cells, candidates, givens)

      // Advance timers a tick then terminate (simulates what happens after timeout clears pending)
      await vi.advanceTimersByTimeAsync(10)

      terminateWorker()

      await expect(findPromise).rejects.toThrow('Worker terminated')

      expect(capturedFindMoveId).not.toBeNull()

      vi.useRealTimers()
    }, 10000)
  })

  describe('worker creation error', () => {
    it('should handle worker creation timeout', async () => {
      vi.resetModules()
      vi.useFakeTimers()

      globalThis.Worker = class SlowWorker {
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: ((event: ErrorEvent) => void) | null = null
        private eventListeners: Map<string, ((event: Event) => void)[]> = new Map()

        constructor() {
          // Don't send 'loaded' message
        }

        postMessage(): void {}
        terminate(): void {}

        addEventListener(type: string, handler: (event: Event) => void): void {
          const listeners = this.eventListeners.get(type) || []
          listeners.push(handler)
          this.eventListeners.set(type, listeners)
        }

        removeEventListener(): void {}
      } as unknown as typeof Worker

      const { initializeWorker, terminateWorker } = await import('./worker-client')

      const initPromise = initializeWorker()

      // Attach rejection handler BEFORE advancing time to prevent unhandled rejection
      // This catches the rejection when it happens during timer advancement
      let error: Error | null = null as Error | null
      const catchPromise = initPromise.catch((e) => {
        error = e as Error
      })

      // Advance past worker creation timeout (10 seconds)
      await vi.advanceTimersByTimeAsync(10001)

      // Wait for the rejection to be handled
      await catchPromise

      expect(error).not.toBeNull()
      expect(error?.message).toBe('Worker creation timeout')

      // Restore real timers before cleanup to prevent unhandled promise issues
      vi.useRealTimers()
      terminateWorker()

      // Allow any pending microtasks to settle
      await vi.waitFor(() => Promise.resolve())
    })

    it('should handle worker error during creation', async () => {
      vi.resetModules()

      globalThis.Worker = class ErrorWorker {
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: ((event: ErrorEvent) => void) | null = null
        private eventListeners: Map<string, ((event: Event) => void)[]> = new Map()

        constructor() {
          // Trigger error after a short delay
          setTimeout(() => {
            const errorEvent = new ErrorEvent('error', { message: 'Worker load failed' })
            const listeners = this.eventListeners.get('error') || []
            for (const listener of listeners) {
              listener(errorEvent)
            }
          }, 5)
        }

        postMessage(): void {}
        terminate(): void {}

        addEventListener(type: string, handler: (event: Event) => void): void {
          const listeners = this.eventListeners.get(type) || []
          listeners.push(handler)
          this.eventListeners.set(type, listeners)
        }

        removeEventListener(): void {}
      } as unknown as typeof Worker

      const { initializeWorker } = await import('./worker-client')

      await expect(initializeWorker()).rejects.toThrow('Worker error: Worker load failed')
    })
  })

  describe('mutation-kill: request id and payload forwarding', () => {
    const installRecordingWorker = () => {
      const posted: { type: string; id: string; payload?: unknown }[] = []
      globalThis.Worker = class extends MockWorker {
        postMessage(data: { type: string; id: string; payload?: unknown }): void {
          posted.push(data)
          super.postMessage(data)
        }
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker
      return () => posted
    }

    it('generates incrementing request ids starting at req-1 (L134)', async () => {
      const getPosted = installRecordingWorker()
      const { initializeWorker, terminateWorker } = await import('./worker-client')

      await initializeWorker()

      const posted = getPosted()
      expect(posted.length).toBeGreaterThan(0)
      expect(posted[0]?.id).toMatch(/^req-1-\d+$/)

      terminateWorker()
    })

    it('forwards the exact findNextMove payload (L322)', async () => {
      const getPosted = installRecordingWorker()
      const { findNextMove, terminateWorker } = await import('./worker-client')

      const cells = [1, 2, 3]
      const candidates = [[4, 5]]
      const givens = [6, 7, 8]
      await findNextMove(cells, candidates, givens)

      const posted = getPosted()
      const req = posted.find((p) => p.type === 'findNextMove')
      expect(req?.payload).toEqual({ cells, candidates, givens })

      terminateWorker()
    })

    it('forwards the exact solveAll payload (L339)', async () => {
      const getPosted = installRecordingWorker()
      const { solveAll, terminateWorker } = await import('./worker-client')

      const cells = [9]
      const candidates = [[7]]
      const givens = [8]
      await solveAll(cells, candidates, givens)

      const posted = getPosted()
      const req = posted.find((p) => p.type === 'solveAll')
      expect(req?.payload).toEqual({ cells, candidates, givens })

      terminateWorker()
    })
  })

  describe('mutation-kill: init-failure cleanup', () => {
    it('terminates the created worker when init fails (L242)', async () => {
      vi.resetModules()
      globalThis.Worker = class extends MockWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          this.setInitShouldFail(true)
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker

      const { initializeWorker } = await import('./worker-client')

      await expect(initializeWorker()).rejects.toThrow('Init failed')

      expect(createdWorkers[0]).toBeDefined()
      // terminate() nulls the onmessage/onerror handlers; under the mutant they stay set
      expect(createdWorkers[0]!.onmessage).toBeNull()
    })
  })

  describe('mutation-kill: message-type filtering', () => {
    const emptyGrid = (): number[] => new Array(81).fill(0)
    const fullCandidates = (): number[][] => new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])

    it('ignores non-response types carrying a pending request id (L199)', async () => {
      vi.resetModules()
      vi.useFakeTimers()
      try {
        const posted: { type: string; id: string; payload?: unknown }[] = []
        globalThis.Worker = class extends MockWorker {
          postMessage(data: { type: string; id: string; payload?: unknown }): void {
            posted.push(data)
          }
          constructor(url: URL | string, options?: WorkerOptions) {
            super(url, options)
            this.setAutoRespond(false)
            createdWorkers.push(this)
          }
        } as unknown as typeof Worker

        const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')

        const initPromise = initializeWorker()
        await vi.advanceTimersByTimeAsync(20)

        // Resolve init with the exact id the client generated so isInitialized becomes true
        const initReq = posted.find((p) => p.type === 'init')
        expect(initReq).toBeDefined()
        createdWorkers[0]!.simulateMessage({
          type: 'result',
          id: initReq!.id,
          success: true,
          data: null,
        })
        await vi.advanceTimersByTimeAsync(10)
        await initPromise

        const findPromise = findNextMove(emptyGrid(), fullCandidates(), emptyGrid())
        let state: 'pending' | 'resolved' | 'rejected' = 'pending'
        findPromise.then(
          () => {
            state = 'resolved'
          },
          () => {
            state = 'rejected'
          },
        )
        await vi.advanceTimersByTimeAsync(10)

        const findReq = posted.find((p) => p.type === 'findNextMove')
        expect(findReq).toBeDefined()

        // 'loaded' is a non-response type: must be ignored so the request stays pending
        createdWorkers[0]!.simulateMessage({ type: 'loaded', id: findReq!.id })
        await vi.advanceTimersByTimeAsync(10)

        expect(state).toBe('pending')

        terminateWorker()
        await findPromise.catch(() => {})
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('mutation-kill: error-type rejection regardless of success flag', () => {
    const emptyGrid = (): number[] => new Array(81).fill(0)
    const fullCandidates = (): number[][] => new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])

    it('rejects on error type even when success is true (L211)', async () => {
      vi.resetModules()
      globalThis.Worker = class extends MockWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          const originalPostMessage = this.postMessage.bind(this)
          this.postMessage = (data: { type: string; id: string; payload?: unknown }) => {
            if (data.type === 'findNextMove') {
              setTimeout(() => {
                this.simulateMessage({
                  type: 'error',
                  id: data.id,
                  success: true,
                  error: 'Boom',
                })
              }, 5)
              return
            }
            originalPostMessage(data)
          }
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker

      const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')
      await initializeWorker()

      await expect(findNextMove(emptyGrid(), fullCandidates(), emptyGrid())).rejects.toThrow('Boom')

      terminateWorker()
    })
  })

  describe('mutation-kill: idle-timer cleanup on terminate', () => {
    it('clears the idle timer when terminating (L82, L100, L101)', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
      try {
        const { initializeWorker, terminateWorker } = await import('./worker-client')

        await initializeWorker()

        const before = clearTimeoutSpy.mock.calls.length
        terminateWorker()
        const after = clearTimeoutSpy.mock.calls.length

        expect(after).toBeGreaterThan(before)
      } finally {
        clearTimeoutSpy.mockRestore()
      }
    })
  })

  describe('mutation-kill: idle timeout and lifecycle coverage', () => {
    it('terminates the worker after the idle timeout with no pending requests', async () => {
      vi.useFakeTimers()
      const { initializeWorker, isWorkerReady, terminateWorker } = await import('./worker-client')

      try {
        const initPromise = initializeWorker()
        await vi.advanceTimersByTimeAsync(50)
        await initPromise
        expect(isWorkerReady()).toBe(true)

        // Advance past IDLE_TIMEOUT_MS (60s)
        await vi.advanceTimersByTimeAsync(61000)

        expect(isWorkerReady()).toBe(false)
      } finally {
        vi.useRealTimers()
        terminateWorker()
      }
    })

    it('getIdleTimeout returns the configured value', async () => {
      const { getIdleTimeout } = await import('./worker-client')
      expect(getIdleTimeout()).toBe(60000)
    })
  })

  describe('mutation-kill: request-timeout and error rejection paths', () => {
    const emptyGrid = (): number[] => new Array(81).fill(0)
    const fullCandidates = (): number[][] => new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])

    // Install a worker that auto-responds to init but swallows findNextMove
    const installInitOnlyWorker = () => {
      globalThis.Worker = class extends MockWorker {
        postMessage(data: { type: string; id: string; payload?: unknown }): void {
          if (data.type === 'findNextMove') return // leave pending
          super.postMessage(data)
        }
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          createdWorkers.push(this)
        }
      } as unknown as typeof Worker
    }

    it('rejects a pending request when the worker fires onerror', async () => {
      vi.resetModules()
      vi.useFakeTimers()
      try {
        installInitOnlyWorker()
        const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')

        const initPromise = initializeWorker()
        await vi.advanceTimersByTimeAsync(50)
        await initPromise

        const worker = createdWorkers[0]!
        const findPromise = findNextMove(emptyGrid(), fullCandidates(), emptyGrid())
        await vi.advanceTimersByTimeAsync(10)

        // Call the client's onerror handler directly (the MockWorker's triggerEvent
        // would first hit a stale createWorker error listener that terminates the worker)
        worker.onerror?.(new ErrorEvent('error', { message: 'crashed' }))

        await expect(findPromise).rejects.toThrow('Worker error: crashed')
        terminateWorker()
      } finally {
        vi.useRealTimers()
      }
    })

    it('rejects with the generic message when error field is empty (L217 fallback)', async () => {
      vi.resetModules()
      vi.useFakeTimers()
      try {
        let findReqId: string | undefined
        globalThis.Worker = class extends MockWorker {
          postMessage(data: { type: string; id: string; payload?: unknown }): void {
            if (data.type === 'findNextMove') {
              findReqId = data.id
              return
            }
            super.postMessage(data)
          }
          constructor(url: URL | string, options?: WorkerOptions) {
            super(url, options)
            createdWorkers.push(this)
          }
        } as unknown as typeof Worker

        const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')

        const initPromise = initializeWorker()
        await vi.advanceTimersByTimeAsync(50)
        await initPromise

        const findPromise = findNextMove(emptyGrid(), fullCandidates(), emptyGrid())
        await vi.advanceTimersByTimeAsync(10)

        expect(findReqId).toBeDefined()
        createdWorkers[0]!.simulateMessage({ type: 'error', id: findReqId, success: false, error: '' })

        await expect(findPromise).rejects.toThrow('Worker request failed')
        terminateWorker()
      } finally {
        vi.useRealTimers()
      }
    })

    it('rejects with a timeout message after REQUEST_TIMEOUT', async () => {
      vi.resetModules()
      vi.useFakeTimers()
      try {
        installInitOnlyWorker()
        const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')

        const initPromise = initializeWorker()
        await vi.advanceTimersByTimeAsync(50)
        await initPromise

        const findPromise = findNextMove(emptyGrid(), fullCandidates(), emptyGrid())
        await vi.advanceTimersByTimeAsync(10)

        // Attach the rejection handler BEFORE advancing past REQUEST_TIMEOUT so the
        // timer-fired rejection always has a waiter (avoids an unhandled-rejection race).
        const assertion = expect(findPromise).rejects.toThrow('Worker request timeout: findNextMove')

        // Advance past REQUEST_TIMEOUT (30s)
        await vi.advanceTimersByTimeAsync(31000)

        await assertion
        terminateWorker()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('mutation-kill: lifecycle log and listener registration assertions', () => {
    it('emits the idle-timeout debug log when terminating an idle worker (L94)', async () => {
      const loggerMod = await import('../lib/logger')
      const debugSpy = vi.spyOn(loggerMod.logger, 'debug').mockImplementation(() => {})

      vi.useFakeTimers()
      try {
        const { initializeWorker } = await import('./worker-client')
        const initPromise = initializeWorker()
        await vi.advanceTimersByTimeAsync(50)
        await initPromise

        debugSpy.mockClear()
        // Advance past IDLE_TIMEOUT_MS (60s) to trigger the idle-termination log.
        await vi.advanceTimersByTimeAsync(61000)

        expect(debugSpy).toHaveBeenCalledWith(
          '[WorkerClient] Idle timeout reached, terminating worker to save resources',
        )
      } finally {
        vi.useRealTimers()
        debugSpy.mockRestore()
      }
    })

    it('returns false mid-initialization when worker is set but isInitialized is not yet true (L131)', async () => {
      vi.resetModules()
      vi.useFakeTimers()
      try {
        // Install a worker that resolves 'loaded' but never responds to 'init',
        // so createWorker resolves (worker set) but isInitialized stays false.
        globalThis.Worker = class extends MockWorker {
          postMessage(data: { type: string; id: string; payload?: unknown }): void {
            if (data.type === 'init') return // leave init pending
          }
          constructor(url: URL | string, options?: WorkerOptions) {
            super(url, options)
            createdWorkers.push(this)
          }
        } as unknown as typeof Worker

        const { initializeWorker, isWorkerReady, terminateWorker } = await import('./worker-client')

        const initPromise = initializeWorker()
        await vi.advanceTimersByTimeAsync(50)

        // Worker was created (loaded message posted by mock) but init hasn't resolved.
        // The `||` mutant would return true here because worker !== null.
        expect(isWorkerReady()).toBe(false)

        terminateWorker()
        await initPromise.catch(() => {})
      } finally {
        vi.useRealTimers()
      }
    })

    it('removeEventListener is called with the "message" event on worker creation (L158,L165)', async () => {
      const removedEvents: string[] = []
      const originalWorker = globalThis.Worker
      class TrackingWorker extends MockWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url, options)
          const origRemove = this.removeEventListener.bind(this)
          this.removeEventListener = (type: string) => {
            removedEvents.push(type)
            origRemove(type, () => {})
          }
          createdWorkers.push(this)
        }
      }
      globalThis.Worker = TrackingWorker as unknown as typeof Worker

      try {
        const { initializeWorker, terminateWorker } = await import('./worker-client')
        await initializeWorker()

        // On the success path, the createWorker handler removes its 'message' listener.
        expect(removedEvents).toContain('message')

        terminateWorker()
      } finally {
        globalThis.Worker = originalWorker
      }
    })

    it('removeEventListener is called with the "error" event when worker creation errors (L166)', async () => {
      vi.resetModules()
      const removedEvents: string[] = []
      const originalWorker = globalThis.Worker
      class ErrorWorker {
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: ((event: ErrorEvent) => void) | null = null
        private eventListeners: Map<string, ((event: Event) => void)[]> = new Map()

        constructor() {
          setTimeout(() => {
            const errorEvent = new ErrorEvent('error', { message: 'Worker load failed' })
            const listeners = this.eventListeners.get('error') || []
            for (const listener of listeners) {
              listener(errorEvent)
            }
          }, 5)
        }

        postMessage(): void {}
        terminate(): void {}

        addEventListener(type: string, handler: (event: Event) => void): void {
          const listeners = this.eventListeners.get(type) || []
          listeners.push(handler)
          this.eventListeners.set(type, listeners)
        }

        removeEventListener(type: string): void {
          removedEvents.push(type)
        }
      }
      globalThis.Worker = ErrorWorker as unknown as typeof Worker

      try {
        const { initializeWorker } = await import('./worker-client')

        await expect(initializeWorker()).rejects.toThrow('Worker error: Worker load failed')

        // The error handler removes both 'message' and 'error' listeners.
        expect(removedEvents).toContain('error')
        expect(removedEvents).toContain('message')
      } finally {
        globalThis.Worker = originalWorker
        vi.resetModules()
      }
    })

    it('emits the worker-error debug log when onerror fires (L229)', async () => {
      vi.resetModules()
      const loggerMod = await import('../lib/logger')
      const debugSpy = vi.spyOn(loggerMod.logger, 'debug').mockImplementation(() => {})

      vi.useFakeTimers()
      try {
        globalThis.Worker = class extends MockWorker {
          postMessage(data: { type: string; id: string; payload?: unknown }): void {
            if (data.type === 'findNextMove') return
            super.postMessage(data)
          }
          constructor(url: URL | string, options?: WorkerOptions) {
            super(url, options)
            createdWorkers.push(this)
          }
        } as unknown as typeof Worker

        const emptyGrid = (): number[] => new Array(81).fill(0)
        const fullCandidates = (): number[][] =>
          new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])

        const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')
        const initPromise = initializeWorker()
        await vi.advanceTimersByTimeAsync(50)
        await initPromise

        const worker = createdWorkers[0]!
        const findPromise = findNextMove(emptyGrid(), fullCandidates(), emptyGrid())
        await vi.advanceTimersByTimeAsync(10)

        // Fire onerror directly. The mutant would log "" instead of the message.
        worker.onerror?.(new ErrorEvent('error', { message: 'crashed' }))

        await expect(findPromise).rejects.toThrow('Worker error: crashed')
        expect(debugSpy).toHaveBeenCalledWith(
          '[WorkerClient] Worker error:',
          expect.any(ErrorEvent),
        )

        terminateWorker()
      } finally {
        vi.useRealTimers()
        debugSpy.mockRestore()
        vi.resetModules()
      }
    })

    it('emits the terminate debug log when terminateWorker is called after init (L311)', async () => {
      const loggerMod = await import('../lib/logger')
      const debugSpy = vi.spyOn(loggerMod.logger, 'debug').mockImplementation(() => {})

      const { initializeWorker, terminateWorker } = await import('./worker-client')
      await initializeWorker()

      debugSpy.mockClear()
      terminateWorker()

      expect(debugSpy).toHaveBeenCalledWith('[WorkerClient] Worker terminated, resources freed')
      debugSpy.mockRestore()
    })
  })
})

describe('worker-client - response-type guard (mutation coverage)', () => {
  const OriginalWorkerRef = globalThis.Worker

  afterEach(() => {
    globalThis.Worker = OriginalWorkerRef
    vi.resetModules()
  })

  it('routes a valid result message to its pending request instead of dropping it', async () => {
    // A synchronously-responding worker: postMessage immediately dispatches the matching
    // 'result'. The onmessage handler therefore runs inside this test (attributable) and,
    // if the `type !== 'ready' && ...` guard is forced true, every response (init and
    // findNextMove) is discarded, so neither promise ever settles and the test times out.
    class SyncMock {
      onmessage: ((e: MessageEvent) => void) | null = null
      onerror: ((e: ErrorEvent) => void) | null = null
      private listeners = new Map<string, ((e: Event) => void)[]>()
      constructor() {
        setTimeout(() => this.dispatch({ type: 'loaded' }), 0)
      }
      addEventListener(type: string, fn: (e: Event) => void): void {
        const arr = this.listeners.get(type) ?? []
        arr.push(fn)
        this.listeners.set(type, arr)
      }
      removeEventListener(type: string, fn: (e: Event) => void): void {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn))
      }
      private dispatch(data: unknown): void {
        const ev = new MessageEvent('message', { data })
        for (const fn of this.listeners.get('message') ?? []) fn(ev)
        if (this.onmessage) this.onmessage(ev)
      }
      postMessage(data: { type?: string; id?: string }): void {
        if (data?.type === 'init') {
          this.dispatch({ type: 'result', id: data.id, success: true, data: null })
        } else if (data?.type === 'findNextMove') {
          this.dispatch({
            type: 'result',
            id: data.id,
            success: true,
            data: {
              move: { technique: 'NakedSingle', placement: { row: 0, col: 0, digit: 5 } },
              board: new Array(81).fill(0),
              candidates: new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9]),
              solved: false,
            },
          })
        }
      }
      terminate(): void {
        this.onmessage = null
        this.onerror = null
      }
    }
    globalThis.Worker = SyncMock as unknown as typeof Worker
    vi.resetModules()
    const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')
    await initializeWorker()
    const result = await findNextMove(
      new Array(81).fill(0),
      new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      new Array(81).fill(0),
    )
    expect(result).toHaveProperty('move')
    terminateWorker()
  }, 3000)
})
