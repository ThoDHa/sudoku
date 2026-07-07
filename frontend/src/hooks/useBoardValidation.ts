import { useCallback } from 'react'
import { isValidSolution } from '../lib/validationUtils'

export interface UseBoardValidationOptions {
  setIsComplete: (complete: boolean) => void
}

export interface UseBoardValidationReturn {
  checkCompletion: (newBoard: number[]) => void
  isValidSolution: (board: number[]) => boolean
}

export function useBoardValidation(options: UseBoardValidationOptions): UseBoardValidationReturn {
  const { setIsComplete } = options

  const checkCompletion = useCallback(
    (newBoard: number[]) => {
      // Stryker disable next-line MethodExpression,ConditionalExpression: allFilled is a redundant pre-check; isValidSolution already returns false when any cell is empty, so mutating every()->some() or v!==0->true cannot change the conjunction's result
      const allFilled = newBoard.every((v: number) => v !== 0)
      if (allFilled && isValidSolution(newBoard)) {
        setIsComplete(true)
      } else {
        setIsComplete(false)
      }
    },
    [setIsComplete],
  )

  return {
    checkCompletion,
    isValidSolution,
  }
}
