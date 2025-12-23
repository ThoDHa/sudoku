import { useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Board from '../components/Board'
import { encodePuzzle } from '../lib/puzzleEncoding'
import { validateCustomPuzzle } from '../lib/solver-service'
import { MIN_GIVENS, STORAGE_KEYS } from '../lib/constants'

export default function Custom() {
  const navigate = useNavigate()
  const [board, setBoard] = useState<number[]>(Array(81).fill(0))
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate device ID for validation
  const getDeviceId = useCallback(() => {
    try {
      let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID)
      if (!deviceId) {
        deviceId = crypto.randomUUID()
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId)
      }
      return deviceId
    } catch {
      // localStorage not available (private mode, storage full, etc.)
      // Return a session-only ID
      return crypto.randomUUID()
    }
  }, [])

  const handleCellClick = (idx: number) => {
    setSelectedCell(idx)
    setError(null)
  }

  const handleDigitInput = (digit: number) => {
    if (selectedCell === null) return

    const newBoard = [...board]
    newBoard[selectedCell] = digit
    setBoard(newBoard)
    setError(null)
  }

  const handleErase = () => {
    if (selectedCell === null) return

    const newBoard = [...board]
    newBoard[selectedCell] = 0
    setBoard(newBoard)
    setError(null)
  }

  const handleClear = () => {
    setBoard(Array(81).fill(0))
    setSelectedCell(null)
    setError(null)
  }

  const handleValidateAndPlay = async () => {
    setValidating(true)
    setError(null)

    try {
      // Check we have enough givens
      const givenCount = board.filter((v) => v !== 0).length
      if (givenCount < MIN_GIVENS) {
        setError(`Need at least ${MIN_GIVENS} givens for a valid Sudoku puzzle.`)
        setValidating(false)
        return
      }

      // Validate using solver service (WASM-first)
      const data = await validateCustomPuzzle(board, getDeviceId())

      if (!data.valid) {
        setError(data.reason || 'Puzzle is invalid')
        setValidating(false)
        return
      }

      if (!data.unique) {
        setError('Puzzle has multiple solutions. A valid Sudoku must have exactly one solution.')
        setValidating(false)
        return
      }

      // Encode the puzzle for a shareable URL
      const encoded = encodePuzzle(board)

      // Navigate to play the custom puzzle using the encoded URL
      navigate(`/c/${encoded}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate puzzle. Please try again.')
    } finally {
      setValidating(false)
    }
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const digits = text.replace(/[^0-9.]/g, '').split('').map((c) => (c === '.' ? 0 : parseInt(c, 10)))

      if (digits.length === 81) {
        setBoard(digits)
        setError(null)
      } else {
        setError(`Expected 81 digits, got ${digits.length}. Use 0 or . for empty cells.`)
      }
    } catch {
      setError('Failed to read clipboard')
    }
  }

  // Create empty candidates for display
  const candidates = new Uint16Array(81)

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background" style={{ padding: 'var(--page-padding)' }}>
      <div className="mb-4">
        <Link to="/" className="text-sm text-accent hover:underline">
          &larr; Back to puzzles
        </Link>
      </div>

      <div className="mb-4 text-center">
        <h1 className="homepage-title text-foreground">Custom Puzzle</h1>
        <p className="text-sm text-foreground-muted">
          Enter your own puzzle or paste from clipboard.
        </p>
      </div>

      {/* Board container - uses game-container for proper sizing like Game.tsx */}
      <div className="game-container flex flex-col items-center">
        <div className="relative aspect-square w-full">
          <Board
            board={board}
            initialBoard={Array(81).fill(0)}
            candidates={candidates}
            selectedCell={selectedCell}
            highlightedDigit={null}
            highlight={null}
            onCellClick={handleCellClick}
          />
        </div>

        {/* Digit input - inside container for scaling */}
        <div className="controls-grid flex flex-col items-center mt-2 flex-shrink-0">
          <div className="digit-grid flex flex-col">
            {/* Row 1: Digits 1-3 */}
            <div className="digit-row flex justify-center">
              {[1, 2, 3].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleDigitInput(digit)}
                  className="control-digit-btn bg-btn-bg text-foreground"
                >
                  {digit}
                </button>
              ))}
            </div>
            {/* Row 2: Digits 4-6 */}
            <div className="digit-row flex justify-center">
              {[4, 5, 6].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleDigitInput(digit)}
                  className="control-digit-btn bg-btn-bg text-foreground"
                >
                  {digit}
                </button>
              ))}
            </div>
            {/* Row 3: Digits 7-9 */}
            <div className="digit-row flex justify-center">
              {[7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleDigitInput(digit)}
                  className="control-digit-btn bg-btn-bg text-foreground"
                >
                  {digit}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          onClick={handleErase}
          className="rounded-lg bg-btn-bg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-btn-hover"
        >
          Erase
        </button>
        <button
          onClick={handleClear}
          className="rounded-lg bg-btn-bg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-btn-hover"
        >
          Clear All
        </button>
        <button
          onClick={handlePaste}
          className="rounded-lg bg-btn-bg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-btn-hover"
        >
          Paste
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-100 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-4 flex gap-4">
        <button
          onClick={() => navigate('/')}
          className="rounded-lg border border-board-border-light px-6 py-3 font-medium text-foreground transition-colors hover:bg-btn-hover"
        >
          Cancel
        </button>
        <button
          onClick={handleValidateAndPlay}
          disabled={validating}
          className="rounded-lg bg-accent px-6 py-3 font-medium text-btn-active-text transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {validating ? 'Validating...' : 'Validate & Play'}
        </button>
      </div>

      <div className="mt-6 max-w-md text-center text-xs text-foreground-muted">
        <p className="mb-1">
          <strong className="text-foreground">Paste format:</strong> 81 digits (0 or . for empty)
        </p>
      </div>
    </div>
  )
}
