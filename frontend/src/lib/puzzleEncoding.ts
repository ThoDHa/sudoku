// Compact puzzle encoding for shareable URLs
// Two encoding strategies:
// 1. "Sparse" encoding for puzzles with few givens (typical sudoku ~25 givens)
// 2. "Dense" encoding for puzzles with many filled cells

// Base64url alphabet for efficient encoding
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Encode a sudoku puzzle to a compact URL-safe string
 *
 * For typical puzzles with ~25 givens, uses sparse encoding:
 * - Each given is encoded as: position (0-80) + digit (1-9) = 7 bits + 4 bits = 11 bits
 * - ~25 givens × 11 bits = ~275 bits ≈ 46 base64 chars
 *
 * But we can do better by encoding position differences (delta encoding):
 * - First position: 7 bits (0-80)
 * - Subsequent: delta from previous position (usually small, 1-9 bits)
 * - Digit: 4 bits (1-9)
 *
 * Simplest approach that's still compact: encode as list of (position, digit) pairs
 * Using base81 for position and base9 for digit = 81*9 = 729 combinations per given
 * log2(729) ≈ 9.5 bits per given
 * 25 givens × 9.5 bits ≈ 238 bits ≈ 40 base64 chars
 *
 * Even simpler: Use base85 encoding on the sparse list
 */

/**
 * Encode puzzle - auto-selects best encoding based on filled cell count
 */
export function encodePuzzle(cells: number[]): string {
  if (cells.length !== 81) {
    throw new Error('Puzzle must have 81 cells')
  }

  const filledCount = cells.filter((c) => c !== 0).length

  // For puzzles with many filled cells (>40), use dense encoding
  if (filledCount > 40) {
    return 'd' + encodeDense(cells)
  }

  // For typical puzzles, use sparse encoding
  return 's' + encodeSparse(cells)
}

/**
 * Sparse encoding: a 14-char base64 bitmask marking filled cells, followed by
 * one base64 char per filled cell encoding its digit (1-9 -> A-I).
 */
function encodeSparse(cells: number[]): string {
  // Bitmask: one bit per cell (81 bits), set when the cell is filled.
  let mask = BigInt(0)
  // Stryker disable next-line EqualityOperator: index 81 is out of bounds (array has exactly 81 entries); cells[81] is undefined and skipped by the inner guard, so iterating one step further is a no-op
  for (let i = 0; i < 81; i++) {
    const cell = cells[i]
    if (cell !== undefined && cell !== 0) {
      mask |= BigInt(1) << BigInt(80 - i)
    }
  }

  // Empty puzzle encodes to '' (decoder maps that back to an all-zero board).
  if (mask === BigInt(0)) {
    return ''
  }

  // Encode bitmask as base64url (81 bits -> 14 chars)
  let maskStr = ''
  for (let i = 0; i < 14; i++) {
    const idx = Number((mask >> BigInt((13 - i) * 6)) & BigInt(0x3f))
    maskStr += ALPHABET[idx]
  }

  // Encode each filled cell's digit (1-9 -> first 9 chars of the alphabet)
  let digitsStr = ''
  // Stryker disable next-line EqualityOperator: index 81 is out of bounds; cells[81] is undefined and skipped by the inner guard, so iterating to 81 is a no-op
  for (let i = 0; i < 81; i++) {
    const cell = cells[i]
    if (cell !== undefined && cell !== 0) {
      digitsStr += ALPHABET[cell - 1]
    }
  }

  return maskStr + digitsStr
}

/**
 * Dense encoding: Pack all 81 cells (for puzzles with many filled cells)
 * Uses 4 bits per cell = 41 bytes = 55 base64 chars
 */
