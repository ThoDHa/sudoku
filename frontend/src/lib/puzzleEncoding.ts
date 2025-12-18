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
 * Decode a compact URL-safe string back to a sudoku puzzle
 */
export function decodePuzzle(encoded: string): number[] {
  if (encoded.length === 0) {
    return Array(81).fill(0)
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