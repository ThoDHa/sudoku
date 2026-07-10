import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isPortablePuzzle,
  buildPuzzleShareUrl,
  buildStateShareUrl,
  getShareBaseUrl,
} from './shareLinks'
import { decodePuzzleWithState, decodePuzzle } from './puzzleEncoding'

function makeGivens(): number[] {
  const givens = Array<number>(81).fill(0)
  givens[0] = 5
  givens[1] = 3
  givens[4] = 7
  return givens
}

function makeState(): { board: number[]; givens: number[]; candidates: number[][] } {
  const givens = makeGivens()
  const board = [...givens]
  board[2] = 4 // a user-filled cell
  const candidates = Array.from({ length: 81 }, () => [] as number[])
  candidates[3] = [1, 2, 9] // a pencil-marked cell
  return { board, givens, candidates }
}

describe('getShareBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('strips the trailing slash when the deploy base path ends with one', () => {
    // The default test BASE_URL is '/', so origin + '/' ends with a slash.
    vi.stubEnv('BASE_URL', '/')
    expect(getShareBaseUrl()).toBe(window.location.origin)
    expect(getShareBaseUrl().endsWith('/')).toBe(false)
  })

  it('leaves the base URL untouched when it has no trailing slash', () => {
    vi.stubEnv('BASE_URL', '/app')
    expect(getShareBaseUrl()).toBe(`${window.location.origin}/app`)
  })
})

describe('isPortablePuzzle', () => {
  it('treats daily and homepage-practice seeds as portable', () => {
    expect(isPortablePuzzle({ isEncodedCustom: false, seed: 'daily-2026-07-08' })).toBe(true)
    expect(isPortablePuzzle({ isEncodedCustom: false, seed: 'P1720000000000' })).toBe(true)
  })

  it('treats custom and technique-practice seeds as non-portable', () => {
    expect(isPortablePuzzle({ isEncodedCustom: false, seed: 'custom-abc123' })).toBe(false)
    expect(isPortablePuzzle({ isEncodedCustom: false, seed: 'practice-xwing-1' })).toBe(false)
  })

  it('treats encoded-custom links and missing seeds as non-portable', () => {
    expect(isPortablePuzzle({ isEncodedCustom: true, seed: 'daily-2026-07-08' })).toBe(false)
    expect(isPortablePuzzle({ isEncodedCustom: false, seed: undefined })).toBe(false)
  })
})

describe('buildPuzzleShareUrl', () => {
  const base = getShareBaseUrl()

  it('uses a seed link with pinned difficulty for portable puzzles', () => {
    const url = buildPuzzleShareUrl({
      isEncodedCustom: false,
      seed: 'P1720000000000',
      difficulty: 'hard',
      givens: makeGivens(),
    })
    expect(url).toBe(`${base}/P1720000000000?d=hard`)
    expect(url).not.toContain('/c/')
  })

  it('falls back to an encoded givens link for non-portable puzzles', () => {
    const givens = makeGivens()
    const url = buildPuzzleShareUrl({
      isEncodedCustom: false,
      seed: 'custom-abc123',
      difficulty: 'custom',
      givens,
    })
    expect(url.startsWith(`${base}/c/`)).toBe(true)
    const encoded = url.slice(`${base}/c/`.length)
    expect(decodePuzzle(encoded)).toEqual(givens)
  })
})

describe('buildStateShareUrl', () => {
  it('overlays state on the seed link and round-trips the board and notes', () => {
    const { board, givens, candidates } = makeState()
    const url = buildStateShareUrl({
      isEncodedCustom: false,
      seed: 'P1720000000000',
      difficulty: 'hard',
      givens,
      board,
      candidates,
      elapsedMs: 65_000,
    })
    const parsed = new URL(url)
    expect(parsed.pathname.endsWith('/P1720000000000')).toBe(true)
    expect(parsed.searchParams.get('d')).toBe('hard')
    expect(parsed.searchParams.get('t')).toBe('65000')

    const state = parsed.searchParams.get('s')
    expect(state).toBeTruthy()
    const decoded = decodePuzzleWithState(state as string)
    expect(decoded?.board).toEqual(board)
    expect(decoded?.candidates?.[3]).toEqual([1, 2, 9])
  })

  it('omits the time parameter when no elapsed time is given', () => {
    const { board, givens, candidates } = makeState()
    const url = buildStateShareUrl({
      isEncodedCustom: false,
      seed: 'daily-2026-07-08',
      difficulty: 'medium',
      givens,
      board,
      candidates,
    })
    expect(new URL(url).searchParams.get('t')).toBeNull()
  })

  it('uses an encoded /c/ link with a time query for non-portable puzzles', () => {
    const { board, givens, candidates } = makeState()
    const url = buildStateShareUrl({
      isEncodedCustom: true,
      seed: undefined,
      difficulty: 'custom',
      givens,
      board,
      candidates,
      elapsedMs: 30_000,
    })
    const parsed = new URL(url)
    expect(parsed.pathname).toContain('/c/')
    expect(parsed.searchParams.get('t')).toBe('30000')
  })

  it('omits the time query on the encoded /c/ link when no elapsed time is given', () => {
    const { board, givens, candidates } = makeState()
    const url = buildStateShareUrl({
      isEncodedCustom: true,
      seed: undefined,
      difficulty: 'custom',
      givens,
      board,
      candidates,
    })
    const parsed = new URL(url)
    expect(parsed.pathname).toContain('/c/')
    expect(parsed.searchParams.get('t')).toBeNull()
    expect(url).not.toContain('?t=')
  })

  it('omits the time param for zero or negative elapsed time on a seed link', () => {
    const { board, givens, candidates } = makeState()
    // Only elapsedMs > 0 produces a time param; the `&&` guard rejects 0, and
    // negatives must be rejected too (a `||` mutant would let -1 through).
    const url = buildStateShareUrl({
      isEncodedCustom: false,
      seed: 'daily-2026-07-08',
      difficulty: 'medium',
      givens,
      board,
      candidates,
      elapsedMs: -100,
    })
    expect(new URL(url).searchParams.get('t')).toBeNull()
    expect(url).not.toContain('t=')
  })

  it('appends no stray text to the seed link when elapsed time is absent', () => {
    const { board, givens, candidates } = makeState()
    const url = buildStateShareUrl({
      isEncodedCustom: false,
      seed: 'daily-2026-07-08',
      difficulty: 'medium',
      givens,
      board,
      candidates,
    })
    // The empty time-suffix branch must contribute nothing to the URL.
    expect(new URL(url).searchParams.get('t')).toBeNull()
    expect(url).not.toContain('Stryker')
  })

  it('appends no stray text to the /c/ link when elapsed time is absent', () => {
    const { board, givens, candidates } = makeState()
    const url = buildStateShareUrl({
      isEncodedCustom: true,
      seed: undefined,
      difficulty: 'custom',
      givens,
      board,
      candidates,
    })
    expect(url).not.toContain('Stryker')
    expect(url).not.toContain('?t=')
  })

  it('uses an encoded /c/ link for a present but non-portable seed (custom-)', () => {
    const { board, givens, candidates } = makeState()
    // seed is present but non-portable: an `||` mutant of the `seed && isPortable`
    // guard would wrongly route this to a bare seed link instead of /c/.
    const url = buildStateShareUrl({
      isEncodedCustom: false,
      seed: 'custom-abc123',
      difficulty: 'custom',
      givens,
      board,
      candidates,
      elapsedMs: 10_000,
    })
    expect(url).toContain('/c/')
    expect(url).not.toContain('/custom-abc123?')
  })
})
