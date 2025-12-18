import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getBestScores, getRecentScores, Score } from '../lib/scores'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString()
}

export default function Leaderboard() {
  const [bestScores, setBestScores] = useState<Record<string, Score>>({})
  const [recentScores, setRecentScores] = useState<Score[]>([])

  useEffect(() => {
    setBestScores(getBestScores())
    setRecentScores(getRecentScores(10))
  }, [])

  const difficulties = ['easy', 'medium', 'hard', 'extreme']

  return (
    <div className="mx-auto max-w-4xl p-6 bg-[var(--bg)] min-h-[100dvh]">
      <div className="mb-8">
        <Link to="/" className="text-sm text-[var(--accent)] hover:underline">
          &larr; Back to puzzles
        </Link>
      </div>

      <h1 className="mb-6 text-3xl font-bold text-[var(--text)]">Your Stats</h1>

      <div className="space-y-8">
        <section>
          <h2 className="mb-4 text-xl font-semibold text-[var(--text)]">Best Times</h2>
          {Object.keys(bestScores).length === 0 ? (
            <p className="text-[var(--text-muted)]">No scores yet. Complete a puzzle to see your best times!</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--border-light)]">
              <table className="min-w-full">
                <thead className="bg-[var(--bg-secondary)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Difficulty</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Time</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Assists</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-light)]">
                  {difficulties.map((diff) => {
                    const score = bestScores[diff]
                    if (!score) return null
                    return (
                      <tr key={diff} className="bg-[var(--bg)]">
                        <td className="px-4 py-3 capitalize text-[var(--text)]">{diff}</td>
                        <td className="px-4 py-3 font-mono text-[var(--text)]">{formatTime(score.timeMs)}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">
                          {score.autoSolveUsed ? '🤖' : score.hintsUsed > 0 ? `💡${score.hintsUsed}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{formatDate(score.completedAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-[var(--text)]">Recent Completions</h2>
          {recentScores.length === 0 ? (
            <p className="text-[var(--text-muted)]">No recent completions.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--border-light)]">
              <table className="min-w-full">
                <thead className="bg-[var(--bg-secondary)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Difficulty</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Time</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Assists</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-light)]">
                  {recentScores.map((score, i) => (
                    <tr key={i} className="bg-[var(--bg)]">
                      <td className="px-4 py-3 capitalize text-[var(--text)]">{score.difficulty}</td>
                      <td className="px-4 py-3 font-mono text-[var(--text)]">{formatTime(score.timeMs)}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {score.autoSolveUsed ? '🤖' : score.hintsUsed > 0 ? `💡${score.hintsUsed}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{formatDate(score.completedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
