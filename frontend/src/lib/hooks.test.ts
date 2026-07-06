import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./solver-service', () => ({
  getDailySeed: vi.fn(() => ({ date_utc: '2026-01-01', seed: 'test-seed' })),
}))

const RECOGNIZED_DIFFICULTIES = ['easy', 'medium', 'hard', 'extreme', 'impossible'] as const

describe('useDailySeed', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns the locally-computed daily seed with loading=false, error=null, and a no-op refetch', async () => {
    const { useDailySeed } = await import('./hooks')
    const { result } = renderHook(() => useDailySeed())

    expect(result.current.data).toEqual({ date_utc: '2026-01-01', seed: 'test-seed' })
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(() => result.current.refetch()).not.toThrow()
  })
})

describe('getLastDailyDifficulty', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when no difficulty has been stored', async () => {
    const { getLastDailyDifficulty } = await import('./hooks')
    expect(getLastDailyDifficulty()).toBeNull()
  })

  it.each(RECOGNIZED_DIFFICULTIES)('returns the stored value when it is the recognized difficulty "%s"', async (d) => {
    const { getLastDailyDifficulty } = await import('./hooks')
    localStorage.setItem('lastDailyDifficulty', d)
    expect(getLastDailyDifficulty()).toBe(d)
  })

  it('returns null for an unrecognized stored value so custom games do not leak in', async () => {
    const { getLastDailyDifficulty } = await import('./hooks')
    localStorage.setItem('lastDailyDifficulty', 'custom')
    expect(getLastDailyDifficulty()).toBeNull()
  })

  it('returns null for a garbage stored value', async () => {
    const { getLastDailyDifficulty } = await import('./hooks')
    localStorage.setItem('lastDailyDifficulty', 'not-a-difficulty')
    expect(getLastDailyDifficulty()).toBeNull()
  })
})

describe('useLastDailyDifficulty', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initializes from a recognized stored difficulty', async () => {
    localStorage.setItem('lastDailyDifficulty', 'hard')
    const { useLastDailyDifficulty } = await import('./hooks')
    const { result } = renderHook(() => useLastDailyDifficulty())
    expect(result.current.difficulty).toBe('hard')
  })

  it('initializes to null when nothing is stored', async () => {
    const { useLastDailyDifficulty } = await import('./hooks')
    const { result } = renderHook(() => useLastDailyDifficulty())
    expect(result.current.difficulty).toBeNull()
  })

  it('initializes to null for an unrecognized stored value', async () => {
    localStorage.setItem('lastDailyDifficulty', 'custom')
    const { useLastDailyDifficulty } = await import('./hooks')
    const { result } = renderHook(() => useLastDailyDifficulty())
    expect(result.current.difficulty).toBeNull()
  })

  it('setDifficulty persists the value to localStorage and updates state', async () => {
    const { useLastDailyDifficulty } = await import('./hooks')
    const { result } = renderHook(() => useLastDailyDifficulty())

    act(() => result.current.setDifficulty('extreme'))

    expect(result.current.difficulty).toBe('extreme')
    expect(localStorage.getItem('lastDailyDifficulty')).toBe('extreme')
  })
})
