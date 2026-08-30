// Compact puzzle encoding for shareable URLs
// Two encoding strategies:
// 1. "Sparse" encoding for puzzles with few givens (typical sudoku ~25 givens)
// 2. "Dense" encoding for puzzles with many filled cells

// Base64url alphabet for efficient encoding
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// Bit (within a 9-bit candidate group) for each digit 0-9; digit 0 is the
// |= identity so invalid digits contribute nothing.
const DIGIT_BIT = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256]

const toBase64Url = (bytes: number[]): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

// Encode an 81-cell bitmask as 14 base64url chars (84 bits, 3 leading zeros).
const maskToChars = (mask: bigint): string => {
  let maskStr = ''
  for (let i = 0; i < 14; i++) {
    const idx = Number((mask >> BigInt((13 - i) * 6)) & BigInt(0x3f))
    maskStr += ALPHABET.charAt(idx)
  }
  return maskStr
}

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
  for (const [i, cell] of cells.entries()) {
    if (cell !== 0) {
      mask |= BigInt(1) << BigInt(80 - i)
    }
  }

  // Empty puzzle encodes to '' (decoder maps that back to an all-zero board).
  if (mask === BigInt(0)) {
    return ''
  }

  // Encode bitmask as base64url (81 bits -> 14 chars)
  const maskStr = maskToChars(mask)

  // Encode each filled cell's digit (1-9 -> first 9 chars of the alphabet)
  let digitsStr = ''
  for (const cell of cells) {
    // charAt(-1) is '' for empty cells (cell 0), so the unfilled cells
    // contribute no digit char, exactly one per set mask bit otherwise.
    digitsStr += ALPHABET.charAt(cell - 1)
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
  for (const [i, cell] of cells.entries()) {
    if (i % 2 === 0) {
      const high = cell & 0x0f
      const low = (cells[i + 1] ?? 0) & 0x0f
      bytes.push((high << 4) | low)
    }
  }

  // Convert to base64url
  return toBase64Url(bytes)
}

/**
 * Check if a string is a raw 81-digit puzzle string
 * Accepts digits 0-9 and . for empty cells
 */
function isRaw81String(str: string): boolean {
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

const EMPTY_BOARD = () => Array<number>(81).fill(0)

// Decode the leading 14-char base64url bitmask into a BigInt. Returns null when
// the mask is malformed; callers substitute their own empty fallback.
const decode14CharMask = (maskStr: string): bigint | null => {
  let mask = BigInt(0)
  for (const char of maskStr) {
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) return null
    mask = (mask << BigInt(6)) | BigInt(idx)
  }
  return mask
}

// Cell indexes (0-80) of the set bits in an 81-cell mask, in cell order.
const setBitIndexes = (mask: bigint): number[] => {
  const indexes: number[] = []
  for (const i of Array(81).keys()) {
    if (((mask >> BigInt(80 - i)) & BigInt(1)) === BigInt(1)) indexes.push(i)
  }
  return indexes
}

// Decode a single base64url digit char into a 1-based puzzle digit (0 on miss).
const decodeDigitChar = (char: string | undefined): number => {
  /* istanbul ignore start */
  // Stryker disable next-line ConditionalExpression: covers the `false` replacement only (guard skipped): ALPHABET.indexOf(undefined) coerces to a search for "undefined", returns -1, and the range check below then yields the same 0 the early return gives. The `true` replacement dies: every valid digit char would decode as 0.
  if (!char) return 0
  /* istanbul ignore stop */
  const d = ALPHABET.indexOf(char)
  // indexOf yields -1 (miss) or 0..63; for -1 the d+1 arm already yields 0,
  // so only the upper bound needs guarding.
  return d < 9 ? d + 1 : 0
}

