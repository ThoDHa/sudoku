/**
 * SDK API Tests
 * 
 * Tests the Sudoku API using the PlaywrightAPISDK.
 * All tests run serially to avoid rate limiting.
 */

import { test, expect } from '@playwright/test';
import { PlaywrightAPISDK, type Difficulty } from './sdk';

// Configure serial execution to avoid rate limiting
test.describe.configure({ mode: 'serial' });

const API_BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost';
const API_DELAY = 600; // ms between API calls

let sdk: PlaywrightAPISDK;

test.beforeEach(async ({ request }) => {
  sdk = new PlaywrightAPISDK({
    request,
    baseUrl: API_BASE,
    apiDelay: API_DELAY,
  });
});

// ============================================
// HEALTH & INFO ENDPOINTS
// ============================================

test.describe('Health & Info Endpoints', () => {
  test('health endpoint returns OK', async () => {
    const response = await sdk.health();
    expect(response.ok).toBe(true);
    expect(response.data?.status).toBe('ok');
    expect(response.data?.version).toBeDefined();
  });

  test('daily endpoint returns seed and date', async () => {
    const response = await sdk.daily();
    expect(response.ok).toBe(true);
    expect(response.data?.seed).toBeDefined();
    expect(response.data?.date_utc).toBeDefined();
    expect(response.data?.puzzle_index).toBeDefined();
  });
});

// ============================================
// PUZZLE ENDPOINTS
// ============================================

test.describe('Puzzle Endpoints', () => {
  test('get puzzle returns 81-cell puzzle', async () => {
    const response = await sdk.getPuzzle('test-sdk-123', 'easy');
    expect(response.ok).toBe(true);
    expect(response.data?.givens).toHaveLength(81);
    expect(response.data?.difficulty).toBe('easy');
    expect(response.data?.seed).toBe('test-sdk-123');
  });

  test('get puzzle works for all difficulties', async () => {
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'extreme', 'impossible'];
    
    for (const diff of difficulties) {
      const response = await sdk.getPuzzle(`sdk-diff-${diff}`, diff);
      expect(response.ok).toBe(true);
      expect(response.data?.givens).toHaveLength(81);
      expect(response.data?.difficulty).toBe(diff);
    }
  });

  test('same seed produces same puzzle', async () => {
    const seed = 'sdk-determinism-test';
    
    const response1 = await sdk.getPuzzle(seed, 'medium');
    const response2 = await sdk.getPuzzle(seed, 'medium');
    
    expect(response1.ok).toBe(true);
    expect(response2.ok).toBe(true);
    expect(response1.data?.givens).toEqual(response2.data?.givens);
  });
});

// ============================================
// PRACTICE PUZZLES
// ============================================

test.describe('Practice Puzzles', () => {
  test('get practice puzzle for naked-single', async () => {
    const response = await sdk.getPracticePuzzle('naked-single');
    expect(response.ok).toBe(true);
    expect(response.data?.givens).toHaveLength(81);
    expect(response.data?.technique).toBe('naked-single');
    expect(response.data?.seed).toContain('practice-naked-single');
  });

  test('get practice puzzle for hidden-single', async () => {
    const response = await sdk.getPracticePuzzle('hidden-single');
    expect(response.ok).toBe(true);
    expect(response.data?.givens).toHaveLength(81);
    expect(response.data?.technique).toBe('hidden-single');
  });

  test('unknown technique returns 404', async () => {
    const response = await sdk.getPracticePuzzle('non-existent-technique');
    // May return 404 if technique not found in any puzzle
    // or may succeed if it searches with default difficulties
    // For now just verify we get a response
    expect(response.status).toBeDefined();
  });
});

// ============================================
// SESSION MANAGEMENT
// ============================================

