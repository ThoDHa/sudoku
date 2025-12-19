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
