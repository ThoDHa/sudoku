type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'impossible' | 'custom'
type BadgeSize = 'sm' | 'md' | 'lg'

interface DifficultyBadgeProps {
  difficulty: string
  size?: BadgeSize
  className?: string
}

const difficultyStyles: Record<Difficulty, string> = {
  easy: 'bg-diff-easy/15 text-diff-easy',
  medium: 'bg-diff-medium/15 text-diff-medium',
  hard: 'bg-diff-hard/15 text-diff-hard',
  extreme: 'bg-diff-extreme/15 text-diff-extreme',
  impossible: 'bg-diff-impossible/15 text-diff-impossible',
  custom: 'bg-diff-impossible/15 text-diff-impossible',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-lg',
}

export default function DifficultyBadge({ difficulty, size = 'md', className = '' }: DifficultyBadgeProps) {
  const diffKey = difficulty as Difficulty
  const colorStyle = difficultyStyles[diffKey] || difficultyStyles.medium
  const sizeStyle = sizeStyles[size]

  return (
    <span className={`inline-block rounded-full font-medium capitalize ${colorStyle} ${sizeStyle} ${className}`}>
      {difficulty}
    </span>
  )
}
