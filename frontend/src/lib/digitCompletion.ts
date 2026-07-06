import { MAX_DIGIT } from './constants'

export const DIGIT_COMPLETION_TARGET = MAX_DIGIT

export function isDigitComplete(digit: number, digitCounts: number[] | undefined | null): boolean {
  if (!digitCounts) return false
  const count = digitCounts[digit - 1]
  // Stryker disable next-line EqualityOperator,ConditionalExpression: the `count !== undefined` guard is redundant; `count >= DIGIT_COMPLETION_TARGET` already yields false for undefined (NaN >= n), so the conjunction is observably identical
  return count !== undefined && count >= DIGIT_COMPLETION_TARGET
}
