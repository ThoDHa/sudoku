import { useNavigate } from 'react-router-dom'
import DailyCard from './DailyCard'
import { Difficulty } from '../lib/hooks'

interface DifficultyGridProps {
  seed: string
  lastSelected: Difficulty | null
  onSelect: (difficulty: Difficulty) => void
  routePrefix?: string // '/p' for daily, '/game' for practice
}

const difficulties: Difficulty[] = [
  'easy',
  'medium',
  'hard',
  'extreme',
  'impossible',
]

export default function DifficultyGrid({ seed, lastSelected, onSelect, routePrefix = '/p' }: DifficultyGridProps) {
  const navigate = useNavigate()

  const handlePlay = (difficulty: Difficulty) => {
    onSelect(difficulty)
    navigate(`${routePrefix}/${seed}?d=${difficulty}`)
  }

  return (
    <div className="difficulty-grid flex flex-col">
      {/* Top row: Easy, Medium, Hard */}
      <div className="grid grid-cols-3 gap-[inherit]">
        {difficulties.slice(0, 3).map((key) => (
          <DailyCard
            key={key}
            difficulty={key}
            selected={lastSelected === key}
            onPlay={() => handlePlay(key)}
          />
        ))}
      </div>
      {/* Bottom row: Expert, Impossible (centered) */}
      <div className="grid grid-cols-2 gap-[inherit] mx-auto w-2/3">
        {difficulties.slice(3).map((key) => (
          <DailyCard
            key={key}
            difficulty={key}
            selected={lastSelected === key}
            onPlay={() => handlePlay(key)}
          />
        ))}
      </div>
    </div>
  )
}
