import React, { useState, useCallback, useRef } from 'react'
import { isValidSolution } from '../lib/validationUtils'

export interface UseCompletionOptions {
  onComplete?: () => void
}

export interface UseCompletionReturn {
  isComplete: boolean
  setIsComplete: React.Dispatch<React.SetStateAction<boolean>>
  checkCompletion: (board: number[]) => void
}

export function useCompletion(options: UseCompletionOptions): UseCompletionReturn {
  const { onComplete } = options

  const [isComplete, setIsComplete] = useState(false)
  const onCompleteRef = useRef(onComplete)

  React.useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const checkCompletion = useCallback((board: number[]) => {
    const allFilled = board.every((v: number) => v !== 0)
    if (allFilled && isValidSolution(board)) {
      setIsComplete(true)
      onCompleteRef.current?.()
    } else {
      setIsComplete(false)
    }
  }, [])

  return {
    isComplete,
    setIsComplete,
    checkCompletion,
  }
}
