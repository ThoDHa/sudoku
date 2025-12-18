// Compact puzzle encoding for shareable URLs
// Encodes 81 cells (0-9) into a URL-safe base64 string

// Each cell is 0-9 (10 values), so we can pack ~2.5 cells per character
// Using base64url encoding: 64 values = 6 bits per char
// 81 cells * ~3.32 bits per cell = ~269 bits = ~45 base64 chars

/**
 * Encode a sudoku puzzle (81 cells, values 0-9) to a compact URL-safe string
 * Uses base64url encoding. Empty cells are 0.
 * 
 * Format: Each cell is 4 bits (0-9, values 10-15 unused), packed into bytes
 * 81 cells = 41 bytes (with padding) = ~55 base64 chars
 */
export function encodePuzzle(cells: number[]): string {
  if (cells.length !== 81) {
    throw new Error('Puzzle must have 81 cells')
  }

  // Pack 2 cells per byte (4 bits each)
  const bytes: number[] = []
  for (let i = 0; i < 81; i += 2) {
    const high = cells[i] & 0x0F
    const low = (cells[i + 1] ?? 0) & 0x0F
    bytes.push((high << 4) | low)
  }

  // Convert to base64url
  const uint8 = new Uint8Array(bytes)
  const binary = String.fromCharCode(...uint8)
  const base64 = btoa(binary)
  // Convert to base64url (URL-safe)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Decode a compact URL-safe string back to a sudoku puzzle
 */
export function decodePuzzle(encoded: string): number[] {
  // Convert from base64url to standard base64
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '='
  }

  // Decode base64
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  // Unpack 2 cells per byte
  const cells: number[] = []
  for (let i = 0; i < bytes.length && cells.length < 81; i++) {
    const high = (bytes[i] >> 4) & 0x0F
    const low = bytes[i] & 0x0F
    cells.push(high)
    if (cells.length < 81) {
      cells.push(low)
    }
  }

  return cells
}