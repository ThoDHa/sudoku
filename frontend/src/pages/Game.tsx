import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom'
import Board from '../components/Board'
import Controls from '../components/Controls'
import History from '../components/History'
import ResultModal from '../components/ResultModal'
import TechniqueModal from '../components/TechniqueModal'
import TechniquesListModal from '../components/TechniquesListModal'
import DifficultyBadge from '../components/DifficultyBadge'
import OnboardingModal, { useOnboarding } from '../components/OnboardingModal'
import { Difficulty } from '../lib/hooks'
import { useTheme, ColorTheme, FontSize } from '../lib/ThemeContext'
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
  MAX_HISTORY_BADGE_COUNT,
} from '../lib/constants'
import { getAutoSolveSpeed, setAutoSolveSpeed, AutoSolveSpeed, AUTO_SOLVE_SPEEDS, getHideTimer, setHideTimer } from '../lib/preferences'

// Type for saved game state in localStorage
interface SavedGameState {
  board: number[]
  candidates: number[][] // Serialized from Set<number>[]
  elapsedMs: number
  history: Move[]
  autoFillUsed: boolean
  savedAt: number // timestamp
}

const fontSizes: { key: FontSize; label: string }[] = [
  { key: 'xs', label: 'A' },
  { key: 'small', label: 'A' },
  { key: 'medium', label: 'A' },
  { key: 'large', label: 'A' },
  { key: 'xl', label: 'A' },
]

