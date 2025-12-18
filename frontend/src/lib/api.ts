/**
 * API module - Re-exports from solver-service for backward compatibility.
 * 
 * New code should import directly from './solver-service'.
 * This file exists for backward compatibility with existing imports.
 */

// Re-export everything from solver-service
export {
  // Types
  type CellRef,
  type Candidate,
  type TechniqueRef,
  type Highlights,
  type Move,
  type SolveNextResult,
  type SolveAllResult,
  type ValidateBoardResult,
  type ValidateCustomResult,
  type PuzzleResult,
  
  // Solver functions
  solveNext,
  solveAll,
  validateBoard,
  validateCustomPuzzle,
  getPuzzle,
  
  // Daily/practice
  getDailySeed,
  fetchPracticePuzzle,
  
  // WASM initialization
  initializeSolver,
  isWasmReady,
} from './solver-service'

// Re-export DailyResponse type for hooks.ts
export type DailyResponse = {
  date_utc: string
  seed: string
}
