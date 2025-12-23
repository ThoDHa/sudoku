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

  const filledCount = cells.filter(c => c !== 0).length
  
  // For puzzles with many filled cells (>40), use dense encoding
  if (filledCount > 40) {
    return 'd' + encodeDense(cells)
  }
  
  // For typical puzzles, use sparse encoding
  return 's' + encodeSparse(cells)
}

/**
 * Sparse encoding: Only encode cells that have values
 * Format: series of (position, digit) pairs encoded efficiently
 */
function encodeSparse(cells: number[]): string {
  // Collect givens as (position, digit) pairs
  const givens: Array<{pos: number, digit: number}> = []
  for (let i = 0; i < 81; i++) {
    const cell = cells[i]
    if (cell !== undefined && cell !== 0) {
      givens.push({ pos: i, digit: cell })
    }
  }
  
  if (givens.length === 0) {
    return '' // Empty puzzle
  }
  
  // Encode each given as a single number: pos * 9 + (digit - 1)
  // This gives values 0-728, which we encode in base64
  // Each value needs ceil(log64(729)) = 2 base64 chars
  // But we can pack multiple values more efficiently
  
  // Convert to a big number, then to base64
  // For simplicity, pack position (7 bits) + digit (4 bits) = 11 bits per given
  const bits: number[] = []
  
  // First byte: number of givens (0-81)
  bits.push(givens.length)
  
  for (const g of givens) {
    // Pack position (7 bits, 0-80) and digit (4 bits, 1-9 stored as 0-8)
    const packed = (g.pos << 4) | (g.digit - 1)
    bits.push((packed >> 8) & 0xFF) // High byte (3 bits used)
    bits.push(packed & 0xFF)        // Low byte (8 bits)
  }
  
  // But that's still 2 bytes per given. Let's use a tighter packing:
  // Encode as sequence of base64 chars directly
  // Position 0-80 (81 values) needs 7 bits
  // Digit 1-9 (9 values) needs 4 bits
  // Total: 11 bits per given
  
  // Actually let's use a simpler, more compact approach:
  // Encode as: count, then for each given: position in base85, digit 1-9
  
  // Simplest working approach: variable-length encoding
  // Use a bitmask (81 bits = 14 chars) + digits (1 char per given in base9)
  // Total: 14 + 25 = 39 chars for typical puzzle
  
  // Bitmask approach
  let mask = BigInt(0)
  for (let i = 0; i < 81; i++) {
    const cell = cells[i]
    if (cell !== undefined && cell !== 0) {
      mask |= BigInt(1) << BigInt(80 - i)
    }
  }
  
  // Encode bitmask as base64 (81 bits = 14 base64 chars)
  let maskStr = ''
  for (let i = 0; i < 14; i++) {
    const idx = Number((mask >> BigInt((13 - i) * 6)) & BigInt(0x3F))
    const char = ALPHABET[idx]
    if (char) maskStr += char
  }
  
  // Encode digits (each digit 1-9 as single char, using first 9 chars of alphabet)
  let digitsStr = ''
  for (let i = 0; i < 81; i++) {
    const cell = cells[i]
    if (cell !== undefined && cell !== 0) {
      const char = ALPHABET[cell - 1]
      if (char) digitsStr += char // 1-9 -> A-I
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
  for (let i = 0; i < 81; i += 2) {
    const high = (cells[i] ?? 0) & 0x0F
    const low = (cells[i + 1] ?? 0) & 0x0F
    bytes.push((high << 4) | low)
  }

  // Convert to base64url
  const uint8 = new Uint8Array(bytes)
  const binary = String.fromCharCode(...uint8)
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Check if a string is a raw 81-digit puzzle string
 * Accepts digits 0-9 and . for empty cells
 */
function isRaw81String(str: string): boolean {
  if (str.length !== 81) return false
  return /^[0-9.]{81}$/.test(str)
}

/**
 * Decode a raw 81-character puzzle string (digits 0-9, or . for empty)
 */
function decodeRaw81(str: string): number[] {
  return str.split('').map(c => c === '.' ? 0 : parseInt(c, 10))
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
    return decodeDenseLegacy(encoded)
  }
}

function decodeSparse(encoded: string): number[] {
  if (encoded.length < 14) {
    return Array(81).fill(0)
  }
  
  // First 14 chars are the bitmask
  const maskStr = encoded.slice(0, 14)
  const digitsStr = encoded.slice(14)
  
  // Decode bitmask
  let mask = BigInt(0)
  for (let i = 0; i < 14; i++) {
    const char = maskStr[i]
    if (!char) return Array(81).fill(0) as number[]
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) return Array(81).fill(0) as number[]
    mask = (mask << BigInt(6)) | BigInt(idx)
  }
  
  // Decode digits
  const cells = Array(81).fill(0) as number[]
  let digitIdx = 0
  for (let i = 0; i < 81; i++) {
    const bit = (mask >> BigInt(80 - i)) & BigInt(1)
    if (bit === BigInt(1)) {
      if (digitIdx < digitsStr.length) {
        const char = digitsStr[digitIdx]
        if (char) {
          const d = ALPHABET.indexOf(char)
          if (d >= 0 && d < 9) {
            cells[i] = d + 1
          }
        }
        digitIdx++
      }
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
export function encodePuzzleWithState(board: number[], givens: number[], candidates?: number[][]): string {
  if (board.length !== 81 || givens.length !== 81) {
    throw new Error('Board and givens must have 81 cells')
  }

  // Create bitmask for givens (81 bits)
  let givensMask = BigInt(0)
  for (let i = 0; i < 81; i++) {
    if (givens[i] !== 0) {
      givensMask |= BigInt(1) << BigInt(80 - i)
    }
  }

  // Encode givens mask as base64url (14 chars for 81 bits)
  let maskStr = ''
  for (let i = 0; i < 14; i++) {
    const idx = Number((givensMask >> BigInt((13 - i) * 6)) & BigInt(0x3F))
    maskStr += ALPHABET[idx]
  }

  // Encode all 81 cell values using dense encoding (4 bits per cell)
  const bytes: number[] = []
  for (let i = 0; i < 81; i += 2) {
    const high = (board[i] ?? 0) & 0x0F
    const low = (board[i + 1] ?? 0) & 0x0F
    bytes.push((high << 4) | low)
  }

  const uint8 = new Uint8Array(bytes)
  const binary = String.fromCharCode(...uint8)
  const boardStr = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  // If no candidates provided, return without candidates
  if (!candidates || candidates.length !== 81) {
    return 'e' + maskStr + boardStr
  }

  // Check if there are any candidates to encode
  const hasCandidates = candidates.some(c => c && c.length > 0)
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
  for (let i = 0; i < 81; i++) {
    const cands = candidates[i]
    if (cands && cands.length > 0) {
      hasCandMask |= BigInt(1) << BigInt(80 - i)
    }
  }

  // Encode hasCandMask as 14 base64 chars
  let maskStr = ''
  for (let i = 0; i < 14; i++) {
    const idx = Number((hasCandMask >> BigInt((13 - i) * 6)) & BigInt(0x3F))
    maskStr += ALPHABET[idx]
  }

  // Collect all candidate bits for cells that have candidates
  // Each cell's candidates are 9 bits (bit 0 = digit 1, bit 8 = digit 9)
  const candBits: number[] = []
  for (let i = 0; i < 81; i++) {
    const cands = candidates[i]
    if (cands && cands.length > 0) {
      let bits = 0
      for (const d of cands) {
        if (d >= 1 && d <= 9) {
          bits |= (1 << (d - 1))
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
    candBytes.push(Number((allBits >> BigInt(i * 8)) & BigInt(0xFF)))
  }

  // Convert to base64url
  if (candBytes.length === 0) {
    return maskStr
  }
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
export function decodePuzzleWithState(encoded: string): { board: number[]; givens: number[]; candidates?: number[][] } | null {
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
  const maskStr = data.slice(0, 14)
  let mask = BigInt(0)
  for (let i = 0; i < 14; i++) {
    const char = maskStr[i]
    if (!char) return null
    const idx = ALPHABET.indexOf(char)
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
  if (board.length !== 81) return null

  // Extract givens from mask
  const givens = Array(81).fill(0) as number[]
  for (let i = 0; i < 81; i++) {
    const bit = (mask >> BigInt(80 - i)) & BigInt(1)
    if (bit === BigInt(1)) {
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
function decodeCandidates(data: string): number[][] {
  const candidates: number[][] = Array(81).fill(null).map(() => [])
  
  if (data.length < 14) {
    return candidates
  }

  // First 14 chars are the bitmask for which cells have candidates
  const maskStr = data.slice(0, 14)
  let mask = BigInt(0)
  for (let i = 0; i < 14; i++) {
    const char = maskStr[i]
    if (!char) return candidates
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) return candidates
    mask = (mask << BigInt(6)) | BigInt(idx)
  }

  // Count how many cells have candidates
  let cellsWithCands = 0
  for (let i = 0; i < 81; i++) {
    const bit = (mask >> BigInt(80 - i)) & BigInt(1)
    if (bit === BigInt(1)) {
      cellsWithCands++
    }
  }

  if (cellsWithCands === 0) {
    return candidates
  }

  // Decode the candidate bits from base64
  const candBase64 = data.slice(14)
  if (candBase64.length === 0) {
    return candidates
  }

  // Convert from base64url to standard base64
  let base64 = candBase64.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }

  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return candidates
  }

  // Convert to bytes
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  // Reconstruct all bits
  let allBits = BigInt(0)
  for (let i = 0; i < bytes.length; i++) {
    allBits = (allBits << BigInt(8)) | BigInt(bytes[i] ?? 0)
  }

  // Extract 9-bit values for each cell with candidates
  // Encoding packs MSB-first with padding on the right (LSB side)
  // So we extract from MSB to LSB
  const candBits: number[] = []
  const dataBits = cellsWithCands * 9
  const totalBitsInBytes = bytes.length * 8
  const paddingBits = totalBitsInBytes - dataBits
  
  // Extract 9-bit values from MSB (left side), skipping right-side padding
  for (let i = 0; i < cellsWithCands; i++) {
    // Shift amount: how many bits from the RIGHT to this 9-bit chunk
    // First chunk starts at (totalBitsInBytes - 9), second at (totalBitsInBytes - 18), etc.
    // But we also need to account for padding which is at the RIGHT
    const shiftAmount = paddingBits + (cellsWithCands - 1 - i) * 9
    candBits.push(Number((allBits >> BigInt(shiftAmount)) & BigInt(0x1FF)))
  }

  // Apply candidates to cells
  let candIdx = 0
  for (let i = 0; i < 81; i++) {
    const bit = (mask >> BigInt(80 - i)) & BigInt(1)
    if (bit === BigInt(1) && candIdx < candBits.length) {
      const bits = candBits[candIdx]
      const cellCands: number[] = []
      for (let d = 1; d <= 9; d++) {
        if (bits !== undefined && (bits & (1 << (d - 1))) !== 0) {
          cellCands.push(d)
        }
      }
      candidates[i] = cellCands
      candIdx++
    }
  }

  return candidates
}

function decodeDense(encoded: string): number[] {
  return decodeDenseLegacy(encoded)
}

function decodeDenseLegacy(encoded: string): number[] {
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
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  // Unpack 2 cells per byte
  const cells: number[] = []
  for (let i = 0; i < bytes.length && cells.length < 81; i++) {
    const byte = bytes[i]
    if (byte === undefined) continue
    const high = (byte >> 4) & 0x0F
    const low = byte & 0x0F
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