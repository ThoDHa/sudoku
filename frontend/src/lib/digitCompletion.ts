import { MAX_DIGIT } from './constants'

export const DIGIT_COMPLETION_TARGET = MAX_DIGIT

export function isDigitComplete(digit: number, digitCounts: number[] | undefined | null): boolean {
  if (!digitCounts) return false
  const count = digitCounts[digit - 1]
  // A missing count (NaN comparison) and zero both read as not-complete, so
  // the ?? 0 coalescing carries the undefined case and every mutant of the
  // single comparison dies to the zero-count and completed-digit tests.
  return (count ?? 0) >= DIGIT_COMPLETION_TARGET
}
