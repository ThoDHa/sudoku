// Signature helpers for the hint subsystem.
//
// getHintSignature deduplicates successive hints so the same logical move is not
// double-counted. getBoardSignature keys the cached next-hint so it is recomputed
// only when the board or candidates actually change. formatTechniqueName renders a
// technique slug for display. These are pure functions extracted from Game.tsx so
// the hint hook (useHints) and the page can share them without re-deriving identity.

interface HintMove {
  technique: string
  action: string
  digit: number
  targets: { row: number; col: number }[]
}

export function getHintSignature(move: HintMove): string {
  return `${move.technique}-${move.action}-${move.digit}-${JSON.stringify(move.targets)}`
}

export function getBoardSignature(board: number[], candidates: Uint16Array): string {
  const candidatesStr = Array.from(candidates).join(',')
  return `${board.join(',')}-${candidatesStr}`
}

export function formatTechniqueName(technique: string): string {
  return technique.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
