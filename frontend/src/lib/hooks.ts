import { useState } from 'react'
import { getDailySeed } from './solver-service'

export interface DailyResponse {
  date_utc: string
  seed: string
}

export function useDailySeed() {
  // Generate daily seed locally - no API call needed
  const [data] = useState<DailyResponse>(() => getDailySeed())

  return { 
    data, 
    loading: false, 
    error: null as string | null, 
    refetch: () => {} // No-op since it's computed locally
  }
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
