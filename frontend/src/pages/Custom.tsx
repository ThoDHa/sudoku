import { useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Board from '../components/Board'
import { encodePuzzle } from '../lib/puzzleEncoding'
import { MIN_GIVENS, STORAGE_KEYS } from '../lib/constants'

export default function Custom() {
  const navigate = useNavigate()
  const [board, setBoard] = useState<number[]>(Array(81).fill(0))
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate device ID
  const getDeviceId = useCallback(() => {
    let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID)
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId)
    }
    return deviceId
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

      // Validate with backend
      const res = await fetch('/api/custom/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          givens: board,
          device_id: getDeviceId(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Validation failed')
        setValidating(false)
        return
      }

      const data = await res.json()

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
      setError('Failed to validate puzzle. Please try again.')
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
    } catch (err) {
      setError('Failed to read clipboard')
    }
  }

  // Create empty candidates for display
  const candidates = board.map(() => new Set<number>())

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-[var(--bg)]">
      <div className="mb-4">
        <Link to="/" className="text-sm text-[var(--accent)] hover:underline">
          &larr; Back to puzzles
        </Link>
      </div>

      <div className="mb-6 text-center">
        <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Custom Puzzle</h1>
        <p className="text-[var(--text-muted)]">
          Enter your own puzzle or paste from clipboard. Share the URL to challenge others!
        </p>
      </div>

      <Board
        board={board}
        initialBoard={Array(81).fill(0)}
        candidates={candidates}
        selectedCell={selectedCell}
        highlightedDigit={null}
        highlight={null}
        onCellClick={handleCellClick}
      />

      {/* Digit input */}
      <div className="mt-6 flex gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button
            key={digit}
            onClick={() => handleDigitInput(digit)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--btn-bg)] text-lg font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)] active:bg-[var(--accent)] active:text-[var(--btn-active-text)] sm:h-12 sm:w-12 sm:text-xl"
          >
            {digit}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          onClick={handleErase}
          className="rounded-lg bg-[var(--btn-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Erase
        </button>
        <button
          onClick={handleClear}
          className="rounded-lg bg-[var(--btn-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Clear All
        </button>
        <button
          onClick={handlePaste}
          className="rounded-lg bg-[var(--btn-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Paste
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-100 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-4">
        <button
          onClick={() => navigate('/')}
          className="rounded-lg border border-[var(--border-light)] px-6 py-3 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Cancel
        </button>
        <button
          onClick={handleValidateAndPlay}
          disabled={validating}
          className="rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-[var(--btn-active-text)] transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {validating ? 'Validating...' : 'Validate & Play'}
        </button>
      </div>

      <div className="mt-8 max-w-md text-center text-sm text-[var(--text-muted)]">
        <p className="mb-2">
          <strong className="text-[var(--text)]">Paste format:</strong> 81 characters using digits 1-9 and 0 or . for empty cells.
        </p>
        <p>
          Example: <code className="rounded bg-[var(--bg-secondary)] px-1 text-[var(--text)]">530070000600195000098000060800060003400803001700020006060000280000419005000080079</code>
        </p>
      </div>
    </div>
  )
}
