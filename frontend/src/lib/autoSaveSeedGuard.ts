export interface AutoSaveSeedGuardInputs {
  scheduledSeed: string | null
  currentSeed: string | null
}

export function shouldAllowStaleSave(input: AutoSaveSeedGuardInputs): boolean {
  if (input.scheduledSeed === null) return false
  return input.scheduledSeed === input.currentSeed
}
