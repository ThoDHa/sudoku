import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Difficulty } from '../lib/hooks'
import DifficultyBadge from '../components/DifficultyBadge'

const difficulties: { key: Difficulty; description: string; givensHint: string }[] = [
  { key: 'easy', description: 'Great for beginners', givensHint: '~38-40 givens' },
  { key: 'medium', description: 'Some logic required', givensHint: '~32-36 givens' },
  { key: 'hard', description: 'Advanced techniques needed', givensHint: '~26-30 givens' },
  { key: 'extreme', description: 'For experienced solvers', givensHint: '~22-25 givens' },
  { key: 'impossible', description: 'Extreme challenge', givensHint: '~17-21 givens' },
]

export default function DifficultySelect() {
  const navigate = useNavigate()
  const [hoveredDifficulty, setHoveredDifficulty] = useState<Difficulty | null>(null)

  const generateSeed = () => `R${Date.now()}`

  const handlePlay = (difficulty: Difficulty) => {
    navigate(`/game/${generateSeed()}?d=${difficulty}`)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 bg-[var(--bg)] text-[var(--text)]">
      <h1 className="mb-2 text-3xl font-bold">Play Sudoku</h1>
      <p className="mb-8 text-[var(--text-muted)]">Choose your difficulty</p>

      <div className="w-full max-w-md space-y-3">
        {difficulties.map(({ key, description, givensHint }) => (
          <button
            key={key}
            onClick={() => handlePlay(key)}
            onMouseEnter={() => setHoveredDifficulty(key)}
            onMouseLeave={() => setHoveredDifficulty(null)}
            className="w-full rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4 text-left transition-all hover:border-[var(--accent)] hover:bg-[var(--btn-hover)]"
          >
            <div className="flex items-center justify-between">
              <div>
                <DifficultyBadge difficulty={key} size="md" />
                <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-[var(--text-muted)]">{givensHint}</span>
                {hoveredDifficulty === key && (
                  <p className="mt-1 text-sm font-medium text-[var(--accent)]">Play &rarr;</p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap justify-center gap-4">
        <Link
          to="/daily"
          className="rounded-lg border border-[var(--border-light)] px-6 py-3 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Daily Puzzle
        </Link>
        <Link
          to="/custom"
          className="rounded-lg border border-[var(--border-light)] px-6 py-3 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Enter Custom Puzzle
        </Link>
        <Link
          to="/techniques"
          className="rounded-lg border border-[var(--border-light)] px-6 py-3 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Learn Techniques
        </Link>
        <Link
          to="/leaderboard"
          className="rounded-lg border border-[var(--border-light)] px-6 py-3 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Your Stats
        </Link>
      </div>
    </div>
  )
}
