import { Difficulty } from '../lib/hooks'
import DifficultyBadge from './DifficultyBadge'

interface DailyCardProps {
  difficulty: Difficulty
  selected: boolean
  isResumable?: boolean // This card has an in-progress game
  onPlay: () => void
}

// Card border colors for each difficulty - using theme-aware colors
const difficultyColors: Record<Difficulty, { bg: string; border: string; hoverBorder: string; ring: string }> = {
  easy: { 
    bg: 'bg-background-secondary', 
    border: 'border-diff-easy', 
    hoverBorder: 'hover:border-diff-easy/80',
    ring: 'ring-diff-easy',
  },
  medium: { 
    bg: 'bg-background-secondary', 
    border: 'border-diff-medium', 
    hoverBorder: 'hover:border-diff-medium/80',
    ring: 'ring-diff-medium',
  },
  hard: { 
    bg: 'bg-background-secondary', 
    border: 'border-diff-hard', 
    hoverBorder: 'hover:border-diff-hard/80',
    ring: 'ring-diff-hard',
  },
  extreme: { 
    bg: 'bg-background-secondary', 
    border: 'border-diff-extreme', 
    hoverBorder: 'hover:border-diff-extreme/80',
    ring: 'ring-diff-extreme',
  },
  impossible: { 
    bg: 'bg-background-secondary', 
    border: 'border-diff-impossible', 
    hoverBorder: 'hover:border-diff-impossible/80',
    ring: 'ring-diff-impossible',
  },
  custom: { 
    bg: 'bg-background-secondary', 
    border: 'border-diff-impossible', 
    hoverBorder: 'hover:border-diff-impossible/80',
    ring: 'ring-diff-impossible',
  },
}

const selectedBorders: Record<Difficulty, string> = {
  easy: 'border-diff-easy',
  medium: 'border-diff-medium',
  hard: 'border-diff-hard',
  extreme: 'border-diff-extreme',
  impossible: 'border-diff-impossible',
  custom: 'border-diff-impossible',
}

// Resumable background colors (subtle tint of difficulty color)
const resumableBg: Record<Difficulty, string> = {
  easy: 'bg-diff-easy/10',
  medium: 'bg-diff-medium/10',
  hard: 'bg-diff-hard/10',
  extreme: 'bg-diff-extreme/10',
  impossible: 'bg-diff-impossible/10',
  custom: 'bg-diff-impossible/10',
}

export default function DailyCard({ difficulty, selected, isResumable, onPlay }: DailyCardProps) {
  const colors = difficultyColors[difficulty]
  const baseClasses = 'daily-card rounded-xl border-2 transition-all duration-200 cursor-pointer focus:outline-none'
  
  const bgClass = isResumable ? resumableBg[difficulty] : colors.bg
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
        {isResumable ? 'Resume' : 'Play'}
      </span>
    </button>
  )
}