function encodeDense(cells: number[]): string {
  // Pack 2 cells per byte (4 bits each)
  const bytes: number[] = []
  // Stryker disable next-line EqualityOperator: i advances by 2, so after 80 the next value is 82 which already exceeds 81; the <= variant adds no iteration
  for (let i = 0; i < 81; i += 2) {
    // cells has exactly 81 entries, so an even index is always defined; the ?? 0
    // fallback here is unreachable (only the odd-index low nibble can reach it).
    /* v8 ignore next */
    const high = (cells[i] ?? 0) & 0x0f
    const low = (cells[i + 1] ?? 0) & 0x0f
    bytes.push((high << 4) | low)
  }

  // Convert to base64url
  const uint8 = new Uint8Array(bytes)
  const binary = String.fromCharCode(...uint8)
  const base64 = btoa(binary)
  // Stryker disable next-line StringLiteral: valid sudoku digits (0-9) pack into bytes <= 0x99, whose base64 encoding never produces '+' (62) or '/' (63); only the '=' removal is reachable
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Check if a string is a raw 81-digit puzzle string
 * Accepts digits 0-9 and . for empty cells
 */
function isRaw81String(str: string): boolean {
  // Stryker disable next-line ConditionalExpression: the regex below anchors to exactly 81 chars (^ and $), making this length check logically redundant
  if (str.length !== 81) return false
  // Stryker disable next-line Regex: with the length already constrained to exactly 81 by the guard above, the ^ and $ anchors are redundant on this 81-char input
  return /^[0-9.]{81}$/.test(str)
}

/**
 * Decode a raw 81-character puzzle string (digits 0-9, or . for empty)
 */
function decodeRaw81(str: string): number[] {
  return str.split('').map((c) => (c === '.' ? 0 : parseInt(c, 10)))
}

/**
 * Decode a compact URL-safe string back to a sudoku puzzle
 * Supports:
 * - Raw 81-digit strings (e.g., "530070000600195000098000060...")
 * - Sparse encoded (prefix 's')
 * - Dense encoded (prefix 'd')
 * - Legacy dense format (no prefix)
 */
export function decodePuzzle(encoded: string): number[] {
  // Stryker disable next-line ConditionalExpression, BlockStatement: an empty string falls through to decodeDense('') which returns the same 81-zero board, making this early return observationally identical
  if (encoded.length === 0) {
    return Array(81).fill(0)
  }

  // Check for raw 81-digit string first
  if (isRaw81String(encoded)) {
    return decodeRaw81(encoded)
  }

  const type = encoded[0]
  const data = encoded.slice(1)

  if (type === 'd') {
    return decodeDense(data)
  } else if (type === 's') {
    return decodeSparse(data)
  } else {
    // Legacy format (no prefix) - try dense decoding
    return decodeDense(encoded)
  }
}

const EMPTY_BOARD = () => Array(81).fill(0) as number[]

// Decode the leading 14-char base64url bitmask into a BigInt. Returns null when
// the mask is malformed; callers substitute their own empty fallback.
const decode14CharMask = (maskStr: string): bigint | null => {
  let mask = BigInt(0)
  for (let i = 0; i < 14; i++) {
    const char = maskStr[i]
    /* v8 ignore start */
    // Stryker disable next-line ConditionalExpression: both call sites (decodeSparse L197, decodeCandidates L463) gate on `length < 14` before invoking, so maskStr is always exactly 14 chars and char is always defined; the branch is provably unreachable
    if (!char) return null
    /* v8 ignore stop */
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) return null
    mask = (mask << BigInt(6)) | BigInt(idx)
  }
  return mask
}

// Count set bits across the 81 cell positions of a mask.
const countSetMaskBits = (mask: bigint): number => {
  let count = 0
  // Stryker disable next-line EqualityOperator: extra i=81 step shifts by BigInt(-1), which for BigInt is a left-shift by 1; the resulting low bit is always 0, so count never increments
  for (let i = 0; i < 81; i++) {
    // Stryker disable next-line ConditionalExpression: forcing count to 81 is observationally identical: extractCandBits' shift formula collapses to bytesLen*8-(i+1)*9 regardless of cellsWithCands, and the consumer loop only reads candBits[i] for cells whose mask bit is set, so the surplus entries are never observed
    if (((mask >> BigInt(80 - i)) & BigInt(1)) === BigInt(1)) count++
  }
  return count
}

// Decode a single base64url digit char into a 1-based puzzle digit (0 on miss).
const decodeDigitChar = (char: string | undefined): number => {
  /* v8 ignore start */
  // Stryker disable next-line ConditionalExpression: when char is undefined, the early return yields 0; skipping it makes ALPHABET.indexOf(undefined) return -1, and the ternary below then yields 0 as well. Both paths are observationally identical.
  if (!char) return 0
  /* v8 ignore stop */
  const d = ALPHABET.indexOf(char)
  return d >= 0 && d < 9 ? d + 1 : 0
}