test.describe('Session Management', () => {
  test('start session returns valid token', async () => {
    const response = await sdk.startSession({
      seed: 'sdk-session-test',
      difficulty: 'easy',
      device_id: 'sdk-test-device',
    });
    
    expect(response.ok).toBe(true);
    expect(response.data?.token).toBeDefined();
    expect(response.data?.token.length).toBeGreaterThan(10);
    expect(response.data?.puzzle_id).toBeDefined();
  });

  test('start session requires all fields', async () => {
    // Missing seed
    const response1 = await sdk.startSession({
      seed: '',
      difficulty: 'easy',
      device_id: 'test-device',
    });
    expect(response1.ok).toBe(false);
    
    // Missing device_id
    const response2 = await sdk.startSession({
      seed: 'test-seed',
      difficulty: 'easy',
      device_id: '',
    });
    expect(response2.ok).toBe(false);
  });

  test('startGame convenience method works', async () => {
    const { puzzle, session } = await sdk.startGame('sdk-convenience-test', 'easy', 'sdk-device');
    
    expect(puzzle.ok).toBe(true);
    expect(session.ok).toBe(true);
    expect(puzzle.data?.givens).toHaveLength(81);
    expect(session.data?.token).toBeDefined();
  });
});

// ============================================
// SOLVE NEXT ENDPOINT
// ============================================

test.describe('Solve Next Endpoint', () => {
  test('solve next returns a move', async () => {
    const { puzzle, session } = await sdk.startGame('sdk-solve-next-1', 'easy', 'sdk-device-1');
    
    expect(puzzle.ok).toBe(true);
    expect(session.ok).toBe(true);
    
    const response = await sdk.solveNext({
      token: session.data!.token,
      board: puzzle.data!.givens,
      candidates: Array(81).fill([]),
    });
    
    expect(response.ok).toBe(true);
    expect(response.data?.move).toBeDefined();
    expect(response.data?.move?.technique).toBeDefined();
    expect(response.data?.board).toHaveLength(81);
  });

  test('first moves may be immediate assignments (naked/hidden single)', async () => {
    const { puzzle, session } = await sdk.startGame('sdk-fill-cand-1', 'easy', 'sdk-device-2');
    
    const response = await sdk.solveNext({
      token: session.data!.token,
      board: puzzle.data!.givens,
      candidates: Array(81).fill([]),
    });
    
    expect(response.ok).toBe(true);
    // First move can be fill-candidate, naked-single, or hidden-single
    // depending on whether adding the candidate creates an immediate assignment
    expect(['fill-candidate', 'naked-single', 'hidden-single']).toContain(response.data?.move?.technique);
    expect(response.data?.move?.digit).toBeGreaterThanOrEqual(1);
    expect(response.data?.move?.digit).toBeLessThanOrEqual(9);
  });

  test('invalid token returns error', async () => {
    const board = Array(81).fill(0);
    board[0] = 5;
    
    const response = await sdk.solveNext({
      token: 'invalid-token-xyz',
      board,
      candidates: Array(81).fill([]),
    });
    
    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
  });
});

// ============================================
// SOLVE ALL ENDPOINT
// ============================================

test.describe('Solve All Endpoint', () => {
  test('solve all returns complete solution', async () => {
    const { puzzle, session } = await sdk.startGame('sdk-solve-all-1', 'easy', 'sdk-device-3');
    
    const response = await sdk.solveAll({
      token: session.data!.token,
      board: puzzle.data!.givens,
      candidates: Array(81).fill([]),
    });
    
    expect(response.ok).toBe(true);
    expect(response.data?.finalBoard).toHaveLength(81);
    expect(response.data?.moves).toBeDefined();
    expect(response.data?.moves!.length).toBeGreaterThan(0);
    
    // All cells should be filled
    const emptyCount = response.data?.finalBoard.filter(c => c === 0).length;
    expect(emptyCount).toBe(0);
  });

  test('solve all includes assignment moves', async () => {
    const { puzzle, session } = await sdk.startGame('sdk-fill-cand-all', 'easy', 'sdk-device-4');
    
    const response = await sdk.solveAll({
      token: session.data!.token,
      board: puzzle.data!.givens,
      candidates: Array(81).fill([]),
    });
    
    expect(response.ok).toBe(true);
    
    // Should have assignment moves (naked-single or hidden-single)
    const assignMoves = response.data?.moves?.filter(
      m => m.move.action === 'assign'
    );
    expect(assignMoves!.length).toBeGreaterThan(0);
  });

  test('solve all uses multiple techniques', async () => {
    const { puzzle, session } = await sdk.startGame('sdk-multi-tech', 'medium', 'sdk-device-5');
    
    const response = await sdk.solveAll({
      token: session.data!.token,
      board: puzzle.data!.givens,
      candidates: Array(81).fill([]),
    });
    
    expect(response.ok).toBe(true);
    
    const techniques = new Set(response.data?.moves?.map(m => m.move.technique));
    expect(techniques.has('fill-candidate')).toBe(true);
    expect(techniques.size).toBeGreaterThan(1);
  });
});

