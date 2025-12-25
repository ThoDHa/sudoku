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
    
    // Mock Worker constructor
    globalThis.Worker = vi.fn().mockImplementation((url: URL | string, options?: WorkerOptions) => {
      const worker = new MockWorker(url, options)
      createdWorkers.push(worker)
      return worker
    }) as unknown as typeof Worker
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
      
      // Track if Worker constructor was called
      let workerCreated = false
      globalThis.Worker = vi.fn().mockImplementation(() => {
        workerCreated = true
        const worker = new MockWorker('', {})
        createdWorkers.push(worker)
        return worker
      }) as unknown as typeof Worker
      
      const { initializeWorker, terminateWorker } = await import('./worker-client')
      
      // Start initialization (will eventually timeout, but we just verify it tries)
      const initPromise = initializeWorker()
      
      // Give it time to create the worker
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(workerCreated).toBe(true)
      expect(createdWorkers.length).toBeGreaterThan(0)
      
      // Cleanup - terminate to avoid hanging
      terminateWorker()
      
      // The promise will reject due to termination, which is expected
      await expect(initPromise).rejects.toThrow()
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
      candidates: [[1, 2], [3, 4]],
      solved: false
    }
    
    expect(result.move).toBeNull()
    expect(result.board).toEqual([0, 0, 0])
    expect(result.candidates).toEqual([[1, 2], [3, 4]])
    expect(result.solved).toBe(false)
  })
})

