/**
 * API Tests for Sudoku Solver Endpoints
 *
 * These tests verify the API behavior without browser context.
 * Run with: npx playwright test e2e/api/solver.spec.ts
 */

import { test, expect } from '@playwright/test';
import { DirectAPISDK } from '../sdk';
import type { Difficulty, Board, PuzzleResponse, SessionStartResponse } from '../sdk';

// Configure base URL from environment or default
const API_URL = process.env.API_URL || 'http://localhost:8080';

// Create SDK instance for all tests
const sdk = new DirectAPISDK({ baseUrl: API_URL, timeout: 10000 });

// Test seed for deterministic puzzles
const TEST_SEED = 'test-api-seed-12345';

// Helper to generate a unique device ID
function generateDeviceId(): string {
  return `test-device-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// Helper to start a session and get token
async function getSessionToken(seed: string, difficulty: Difficulty): Promise<string> {
  const sessionResult = await sdk.startSession({
    seed,
    difficulty,
    device_id: generateDeviceId(),
  });
  expect(sessionResult.ok).toBe(true);
  expect(sessionResult.data?.token).toBeDefined();
  return sessionResult.data!.token;
}

test.describe('GET /puzzle - Puzzle Generation', () => {
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

  for (const difficulty of difficulties) {
    test(`returns valid puzzle for difficulty: ${difficulty}`, async () => {
      const result = await sdk.getPuzzle(TEST_SEED, difficulty);

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();

      const puzzle = result.data!;
      expect(puzzle.seed).toBe(TEST_SEED);
      expect(puzzle.difficulty).toBe(difficulty);
      expect(puzzle.givens).toHaveLength(81);
      expect(puzzle.puzzle_id).toBe(`${TEST_SEED}-${difficulty}`);

      // Verify givens are valid (0-9)
      for (const cell of puzzle.givens) {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThanOrEqual(9);
      }

      // Verify there are some givens (not all zeros)
      const filledCells = puzzle.givens.filter((c) => c !== 0).length;
      expect(filledCells).toBeGreaterThan(16); // Min 17 givens for unique solution
    });
  }

  test('returns same puzzle for same seed and difficulty', async () => {
    const result1 = await sdk.getPuzzle(TEST_SEED, 'medium');
    const result2 = await sdk.getPuzzle(TEST_SEED, 'medium');

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    expect(result1.data!.givens).toEqual(result2.data!.givens);
  });

  test('returns different puzzles for different difficulties', async () => {
    const easy = await sdk.getPuzzle(TEST_SEED, 'easy');
    const hard = await sdk.getPuzzle(TEST_SEED, 'hard');

    expect(easy.ok).toBe(true);
    expect(hard.ok).toBe(true);

    // Easy puzzles should have more givens than hard puzzles
    const easyFilledCount = easy.data!.givens.filter((c) => c !== 0).length;
    const hardFilledCount = hard.data!.givens.filter((c) => c !== 0).length;
    expect(easyFilledCount).toBeGreaterThan(hardFilledCount);
  });

  test('returns error for invalid difficulty', async () => {
    // Use fetch directly for invalid difficulty test
    const response = await fetch(
      `${API_URL}/api/puzzle/${TEST_SEED}?d=invalid`
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('invalid_difficulty');
  });
});

test.describe('POST /solve/next - Get Hint', () => {
  test('returns next move for valid puzzle', async () => {
    // Get a puzzle first
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'easy');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    // Start a session
    const token = await getSessionToken(TEST_SEED, 'easy');

    // Request next move (hint)
    const solveResult = await sdk.solveNext({
      token,
      board: puzzle.givens,
    });

    expect(solveResult.ok).toBe(true);
    expect(solveResult.status).toBe(200);

    const response = solveResult.data!;
    // Should have a move (puzzle isn't solved yet)
    expect(response.move).toBeDefined();
    if (response.move) {
      expect(response.move.technique).toBeDefined();
      expect(response.move.action).toBeDefined();
      expect(response.move.explanation).toBeDefined();
    }
  });

  test('returns valid hint with technique explanation', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'medium');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'medium');

    const solveResult = await sdk.solveNext({
      token,
      board: puzzle.givens,
    });

    expect(solveResult.ok).toBe(true);
    const move = solveResult.data!.move!;

    // Check move has required fields
    expect(move.technique).toBeTruthy();
    expect(move.action).toBeTruthy();
    expect(move.explanation).toBeTruthy();
    expect(['assign', 'candidate', 'eliminate', 'contradiction', 'clear-candidates']).toContain(move.action);
  });

  test('returns error with invalid token', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'easy');
    expect(puzzleResult.ok).toBe(true);

    const solveResult = await sdk.solveNext({
      token: 'invalid-token',
      board: puzzleResult.data!.givens,
    });

    expect(solveResult.ok).toBe(false);
    expect(solveResult.status).toBe(401);
    expect(solveResult.error).toContain('invalid token');
  });

  test('returns error with invalid board size', async () => {
    const token = await getSessionToken(TEST_SEED, 'easy');

    // Use fetch directly for malformed request
    const response = await fetch(`${API_URL}/api/solve/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        board: [1, 2, 3], // Invalid: only 3 cells
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('81');
  });
});

