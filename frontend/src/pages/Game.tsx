import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useLocation } from 'react-router-dom'
import Board from '../components/Board'
import Controls from '../components/Controls'
import History from '../components/History'
import ResultModal from '../components/ResultModal'
import TechniqueModal from '../components/TechniqueModal'
import TechniquesListModal from '../components/TechniquesListModal'
import GameHeader from '../components/GameHeader'
import GameModals from '../components/GameModals'
import OnboardingModal, { useOnboarding } from '../components/OnboardingModal'
import { Difficulty } from '../lib/hooks'
import { useTheme } from '../lib/ThemeContext'
import { useGameContext } from '../lib/GameContext'
import { useGameTimer } from '../hooks/useGameTimer'
import { useSudokuGame, Move } from '../hooks/useSudokuGame'
import { useAutoSolve } from '../hooks/useAutoSolve'
import {
  TOAST_DURATION_SUCCESS,
  TOAST_DURATION_INFO,
  TOAST_DURATION_ERROR,
  TOAST_DURATION_FIX_ERROR,
  STORAGE_KEYS,
} from '../lib/constants'
import { getAutoSolveSpeed, AutoSolveSpeed, AUTO_SOLVE_SPEEDS, getHideTimer, setHideTimer } from '../lib/preferences'
import { validateBoard, solveAll, getPuzzle } from '../lib/solver-service'

import { saveScore, markDailyCompleted, type Score } from '../lib/scores'
import { decodePuzzle, encodePuzzle } from '../lib/puzzleEncoding'

// Type for saved game state in localStorage
interface SavedGameState {
  board: number[]
  candidates: number[][] // Serialized from Set<number>[]
  elapsedMs: number
  history: Move[]
  autoFillUsed: boolean
  savedAt: number // timestamp
}

interface PuzzleData {
  puzzle_id: string
  seed: string
  difficulty: string
  givens: number[]
}

