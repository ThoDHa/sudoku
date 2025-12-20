import { useReducer, useMemo } from 'react'

/**
 * Move highlight information - what technique/hint is currently being shown
 */
export interface MoveHighlight {
  step_index: number
  technique: string
  action: string
  digit: number
  targets: { row: number; col: number }[]
  eliminations?: { row: number; col: number; digit: number }[]
  explanation: string
  refs: { title: string; slug: string; url: string }
  highlights: {
    primary: { row: number; col: number }[]
    secondary?: { row: number; col: number }[]
  }
  isUserMove?: boolean
}

/**
 * Consolidated highlight state - all highlight-related state in one place
 * This ensures atomic updates and prevents intermediate render states
 */
export interface HighlightState {
  /** Currently selected cell index (0-80) or null */
  selectedCell: number | null
  /** Currently highlighted digit for multi-fill mode (1-9) or null */
  highlightedDigit: number | null
  /** Current move/hint highlight being shown */
  currentHighlight: MoveHighlight | null
  /** Index of selected move in history panel */
  selectedMoveIndex: number | null
  /** Version counter - increments on every state change to ensure React detects updates */
  version: number
}

/**
 * All possible actions for highlight state changes
 * Using discriminated unions for type safety
 */
export type HighlightAction =
  // Selection actions
  | { type: 'SELECT_CELL'; cell: number }
  | { type: 'DESELECT_CELL' }
  
  // Digit highlight actions
  | { type: 'SET_DIGIT_HIGHLIGHT'; digit: number }
  | { type: 'CLEAR_DIGIT_HIGHLIGHT' }
  | { type: 'TOGGLE_DIGIT_HIGHLIGHT'; digit: number }
  
  // Move highlight actions
  | { type: 'SET_MOVE_HIGHLIGHT'; move: MoveHighlight; index?: number }
  | { type: 'CLEAR_MOVE_HIGHLIGHT' }
  
  // Compound actions (for specific workflows)
  | { type: 'CLEAR_ALL' }
  | { type: 'CLEAR_ALL_AND_DESELECT' }
  | { type: 'CLEAR_AFTER_USER_CANDIDATE_OP' }  // Preserves digit highlight for multi-fill
  | { type: 'CLEAR_AFTER_DIGIT_PLACEMENT' }    // Preserves digit highlight
  | { type: 'CLEAR_AFTER_CELL_SELECTION' }     // Clears highlights when selecting cell
  | { type: 'CLEAR_AFTER_ERASE' }              // Preserves digit highlight
  | { type: 'CLEAR_ON_MODE_CHANGE' }           // Clears everything
  | { type: 'CLEAR_AFTER_DIGIT_TOGGLE' }       // User toggled same digit (erase) - clears all highlights
  | { type: 'CLEAR_HIGHLIGHTS_KEEP_SELECTION' } // Clears highlights but keeps selected cell
  
  // Given cell click - highlight the digit and select the cell for peer highlighting
  | { type: 'CLICK_GIVEN_CELL'; digit: number; cell: number }

const initialState: HighlightState = {
  selectedCell: null,
  highlightedDigit: null,
  currentHighlight: null,
  selectedMoveIndex: null,
  version: 0,
}

/**
 * Reducer for highlight state - all state transitions are atomic
 */
function highlightReducer(state: HighlightState, action: HighlightAction): HighlightState {
  // Always increment version to ensure React detects the change
  const nextVersion = state.version + 1

  switch (action.type) {
    // Selection actions
    case 'SELECT_CELL':
      return {
        ...state,
        selectedCell: action.cell,
        // Clear highlights when selecting a cell (for consistent UX)
        highlightedDigit: null,
        currentHighlight: null,
        version: nextVersion,
      }
    
    case 'DESELECT_CELL':
      return {
        ...state,
        selectedCell: null,
        version: nextVersion,
      }
    
    // Digit highlight actions
    case 'SET_DIGIT_HIGHLIGHT':
      return {
        ...state,
        highlightedDigit: action.digit,
        // Clear move highlight when setting digit (fixes persistence bug)
        currentHighlight: null,
        version: nextVersion,
      }
    
    case 'CLEAR_DIGIT_HIGHLIGHT':
      return {
        ...state,
        highlightedDigit: null,
        version: nextVersion,
      }
    
    case 'TOGGLE_DIGIT_HIGHLIGHT':
      return {
        ...state,
        highlightedDigit: state.highlightedDigit === action.digit ? null : action.digit,
        currentHighlight: null,
        version: nextVersion,
      }
    
    // Move highlight actions
    case 'SET_MOVE_HIGHLIGHT':
      return {
        ...state,
        currentHighlight: action.move,
        selectedMoveIndex: action.index ?? state.selectedMoveIndex,
        version: nextVersion,
      }
    
    case 'CLEAR_MOVE_HIGHLIGHT':
      return {
        ...state,
        currentHighlight: null,
        selectedMoveIndex: null,
        version: nextVersion,
      }
    
    // Compound actions for specific workflows
    case 'CLEAR_ALL':
      return {
        ...state,
        highlightedDigit: null,
        currentHighlight: null,
        selectedMoveIndex: null,
        version: nextVersion,
      }
    
    case 'CLEAR_ALL_AND_DESELECT':
      return {
        ...state,
        selectedCell: null,
        highlightedDigit: null,
        currentHighlight: null,
        selectedMoveIndex: null,
        version: nextVersion,
      }
    
    case 'CLEAR_AFTER_USER_CANDIDATE_OP':
      // User added/removed a candidate manually
      // PRESERVE digit highlight for multi-fill workflow
      // Clear move highlight to prevent stale cell backgrounds
      return {
        ...state,
        currentHighlight: null,
        selectedMoveIndex: null,
        version: nextVersion,
      }
    
    case 'CLEAR_AFTER_DIGIT_PLACEMENT':
      // User placed a digit
      // PRESERVE digit highlight for multi-fill workflow
      return {
        ...state,
        currentHighlight: null,
        version: nextVersion,
      }
    
    case 'CLEAR_AFTER_CELL_SELECTION':
      // User selected a cell
      // Clear digit highlight but preserve cell selection
      return {
        ...state,
        highlightedDigit: null,
        currentHighlight: null,
        version: nextVersion,
      }
    
    case 'CLEAR_AFTER_ERASE':
      // User erased a cell
      // Preserve digit highlight for continued operations
      return {
        ...state,
        currentHighlight: null,
        version: nextVersion,
      }
    
    case 'CLEAR_ON_MODE_CHANGE':
      // User changed modes (notes/placement/erase)
      // Clear everything
      return {
        ...state,
        selectedCell: null,
        highlightedDigit: null,
        currentHighlight: null,
        version: nextVersion,
      }
    
    case 'CLEAR_AFTER_DIGIT_TOGGLE':
      // User toggled the same digit (erased it)
      // Clear all highlights
      return {
        ...state,
        highlightedDigit: null,
        currentHighlight: null,
        selectedMoveIndex: null,
        version: nextVersion,
      }
    
    case 'CLEAR_HIGHLIGHTS_KEEP_SELECTION':
      // Clear digit and move highlights but keep cell selection
      return {
        ...state,
        highlightedDigit: null,
        currentHighlight: null,
        selectedMoveIndex: null,
        version: nextVersion,
      }
    
    case 'CLICK_GIVEN_CELL':
      // User clicked on a given cell - highlight that digit and select cell for peer highlighting
      return {
        ...state,
        selectedCell: action.cell,
        highlightedDigit: action.digit,
        currentHighlight: null,
        version: nextVersion,
      }
    
    default:
      return state
  }
}

