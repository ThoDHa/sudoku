import { Difficulty } from '../lib/hooks'
import DifficultyBadge from './DifficultyBadge'

interface DailyCardProps {
  difficulty: Difficulty
  selected: boolean
  isResumable?: boolean // This card has an in-progress game
  onPlay: () => void
}

const CARD_BG = 'bg-background-secondary'

// Build the border/hover/ring triple for a difficulty color token. `custom`
// reuses the impossible palette per the existing visual mapping.
const difficultyColorsFor = (token: string) => ({
  bg: CARD_BG,
  border: `border-diff-${token}`,
  hoverBorder: `hover:border-diff-${token}/80`,
  ring: `ring-diff-${token}`,
})

// Card border colors for each difficulty - using theme-aware colors
const difficultyColors: Record<
  Difficulty,
  { bg: string; border: string; hoverBorder: string; ring: string }
> = {
  easy: difficultyColorsFor('easy'),
  medium: difficultyColorsFor('medium'),
  hard: difficultyColorsFor('hard'),
  extreme: difficultyColorsFor('extreme'),
  impossible: difficultyColorsFor('impossible'),
  custom: difficultyColorsFor('impossible'),
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
  const baseClasses =
    'daily-card rounded-xl border-2 transition-all duration-200 cursor-pointer focus:outline-none'

  const bgClass = isResumable ? resumableBg[difficulty] : colors.bg
  const borderClass = colors.border
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