function decodeSparse(encoded: string): number[] {
  const mask = decode14CharMask(encoded.slice(0, 14))
  if (mask === null) return EMPTY_BOARD()
  const digitsStr = encoded.slice(14)

  const cells = EMPTY_BOARD()
  for (const [digitIdx, i] of setBitIndexes(mask).entries()) {
    cells[i] = decodeDigitChar(digitsStr[digitIdx])
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
  for (const [i, given] of givens.entries()) {
    if (given !== 0 && board[i] === given) {
      givensMask |= BigInt(1) << BigInt(80 - i)
    }
  }

  // Encode givens mask as base64url (14 chars for 81 bits)
  const maskStr = maskToChars(givensMask)

  // Encode all 81 cell values using dense encoding (4 bits per cell)
  const bytes: number[] = []
  for (const [i, cell] of board.entries()) {
    if (i % 2 === 0) {
      const high = cell & 0x0f
      const low = (board[i + 1] ?? 0) & 0x0f
      bytes.push((high << 4) | low)
    }
  }

  const boardStr = toBase64Url(bytes)

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
  for (const [i, cands] of candidates.entries()) {
    if (cands && cands.length > 0) {
      hasCandMask |= BigInt(1) << BigInt(80 - i)
    }
  }

  // Encode hasCandMask as 14 base64 chars
  const maskStr = maskToChars(hasCandMask)

  // Collect all candidate bits for cells that have candidates
  // Each cell's candidates are 9 bits (bit 0 = digit 1, bit 8 = digit 9)
  const candBits: number[] = []
  for (const cands of candidates) {
    if (cands && cands.length > 0) {
      let bits = 0
      for (const d of cands) {
        bits |= DIGIT_BIT[d] ?? 0
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
  const candBase64 = toBase64Url(candBytes)

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
  const mask = decode14CharMask(data.slice(0, 14))
  if (mask === null) return null

  // Board data is 41 bytes = 55 base64 chars (approximately, without padding)
  // Dense encoding: 81 cells at 4 bits each = 324 bits = 40.5 bytes = 41 bytes
  const boardEndIdx = 14 + 55 // After mask (14) + board (~55 chars)

  // Find where the board ends by trying to decode it
  // The board is exactly 41 bytes = 328 bits, which encodes to ceil(41*8/6) = 55 base64 chars
  const boardStr = data.slice(14, boardEndIdx)
  const board = decodeDense(boardStr)

  // Extract givens from mask
  const givens = Array<number>(81).fill(0)
  for (const [i, cell] of board.entries()) {
    const bit = (mask >> BigInt(80 - i)) & BigInt(1)
    if (bit === BigInt(1)) {
      givens[i] = cell
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
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return bytes
    // Directive is inline on the `catch` line so it leads the CatchClause node; a
    // disable comment placed here inside the try body attaches elsewhere and is inert.
  } /* Stryker disable next-line BlockStatement: emptying the catch returns undefined instead of null, but the sole consumer (`const bytes = base64UrlToBytes(...); if (!bytes) return candidates`) treats null and undefined identically, so the change is observationally equivalent */ catch {
    return null
  }
}

// Expand a packed 9-bit candidate mask into the list of candidate digits 1-9.
const bitsToCandidateDigits = (bits: number): number[] => {
  const digits: number[] = []
  for (let d = 1; d <= 9; d++) {
    if ((bits & (1 << (d - 1))) !== 0) digits.push(d)
  }
  return digits
}

function decodeCandidates(data: string): number[][] {
  const candidates: number[][] = Array(81)
    .fill(null)
    .map(() => [])

  const mask = decode14CharMask(data.slice(0, 14))
  if (mask === null) return candidates

  const bytes = base64UrlToBytes(data.slice(14))
  if (!bytes) return candidates

  const cellIdxs = setBitIndexes(mask)

  // Unpack the packed 9-bit candidate groups (MSB-first, right-padded): fold the
  // bytes into one BigInt, drop the padding bits, then dequeue one group per set
  // mask bit, last cell first.
  let remaining = BigInt(0)
  for (const byte of bytes) {
    remaining = (remaining << BigInt(8)) | BigInt(byte)
  }
  remaining >>= BigInt(bytes.length * 8 - cellIdxs.length * 9)

  for (const cellIdx of [...cellIdxs].reverse()) {
    candidates[cellIdx] = bitsToCandidateDigits(Number(remaining & BigInt(0x1ff)))
    remaining >>= BigInt(9)
  }

  return candidates
}

function decodeDense(encoded: string): number[] {
  // Convert from base64url to standard base64
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')

  // Decode base64
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return Array<number>(81).fill(0)
  }

  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  // Unpack 2 cells per byte
  const cells: number[] = []
  for (const byte of bytes) {
    if (cells.length === 81) break
    const high = (byte >> 4) & 0x0f
    const low = byte & 0x0f
    cells.push(high > 9 ? 0 : high)
    if (cells.length < 81) {
      cells.push(low > 9 ? 0 : low)
    }
  }

  // Pad to 81 if needed
  while (cells.length < 81) {
    cells.push(0)
  }

  return cells
}
