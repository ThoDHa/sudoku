import { MAX_DIGIT } from './constants'

export const DIGIT_COMPLETION_TARGET = MAX_DIGIT

export function isDigitComplete(digit: number, digitCounts: number[] | undefined | null): boolean {
  if (!digitCounts) return false
  const count = digitCounts[digit - 1]
  return count !== undefined && count >= DIGIT_COMPLETION_TARGET
}
