import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE, MS_PER_SECOND } from '../lib/constants'

interface TimerProps {
  elapsedMs: number
}

export default function Timer({ elapsedMs }: TimerProps) {
  const totalSeconds = Math.floor(elapsedMs / MS_PER_SECOND)
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE

  const format = (n: number): string => n.toString().padStart(2, '0')

  const display =
    hours > 0
      ? `${hours}:${format(minutes)}:${format(seconds)}`
      : `${format(minutes)}:${format(seconds)}`

  return (
    <div className="font-mono text-lg tabular-nums text-[var(--text-muted)]">{display}</div>
  )
}