export default function Game() {
  const { seed, encoded } = useParams<{ seed?: string; encoded?: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  
  // Determine if this is an encoded custom puzzle (from /c/:encoded route)
  const isEncodedCustom = location.pathname.startsWith('/c/') && encoded
  
  // Detect custom puzzle from seed prefix if no difficulty param
  const difficultyParam = searchParams.get('d')
  const difficulty = (
    isEncodedCustom ? 'custom' :
    difficultyParam || (seed?.startsWith('custom-') ? 'custom' : 'medium')
  ) as Difficulty
  
  const { mode, setMode, colorTheme, setColorTheme, fontSize, setFontSize } = useTheme()
  const { setGameState } = useGameContext()
  const { showOnboarding, closeOnboarding } = useOnboarding()
  
  // Store the encoded string for sharing custom puzzles
  const [encodedPuzzle, setEncodedPuzzle] = useState<string | null>(encoded || null)

  // Puzzle loading state
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null)
  const [initialBoard, setInitialBoard] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state (not game logic)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [highlightedDigit, setHighlightedDigit] = useState<number | null>(null)
  const [eraseMode, setEraseMode] = useState(false)
  const [notesMode, setNotesMode] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [currentHighlight, setCurrentHighlight] = useState<Move | null>(null)
  const [selectedMoveIndex, setSelectedMoveIndex] = useState<number | null>(null)
  const [techniqueModal, setTechniqueModal] = useState<{ title: string; slug: string } | null>(null)
  const [techniquesListOpen, setTechniquesListOpen] = useState(false)
  const [solveConfirmOpen, setSolveConfirmOpen] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showSolutionConfirm, setShowSolutionConfirm] = useState(false)
  const [unpinpointableErrorInfo, setUnpinpointableErrorInfo] = useState<{ message: string; count: number } | null>(null)
  const [bugReportCopied, setBugReportCopied] = useState(false)
  const [autoFillUsed, setAutoFillUsed] = useState(false)
  const [autoSolveUsed, setAutoSolveUsed] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [validationMessage, setValidationMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [autoSolveSpeedState, setAutoSolveSpeedState] = useState<AutoSolveSpeed>(getAutoSolveSpeed())
  const [hideTimerState, setHideTimerState] = useState(getHideTimer())
  
  // Track whether we've restored saved state (to prevent overwriting on initial load)
  const hasRestoredSavedState = useRef(false)
  // Guard to prevent concurrent hint requests (ref is more reliable than state for this)
  const hintInProgress = useRef(false)
  // Cached solution moves - invalidated when user makes manual changes
  const cachedSolutionMoves = useRef<Array<{
    board: number[]
    candidates: (number[] | null)[]
    move: Move
  }>>([])
  // Track the history length when solution was cached, to detect user changes
  const cachedAtHistoryLength = useRef<number>(-1)

  // ============================================================
  // CUSTOM HOOKS
  // ============================================================

  // Timer hook
  const timer = useGameTimer({ pauseOnHidden: true })

  // Game state hook - only initialize after we have the initial board
  const game = useSudokuGame({
    initialBoard: initialBoard.length === 81 ? initialBoard : Array(81).fill(0),
    onComplete: () => {
      timer.pauseTimer()
      handleSubmit()
    },
  })

  // Auto-solve hook - fetches all moves at once and plays them back
  const autoSolve = useAutoSolve({
    stepDelay: AUTO_SOLVE_SPEEDS[autoSolveSpeedState],
    gamePaused: timer.isPausedDueToVisibility,
    getBoard: () => game.board,
    getCandidates: () => game.candidates,
    getGivens: () => initialBoard,
    applyMove: (newBoard, newCandidates, move, index) => {
      game.applyExternalMove(newBoard, newCandidates, move)
      setCurrentHighlight(move)
      setSelectedMoveIndex(index)
      
      // Highlight the digit being placed/modified
      if (move.digit && move.digit > 0) {
        setHighlightedDigit(move.digit)
      }
      
      // Show notes mode if it's a candidate operation
      if (move.action === 'eliminate' || move.action === 'candidate') {
        setNotesMode(true)
      } else if (move.action === 'assign' || move.action === 'place') {
        setNotesMode(false)
      }
    },
    applyState: (board, candidates, move, index) => {
      game.setBoardState(board, candidates)
      setCurrentHighlight(move)
      setSelectedMoveIndex(index)
      
      // Update digit highlight based on move
      if (move && move.digit && move.digit > 0) {
        setHighlightedDigit(move.digit)
      } else {
        setHighlightedDigit(null)
      }
      
      // Update notes mode based on move action
      if (move) {
        if (move.action === 'eliminate' || move.action === 'candidate') {
          setNotesMode(true)
        } else if (move.action === 'assign' || move.action === 'place') {
          setNotesMode(false)
        }
      }
    },
    isComplete: () => game.isComplete,
    onError: (message) => {
      setValidationMessage({ type: 'error', message })
      setTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
    },
    onUnpinpointableError: (message, count) => {
      setUnpinpointableErrorInfo({ message, count })
      setShowSolutionConfirm(true)
    },
    onStatus: (message) => {
      setValidationMessage({ type: 'success', message })
      setTimeout(() => setValidationMessage(null), 2000)
    },
    onErrorFixed: (message, resumeCallback) => {
      // Show toast for fix-error (longer duration than normal hints)
      setValidationMessage({ type: 'error', message: `Fixed: ${message}` })
      setTimeout(() => {
        setValidationMessage(null)
        resumeCallback()
      }, TOAST_DURATION_FIX_ERROR)
    },
  })

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  // Get storage key for the current puzzle
  const getStorageKey = useCallback((puzzleSeed: string) => {
    return `${STORAGE_KEYS.GAME_STATE_PREFIX}${puzzleSeed}`
  }, [])

  // Save game state to localStorage
  const saveGameState = useCallback(() => {
    if (!puzzle || game.isComplete || !hasRestoredSavedState.current) return
    
    const storageKey = getStorageKey(puzzle.seed)
    const savedState: SavedGameState = {
      board: game.board,
      candidates: game.candidates.map(set => Array.from(set)),
      elapsedMs: timer.elapsedMs,
      history: game.history,
      autoFillUsed,
      savedAt: Date.now(),
    }
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(savedState))
    } catch (e) {
      console.warn('Failed to save game state:', e)
    }
  }, [puzzle, game.board, game.candidates, game.history, game.isComplete, timer.elapsedMs, autoFillUsed, getStorageKey])

  // Clear saved game state from localStorage
  const clearSavedGameState = useCallback(() => {
    if (!puzzle) return
    const storageKey = getStorageKey(puzzle.seed)
    try {
      localStorage.removeItem(storageKey)
    } catch (e) {
      console.warn('Failed to clear saved game state:', e)
    }
  }, [puzzle, getStorageKey])

  // Load saved game state from localStorage
  const loadSavedGameState = useCallback((puzzleSeed: string): SavedGameState | null => {
    const storageKey = getStorageKey(puzzleSeed)
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return null
      
      const parsed = JSON.parse(saved) as SavedGameState
      // Validate the saved state
      if (parsed.board?.length === 81 && parsed.candidates?.length === 81) {
        return parsed
      }
    } catch (e) {
      console.warn('Failed to load saved game state:', e)
    }
    return null
  }, [getStorageKey])

  // ============================================================
  // GAME ACTIONS (using hooks)
  // ============================================================

  // Invalidate cached solution when user makes manual changes
  const invalidateCachedSolution = useCallback(() => {
    cachedSolutionMoves.current = []
    cachedAtHistoryLength.current = -1
  }, [])

  // Clear all user entries (keeps timer running)
  const handleClearAll = useCallback(() => {
    game.clearAll()
    invalidateCachedSolution()
    setCurrentHighlight(null)
    setSelectedMoveIndex(null)
    setSelectedCell(null)
    setHighlightedDigit(null)
    setNotesMode(false)
  }, [game, invalidateCachedSolution])

  // Restart puzzle (clears all AND resets timer)
  const handleRestart = useCallback(() => {
    game.resetGame()
    invalidateCachedSolution()
    timer.resetTimer()
    timer.startTimer()
    setCurrentHighlight(null)
    setSelectedMoveIndex(null)
    setSelectedCell(null)
    setHighlightedDigit(null)
    setNotesMode(false)
    setHintsUsed(0)
    setAutoFillUsed(false)
    setAutoSolveUsed(false)
    setShowResultModal(false)
  }, [game, timer, invalidateCachedSolution])

  // Auto-fill notes based on current board state
  const autoFillNotes = useCallback(() => {
    if (game.board.length !== 81) return
    const newCandidates = game.fillAllCandidates(game.board)
    const cellsWithCandidates = newCandidates.filter(set => set.size > 0).length
    
    const fillMove: Move = {
      step_index: game.history.length,
      technique: 'Fill Candidates',
      action: 'candidate',
      digit: 0,
      targets: [],
      explanation: `Filled all candidates for ${cellsWithCandidates} cells`,
      refs: { title: 'Fill Candidates', slug: 'fill-candidates', url: '' },
      highlights: { primary: [] },
      isUserMove: true, // Mark as user action so it doesn't count as hint
    }
    
    game.applyExternalMove(game.board, newCandidates, fillMove)
    invalidateCachedSolution()
    setAutoFillUsed(true)
  }, [game, invalidateCachedSolution])

  // Check notes for errors
  const handleCheckNotes = useCallback(() => {
    const result = game.checkNotes()
    
    if (result.cellsWithNotes === 0) {
      setValidationMessage({ type: 'error', message: 'No notes to check. Add some notes first!' })
      setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
      return
    }
    
    if (result.valid) {
      if (result.missingNotes.length > 0) {
        setValidationMessage({ 
          type: 'success', 
          message: `Notes are correct! (${result.missingNotes.length} possible candidates not noted)` 
        })
      } else {
        setValidationMessage({ type: 'success', message: 'All notes are correct and complete!' })
      }
    } else {
      const wrongCount = result.wrongNotes.length
      setValidationMessage({ 
        type: 'error', 
        message: `Found ${wrongCount} incorrect note${wrongCount > 1 ? 's' : ''}. Some notes are impossible.`
      })
    }
    setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
  }, [game])

  // Validate current board state
  const handleValidate = useCallback(async () => {
    try {
      const data = await validateBoard(game.board)
      if (data.valid) {
        setValidationMessage({ type: 'success', message: data.message || 'All entries are correct!' })
      } else {
        setValidationMessage({ type: 'error', message: data.message || 'There are errors in the puzzle' })
      }
      setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
    } catch {
      setValidationMessage({ type: 'error', message: 'Failed to validate puzzle' })
      setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
    }
  }, [game.board])

  // Core hint step logic - uses cached solution or fetches new one
  // Returns true if more steps available, false otherwise
  const executeHintStep = useCallback(async (showNotification: boolean = true): Promise<boolean> => {
    // Deselect any highlighted digit when using hint
    setSelectedCell(null)
    setHighlightedDigit(null)
    setCurrentHighlight(null)

    // Check if we need to fetch a new solution
    // Invalidate cache if user made changes (history length changed unexpectedly)
    const userMadeChanges = cachedAtHistoryLength.current >= 0 && 
                            game.history.length !== cachedAtHistoryLength.current

    if (userMadeChanges || cachedSolutionMoves.current.length === 0) {
      // Fetch fresh solution from current state
      const boardSnapshot = [...game.board]
      const candidatesArray = game.candidates.map(set => Array.from(set))

      try {
        const data = await solveAll(boardSnapshot, candidatesArray, initialBoard)
        
        if (!data.moves || data.moves.length === 0) {
          if (showNotification) {
            setValidationMessage({ 
              type: 'error', 
              message: data.solved 
                ? 'Puzzle is already complete!' 
                : 'This puzzle requires advanced techniques beyond our hint system.' 
            })
            setTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
          }
          return false
        }

        // Cache the solution
        cachedSolutionMoves.current = [...data.moves]
        cachedAtHistoryLength.current = game.history.length
      } catch (err) {
        console.error('Hint error:', err)
        if (showNotification) {
          setValidationMessage({ type: 'error', message: err instanceof Error ? err.message : 'Failed to get hint' })
          setTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        }
        return false
      }
    }

    // Get the next move from cache
    const nextMoveResult = cachedSolutionMoves.current.shift()
    if (!nextMoveResult) {
      if (showNotification) {
        setValidationMessage({ type: 'success', message: 'Puzzle complete!' })
        setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
      }
      return false
    }

    const move = nextMoveResult.move

    // Handle special moves
    if (move.action === 'unpinpointable-error') {
      invalidateCachedSolution()
      setUnpinpointableErrorInfo({ 
        message: move.explanation || `Couldn't pinpoint the error.`, 
        count: (move as unknown as { userEntryCount?: number }).userEntryCount || 0 
      })
      setShowSolutionConfirm(true)
      return false
    }

    if (move.action === 'contradiction' || move.action === 'error') {
      invalidateCachedSolution()
      if (game.canUndo) {
        game.undo()
        setCurrentHighlight(null)
        if (showNotification) {
          setValidationMessage({ 
            type: 'error', 
            message: move.explanation || 'Contradiction found - undoing last move'
          })
          setTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        }
        return true // More steps available after backtrack
      } else {
        if (showNotification) {
          setValidationMessage({ 
            type: 'error', 
            message: 'The puzzle cannot be solved - initial state has errors.'
          })
          setTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        }
        return false
      }
    }

    // Apply the move
    const newBoard = nextMoveResult.board
    const newCandidates = nextMoveResult.candidates
      ? nextMoveResult.candidates.map((cellCands: number[] | null) => new Set<number>(cellCands || []))
      : game.candidates.map(() => new Set<number>())

    game.applyExternalMove(newBoard, newCandidates, move)
    // Update the cached history length to account for this hint
    cachedAtHistoryLength.current = game.history.length + 1
    
    setCurrentHighlight(move)
    setSelectedMoveIndex(game.history.length)

    if (showNotification) {
      const firstTarget = move.targets?.[0]
      const techniqueName = move.technique === 'fill-candidate' && firstTarget
        ? `Added ${move.digit} to R${firstTarget.row + 1}C${firstTarget.col + 1}`
        : (move.technique || 'Hint')
      setValidationMessage({ 
        type: 'success', 
        message: techniqueName
      })
      setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
    }

    // Check if more moves available
    return cachedSolutionMoves.current.length > 0 || newBoard.some(v => v === 0)
  }, [game, initialBoard, invalidateCachedSolution])

  // Handle hint button - calls executeHintStep with notifications and increments counter
  const handleNext = useCallback(async () => {
    // Prevent concurrent hint requests (spam protection)
    if (hintInProgress.current) return
    hintInProgress.current = true
    try {
      const result = await executeHintStep(true)
      if (result !== false) {
        // Only count as hint if it was successful (not an error)
        setHintsUsed(prev => prev + 1)
      }
    } finally {
      hintInProgress.current = false
    }
  }, [executeHintStep])

  // Cell click handler
  const handleCellClick = useCallback((idx: number) => {
    // Given cells: just highlight the digit, don't select
    if (game.isGivenCell(idx)) {
      const cellDigit = game.board[idx] ?? null
      setHighlightedDigit(cellDigit)
      setEraseMode(false)
      setSelectedCell(null)
      setCurrentHighlight(null)
      return
    }

    // Toggle selection: clicking the same cell again deselects it (highest priority for user-fillable cells)
    if (selectedCell === idx) {
      setSelectedCell(null)
      setHighlightedDigit(null)
      setCurrentHighlight(null)
      return
    }

    // If erase mode is active and cell has a value, erase it
    if (eraseMode && game.board[idx] !== 0) {
      game.eraseCell(idx)
      setCurrentHighlight(null)
      // Keep erase mode active so user can erase multiple cells
      return
    }

    // If a digit is highlighted and this cell is empty, fill it
    if (highlightedDigit !== null && game.board[idx] === 0) {
      game.setCell(idx, highlightedDigit, notesMode)
      setCurrentHighlight(null)
      // Keep digit highlighted so user can fill multiple cells with same digit
      return
    }

    // Select the cell (works for both empty and user-filled cells)
    setSelectedCell(idx)
    setHighlightedDigit(null)
    setEraseMode(false)
    setCurrentHighlight(null)
  }, [game, highlightedDigit, eraseMode, notesMode, selectedCell])

  // Digit input handler
  const handleDigitInput = useCallback((digit: number) => {
    // Clear erase mode when selecting a digit
    setEraseMode(false)
    
    // If no cell selected, toggle digit highlight for multi-fill mode
    if (selectedCell === null) {
      setHighlightedDigit(highlightedDigit === digit ? null : digit)
      return
    }
    
    if (game.isGivenCell(selectedCell)) return

    // If cell already has this digit, erase it
    if (game.board[selectedCell] === digit) {
      game.eraseCell(selectedCell)
      return
    }

    game.setCell(selectedCell, digit, notesMode)
    
    // Keep cell selected so user can erase or change immediately
    // Keep digit highlighted so user can fill multiple cells with same digit
  }, [game, selectedCell, highlightedDigit, notesMode])

  // Keyboard cell change handler (from Board component)
  const handleCellChange = useCallback((idx: number, value: number) => {
    if (game.isGivenCell(idx)) return
    if (value === 0) {
      game.eraseCell(idx)
    } else {
      game.setCell(idx, value, notesMode)
    }
  }, [game, notesMode])

  // Toggle erase mode handler
  const handleEraseMode = useCallback(() => {
    setEraseMode(prev => !prev)
    setHighlightedDigit(null)
    setSelectedCell(null)
  }, [])

  // Undo handler - during auto-solve, this steps backward
  const handleUndo = useCallback(() => {
    if (autoSolve.isAutoSolving) {
      autoSolve.stepBack()
    } else {
      game.undo()
      invalidateCachedSolution()
      // Clear selection and highlights after undo
      setSelectedCell(null)
      setHighlightedDigit(null)
      setCurrentHighlight(null)
      setSelectedMoveIndex(null)
    }
  }, [game, autoSolve, invalidateCachedSolution])

  // Redo handler - during auto-solve, this steps forward
  const handleRedo = useCallback(() => {
    if (autoSolve.isAutoSolving) {
      autoSolve.stepForward()
    } else {
      game.redo()
      invalidateCachedSolution()
      // Clear selection and highlights after redo
      setSelectedCell(null)
      setHighlightedDigit(null)
      setCurrentHighlight(null)
      setSelectedMoveIndex(null)
    }
  }, [game, autoSolve, invalidateCachedSolution])

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!puzzle) return

    const score: Score = {
      seed: puzzle.seed,
      difficulty: puzzle.difficulty,
      timeMs: timer.elapsedMs,
      hintsUsed: hintsUsed,
      mistakes: 0,
      completedAt: new Date().toISOString(),
      autoFillUsed: autoFillUsed,
      autoSolveUsed: autoSolveUsed,
      ...(encodedPuzzle ? { encodedPuzzle } : {}),
    }

    saveScore(score)
    
    // Mark daily puzzle as completed for streak tracking
    if (puzzle.seed.startsWith('daily-')) {
      markDailyCompleted()
    }
    
    setShowResultModal(true)
  }, [puzzle, hintsUsed, timer.elapsedMs, encodedPuzzle, autoFillUsed, autoSolveUsed])

  // Auto-solve handler
  const handleSolve = useCallback(async () => {
    setSelectedCell(null)
    setHighlightedDigit(null)
    setAutoSolveUsed(true) // Mark that auto-solve was used
    await autoSolve.startAutoSolve()
  }, [autoSolve])

  // Bug report handler - opens GitHub issue with state
  const handleReportBug = useCallback(async () => {
    const bugReport = {
      timestamp: new Date().toISOString(),
      puzzle: {
        seed: puzzle?.seed,
        difficulty: puzzle?.difficulty,
        puzzleId: puzzle?.puzzle_id,
      },
      state: {
        initialBoard: initialBoard,
        currentBoard: game.board,
        candidates: game.candidates.map(set => Array.from(set)),
        elapsedMs: timer.elapsedMs,
        isComplete: game.isComplete,
      },
      history: game.history.map(move => ({
        stepIndex: move.step_index,
        technique: move.technique,
        action: move.action,
        digit: move.digit,
        targets: move.targets,
        eliminations: move.eliminations,
        explanation: move.explanation,
        isUserMove: move.isUserMove,
      })),
      historyIndex: game.historyIndex,
      settings: {
        colorTheme: colorTheme,
        mode: mode,
      },
      userAgent: navigator.userAgent,
    }

    const bugReportJson = JSON.stringify(bugReport, null, 2)
    
    // Create a compact board representation for the issue body
    const boardString = game.board.map((v, i) => 
      (i > 0 && i % 9 === 0 ? '\n' : '') + (v === 0 ? '.' : v)
    ).join('')
    
    const issueBody = `## Bug Description
<!-- Please describe the bug you encountered -->

## Puzzle State
- **Seed:** ${puzzle?.seed || 'Unknown'}
- **Difficulty:** ${puzzle?.difficulty || 'Unknown'}
- **Time:** ${Math.floor(timer.elapsedMs / 1000)}s

### Current Board
\`\`\`
${boardString}
\`\`\`

<details>
<summary>Full Debug State (click to expand)</summary>

\`\`\`json
${bugReportJson}
\`\`\`

</details>

## Expected Behavior
<!-- What did you expect to happen? -->

## Actual Behavior
<!-- What actually happened? -->
`

    // Also copy to clipboard as backup
    try {
      await navigator.clipboard.writeText(bugReportJson)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = bugReportJson
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    
    setBugReportCopied(true)
    setTimeout(() => setBugReportCopied(false), TOAST_DURATION_SUCCESS)
    
    // Open GitHub issue with pre-filled content
    const issueUrl = new URL('https://github.com/ThoDHa/sudoku/issues/new')
    issueUrl.searchParams.set('title', `Bug: [Please describe briefly]`)
    issueUrl.searchParams.set('body', issueBody)
    issueUrl.searchParams.set('labels', 'bug')
    
    window.open(issueUrl.toString(), '_blank')
  }, [puzzle, initialBoard, game, timer.elapsedMs, colorTheme, mode])

  // ============================================================
  // EFFECTS
  // ============================================================

  // Clear selection when clicking on background (only deselect cell, keep digit highlight)
  useEffect(() => {
    const handleBackgroundClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.classList.contains('game-background')) {
        setSelectedCell(null)
        // Don't clear highlightedDigit - user may want to keep filling cells
        setCurrentHighlight(null)
      }
    }
    document.addEventListener('click', handleBackgroundClick)
    return () => document.removeEventListener('click', handleBackgroundClick)
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Don't trigger shortcuts when modals are open
      if (showResultModal || historyOpen || techniqueModal || techniquesListOpen || 
          solveConfirmOpen || showClearConfirm) {
        return
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

      // Ctrl/Cmd + Z = Undo
      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleUndo()
        return
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
      if ((ctrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z') || 
          (ctrlOrCmd && e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        handleRedo()
        return
      }

      // H = Hint
      if (e.key.toLowerCase() === 'h' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        handleNext()
        return
      }

      // N = Toggle Notes mode
      if (e.key.toLowerCase() === 'n' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        setNotesMode(prev => !prev)
        return
      }

      // V = Validate
      if (e.key.toLowerCase() === 'v' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        handleValidate()
        return
      }

      // Escape = Deselect cell and clear highlights
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedCell(null)
        setHighlightedDigit(null)
        setCurrentHighlight(null)
        return
      }

      // Space = Toggle notes mode (alternative)
      if (e.key === ' ' && !ctrlOrCmd) {
        // Only if not on a focusable element that uses space
        const activeTag = document.activeElement?.tagName
        if (activeTag !== 'BUTTON' && activeTag !== 'A') {
          e.preventDefault()
          setNotesMode(prev => !prev)
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    handleUndo, handleRedo, handleNext, handleValidate,
    showResultModal, historyOpen, techniqueModal, techniquesListOpen,
    solveConfirmOpen, showClearConfirm
  ])

  // Sync game state to global context for header
  useEffect(() => {
    if (!loading && puzzle) {
      setGameState({
        isPlaying: true,
        difficulty,
        elapsedMs: timer.elapsedMs,
        historyCount: game.history.length,
        isComplete: game.isComplete,
        onHint: null,
        onHistory: () => setHistoryOpen(true),
        onAutoFillNotes: autoFillNotes,
      })
    }
    return () => setGameState(null)
  }, [loading, puzzle, difficulty, timer.elapsedMs, game.history.length, game.isComplete, autoFillNotes, setGameState])

  // Clear highlighted digit when auto-solve stops
  useEffect(() => {
    if (!autoSolve.isAutoSolving) {
      setHighlightedDigit(null)
    }
  }, [autoSolve.isAutoSolving])

  // Fetch puzzle
  useEffect(() => {
    if (!seed && !isEncodedCustom) return

    const loadPuzzle = async () => {
      try {
        setLoading(true)
        setError(null)
        setSelectedCell(null)
        setHighlightedDigit(null)
        setCurrentHighlight(null)
        setSelectedMoveIndex(null)
        setShowResultModal(false)

        let givens: number[]
        let puzzleData: PuzzleData

        if (isEncodedCustom && encoded) {
          try {
            givens = decodePuzzle(encoded)
            if (givens.length !== 81) {
              throw new Error('Invalid puzzle encoding')
            }
          } catch {
            throw new Error('Invalid puzzle link. The puzzle could not be decoded.')
          }
          
          setEncodedPuzzle(encoded)
          
          puzzleData = {
            puzzle_id: `encoded-${encoded.substring(0, 8)}`,
            seed: `encoded-${encoded.substring(0, 8)}`,
            difficulty: 'custom',
            givens: givens,
          }
        } else if (difficulty === 'custom' && seed?.startsWith('custom-')) {
          const storedGivens = localStorage.getItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${seed}`)
          if (!storedGivens) {
            throw new Error('Custom puzzle not found. Please re-enter the puzzle.')
          }
          givens = JSON.parse(storedGivens)
          
          setEncodedPuzzle(encodePuzzle(givens))
          
          puzzleData = {
            puzzle_id: seed,
            seed: seed,
            difficulty: 'custom',
            givens: givens,
          }
        } else {
          // Fetch puzzle using solver service (WASM-first)
          const fetchedPuzzle = await getPuzzle(seed!, difficulty)
          puzzleData = {
            puzzle_id: fetchedPuzzle.puzzle_id,
            seed: fetchedPuzzle.seed,
            difficulty: fetchedPuzzle.difficulty,
            givens: fetchedPuzzle.givens,
          }
          givens = puzzleData.givens
          setEncodedPuzzle(null)
        }

        setPuzzle(puzzleData)
        setInitialBoard([...givens])

        timer.resetTimer()
        timer.startTimer()
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    loadPuzzle()
  }, [seed, encoded, isEncodedCustom, difficulty])

  // Reset game state when initialBoard changes (new puzzle loaded) and restore saved state if available
  useEffect(() => {
    if (initialBoard.length === 81 && puzzle) {
      // Check for saved state for this puzzle
      const savedState = loadSavedGameState(puzzle.seed)
      
      if (savedState) {
        // Restore saved state
        const restoredCandidates = savedState.candidates.map(arr => new Set(arr))
        game.restoreState(savedState.board, restoredCandidates, savedState.history)
        timer.setElapsedMs(savedState.elapsedMs)
        setAutoFillUsed(savedState.autoFillUsed)
      } else {
        // Start fresh
        game.resetGame()
      }
      
      hasRestoredSavedState.current = true
    }
  // Note: We intentionally only trigger this when initialBoard or puzzle changes
  // game.restoreState and game.resetGame are stable callbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBoard, puzzle, loadSavedGameState])

  // Auto-save game state when board or candidates change
  useEffect(() => {
    if (!puzzle || !hasRestoredSavedState.current || game.isComplete) return
    
    // Debounce saves to avoid excessive localStorage writes
    const timeoutId = setTimeout(() => {
      saveGameState()
    }, 500)
    
    return () => clearTimeout(timeoutId)
  }, [game.board, game.candidates, game.history, puzzle, game.isComplete, saveGameState])

  // Clear saved state when puzzle is completed
  useEffect(() => {
    if (game.isComplete && puzzle) {
      clearSavedGameState()
    }
  }, [game.isComplete, puzzle, clearSavedGameState])

  // Pause timer when game is complete
  useEffect(() => {
    if (game.isComplete) {
      timer.pauseTimer()
    }
  }, [game.isComplete, timer])

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border-light)] border-t-[var(--accent)]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[var(--bg)]">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Game Header */}
      <GameHeader
        difficulty={difficulty}
        formatTime={timer.formatTime}
        isPausedDueToVisibility={timer.isPausedDueToVisibility}
        hideTimer={hideTimerState}
        isComplete={game.isComplete}
        historyCount={game.history.length}
        isAutoSolving={autoSolve.isAutoSolving}
        isPaused={autoSolve.isPaused}
        autoSolveSpeed={autoSolveSpeedState}
        onTogglePause={autoSolve.togglePause}
        onStopAutoSolve={autoSolve.stopAutoSolve}
        onSetAutoSolveSpeed={setAutoSolveSpeedState}
        onHint={handleNext}
        onHistoryOpen={() => setHistoryOpen(true)}
        onShowResult={() => setShowResultModal(true)}
        onAutoFillNotes={autoFillNotes}
        onCheckNotes={handleCheckNotes}
        onClearNotes={game.clearCandidates}
        onValidate={handleValidate}
        onSolve={() => setSolveConfirmOpen(true)}
        onClearAll={() => setShowClearConfirm(true)}
        onTechniquesList={() => setTechniquesListOpen(true)}
        onReportBug={handleReportBug}
        bugReportCopied={bugReportCopied}
        mode={mode}
        colorTheme={colorTheme}
        fontSize={fontSize}
        hideTimerState={hideTimerState}
        onSetMode={setMode}
        onSetColorTheme={setColorTheme}
        onSetFontSize={setFontSize}
        onToggleHideTimer={() => {
          const newValue = !hideTimerState
          setHideTimerState(newValue)
          setHideTimer(newValue)
        }}
      />

      {/* Validation message toast */}
      {validationMessage && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg ${
          validationMessage.type === 'success' 
            ? 'bg-green-500 text-white' 
            : 'bg-red-500 text-white'
        }`}>
          {validationMessage.message}
        </div>
      )}

      <div 
        className="game-background flex flex-1 flex-col items-center justify-center p-4 lg:p-8 overflow-hidden"
        onClick={(e) => {
          // Deselect when clicking on the background (not on board or controls)
          if (e.target === e.currentTarget) {
            setSelectedCell(null)
            setHighlightedDigit(null)
            setEraseMode(false)
            setCurrentHighlight(null)
          }
        }}
      >

        {/* Game container - centers board and controls together */}
        <div className="game-container flex flex-col items-center">
          {/* Board container with pause overlay */}
          <div className="relative w-full">
            <Board
              board={game.board}
              initialBoard={initialBoard}
              candidates={game.candidates}
              selectedCell={selectedCell}
              highlightedDigit={highlightedDigit}
              highlight={currentHighlight}
              onCellClick={handleCellClick}
              onCellChange={handleCellChange}
            />
            
            {/* Pause overlay - shown when timer is paused due to tab/window losing focus */}
            {timer.isPausedDueToVisibility && !game.isComplete && (
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg)]/95 backdrop-blur-md rounded-xl z-20"
                onClick={() => {
                  // Clicking the overlay brings focus back, which auto-resumes the timer
                  window.focus()
                }}
              >
                <div className="text-6xl mb-4">
                  <svg className="w-16 h-16 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-[var(--text)] mb-2">Game Paused</h3>
                <p className="text-sm text-[var(--text-muted)] text-center px-4">
                  Click anywhere or return to this tab to continue
                </p>
                <div className="mt-4 text-2xl font-mono text-[var(--accent)]">
                  {timer.formatTime()}
                </div>
              </div>
            )}
          </div>

          <Controls
            notesMode={notesMode}
            onNotesToggle={() => setNotesMode(!notesMode)}
            onDigit={handleDigitInput}
            onEraseMode={handleEraseMode}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={autoSolve.isAutoSolving ? (autoSolve.isPaused && autoSolve.canStepBack) : game.canUndo}
            canRedo={autoSolve.isAutoSolving ? (autoSolve.isPaused && autoSolve.canStepForward) : game.canRedo}
            eraseMode={eraseMode}
            digitCounts={game.digitCounts}
            highlightedDigit={highlightedDigit}
            isComplete={game.isComplete}
            isSolving={autoSolve.isAutoSolving}
          />
        </div>
      </div>

      <History
        moves={game.history}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onMoveClick={(move, index) => {
          setCurrentHighlight(move)
          setSelectedMoveIndex(index)
        }}
        onTechniqueClick={(technique) => setTechniqueModal(technique)}
        selectedMoveIndex={selectedMoveIndex}
      />

      <ResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        seed={puzzle?.seed || ''}
        difficulty={difficulty}
        timeMs={timer.elapsedMs}
        hintsUsed={hintsUsed}
        autoFillUsed={autoFillUsed}
        autoSolveUsed={autoSolveUsed}
        encodedPuzzle={encodedPuzzle}
      />

      <TechniqueModal
        isOpen={techniqueModal !== null}
        onClose={() => setTechniqueModal(null)}
        technique={techniqueModal}
      />

      <TechniquesListModal
        isOpen={techniquesListOpen}
        onClose={() => setTechniquesListOpen(false)}
      />

      {/* Confirmation Dialogs */}
      <GameModals
        solveConfirmOpen={solveConfirmOpen}
        setSolveConfirmOpen={setSolveConfirmOpen}
        onSolve={handleSolve}
        showClearConfirm={showClearConfirm}
        setShowClearConfirm={setShowClearConfirm}
        isComplete={game.isComplete}
        onRestart={handleRestart}
        onClearAll={handleClearAll}
        showSolutionConfirm={showSolutionConfirm}
        setShowSolutionConfirm={setShowSolutionConfirm}
        unpinpointableErrorMessage={unpinpointableErrorInfo?.message || null}
        onShowSolution={autoSolve.solveFromGivens}
      />

      {/* Onboarding Modal - shown for first-time users */}
      <OnboardingModal isOpen={showOnboarding} onClose={closeOnboarding} />
    </div>
  )
}
