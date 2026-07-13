export interface AutoSaveSeedGuardInputs {
  scheduledSeed: string | null
  currentSeed: string | null
}

export function shouldAllowStaleSave(input: AutoSaveSeedGuardInputs): boolean {
  if (input.currentSeed === null) return false
  if (input.scheduledSeed === null) return false
  return input.scheduledSeed === input.currentSeed
}
