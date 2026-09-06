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
      if (isValidSolution(newBoard)) {
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
