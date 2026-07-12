export interface CompletionGateInputs {
  isComplete: boolean
  restoredAsComplete: boolean
}

export type CompletionAction = 'none' | 'show-only' | 'record'

export function resolveCompletionAction(inputs: CompletionGateInputs): CompletionAction {
  if (!inputs.isComplete) return 'none'
  if (inputs.restoredAsComplete) return 'show-only'
  return 'record'
}
