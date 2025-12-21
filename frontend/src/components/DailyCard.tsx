import { Difficulty } from '../lib/hooks'
import DifficultyBadge from './DifficultyBadge'

interface DailyCardProps {
  difficulty: Difficulty
  selected: boolean
  onPlay: () => void
}

// Card border colors for each difficulty
const difficultyColors: Record<Difficulty, { bg: string; border: string; hoverBorder: string; ring: string }> = {
  easy: { 
    bg: 'bg-background-secondary', 
    border: 'border-green-500', 
    hoverBorder: 'hover:border-green-600',
    ring: 'ring-green-500',
  },
  medium: { 
    bg: 'bg-background-secondary', 
    border: 'border-amber-500', 
    hoverBorder: 'hover:border-amber-600',
    ring: 'ring-amber-500',
  },
  hard: { 
    bg: 'bg-background-secondary', 
    border: 'border-orange-500', 
    hoverBorder: 'hover:border-orange-600',
    ring: 'ring-orange-500',
  },
  extreme: { 
    bg: 'bg-background-secondary', 
    border: 'border-red-500', 
    hoverBorder: 'hover:border-red-600',
    ring: 'ring-red-500',
  },
  impossible: { 
    bg: 'bg-background-secondary', 
    border: 'border-fuchsia-500', 
    hoverBorder: 'hover:border-fuchsia-600',
    ring: 'ring-fuchsia-500',
  },
  custom: { 
    bg: 'bg-background-secondary', 
    border: 'border-purple-500', 
    hoverBorder: 'hover:border-purple-600',
    ring: 'ring-purple-500',
  },
}

const selectedBorders: Record<Difficulty, string> = {
  easy: 'border-green-500 dark:border-green-400',
  medium: 'border-amber-500 dark:border-yellow-400',
  hard: 'border-orange-500 dark:border-orange-400',
  extreme: 'border-red-500 dark:border-red-400',
  impossible: 'border-fuchsia-500 dark:border-fuchsia-400',
  custom: 'border-purple-500 dark:border-purple-400',
}

export default function DailyCard({ difficulty, selected, onPlay }: DailyCardProps) {
  const colors = difficultyColors[difficulty]
  const baseClasses = 'daily-card rounded-xl border-2 transition-all duration-200 cursor-pointer focus:outline-none'
  
  const bgClass = colors.bg
  const borderClass = selected ? selectedBorders[difficulty] : colors.border
  const hoverClass = selected ? '' : colors.hoverBorder
  const ringClass = selected ? `ring-2 ${colors.ring}` : ''

  return (
    <button
      onClick={onPlay}
      className={`${baseClasses} ${bgClass} ${borderClass} ${hoverClass} ${ringClass} flex flex-col items-center justify-center`}
    >
      <DifficultyBadge difficulty={difficulty} size="lg" />
      <span className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-btn-active-text hover:opacity-90">
        Play
      </span>
    </button>
  )
}