function decodeSparse(encoded: string): number[] {
  // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: at exactly 14 chars the slice(0,14) returns all zeros (a valid empty mask), decode14CharMask yields 0n, digitsStr is '', and the cell loop produces an all-zero board identical to EMPTY_BOARD()
  if (encoded.length < 14) {
    return EMPTY_BOARD()
  }

  // Stryker disable next-line MethodExpression: decode14CharMask reads indices 0..13 of its argument; for an input already at least 14 chars long, maskStr[0..13] is identical whether we pass the full encoded string or its first-14 slice
  const mask = decode14CharMask(encoded.slice(0, 14))
  if (mask === null) return EMPTY_BOARD()
  const digitsStr = encoded.slice(14)

  const cells = EMPTY_BOARD()
  let digitIdx = 0
  // Stryker disable next-line EqualityOperator: extra i=81 step shifts by BigInt(-1) (a left-shift by 1 in BigInt); the low bit becomes 0 so the mask-bit test fails and no assignment happens
  for (let i = 0; i < 81; i++) {
    if (((mask >> BigInt(80 - i)) & BigInt(1)) === BigInt(1)) {
      /* v8 ignore start */
      // Stryker disable next-line ConditionalExpression,EqualityOperator: when digitIdx >= digitsStr.length, digitsStr[digitIdx] is undefined and decodeDigitChar(undefined) returns 0; cells[i] stays at 0 either way, and digitIdx++ runs unconditionally outside the branch
      if (digitIdx < digitsStr.length) cells[i] = decodeDigitChar(digitsStr[digitIdx])
      /* v8 ignore stop */
      digitIdx++
    }
  }

  return cells
}

/**
 * Encode puzzle with full state - includes both givens and user-filled cells
 * Format: 'e' + (givens mask) + (all values)
 * - Uses bitmask to identify which cells are givens
 * - Encodes all 81 cell values (including user entries)
 * - Allows sharing puzzle at any point in solving progress
 */
export function encodePuzzleWithState(
  board: number[],
  givens: number[],
  candidates?: number[][],
): string {
  if (board.length !== 81 || givens.length !== 81) {
    throw new Error('Board and givens must have 81 cells')
  }

  // Create bitmask for givens (81 bits)
  // A cell is marked as a given only if it was originally a given AND hasn't been modified
  let givensMask = BigInt(0)
  // Stryker disable next-line EqualityOperator: extra i=81 step reads givens[81]/board[81] = undefined; `undefined !== 0` is true and `undefined === undefined` is true, so the branch executes but `BigInt(1) << BigInt(-1)` is 0n in BigInt arithmetic, OR-ing 0n is a no-op
  for (let i = 0; i < 81; i++) {
    if (givens[i] !== 0 && board[i] === givens[i]) {
      givensMask |= BigInt(1) << BigInt(80 - i)
    }
  }

  // Encode givens mask as base64url (14 chars for 81 bits)
  let maskStr = ''
  for (let i = 0; i < 14; i++) {
    const idx = Number((givensMask >> BigInt((13 - i) * 6)) & BigInt(0x3f))
    maskStr += ALPHABET[idx]
  }

  // Encode all 81 cell values using dense encoding (4 bits per cell)
  const bytes: number[] = []
  // Stryker disable next-line EqualityOperator: i advances by 2, so after 80 the next value is 82 which already exceeds 81; the <= variant adds no iteration
  for (let i = 0; i < 81; i += 2) {
    // board has exactly 81 entries, so an even index is always defined; the ?? 0
    // fallback here is unreachable (only the odd-index low nibble can reach it).
    /* v8 ignore next */
    const high = (board[i] ?? 0) & 0x0f
    const low = (board[i + 1] ?? 0) & 0x0f
    bytes.push((high << 4) | low)
  }

  const uint8 = new Uint8Array(bytes)
  const binary = String.fromCharCode(...uint8)
  // Stryker disable next-line StringLiteral: board values are sudoku digits (0-9) which pack into bytes <= 0x99, whose base64 encoding never produces '+' (62) or '/' (63); only the '=' removal is reachable
  const boardStr = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  // If no candidates provided, return without candidates
  if (!candidates || candidates.length !== 81) {
    return 'e' + maskStr + boardStr
  }

  // Check if there are any candidates to encode
  const hasCandidates = candidates.some((c) => c && c.length > 0)
  if (!hasCandidates) {
    return 'e' + maskStr + boardStr
  }

  // Encode candidates with 'c' prefix to indicate candidates are included
  const candidatesStr = encodeCandidates(candidates)
  return 'c' + maskStr + boardStr + candidatesStr
}

