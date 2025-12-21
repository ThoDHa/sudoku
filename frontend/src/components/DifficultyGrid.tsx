import { useNavigate } from 'react-router-dom'
import DailyCard from './DailyCard'
import { Difficulty } from '../lib/hooks'

interface DifficultyGridProps {
  seed: string
  lastSelected: Difficulty | null
  onSelect: (difficulty: Difficulty) => void
  routePrefix?: string // '/p' for daily, '/game' for practice
  onBeforeNavigate?: (path: string) => boolean // Return false to prevent navigation
  resumeDifficulty?: string | undefined // Difficulty of in-progress game to highlight
  resumeSeed?: string | undefined // Seed of in-progress game (for practice mode resume)
}

const difficulties: Difficulty[] = [
  'easy',
  'medium',
  'hard',
  'extreme',
  'impossible',
]

export default function DifficultyGrid({ seed, lastSelected, onSelect, routePrefix = '/p', onBeforeNavigate, resumeDifficulty, resumeSeed }: DifficultyGridProps) {
  const navigate = useNavigate()

  const handlePlay = (difficulty: Difficulty) => {
    // If this is the resumable difficulty and we have a resumeSeed, use that seed instead
    const isResumable = resumeDifficulty === difficulty && resumeSeed
    const targetSeed = isResumable ? resumeSeed : seed
    const path = `${routePrefix}/${targetSeed}?d=${difficulty}`
    
    // If onBeforeNavigate returns false, don't navigate (caller will handle it)
    if (onBeforeNavigate && !onBeforeNavigate(path)) {
      return
    }
    
    onSelect(difficulty)
    navigate(path)
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
            isResumable={resumeDifficulty === key}
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
            isResumable={resumeDifficulty === key}
            onPlay={() => handlePlay(key)}
          />
        ))}
      </div>
    </div>
  )
}
