type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'impossible' | 'custom'
type BadgeSize = 'sm' | 'md' | 'lg'

interface DifficultyBadgeProps {
  difficulty: string
  size?: BadgeSize
  className?: string
}

const difficultyStyles: Record<Difficulty, string> = {
  easy: 'bg-green-500/10 text-green-600 dark:text-green-400',
  medium: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  hard: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  extreme: 'bg-red-500/10 text-red-600 dark:text-red-400',
  impossible: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
  custom: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
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