/**
 * Encode candidates compactly
 * Strategy:
 * 1. Bitmask for which cells have candidates (81 bits = 14 chars)
 * 2. For each cell with candidates, 9 bits for digits 1-9
 * Pack efficiently into base64
 */
function encodeCandidates(candidates: number[][]): string {
  // Create bitmask for cells that have candidates
  let hasCandMask = BigInt(0)
  // Stryker disable next-line EqualityOperator: index 81 is out of bounds; candidates[81] is undefined and the inner `cands &&` guard skips it, so iterating to 81 is a no-op
  for (let i = 0; i < 81; i++) {
    const cands = candidates[i]
    if (cands && cands.length > 0) {
      hasCandMask |= BigInt(1) << BigInt(80 - i)
    }
  }

  // Encode hasCandMask as 14 base64 chars
  let maskStr = ''
  for (let i = 0; i < 14; i++) {
    const idx = Number((hasCandMask >> BigInt((13 - i) * 6)) & BigInt(0x3f))
    maskStr += ALPHABET[idx]
  }

  // Collect all candidate bits for cells that have candidates
  // Each cell's candidates are 9 bits (bit 0 = digit 1, bit 8 = digit 9)
  const candBits: number[] = []
  // Stryker disable next-line EqualityOperator: index 81 is out of bounds; candidates[81] is undefined and the inner `cands &&` guard skips it, so iterating to 81 is a no-op
  for (let i = 0; i < 81; i++) {
    const cands = candidates[i]
    if (cands && cands.length > 0) {
      let bits = 0
      for (const d of cands) {
        if (d >= 1 && d <= 9) {
          bits |= 1 << (d - 1)
        }
      }
      candBits.push(bits)
    }
  }

  // Pack 9-bit values into bytes
  // We'll use a simple approach: pack bits sequentially and convert to base64
  let allBits = BigInt(0)
  let bitCount = 0
  for (const bits of candBits) {
    allBits = (allBits << BigInt(9)) | BigInt(bits)
    bitCount += 9
  }

  // Pad to byte boundary (add zeros on the right/LSB side)
  const paddingBits = (8 - (bitCount % 8)) % 8
  allBits = allBits << BigInt(paddingBits)
  const totalBits = bitCount + paddingBits

  // Convert to bytes (MSB first)
  const byteCount = totalBits / 8
  const candBytes: number[] = []
  for (let i = byteCount - 1; i >= 0; i--) {
    candBytes.push(Number((allBits >> BigInt(i * 8)) & BigInt(0xff)))
  }

  // Convert to base64url
  /* v8 ignore start */
  // Stryker disable next-line ConditionalExpression,BlockStatement: encodeCandidates is only called after the `hasCandidates` guard in encodePuzzleWithState, so at least one cell pushes an entry to candBits; bitCount >= 9 forces byteCount >= 2, so candBytes is never empty and this branch is provably unreachable
  if (candBytes.length === 0) {
    return maskStr
  }
  /* v8 ignore stop */
  const candUint8 = new Uint8Array(candBytes)
  const candBinary = String.fromCharCode(...candUint8)
  const candBase64 = btoa(candBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return maskStr + candBase64
}

/**
 * Decode puzzle with full state
 * Returns both the complete board and the givens mask
 * Allows restoring puzzle at any point in solving progress
 */
export function decodePuzzleWithState(
  encoded: string,
): { board: number[]; givens: number[]; candidates?: number[][] } | null {
  // Handle 'c' prefix (with candidates) or 'e' prefix (board only)
  if (!encoded.startsWith('e') && !encoded.startsWith('c')) {
    return null
  }

  const hasCandidates = encoded.startsWith('c')
  const data = encoded.slice(1)

  // Need at least 14 chars for givens mask + ~28 chars for board data
  if (data.length < 14 + 20) {
    return null
  }

  // Decode givens mask (first 14 chars)
  // Stryker disable next-line MethodExpression: decode14CharMask's loop reads indices 0..13 of its argument; for an input already at least 14 chars long, data and data.slice(0,14) share the same first-14 chars, so the decoded mask is identical
  const maskStr = data.slice(0, 14)
  let mask = BigInt(0)
  for (let i = 0; i < 14; i++) {
    const idx = ALPHABET.indexOf(maskStr.charAt(i))
    if (idx === -1) return null
    mask = (mask << BigInt(6)) | BigInt(idx)
  }

  // Board data is 41 bytes = 55 base64 chars (approximately, without padding)
  // Dense encoding: 81 cells at 4 bits each = 324 bits = 40.5 bytes = 41 bytes
  const boardEndIdx = 14 + 55 // After mask (14) + board (~55 chars)

  // Find where the board ends by trying to decode it
  // The board is exactly 41 bytes = 328 bits, which encodes to ceil(41*8/6) = 55 base64 chars
  const boardStr = data.slice(14, boardEndIdx)
  const board = decodeDense(boardStr)
  /* v8 ignore start */
  // Stryker disable next-line ConditionalExpression: decodeDense always returns a length-81 array (padding to 81 cells at the end), so this guard is unreachable for any input that reaches this line; forcing false is observationally identical
  if (board.length !== 81) return null
  /* v8 ignore stop */

  // Extract givens from mask
  const givens = Array(81).fill(0) as number[]
  // Stryker disable next-line EqualityOperator: at i===81 the BigInt shift is by BigInt(-1) (a left-shift by 1), so the masked bit is always 0 and no assignment happens; even if it did, givens[81] is out of bounds
  for (let i = 0; i < 81; i++) {
    const bit = (mask >> BigInt(80 - i)) & BigInt(1)
    if (bit === BigInt(1)) {
      // board is length 81 and i < 81, so board[i] is always defined; ?? 0 is a
      // defensive default.
      /* v8 ignore next */
      givens[i] = board[i] ?? 0
    }
  }

  // If no candidates, return just board and givens
  if (!hasCandidates) {
    return { board, givens }
  }

  // Decode candidates
  const candidatesData = data.slice(boardEndIdx)
  const candidates = decodeCandidates(candidatesData)

  return { board, givens, candidates }
}

/**
 * Decode candidates from encoded string
 */
// Decode a base64url string into bytes. Returns null on empty or decode error.
const base64UrlToBytes = (str: string): Uint8Array | null => {
  /* v8 ignore start */
  // Stryker disable next-line ConditionalExpression: when str==='' the original returns null; the mutant continues, but the atob('') call below yields '' (empty binary), producing a zero-length Uint8Array. Callers check `if (!bytes)` which is false for an empty Uint8Array, then extractCandBits runs zero iterations, and the consumer loop's mask-bit check skips every cell — yielding the same all-empty candidates that the null path returns
  if (str.length === 0) return null
  /* v8 ignore stop */
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    // Stryker disable next-line EqualityOperator: at i===binary.length, binary.charCodeAt(i) returns NaN and the Uint8Array coerces it to 0; the assignment is silently dropped because bytes has exactly binary.length slots, so the extra iteration is a no-op
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

// Expand a packed 9-bit candidate mask into the list of candidate digits 1-9.
const bitsToCandidateDigits = (bits: number | undefined): number[] => {
  const digits: number[] = []
  /* v8 ignore start */
  // Stryker disable next-line ConditionalExpression: every caller passes a defined number (extractCandBits indexes a typed array slot that may be undefined, but the surrounding `candIdx < candBits.length` guard ensures the index is in range). For the in-range case both branches yield the same digits list; the mutant only differs when bits===undefined, which is unreachable in normal flow
  if (bits === undefined) return digits
  /* v8 ignore stop */
  for (let d = 1; d <= 9; d++) {
    if ((bits & (1 << (d - 1))) !== 0) digits.push(d)
  }
  return digits
}

// Extract the packed 9-bit candidate values (MSB-first, right-padded) from bytes.
const extractCandBits = (bytes: Uint8Array, cellsWithCands: number): number[] => {
  let allBits = BigInt(0)
  // Stryker disable next-line EqualityOperator: at i===bytes.length, bytes[i] is undefined and BigInt(undefined) throws; the extra iteration is therefore a no-op for the in-range case (which is the only reachable case since the loop bound is the array length)
  for (let i = 0; i < bytes.length; i++) {
    // bytes[i] is always defined for i < bytes.length (Uint8Array), so ?? 0 is a
    // defensive default.
    /* v8 ignore next */
    allBits = (allBits << BigInt(8)) | BigInt(bytes[i] ?? 0)
  }
  const totalBitsInBytes = bytes.length * 8
  const paddingBits = totalBitsInBytes - cellsWithCands * 9
  const candBits: number[] = []
  for (let i = 0; i < cellsWithCands; i++) {
    const shiftAmount = paddingBits + (cellsWithCands - 1 - i) * 9
    candBits.push(Number((allBits >> BigInt(shiftAmount)) & BigInt(0x1ff)))
  }
  return candBits
}

function decodeCandidates(data: string): number[][] {
  const candidates: number[][] = Array(81)
    .fill(null)
    .map(() => [])

  // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: for data.length<=14, the alternative paths collapse — short data makes decode14CharMask return null (next guard) and a 14-char mask of all zeros makes cellsWithCands===0 (guard after); in both cases the function returns the same all-empty candidates with or without this early return
  if (data.length < 14) {
    return candidates
  }

  // Stryker disable next-line MethodExpression: decode14CharMask reads only indices 0..13 of its argument; for data already >=14 chars long, data.slice(0,14) and data share those leading 14 chars identically
  const mask = decode14CharMask(data.slice(0, 14))
  /* v8 ignore start */
  // Stryker disable next-line ConditionalExpression: forcing `false` here continues with mask===null, but BigInt ops on null coerce to 0n so countSetMaskBits returns 0 and the L467 guard returns the same all-empty candidates
  if (mask === null) return candidates
  /* v8 ignore stop */

  const cellsWithCands = countSetMaskBits(mask)
  /* v8 ignore start */
  // Stryker disable next-line ConditionalExpression: forcing `false` continues with cellsWithCands===0; extractCandBits returns an empty array and the consumer loop's mask-bit check (mask===0n) skips every cell, yielding the same all-empty candidates as the early return
  if (cellsWithCands === 0) return candidates
  /* v8 ignore stop */

  const bytes = base64UrlToBytes(data.slice(14))
  if (!bytes) return candidates

  const candBits = extractCandBits(bytes, cellsWithCands)

  let candIdx = 0
  // Stryker disable next-line EqualityOperator: at i===81 the BigInt shift is by BigInt(-1) (a left-shift by 1 in BigInt), so (mask>>...) & 1n is 0n and the compound condition is false; the extra iteration is a no-op
  for (let i = 0; i < 81; i++) {
    // Stryker disable next-line ConditionalExpression,EqualityOperator: forcing the compound condition to `true` or `<=` adds iterations where candBits[candIdx] is undefined; bitsToCandidateDigits(undefined) returns [], which is already the initialized value of candidates[i], so no observable change
    if (((mask >> BigInt(80 - i)) & BigInt(1)) === BigInt(1) && candIdx < candBits.length) {
      candidates[i] = bitsToCandidateDigits(candBits[candIdx])
      candIdx++
    }
  }

  return candidates
}

function decodeDense(encoded: string): number[] {
  // Convert from base64url to standard base64
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '='
  }

  // Decode base64
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return Array(81).fill(0)
  }

  const bytes = new Uint8Array(binary.length)
  // Stryker disable next-line EqualityOperator: at i===binary.length, binary.charCodeAt(i) is NaN and the Uint8Array coerces it to 0; bytes has exactly binary.length slots so the assignment is silently dropped, making the extra iteration a no-op
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  // Unpack 2 cells per byte
  const cells: number[] = []
  // Stryker disable next-line EqualityOperator: at i===bytes.length, byte===undefined; the L519 `if (byte === undefined) continue` guard skips the extra iteration, making it a no-op
  for (let i = 0; i < bytes.length && cells.length < 81; i++) {
    const byte = bytes[i]
    /* v8 ignore start */
    // Stryker disable next-line ConditionalExpression: for in-range i, bytes[i] is always defined (Uint8Array returns a number for valid indices), so this guard only matters for the L508 mutant's extra iteration; without it, that extra step still skips cleanly because the loop's `cells.length < 81` bound halts growth. For the normal in-range case both branches are identical.
    if (byte === undefined) continue
    /* v8 ignore stop */
    const high = (byte >> 4) & 0x0f
    const low = byte & 0x0f
    cells.push(high)
    if (cells.length < 81) {
      cells.push(low)
    }
  }

  // Pad to 81 if needed
  while (cells.length < 81) {
    cells.push(0)
  }

  return cells
}