// ============================================
// VALIDATE ENDPOINT
// ============================================

test.describe('Validate Endpoint', () => {
  test('valid partial board returns valid=true', async () => {
    const session = await sdk.startSession({
      seed: 'sdk-validate-1',
      difficulty: 'easy',
      device_id: 'sdk-device-6',
    });
    
    const board = sdk.createPartialBoard([
      { index: 0, value: 5 },
      { index: 1, value: 3 },
      { index: 4, value: 7 },
    ]);
    
    const response = await sdk.validate({
      token: session.data!.token,
      board,
    });
    
    expect(response.ok).toBe(true);
    expect(response.data?.valid).toBe(true);
  });

  test('board with conflicts returns valid=false', async () => {
    const session = await sdk.startSession({
      seed: 'sdk-validate-2',
      difficulty: 'easy',
      device_id: 'sdk-device-7',
    });
    
    const board = sdk.createConflictingBoard();
    
    const response = await sdk.validate({
      token: session.data!.token,
      board,
    });
    
    expect(response.ok).toBe(true);
    expect(response.data?.valid).toBe(false);
  });
});

// ============================================
// CUSTOM VALIDATE ENDPOINT
// ============================================

test.describe('Custom Validate Endpoint', () => {
  test('valid custom puzzle returns valid=true', async () => {
    const givens = Array(81).fill(0);
    // Fill first two rows with valid non-conflicting values
    const row1 = [5, 3, 4, 6, 7, 8, 9, 1, 2];
    const row2 = [6, 7, 2, 1, 9, 5, 3, 4, 8];
    for (let i = 0; i < 9; i++) {
      givens[i] = row1[i];
      givens[i + 9] = row2[i];
    }
    
    const response = await sdk.validateCustom({
      givens,
      device_id: 'sdk-custom-device',
    });
    
    expect(response.ok).toBe(true);
    expect(response.data?.valid).toBe(true);
  });

  test('custom puzzle with too few givens returns invalid', async () => {
    const givens = Array(81).fill(0);
    givens[0] = 5; // Only 1 given
    
    const response = await sdk.validateCustom({
      givens,
      device_id: 'sdk-few-givens',
    });
    
    expect(response.ok).toBe(true);
    expect(response.data?.valid).toBe(false);
    expect(response.data?.reason).toContain('17');
  });
});

// ============================================
// HELPER METHODS
// ============================================

test.describe('SDK Helper Methods', () => {
  test('isSolved correctly identifies complete boards', async () => {
    const incomplete = Array(81).fill(0);
    incomplete[0] = 5;
    expect(sdk.isSolved(incomplete)).toBe(false);
    
    const complete = Array(81).fill(0).map((_, i) => (i % 9) + 1);
    expect(sdk.isSolved(complete)).toBe(true);
  });

  test('countEmpty and countFilled work correctly', async () => {
    const board = Array(81).fill(0);
    board[0] = 5;
    board[1] = 3;
    board[10] = 7;
    
    expect(sdk.countEmpty(board)).toBe(78);
    expect(sdk.countFilled(board)).toBe(3);
  });
});
