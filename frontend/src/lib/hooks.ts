import { useState, useEffect } from 'react'
import { fetchDaily, DailyResponse } from './api'

export function useDailySeed() {
  const [data, setData] = useState<DailyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDaily()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error, refetch: () => {
    setLoading(true)
    setError(null)
    fetchDaily()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }}
}

const STORAGE_KEY = 'lastDailyDifficulty'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'impossible' | 'custom'

export function useLastDailyDifficulty() {
  const [difficulty, setDifficultyState] = useState<Difficulty | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && ['easy', 'medium', 'hard', 'extreme', 'impossible'].includes(stored)) {
      return stored as Difficulty
    }
    return null
  })

  const setDifficulty = (d: Difficulty) => {
    localStorage.setItem(STORAGE_KEY, d)
    setDifficultyState(d)
  }

  return { difficulty, setDifficulty }
}