test.describe('POST /solve/full - Full Solution', () => {
  test('solves puzzle completely with fast mode', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'easy');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'easy');

    const solveResult = await sdk.solveFull(token, puzzle.givens, 'fast');

    expect(solveResult.ok).toBe(true);
    expect(solveResult.status).toBe(200);

    const response = solveResult.data!;
    expect(response.final_board).toHaveLength(81);

    // Verify solution is complete (no zeros)
    for (const cell of response.final_board) {
      expect(cell).toBeGreaterThanOrEqual(1);
      expect(cell).toBeLessThanOrEqual(9);
    }
  });

  test('solves puzzle with human-style techniques', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'easy');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'easy');

    const solveResult = await sdk.solveFull(token, puzzle.givens, 'human');

    expect(solveResult.ok).toBe(true);
    expect(solveResult.status).toBe(200);

    const response = solveResult.data!;
    expect(response.final_board).toHaveLength(81);
    // Human mode includes moves array
    expect(response.moves).toBeDefined();
    expect(response.stopped_reason).toBeDefined();
  });

  test('returns error for unsolvable puzzle', async () => {
    const token = await getSessionToken(TEST_SEED, 'easy');

    // Create an invalid puzzle (two 1s in first row)
    const invalidBoard: Board = Array(81).fill(0);
    invalidBoard[0] = 1;
    invalidBoard[1] = 1;

    const solveResult = await sdk.solveFull(token, invalidBoard, 'fast');

    // Fast solver returns error for unsolvable puzzles
    expect(solveResult.ok).toBe(false);
    expect(solveResult.status).toBe(400);
    expect(solveResult.error).toContain('no solution');
  });
});

test.describe('POST /solve/all - Step-by-step Solution', () => {
  test('returns all solving steps', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'easy');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'easy');

    const solveResult = await sdk.solveAll({
      token,
      board: puzzle.givens,
    });

    expect(solveResult.ok).toBe(true);
    expect(solveResult.status).toBe(200);

    const response = solveResult.data!;
    expect(response.moves).toBeDefined();
    expect(response.moves.length).toBeGreaterThan(0);
    expect(response.solved).toBe(true);
    expect(response.finalBoard).toHaveLength(81);

    // Verify each move has required fields
    for (const step of response.moves) {
      expect(step.board).toHaveLength(81);
      expect(step.candidates).toHaveLength(81);
      expect(step.move).toBeDefined();
    }
  });
});

test.describe('POST /session/start - Session Management', () => {
  test('creates session with valid parameters', async () => {
    const result = await sdk.startSession({
      seed: TEST_SEED,
      difficulty: 'medium',
      device_id: generateDeviceId(),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();
    expect(result.data!.token).toBeTruthy();
    expect(result.data!.puzzle_id).toBe(`${TEST_SEED}-medium`);
    expect(result.data!.started_at).toBeTruthy();
  });

  test('returns error for invalid difficulty', async () => {
    const response = await fetch(`${API_URL}/api/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed: TEST_SEED,
        difficulty: 'invalid',
        device_id: generateDeviceId(),
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('invalid_difficulty');
  });

  test('returns error for missing required fields', async () => {
    const response = await fetch(`${API_URL}/api/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed: TEST_SEED,
        // Missing difficulty and device_id
      }),
    });

    expect(response.status).toBe(400);
  });
});

