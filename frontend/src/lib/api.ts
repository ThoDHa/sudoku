const API_BASE = '/api'

export interface DailyResponse {
  date_utc: string
  seed: string
}

export async function fetchDaily(): Promise<DailyResponse> {
  const res = await fetch(`${API_BASE}/daily`)
  if (!res.ok) {
    throw new Error('Failed to fetch daily puzzle')
  }
  return res.json()
}

export interface PracticePuzzleResponse {
  seed: string
  difficulty: string
  givens: number[]
  technique: string
  puzzle_index: number
  cached: boolean
  error?: string
  message?: string
}

export async function fetchPracticePuzzle(technique: string): Promise<PracticePuzzleResponse> {
  const res = await fetch(`${API_BASE}/practice/${encodeURIComponent(technique)}`)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch practice puzzle')
  }
  return data
}
