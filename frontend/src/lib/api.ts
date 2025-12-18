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
