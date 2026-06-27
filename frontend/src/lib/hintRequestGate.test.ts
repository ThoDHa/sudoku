import { describe, it, expect } from 'vitest'
import { createHintRequestGate } from './hintRequestGate'

// Mirror of how Game.tsx consumes the gate: check, begin before any await,
// end in finally. Kept inline so the test asserts the real usage contract.
async function requestHint<T>(
  gate: ReturnType<typeof createHintRequestGate>,
  solver: () => Promise<T>,
): Promise<T | null> {
  if (!gate.canStart()) return null
  gate.begin()
  try {
    return await solver()
  } finally {
    gate.end()
  }
}

describe('createHintRequestGate', () => {
  describe('blocking a duplicate request while one is in flight', () => {
    it('rejects a second request made while the first is still pending so the solver runs only once', async () => {
      const gate = createHintRequestGate()
      let solverCalls = 0
      // A deferred keeps the solver pending so the second request is
      // guaranteed to arrive while the first is genuinely in-flight.
      let resolveSolver: (value: string) => void = () => {
        throw new Error('solver resolved before test was ready')
      }
      const solver = () =>
        new Promise<string>((resolve) => {
          solverCalls++
          resolveSolver = resolve
        })

      // First request begins and parks on the unresolved solver.
      const first = requestHint(gate, solver)
      // Fired while the first is in-flight: must be rejected, not queued.
      const second = requestHint(gate, solver)

      expect(gate.isInProgress()).toBe(true)
      expect(solverCalls).toBe(1)

      resolveSolver('hint')
      const [firstResult, secondResult] = await Promise.all([first, second])

      expect(solverCalls).toBe(1)
      expect(firstResult).toBe('hint')
      expect(secondResult).toBeNull()
      expect(gate.isInProgress()).toBe(false)
    })

    it('clears the in-progress flag even when the in-flight request throws', async () => {
      const gate = createHintRequestGate()
      const solver = async (): Promise<string> => {
        throw new Error('solver exploded')
      }

      await expect(requestHint(gate, solver)).rejects.toThrow('solver exploded')

      expect(gate.isInProgress()).toBe(false)
      expect(gate.canStart()).toBe(true)
    })
  })

  describe('allowing a new request once the previous one has completed', () => {
    it('runs the solver a second time after the first request has settled', async () => {
      const gate = createHintRequestGate()
      let solverCalls = 0
      const solver = async () => {
        solverCalls++
        return `hint-${solverCalls}`
      }

      const first = await requestHint(gate, solver)
      const second = await requestHint(gate, solver)

      expect(first).toBe('hint-1')
      expect(second).toBe('hint-2')
      expect(solverCalls).toBe(2)
    })
  })

  describe('initial state', () => {
    it('starts idle so the first request can proceed', () => {
      const gate = createHintRequestGate()

      expect(gate.canStart()).toBe(true)
      expect(gate.isInProgress()).toBe(false)
    })

    it('reflects in-progress once begun and idle once ended', () => {
      const gate = createHintRequestGate()

      gate.begin()
      expect(gate.canStart()).toBe(false)
      expect(gate.isInProgress()).toBe(true)

      gate.end()
      expect(gate.canStart()).toBe(true)
      expect(gate.isInProgress()).toBe(false)
    })
  })
})
