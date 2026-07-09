// Shareable link construction for puzzles.
//
// Portable puzzles (daily, homepage practice) regenerate deterministically from
// their seed via the static pool, so the share link is just the seed URL and the
// givens never travel. Non-portable puzzles (custom, technique-practice) resolve
// from the sharer's localStorage, so their givens must be encoded into a /c/ link.

import { encodePuzzle, encodePuzzleWithState } from './puzzleEncoding'

const CUSTOM_SEED_PREFIX = 'custom-'
const PRACTICE_SEED_PREFIX = 'practice-'

// Absolute base URL for shareable links, honoring the deploy sub-path (e.g. the
// GitHub Pages /sudoku/ prefix). Mirrors what the app already trusts for links.
export function getShareBaseUrl(): string {
  const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/')
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

// A puzzle is portable when its seed deterministically reproduces the givens on
// any device. Custom and technique-practice puzzles are backed by the sharer's
// localStorage and cannot be reproduced from the seed alone.
export function isPortablePuzzle(params: { isEncodedCustom: boolean; seed?: string }): boolean {
  const { isEncodedCustom, seed } = params
  if (isEncodedCustom || !seed) {
    return false
  }
  return !seed.startsWith(CUSTOM_SEED_PREFIX) && !seed.startsWith(PRACTICE_SEED_PREFIX)
}

export interface PuzzleShareParams {
  isEncodedCustom: boolean
  seed?: string
  difficulty: string
  givens: number[]
}

// Link that shares the bare puzzle: givens only, nothing filled in.
export function buildPuzzleShareUrl(params: PuzzleShareParams): string {
  const base = getShareBaseUrl()
  if (params.seed && isPortablePuzzle(params)) {
    // Difficulty is required: the same seed at a different difficulty hashes to a
    // different puzzle, so it must be pinned for the friend to get this puzzle.
    return `${base}/${params.seed}?d=${params.difficulty}`
  }
  return `${base}/c/${encodePuzzle(params.givens)}`
}

export interface StateShareParams extends PuzzleShareParams {
  board: number[]
  candidates: number[][]
  elapsedMs?: number
}

// Link that shares the exact current position: givens plus the player's entries
// and pencil-mark notes, plus optional elapsed time.
export function buildStateShareUrl(params: StateShareParams): string {
  const base = getShareBaseUrl()
  const state = encodePuzzleWithState(params.board, params.givens, params.candidates)
  const time = params.elapsedMs && params.elapsedMs > 0 ? Math.round(params.elapsedMs) : null

  if (params.seed && isPortablePuzzle(params)) {
    // Seed reproduces the givens; the state param carries only the player's delta.
    const timeSuffix = time !== null ? `&t=${time}` : ''
    return `${base}/${params.seed}?d=${params.difficulty}&s=${state}${timeSuffix}`
  }
  // Non-portable: the encoded blob carries givens + state; time rides a query param.
  const timeSuffix = time !== null ? `?t=${time}` : ''
  return `${base}/c/${state}${timeSuffix}`
}