test.describe('POST /validate - Board Validation', () => {
  test('validates correct board state', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'easy');
    expect(puzzleResult.ok).toBe(true);

    const token = await getSessionToken(TEST_SEED, 'easy');

    const validateResult = await sdk.validate({
      token,
      board: puzzleResult.data!.givens,
    });

    expect(validateResult.ok).toBe(true);
    expect(validateResult.data!.valid).toBe(true);
  });

  test('detects conflicting numbers', async () => {
    const token = await getSessionToken(TEST_SEED, 'easy');

    // Create a board with conflicts (two 1s in first row)
    const conflictBoard: Board = Array(81).fill(0);
    conflictBoard[0] = 1;
    conflictBoard[1] = 1;

    const validateResult = await sdk.validate({
      token,
      board: conflictBoard,
    });

    expect(validateResult.ok).toBe(true);
    expect(validateResult.data!.valid).toBe(false);
    expect(validateResult.data!.reason).toBe('conflicts');
  });
});

test.describe('GET /health - Health Check', () => {
  test('returns healthy status', async () => {
    const result = await sdk.health();

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data!.status).toBe('ok');
    expect(result.data!.version).toBeDefined();
  });
});

test.describe('GET /daily - Daily Puzzle', () => {
  test('returns daily puzzle info', async () => {
    const result = await sdk.daily();

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data!.date_utc).toBeDefined();
    expect(result.data!.seed).toBeDefined();
    expect(result.data!.seed).toMatch(/^D\d{4}-\d{2}-\d{2}$/); // Format: D2025-01-15
  });
});