import { saveScore } from '../lib/scores'
import { decodePuzzle, encodePuzzle } from '../lib/puzzleEncoding'

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
  const [token, setToken] = useState<string | null>(null)
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
  const [newPuzzleMenuOpen, setNewPuzzleMenuOpen] = useState(false)
  const [bugReportCopied, setBugReportCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [autoFillUsed, setAutoFillUsed] = useState(false)
  const [autoSolveUsed, setAutoSolveUsed] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [validationMessage, setValidationMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [autoSolveSpeedState, setAutoSolveSpeedState] = useState<AutoSolveSpeed>(getAutoSolveSpeed())
  const [hideTimerState, setHideTimerState] = useState(getHideTimer())
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Track whether we've restored saved state (to prevent overwriting on initial load)
  const hasRestoredSavedState = useRef(false)

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
    token,
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

  // Generate device ID
  const getDeviceId = useCallback(() => {
    let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID)
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId)
    }
    return deviceId
  }, [])

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

  // Clear all user entries (keeps timer running)
  const handleClearAll = useCallback(() => {
    game.clearAll()
    setCurrentHighlight(null)
    setSelectedMoveIndex(null)
    setSelectedCell(null)
    setHighlightedDigit(null)
    setNotesMode(false)
  }, [game])

  // Restart puzzle (clears all AND resets timer)
  const handleRestart = useCallback(() => {
    game.resetGame()
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
  }, [game, timer])

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
    setAutoFillUsed(true)
  }, [game])

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
    if (!token) return

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, board: game.board }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.valid) {
          setValidationMessage({ type: 'success', message: data.message })
        } else {
          setValidationMessage({ type: 'error', message: data.message })
        }
        setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
      }
    } catch {
      setValidationMessage({ type: 'error', message: 'Failed to validate puzzle' })
      setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
    }
  }, [token, game.board])

  // Core hint step logic - returns true if more steps available, false otherwise
  const executeHintStep = useCallback(async (showNotification: boolean = true): Promise<boolean> => {
    if (!token) return false

    // Deselect any highlighted digit when using hint
    setSelectedCell(null)
    setHighlightedDigit(null)
    setCurrentHighlight(null)

    // Send current board and candidates to backend
    const candidatesArray = game.candidates.map(set => Array.from(set))

    try {
      const res = await fetch('/api/solve/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, board: game.board, candidates: candidatesArray, givens: initialBoard }),
      })

      if (res.status === 429) {
        if (showNotification) {
          setValidationMessage({ type: 'error', message: 'Too many requests. Please wait a moment.' })
          setTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        }
        return false
      }

      if (!res.ok) {
        if (showNotification) {
          const errorData = await res.json().catch(() => ({}))
          setValidationMessage({ type: 'error', message: errorData.error || 'Failed to get hint' })
          setTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        }
        return false
      }

      const data = await res.json()
      if (data.move) {
        const move = data.move
        
        // Handle unpinpointable error - show dialog offering solutions
        if (move.action === 'unpinpointable-error') {
          setUnpinpointableErrorInfo({ 
            message: move.explanation || `Couldn't pinpoint the error.`, 
            count: move.userEntryCount || 0 
          })
          setShowSolutionConfirm(true)
          return false
        }
        
        // Handle fix-error - apply the fix from backend
        if (move.action === 'fix-error') {
          // Backend has already prepared the fixed board/candidates
          const newBoard = data.board
          const newCandidates = data.candidates
            ? data.candidates.map((cellCands: number[] | null) => new Set<number>(cellCands || []))
            : game.candidates.map(() => new Set<number>())
          
          game.applyExternalMove(newBoard, newCandidates, move)
          setCurrentHighlight(move)
          setSelectedMoveIndex(game.history.length)
          
          if (showNotification) {
            setValidationMessage({ 
              type: 'success', 
              message: move.explanation || 'Fixed an error!'
            })
            setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
          }
          
          return true // More steps may be available after fix
        }
        
        // Handle contradiction - undo the last move
        if (move.action === 'contradiction') {
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
            // Can't undo - puzzle started in invalid state
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
        
        // Apply changes incrementally to user's current state
        let newBoard = [...game.board]
        let newCandidates = game.candidates.map(set => new Set(set))
        
        if (move.action === 'assign' && move.targets && move.targets.length > 0) {
          // For assignment moves, set the cell value and clear its candidates
          for (const target of move.targets) {
            const idx = target.row * 9 + target.col
            newBoard[idx] = move.digit
            newCandidates[idx] = new Set()
            
            // Also remove this digit from peers' candidates
            const row = target.row
            const col = target.col
            const boxRow = Math.floor(row / 3) * 3
            const boxCol = Math.floor(col / 3) * 3
            
            for (let i = 0; i < 9; i++) {
              // Same row
              newCandidates[row * 9 + i].delete(move.digit)
              // Same column
              newCandidates[i * 9 + col].delete(move.digit)
              // Same box
              const br = boxRow + Math.floor(i / 3)
              const bc = boxCol + (i % 3)
              newCandidates[br * 9 + bc].delete(move.digit)
            }
          }
        } else if (move.action === 'eliminate' && move.eliminations) {
          // For elimination moves, remove specific candidates
          for (const elim of move.eliminations) {
            const idx = elim.row * 9 + elim.col
            newCandidates[idx].delete(elim.digit)
          }
        } else if (move.action === 'candidate' && move.targets && move.targets.length > 0) {
          // For candidate fill moves, add the candidate
          for (const target of move.targets) {
            const idx = target.row * 9 + target.col
            newCandidates[idx].add(move.digit)
          }
        }

        game.applyExternalMove(newBoard, newCandidates, data.move)
        setCurrentHighlight(data.move)
        setSelectedMoveIndex(game.history.length)
        
        if (showNotification) {
          // Show subtle hint notification
          const techniqueName = move.technique === 'fill-candidate' 
            ? `Added ${move.digit} to R${move.targets[0].row + 1}C${move.targets[0].col + 1}`
            : (data.move.technique || 'Hint')
          setValidationMessage({ 
            type: 'success', 
            message: techniqueName
          })
          setTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
        }
        
        // Check if puzzle is now complete
        const stillHasEmpty = newBoard.some(v => v === 0)
        return stillHasEmpty // More steps available if not complete
      } else {
        // No move found - puzzle may be unsolvable or require advanced techniques
        if (showNotification) {
          setValidationMessage({ 
            type: 'error', 
            message: 'This puzzle requires advanced techniques beyond our hint system.' 
          })
          setTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        }
        return false
      }
    } catch (err) {
      console.error('Hint error:', err)
      if (showNotification) {
        setValidationMessage({ type: 'error', message: 'Failed to get hint' })
        setTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
      }
      return false
    }
  }, [token, game, initialBoard])

  // Handle hint button - calls executeHintStep with notifications and increments counter
  const handleNext = useCallback(async () => {
    const result = await executeHintStep(true)
    if (result !== false) {
      // Only count as hint if it was successful (not an error)
      setHintsUsed(prev => prev + 1)
    }
  }, [executeHintStep])

  // Cell click handler
  const handleCellClick = useCallback((idx: number) => {
    // Given cells: just highlight the digit, don't select
    if (game.isGivenCell(idx)) {
      const cellDigit = game.board[idx]
      setHighlightedDigit(cellDigit)
      setEraseMode(false)
      setSelectedCell(null)
      setCurrentHighlight(null)
      return
    }

    // Toggle selection: clicking the same cell again deselects it (highest priority for user-fillable cells)
    if (selectedCell === idx) {
      setSelectedCell(null)
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
      // Clear selection and highlights after undo
      setSelectedCell(null)
      setHighlightedDigit(null)
      setCurrentHighlight(null)
      setSelectedMoveIndex(null)
    }
  }, [game, autoSolve])

  // Redo handler - during auto-solve, this steps forward
  const handleRedo = useCallback(() => {
    if (autoSolve.isAutoSolving) {
      autoSolve.stepForward()
    } else {
      game.redo()
      // Clear selection and highlights after redo
      setSelectedCell(null)
      setHighlightedDigit(null)
      setCurrentHighlight(null)
      setSelectedMoveIndex(null)
    }
  }, [game, autoSolve])

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!puzzle) return

    const score = {
      seed: puzzle.seed,
      difficulty: puzzle.difficulty,
      timeMs: timer.elapsedMs,
      hintsUsed: hintsUsed,
      mistakes: 0,
      completedAt: new Date().toISOString(),
      encodedPuzzle: encodedPuzzle || undefined,
      autoFillUsed: autoFillUsed,
      autoSolveUsed: autoSolveUsed,
    }

    saveScore(score)
    setShowResultModal(true)
  }, [puzzle, hintsUsed, timer.elapsedMs, encodedPuzzle, autoFillUsed, autoSolveUsed])

  // Auto-solve handler
  const handleSolve = useCallback(async () => {
    setSelectedCell(null)
    setHighlightedDigit(null)
    setAutoSolveUsed(true) // Mark that auto-solve was used
    await autoSolve.startAutoSolve()
  }, [autoSolve])

  // Bug report handler
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

    try {
      await navigator.clipboard.writeText(JSON.stringify(bugReport, null, 2))
      setBugReportCopied(true)
      setTimeout(() => setBugReportCopied(false), TOAST_DURATION_SUCCESS)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = JSON.stringify(bugReport, null, 2)
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setBugReportCopied(true)
      setTimeout(() => setBugReportCopied(false), TOAST_DURATION_SUCCESS)
    }
  }, [puzzle, initialBoard, game, timer.elapsedMs, colorTheme, mode])

  // ============================================================
  // EFFECTS
  // ============================================================

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setNewPuzzleMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
          solveConfirmOpen || showClearConfirm || menuOpen) {
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
    solveConfirmOpen, showClearConfirm, menuOpen
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

  // Fetch puzzle and start session
  useEffect(() => {
    if (!seed && !isEncodedCustom) return

    const fetchPuzzle = async () => {
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
          const res = await fetch(`/api/puzzle/${seed}?d=${difficulty}`)
          if (!res.ok) throw new Error('Failed to load puzzle')
          puzzleData = await res.json()
          givens = puzzleData.givens
          setEncodedPuzzle(null)
        }

        setPuzzle(puzzleData)
        setInitialBoard([...givens])

        // Start session
        const sessionRes = await fetch('/api/session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seed: puzzleData.seed,
            difficulty: difficulty === 'custom' ? 'medium' : difficulty,
            device_id: getDeviceId(),
          }),
        })
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json()
          setToken(sessionData.token)
        }

        timer.resetTimer()
        timer.startTimer()
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    fetchPuzzle()
  }, [seed, encoded, isEncodedCustom, difficulty, getDeviceId])

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
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border-light)] border-t-[var(--accent)]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)]">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      {/* Game Header */}
      <header className="sticky top-0 z-40 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border-light)]">
        <div className="mx-auto max-w-4xl px-4 h-14 flex items-center justify-between">
          {/* Left: Logo + Difficulty */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 font-semibold text-[var(--text)]">
              <span className="text-xl">🧩</span>
              <span className="hidden sm:inline">Sudoku</span>
            </Link>
            <DifficultyBadge difficulty={difficulty} size="sm" />
          </div>

          {/* Center: Timer (hidden when hideTimerState is true) */}
          {!hideTimerState && (
            <div className={`flex items-center gap-2 ${timer.isPausedDueToVisibility ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
              {timer.isPausedDueToVisibility ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className="font-mono text-sm">{timer.formatTime()}</span>
              {timer.isPausedDueToVisibility && (
                <span className="text-xs font-medium">PAUSED</span>
              )}
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            {/* Speed controls + Stop button - shown when auto-solving */}
            {autoSolve.isAutoSolving && (
              <div className="flex items-center gap-1">
                {/* Speed controls */}
                <div className="flex items-center rounded-lg overflow-hidden border border-[var(--border-light)]">
                  {([
                    { speed: 'slow' as const, icon: (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    ), label: '1x' },
                    { speed: 'normal' as const, icon: (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4 5v14l8-7z"/>
                        <path d="M12 5v14l8-7z"/>
                      </svg>
                    ), label: '2x' },
                    { speed: 'fast' as const, icon: (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2 5v14l6-7z"/>
                        <path d="M9 5v14l6-7z"/>
                        <path d="M16 5v14l6-7z"/>
                      </svg>
                    ), label: '3x' },
                    { speed: 'instant' as const, icon: (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2 5v14l5-7z"/>
                        <path d="M8 5v14l5-7z"/>
                        <path d="M14 5v14l5-7z"/>
                        <rect x="20" y="5" width="2" height="14"/>
                      </svg>
                    ), label: 'Skip' },
                  ]).map(({ speed, icon, label }) => (
                    <button
                      key={speed}
                      onClick={() => {
                        setAutoSolveSpeed(speed)
                        setAutoSolveSpeedState(speed)
                      }}
                      title={label}
                      className={`px-2 py-1.5 transition-colors ${
                        autoSolveSpeedState === speed
                          ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                          : 'bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                {/* Pause/Resume button */}
                <button
                  onClick={autoSolve.togglePause}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                    autoSolve.isPaused
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)] border border-[var(--border-light)]'
                  }`}
                  title={autoSolve.isPaused ? 'Resume' : 'Pause'}
                >
                  {autoSolve.isPaused ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16"/>
                      <rect x="14" y="4" width="4" height="16"/>
                    </svg>
                  )}
                </button>
                {/* Stop button */}
                <button
                  onClick={autoSolve.stopAutoSolve}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm bg-red-500 text-white hover:bg-red-600 transition-colors"
                  title="Stop solving"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="hidden sm:inline">Stop</span>
                </button>
              </div>
            )}

            {/* Hint button */}
            {!game.isComplete && !autoSolve.isAutoSolving && (
              <button
                onClick={handleNext}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
                title="Get a hint"
              >
                <span className="text-base">💡</span>
                <span className="hidden sm:inline">Hint</span>
              </button>
            )}

            {/* History button */}
            <button
              onClick={() => setHistoryOpen(true)}
              className="relative flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)] transition-colors"
              title="View move history"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">History</span>
              {game.history.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-[var(--btn-active-text)]">
                  {game.history.length > MAX_HISTORY_BADGE_COUNT ? `${MAX_HISTORY_BADGE_COUNT}+` : game.history.length}
                </span>
              )}
            </button>

            {/* Share button - shown when puzzle is complete */}
            {game.isComplete && (
              <button
                onClick={() => setShowResultModal(true)}
                className="flex items-center gap-1 rounded-full bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--btn-active-text)] transition-opacity hover:opacity-90"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            )}

            {/* Menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)] transition-colors"
                title="Menu"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-lg bg-[var(--bg-secondary)] shadow-lg ring-1 ring-[var(--border-light)] py-1 z-50 max-h-[70vh] overflow-y-auto">
                  {/* Primary Actions */}
                  <div className="px-3 py-1.5">
                    <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Actions</span>
                  </div>
                  <button
                    onClick={() => { autoFillNotes(); setMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--btn-hover)]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Auto-fill Notes
                  </button>
                  <button
                    onClick={() => { handleCheckNotes(); setMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--btn-hover)]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    Check Notes
                  </button>
                  <button
                    onClick={() => { game.clearCandidates(); setMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--btn-hover)]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Notes
                  </button>
                  <button
                    onClick={() => { handleValidate(); setMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--btn-hover)]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Check Progress
                  </button>
                  {/* Solve with inline speed icons */}
                  <div className="flex w-full items-center px-4 py-2 text-sm">
                    <button
                      onClick={() => { setSolveConfirmOpen(true); setMenuOpen(false) }}
                      className="flex items-center gap-2 text-[var(--text)] hover:text-[var(--accent)]"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Solve
                    </button>
                    <div className="ml-auto flex gap-0.5">
                      {([
                        { speed: 'slow' as const, icon: (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        ), label: '1x' },
                        { speed: 'normal' as const, icon: (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M4 5v14l8-7z"/>
                            <path d="M12 5v14l8-7z"/>
                          </svg>
                        ), label: '2x' },
                        { speed: 'fast' as const, icon: (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M2 5v14l6-7z"/>
                            <path d="M9 5v14l6-7z"/>
                            <path d="M16 5v14l6-7z"/>
                          </svg>
                        ), label: '3x' },
                        { speed: 'instant' as const, icon: (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M2 5v14l5-7z"/>
                            <path d="M8 5v14l5-7z"/>
                            <path d="M14 5v14l5-7z"/>
                            <rect x="20" y="5" width="2" height="14"/>
                          </svg>
                        ), label: 'Skip' },
                      ]).map(({ speed, icon, label }) => (
                        <button
                          key={speed}
                          onClick={(e) => {
                            e.stopPropagation()
                            setAutoSolveSpeed(speed)
                            setAutoSolveSpeedState(speed)
                            setMenuOpen(false)
                            setSolveConfirmOpen(true)
                          }}
                          title={`${label} - Click to start`}
                          className={`p-1 rounded ${
                            autoSolveSpeedState === speed
                              ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                              : 'text-[var(--text-muted)] hover:bg-[var(--btn-hover)] hover:text-[var(--text)]'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowClearConfirm(true); setMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--btn-hover)]"
                  >
                    {game.isComplete ? (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Restart
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Clear All
                      </>
                    )}
                  </button>

                  <div className="my-1 border-t border-[var(--border-light)]" />

                  {/* New Puzzle submenu */}
                  <div className="relative group">
                    <button
                      onClick={() => setNewPuzzleMenuOpen(!newPuzzleMenuOpen)}
                      className="flex w-full items-center justify-between px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--btn-hover)]"
                    >
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New Puzzle
                      </span>
                      <svg className={`h-4 w-4 transition-transform ${newPuzzleMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {newPuzzleMenuOpen && (
                      <div className="ml-4 mr-2 py-1">
                        {['easy', 'medium', 'hard', 'extreme', 'impossible'].map((d) => (
                          <button
                            key={d}
                            onClick={() => { window.location.href = `/game/P${Date.now()}?d=${d}` }}
                            className="block w-full px-3 py-1.5 text-left text-sm capitalize text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)]"
                          >
                            {d}
                          </button>
                        ))}
                        <div className="my-1 border-t border-[var(--border-light)]" />
                        <button
                          onClick={() => { window.location.href = '/custom' }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)]"
                        >
                          Custom
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="my-1 border-t border-[var(--border-light)]" />

                  {/* Settings Section */}
                  <div className="px-3 py-1.5">
                    <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Settings</span>
                  </div>
                  
                  {/* Theme color selector with light/dark toggle */}
                  <div className="flex items-center justify-between px-4 py-2">
                    <button
                      onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
                      className="p-1.5 rounded-md text-[var(--text)] hover:bg-[var(--btn-hover)] transition-colors"
                      title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                      {mode === 'dark' ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                      )}
                    </button>
                    <div className="flex gap-1.5">
                      {(['blue', 'green', 'purple', 'orange', 'pink'] as ColorTheme[]).map((color) => (
                        <button
                          key={color}
                          onClick={() => setColorTheme(color)}
                          className={`w-5 h-5 rounded-full transition-transform ${
                            color === 'blue' ? 'bg-blue-500' :
                            color === 'green' ? 'bg-green-500' :
                            color === 'purple' ? 'bg-purple-500' :
                            color === 'orange' ? 'bg-orange-500' :
                            'bg-pink-500'
                          } ${
                            colorTheme === color 
                              ? 'ring-2 ring-offset-1 ring-[var(--text)] scale-110' 
                              : 'hover:scale-110'
                          }`}
                          title={`${color} theme`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Font size selector - just A's in different sizes */}
                  <div className="flex items-center justify-center gap-1 px-4 py-2">
                    {fontSizes.map((size) => (
                      <button
                        key={size.key}
                        onClick={() => setFontSize(size.key)}
                        aria-label={`${size.key} text size`}
                        className={`font-size-btn font-size-btn-${size.key} ${
                          fontSize === size.key 
                            ? 'bg-[var(--accent)] text-[var(--btn-active-text)]' 
                            : 'bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                        }`}
                      >
                        {size.label}
                      </button>
                    ))}
                  </div>

                  {/* Hide timer toggle */}
                  <button
                    onClick={() => {
                      const newValue = !hideTimerState
                      setHideTimerState(newValue)
                      setHideTimer(newValue)
                    }}
                    className="flex w-full items-center justify-between px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--btn-hover)]"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {hideTimerState ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        )}
                      </svg>
                      <span>{hideTimerState ? 'Show Timer' : 'Hide Timer'}</span>
                    </div>
                    <div className={`w-8 h-4 rounded-full transition-colors ${hideTimerState ? 'bg-[var(--accent)]' : 'bg-[var(--border-light)]'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${hideTimerState ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>

                  <div className="my-1 border-t border-[var(--border-light)]" />

                  {/* More Options */}
                  <div className="px-3 py-1.5">
                    <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">More</span>
                  </div>
                  <button
                    onClick={() => { setTechniquesListOpen(true); setMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--btn-hover)]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Learn Techniques
                  </button>
                  <button
                    onClick={() => { handleReportBug(); setMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--btn-hover)]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {bugReportCopied ? 'Copied!' : 'Report Bug'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

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

      <div className="game-background flex flex-1 flex-col items-center justify-center p-4 lg:p-8">

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

      {/* Solve Confirmation Dialog */}
      {solveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSolveConfirmOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-[var(--bg)] p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-[var(--text)]">Solve Puzzle?</h2>
            <p className="mb-6 text-sm text-[var(--text-muted)]">
              This will automatically solve the entire puzzle using logical techniques. Are you sure?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSolveConfirmOpen(false)}
                className="flex-1 rounded-lg border border-[var(--border-light)] py-2 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSolveConfirmOpen(false)
                  handleSolve()
                }}
                className="flex-1 rounded-lg bg-[var(--accent)] py-2 font-medium text-[var(--btn-active-text)] transition-colors hover:opacity-90"
              >
                Solve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All / Restart Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowClearConfirm(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-[var(--bg)] p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-[var(--text)]">
              {game.isComplete ? 'Restart Puzzle?' : 'Clear All Entries?'}
            </h2>
            <p className="mb-6 text-sm text-[var(--text-muted)]">
              {game.isComplete 
                ? 'This will reset the puzzle to its initial state and restart the timer from zero.'
                : 'This will remove all your entered numbers and notes, but keep your timer running.'
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-lg border border-[var(--border-light)] py-2 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowClearConfirm(false)
                  if (game.isComplete) {
                    handleRestart()
                  } else {
                    handleClearAll()
                  }
                }}
                className="flex-1 rounded-lg bg-[var(--accent)] py-2 font-medium text-[var(--btn-active-text)] transition-colors hover:opacity-90"
              >
                {game.isComplete ? 'Restart' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show Solution Confirmation Dialog */}
      {showSolutionConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-[var(--bg)] p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-[var(--text)]">Show Solution?</h2>
            <p className="mb-6 text-sm text-[var(--text-muted)]">
              {unpinpointableErrorInfo?.message || "Hmm, I couldn't pinpoint the error. One of your entries might need checking."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSolutionConfirm(false)}
                className="flex-1 rounded-lg border border-[var(--border-light)] py-2 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
              >
                Let Me Fix It
              </button>
              <button
                onClick={() => {
                  setShowSolutionConfirm(false)
                  autoSolve.solveFromGivens()
                }}
                className="flex-1 rounded-lg bg-[var(--accent)] py-2 font-medium text-[var(--btn-active-text)] transition-colors hover:opacity-90"
              >
                Show Solution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Modal - shown for first-time users */}
      <OnboardingModal isOpen={showOnboarding} onClose={closeOnboarding} />
    </div>
  )
}
