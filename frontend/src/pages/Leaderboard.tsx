import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getBestScoresPure, getBestScoresAssisted, Score } from '../lib/scores'

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

const difficultyColors: Record<string, { bg: string; border: string; text: string }> = {
  easy: {
    bg: 'bg-green-500/10',
    border: 'border-green-500',
    text: 'text-green-600 dark:text-green-400',
  },
  medium: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500',
    text: 'text-yellow-600 dark:text-yellow-400',
  },
  hard: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
  },
  extreme: {
    bg: 'bg-red-500/10',
    border: 'border-red-500',
    text: 'text-red-600 dark:text-red-400',
  },
  impossible: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500',
    text: 'text-purple-600 dark:text-purple-400',
  },
}

export default function Leaderboard() {
  const [bestScoresPure, setBestScoresPure] = useState<Record<string, Score>>({})
  const [bestScoresAssisted, setBestScoresAssisted] = useState<Record<string, Score>>({})

  useEffect(() => {
    setBestScoresPure(getBestScoresPure())
    setBestScoresAssisted(getBestScoresAssisted())
  }, [])

  const difficulties = ['easy', 'medium', 'hard', 'extreme', 'impossible']

  const getAssistIcon = (score: Score | undefined): string => {
    if (!score) return ''
    if (score.autoSolveUsed) return '🤖'
    if (score.hintsUsed > 0) return `💡${score.hintsUsed}`
    return ''
  }

  return (
    <div className="mx-auto max-w-4xl p-6 bg-[var(--bg)] h-full">
      <div className="mb-8">
        <Link to="/" className="text-sm text-[var(--accent)] hover:underline">
          &larr; Back to puzzles
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {difficulties.map((difficulty) => {
          const colors = difficultyColors[difficulty]
          if (!colors) return null
          const pureScore = bestScoresPure[difficulty]
          const assistedScore = bestScoresAssisted[difficulty]

          return (
            <div
              key={difficulty}
              className={`rounded-lg border-2 ${colors.border} ${colors.bg} p-3`}
            >
              <h3 className={`font-semibold capitalize ${colors.text} mb-2`}>
                {difficulty}
              </h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Best</span>
                  <span className="font-mono text-[var(--text)]">
                    {pureScore ? formatTime(pureScore.timeMs) : 'No times'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Assisted</span>
                  <span className="font-mono text-[var(--text)]">
                    {assistedScore ? (
                      <>
                        {formatTime(assistedScore.timeMs)} {getAssistIcon(assistedScore)}
                      </>
                    ) : (
                      'No times'
                    )}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