test.describe('Error Handling', () => {
  test('handles missing token in solve request', async () => {
    const response = await fetch(`${API_URL}/api/solve/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board: Array(81).fill(0),
        // Missing token
      }),
    });

    expect(response.status).toBe(400);
  });

  test('handles empty request body', async () => {
    const response = await fetch(`${API_URL}/api/solve/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(400);
  });

  test('handles malformed JSON', async () => {
    const response = await fetch(`${API_URL}/api/solve/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    expect(response.status).toBe(400);
  });
});

// ============================================
// Conflict Detection Tests
// ============================================

test.describe('POST /solve/next - Direct Conflict Detection', () => {
  test('detects row conflict and returns fix-conflict action', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'medium');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'medium');

    // Create a board with a row conflict by adding same digit twice in a row
    const board = [...puzzle.givens];
    // Find two empty cells in the same row
    const row = 0;
    const emptyCells: number[] = [];
    for (let col = 0; col < 9 && emptyCells.length < 2; col++) {
      const idx = row * 9 + col;
      if (board[idx] === 0) {
        emptyCells.push(idx);
      }
    }
    
    // If we found 2 empty cells, create a conflict
    if (emptyCells.length >= 2) {
      board[emptyCells[0]] = 7;
      board[emptyCells[1]] = 7; // Same digit = conflict!

      const solveResult = await sdk.solveNext({ token, board });

      expect(solveResult.ok).toBe(true);
      const move = solveResult.data!.move!;
      expect(move.action).toBe('fix-conflict');
      expect(move.technique).toBe('fix-conflict');
      expect(move.digit).toBe(7);
      expect(move.explanation).toContain('Conflict');
      expect(move.explanation).toContain('row');
      expect(move.highlights).toBeDefined();
      expect(move.highlights!.primary).toHaveLength(1);
      expect(move.highlights!.secondary).toHaveLength(1);
    }
  });

  test('detects column conflict and returns fix-conflict action', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'medium');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'medium');

    // Create a board with a column conflict
    const board = [...puzzle.givens];
    const col = 0;
    const emptyCells: number[] = [];
    for (let row = 0; row < 9 && emptyCells.length < 2; row++) {
      const idx = row * 9 + col;
      if (board[idx] === 0) {
        emptyCells.push(idx);
      }
    }
    
    if (emptyCells.length >= 2) {
      board[emptyCells[0]] = 3;
      board[emptyCells[1]] = 3;

      const solveResult = await sdk.solveNext({ token, board });

      expect(solveResult.ok).toBe(true);
      const move = solveResult.data!.move!;
      expect(move.action).toBe('fix-conflict');
      expect(move.explanation).toContain('Conflict');
      expect(move.explanation).toContain('column');
    }
  });

  test('detects box conflict and returns fix-conflict action', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'medium');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'medium');

    // Create a board with a box conflict (different row AND column, same box)
    const board = [...puzzle.givens];
    // Box 0 contains cells at rows 0-2, cols 0-2
    const boxCells: number[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const idx = r * 9 + c;
        if (board[idx] === 0) {
          boxCells.push(idx);
        }
      }
    }
    
    // Find two cells that are NOT in the same row or column
    if (boxCells.length >= 2) {
      const cell1 = boxCells[0];
      let cell2 = -1;
      for (let i = 1; i < boxCells.length; i++) {
        const row1 = Math.floor(cell1 / 9);
        const col1 = cell1 % 9;
        const row2 = Math.floor(boxCells[i] / 9);
        const col2 = boxCells[i] % 9;
        if (row1 !== row2 && col1 !== col2) {
          cell2 = boxCells[i];
          break;
        }
      }
      
      if (cell2 >= 0) {
        board[cell1] = 9;
        board[cell2] = 9;

        const solveResult = await sdk.solveNext({ token, board });

        expect(solveResult.ok).toBe(true);
        const move = solveResult.data!.move!;
        expect(move.action).toBe('fix-conflict');
        expect(move.explanation).toContain('Conflict');
        expect(move.explanation).toContain('box');
      }
    }
  });

  test('fix-conflict removes user entry, not given', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'easy');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'easy');

    // Find a given digit and an empty cell in the same row
    const board = [...puzzle.givens];
    for (let row = 0; row < 9; row++) {
      let givenCell = -1;
      let givenDigit = 0;
      let emptyCell = -1;

      for (let col = 0; col < 9; col++) {
        const idx = row * 9 + col;
        if (puzzle.givens[idx] !== 0 && givenCell < 0) {
          givenCell = idx;
          givenDigit = puzzle.givens[idx];
        } else if (puzzle.givens[idx] === 0 && emptyCell < 0) {
          emptyCell = idx;
        }
      }

      if (givenCell >= 0 && emptyCell >= 0) {
        // Place the same digit as the given in the empty cell
        board[emptyCell] = givenDigit;

        const solveResult = await sdk.solveNext({ token, board });

        expect(solveResult.ok).toBe(true);
        const move = solveResult.data!.move!;
        expect(move.action).toBe('fix-conflict');
        
        // The primary highlight should be the USER entry (emptyCell), not the given
        const primaryRow = move.highlights!.primary![0].row;
        const primaryCol = move.highlights!.primary![0].col;
        const primaryIdx = primaryRow * 9 + primaryCol;
        expect(primaryIdx).toBe(emptyCell);
        
        // The returned board should have removed the user entry
        expect(solveResult.data!.board[emptyCell]).toBe(0);
        expect(solveResult.data!.board[givenCell]).toBe(givenDigit);
        break;
      }
    }
  });

  test('valid board proceeds without conflict', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'easy');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'easy');

    // Use the puzzle as-is (no conflicts)
    const solveResult = await sdk.solveNext({ token, board: puzzle.givens });

    expect(solveResult.ok).toBe(true);
    const move = solveResult.data!.move!;
    // Should be a normal solving action, not a conflict fix
    expect(move.action).not.toBe('fix-conflict');
    expect(['assign', 'candidate', 'eliminate']).toContain(move.action);
  });
});

test.describe('POST /solve/all - Conflict Detection', () => {
  test('solve/all detects conflict and stops', async () => {
    const puzzleResult = await sdk.getPuzzle(TEST_SEED, 'medium');
    expect(puzzleResult.ok).toBe(true);
    const puzzle = puzzleResult.data!;

    const token = await getSessionToken(TEST_SEED, 'medium');

    // Create a row conflict
    const board = [...puzzle.givens];
    const emptyCells: number[] = [];
    for (let i = 0; i < 9 && emptyCells.length < 2; i++) {
      if (board[i] === 0) emptyCells.push(i);
    }
    
    if (emptyCells.length >= 2) {
      board[emptyCells[0]] = 5;
      board[emptyCells[1]] = 5;

      const solveResult = await sdk.solveAll({ token, board });

      expect(solveResult.ok).toBe(true);
      // When conflict is detected, solve/all returns status: "conflict_found"
      // and includes the fix-conflict move
      const response = solveResult.data as unknown as { status?: string; move?: { action: string } };
      if (response.status) {
        expect(response.status).toBe('conflict_found');
      }
      if (response.move) {
        expect(response.move.action).toBe('fix-conflict');
      }
    }
  });
});