/**
 * Hook for managing highlight state with atomic updates
 * 
 * This replaces the separate useState calls and useHighlightManager hook
 * with a single reducer that ensures all state updates are atomic.
 * 
 * Benefits:
 * 1. Atomic updates - no intermediate render states
 * 2. Version counter - ensures React detects Uint16Array changes
 * 3. Semantic actions - clear intent for each state transition
 * 4. Battery efficient - single state update = single render
 */
export function useHighlightState() {
  const [state, dispatch] = useReducer(highlightReducer, initialState)

  // Memoized action creators for stable references
  const actions = useMemo(() => ({
    // Selection
    selectCell: (cell: number) => dispatch({ type: 'SELECT_CELL', cell }),
    deselectCell: () => dispatch({ type: 'DESELECT_CELL' }),
    
    // Digit highlight
    setDigitHighlight: (digit: number) => dispatch({ type: 'SET_DIGIT_HIGHLIGHT', digit }),
    clearDigitHighlight: () => dispatch({ type: 'CLEAR_DIGIT_HIGHLIGHT' }),
    toggleDigitHighlight: (digit: number) => dispatch({ type: 'TOGGLE_DIGIT_HIGHLIGHT', digit }),
    
    // Move highlight
    setMoveHighlight: (move: MoveHighlight, index?: number) => {
      if (index !== undefined) {
        dispatch({ type: 'SET_MOVE_HIGHLIGHT', move, index })
      } else {
        dispatch({ type: 'SET_MOVE_HIGHLIGHT', move })
      }
    },
    clearMoveHighlight: () => dispatch({ type: 'CLEAR_MOVE_HIGHLIGHT' }),
    
    // Compound actions
    clearAll: () => dispatch({ type: 'CLEAR_ALL' }),
    clearAllAndDeselect: () => dispatch({ type: 'CLEAR_ALL_AND_DESELECT' }),
    clearAfterUserCandidateOp: () => dispatch({ type: 'CLEAR_AFTER_USER_CANDIDATE_OP' }),
    clearAfterDigitPlacement: () => dispatch({ type: 'CLEAR_AFTER_DIGIT_PLACEMENT' }),
    clearAfterCellSelection: () => dispatch({ type: 'CLEAR_AFTER_CELL_SELECTION' }),
    clearAfterErase: () => dispatch({ type: 'CLEAR_AFTER_ERASE' }),
    clearOnModeChange: () => dispatch({ type: 'CLEAR_ON_MODE_CHANGE' }),
    clearAfterDigitToggle: () => dispatch({ type: 'CLEAR_AFTER_DIGIT_TOGGLE' }),
    clearHighlightsKeepSelection: () => dispatch({ type: 'CLEAR_HIGHLIGHTS_KEEP_SELECTION' }),
    clickGivenCell: (digit: number, cell: number) => dispatch({ type: 'CLICK_GIVEN_CELL', digit, cell }),
  }), [])

  // Backward compatibility getters (for gradual migration)
  const selectedCell = state.selectedCell
  const highlightedDigit = state.highlightedDigit
  const currentHighlight = state.currentHighlight
  const selectedMoveIndex = state.selectedMoveIndex
  const version = state.version

  return {
    // State values
    state,
    selectedCell,
    highlightedDigit,
    currentHighlight,
    selectedMoveIndex,
    version,
    
    // Actions
    ...actions,
    dispatch,
  }
}

export type UseHighlightStateReturn = ReturnType<typeof useHighlightState>
