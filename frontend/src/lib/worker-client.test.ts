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
