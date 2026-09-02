import React, { useState, useCallback, useRef } from 'react'
import { isValidSolution } from '../lib/validationUtils'

export interface UseCompletionOptions {
  // Explicit undefined so callers can forward an optional callback under
  // exactOptionalPropertyTypes without a conditional spread.
  onComplete?: (() => void) | undefined
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

  const checkCompletion = useCallback(
    (board: number[]) => {
      // isValidSolution already rejects any board with an empty cell, so no
      // separate all-filled check is needed.
      if (isValidSolution(board)) {
        setIsComplete(true)
        onCompleteRef.current?.()
      } else {
        setIsComplete(false)
      }
    },
    // Stryker disable next-line ArrayDeclaration: the only generated replacement is ["Stryker was here"], a constant; checkCompletion captures no external values (it reads the callback through onCompleteRef), so any deps content is observationally identical across renders
    [],
  )

  return {
    isComplete,
    setIsComplete,
    checkCompletion,
  }
}
