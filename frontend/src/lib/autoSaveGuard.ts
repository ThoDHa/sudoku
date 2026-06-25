export interface AutoSaveGuardInputs {
  hasPuzzle: boolean
  hasRestoredSavedState: boolean
  isComplete: boolean
  autoSaveEnabled: boolean
}

export function shouldSuppressAutoSave(inputs: AutoSaveGuardInputs): boolean {
  return (
    !inputs.hasPuzzle ||
    !inputs.hasRestoredSavedState ||
    inputs.isComplete ||
    !inputs.autoSaveEnabled
  )
}
