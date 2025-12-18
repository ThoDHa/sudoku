import { useNavigate } from 'react-router-dom'
import DailyCard from './DailyCard'
import { Difficulty } from '../lib/hooks'

interface DifficultyGridProps {
  seed: string
  lastSelected: Difficulty | null
  onSelect: (difficulty: Difficulty) => void
}

const difficulties: { key: Difficulty; givensHint: string }[] = [
  { key: 'easy', givensHint: '~38-40' },
  { key: 'medium', givensHint: '~32-36' },
  { key: 'hard', givensHint: '~26-30' },
  { key: 'extreme', givensHint: '~22-25' },
  { key: 'impossible', givensHint: '~17-21' },
]

export default function DifficultyGrid({ seed, lastSelected, onSelect }: DifficultyGridProps) {
  const navigate = useNavigate()

  const handlePlay = (difficulty: Difficulty) => {
    onSelect(difficulty)
    navigate(`/p/${seed}?d=${difficulty}`)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top row: Easy, Medium, Hard */}
      <div className="grid grid-cols-3 gap-4">
        {difficulties.slice(0, 3).map(({ key, givensHint }) => (
          <DailyCard
            key={key}
            difficulty={key}
            givensHint={givensHint}
            selected={lastSelected === key}
            onPlay={() => handlePlay(key)}
          />
        ))}
      </div>
      {/* Bottom row: Expert, Impossible (centered) */}
      <div className="grid grid-cols-2 gap-4 mx-auto w-2/3">
        {difficulties.slice(3).map(({ key, givensHint }) => (
          <DailyCard
            key={key}
            difficulty={key}
            givensHint={givensHint}
            selected={lastSelected === key}
            onPlay={() => handlePlay(key)}
          />
        ))}
      </div>
    </div>
  )
}