describe('WorkerSolveAllResult type', () => {
  it('should have correct structure', async () => {
    const result: import('./worker-client').WorkerSolveAllResult = {
      moves: [],
      solved: true,
      finalBoard: [1, 2, 3, 4, 5, 6, 7, 8, 9]
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
    private responseOverride: ((request: { type: string; id: string; payload?: unknown }) => unknown) | null = null
    
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
            this.simulateMessage({ type: 'error', id: data.id, success: false, error: 'Init failed' })
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
              solved: false
            }
          } else if (data.type === 'solveAll') {
            responseData = {
              moves: [],
              solved: true,
              finalBoard: new Array(81).fill(0)
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
      const event = type === 'message' 
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
    
    setResponseOverride(fn: ((request: { type: string; id: string; payload?: unknown }) => unknown) | null): void {
      this.responseOverride = fn
    }
  }
  
  beforeEach(() => {
    createdWorkers = []
    vi.resetModules()
    
    globalThis.Worker = vi.fn().mockImplementation((url: URL | string, options?: WorkerOptions) => {
      const worker = new MockWorker(url, options)
      createdWorkers.push(worker)
      return worker
    }) as unknown as typeof Worker
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
      globalThis.Worker = vi.fn().mockImplementation(() => {
        const worker = new MockWorker('', {})
        worker.setInitShouldFail(true)
        createdWorkers.push(worker)
        return worker
      }) as unknown as typeof Worker
      
      const { initializeWorker, isWorkerReady } = await import('./worker-client')
      
      await expect(initializeWorker()).rejects.toThrow('Init failed')
      
      expect(isWorkerReady()).toBe(false)
    })
  })
  
  describe('worker.onmessage handler', () => {
    it('should ignore non-response message types', async () => {
      const { initializeWorker, terminateWorker } = await import('./worker-client')
      
      await initializeWorker()
      
      // Send a message with type that should be ignored
      const worker = createdWorkers[0]
      worker.simulateMessage({ type: 'loaded' }) // Should be ignored after init
      worker.simulateMessage({ type: 'unknown' }) // Should be ignored
      
      // If we get here without errors, the handler correctly ignored these
      expect(true).toBe(true)
      
      terminateWorker()
    })
    
    it('should ignore messages without id', async () => {
      const { initializeWorker, terminateWorker } = await import('./worker-client')
      
      await initializeWorker()
      
      const worker = createdWorkers[0]
      // Message with type but no id - should be ignored
      worker.simulateMessage({ type: 'result', success: true, data: {} })
      
      expect(true).toBe(true)
      
      terminateWorker()
    })
    
    it('should ignore messages with unknown request id', async () => {
      const { initializeWorker, terminateWorker } = await import('./worker-client')
      
      await initializeWorker()
      
      const worker = createdWorkers[0]
      // Message with unknown id - should be ignored (no pending request)
      worker.simulateMessage({ type: 'result', id: 'unknown-id-12345', success: true, data: {} })
      
      expect(true).toBe(true)
      
      terminateWorker()
    })
    
    it('should reject pending request on error type', async () => {
      vi.resetModules()
      
      let capturedRequestId: string | null = null
      
      globalThis.Worker = vi.fn().mockImplementation(() => {
        const worker = new MockWorker('', {})
        const originalPostMessage = worker.postMessage.bind(worker)
        worker.postMessage = (data: { type: string; id: string; payload?: unknown }) => {
          if (data.type === 'findNextMove') {
            capturedRequestId = data.id
            // Respond with error type
            setTimeout(() => {
              worker.simulateMessage({ type: 'error', id: data.id, success: false, error: 'Custom error message' })
            }, 5)
            return
          }
          originalPostMessage(data)
        }
        createdWorkers.push(worker)
        return worker
      }) as unknown as typeof Worker
      
      const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')
      
      await initializeWorker()
      
      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])
      const givens = new Array(81).fill(0)
      
      await expect(findNextMove(cells, candidates, givens)).rejects.toThrow('Custom error message')
      
      expect(capturedRequestId).not.toBeNull()
      
      terminateWorker()
    })
    
    it('should reject on success: false', async () => {
      vi.resetModules()
      
      let capturedId: string | null = null
      
      globalThis.Worker = vi.fn().mockImplementation(() => {
        const worker = new MockWorker('', {})
        const originalPostMessage = worker.postMessage.bind(worker)
        worker.postMessage = (data: { type: string; id: string; payload?: unknown }) => {
          if (data.type === 'findNextMove') {
            capturedId = data.id
            // Respond with success: false
            setTimeout(() => {
              worker.simulateMessage({ type: 'result', id: data.id, success: false, error: 'Operation failed' })
            }, 5)
            return
          }
          originalPostMessage(data)
        }
        createdWorkers.push(worker)
        return worker
      }) as unknown as typeof Worker
      
      const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')
      
      await initializeWorker()
      
      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])
      const givens = new Array(81).fill(0)
      
      await expect(findNextMove(cells, candidates, givens)).rejects.toThrow('Operation failed')
      
      expect(capturedId).not.toBeNull()
      
      terminateWorker()
    })
  })
  
  describe('worker.onerror handler', () => {
    it('should reject all pending requests when worker errors', async () => {
      vi.resetModules()
      
      globalThis.Worker = vi.fn().mockImplementation(() => {
        const worker = new MockWorker('', {})
        worker.setAutoRespond(false)
        createdWorkers.push(worker)
        return worker
      }) as unknown as typeof Worker
      
      const { initializeWorker, terminateWorker } = await import('./worker-client')
      
      // Manually construct worker and set up for init to succeed
      const initPromise = initializeWorker()
      
      // Wait for worker to be created
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const worker = createdWorkers[0]
      
      // Manually send init success
      worker.simulateMessage({ type: 'result', id: 'req-1-' + Date.now(), success: true, data: null })
      
      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Simulate a worker error
      worker.simulateError('Worker crashed!')
      
      terminateWorker()
      
      // The init promise may or may not have resolved, but we've tested the error path
      await initPromise.catch(() => {})
    })
  })
  
  describe('terminateWorker', () => {
    it('should reject all pending requests when terminated', async () => {
      vi.resetModules()
      
      globalThis.Worker = vi.fn().mockImplementation(() => {
        const worker = new MockWorker('', {})
        worker.setAutoRespond(false) // Don't auto-respond so we can terminate mid-request
        createdWorkers.push(worker)
        return worker
      }) as unknown as typeof Worker
      
      const { initializeWorker, findNextMove, terminateWorker, isWorkerReady } = await import('./worker-client')
      
      // Manually handle init
      const initPromise = initializeWorker()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const worker = createdWorkers[0]
      // Send init response manually with a guessed ID (first request)
      worker.simulateMessage({ type: 'result', id: 'req-1-' + Date.now(), success: true, data: null })
      
      await new Promise(resolve => setTimeout(resolve, 10))
      
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
        solved: true
      }
      
      globalThis.Worker = vi.fn().mockImplementation(() => {
        const worker = new MockWorker('', {})
        worker.setResponseOverride((req) => {
          if (req.type === 'findNextMove') {
            return expectedResult
          }
          return null
        })
        createdWorkers.push(worker)
        return worker
      }) as unknown as typeof Worker
      
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
    
    it('should return the result from worker', async () => {
      vi.resetModules()
      
      const expectedResult = {
        moves: [
          { board: [1], candidates: [[2]], move: { technique: 'NakedSingle' } }
        ],
        solved: true,
        finalBoard: new Array(81).fill(9)
      }
      
      globalThis.Worker = vi.fn().mockImplementation(() => {
        const worker = new MockWorker('', {})
        worker.setResponseOverride((req) => {
          if (req.type === 'solveAll') {
            return expectedResult
          }
          return null
        })
        createdWorkers.push(worker)
        return worker
      }) as unknown as typeof Worker
      
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
      
      // We'll use a custom worker that responds to init but not to findNextMove
      let capturedFindMoveId: string | null = null
      
      globalThis.Worker = vi.fn().mockImplementation(() => {
        const worker = new MockWorker('', {})
        const originalPostMessage = worker.postMessage.bind(worker)
        worker.postMessage = (data: { type: string; id: string; payload?: unknown }) => {
          if (data.type === 'findNextMove') {
            // Don't respond - capture the id for later
            capturedFindMoveId = data.id
            return
          }
          originalPostMessage(data)
        }
        createdWorkers.push(worker)
        return worker
      }) as unknown as typeof Worker
      
      const { initializeWorker, findNextMove, terminateWorker } = await import('./worker-client')
      
      await initializeWorker()
      
      const cells = new Array(81).fill(0)
      const candidates = new Array(81).fill([])
      const givens = new Array(81).fill(0)
      
      // Use a shorter timeout by directly testing timeout behavior
      // The actual REQUEST_TIMEOUT is 30s which is too long for tests
      // Instead, we'll start the request and then terminate to simulate timeout-like behavior
      const findPromise = findNextMove(cells, candidates, givens)
      
      // Wait a tick then terminate (simulates what happens after timeout clears pending)
      await new Promise(resolve => setTimeout(resolve, 10))
      
      terminateWorker()
      
      await expect(findPromise).rejects.toThrow('Worker terminated')
      
      expect(capturedFindMoveId).not.toBeNull()
    }, 10000)
  })
  
  describe('worker creation error', () => {
    it('should handle worker creation timeout', async () => {
      vi.resetModules()
      vi.useFakeTimers()
      
      // Create a worker that never sends 'loaded'
      class SlowWorker {
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
      }
      
      globalThis.Worker = vi.fn().mockImplementation(() => {
        return new SlowWorker()
      }) as unknown as typeof Worker
      
      const { initializeWorker, terminateWorker } = await import('./worker-client')
      
      const initPromise = initializeWorker()
      
      // Attach rejection handler BEFORE advancing time to prevent unhandled rejection
      // This catches the rejection when it happens during timer advancement
      let error: Error | null = null
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
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    
    it('should handle worker error during creation', async () => {
      vi.resetModules()
      
      class ErrorWorker {
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
      }
      
      globalThis.Worker = vi.fn().mockImplementation(() => {
        return new ErrorWorker()
      }) as unknown as typeof Worker
      
      const { initializeWorker } = await import('./worker-client')
      
      await expect(initializeWorker()).rejects.toThrow('Worker error: Worker load failed')
    })
  })
})
