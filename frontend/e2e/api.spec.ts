import { test, expect } from '@playwright/test';

/**
 * API Integration Tests
 * 
 * These tests directly test the backend API endpoints to ensure:
 * 1. All endpoints return correct data
 * 2. Solve endpoints work correctly
 * 3. Session management works
 * 4. Error handling is proper
 * 
 * NOTE: All tests run serially to avoid rate limiting (120 req/min with burst=10)
 */

// Force serial execution for the entire file
test.describe.configure({ mode: 'serial' });

const API_BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost';

// Helper to wait between API calls - 600ms ensures we stay under rate limit
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const API_DELAY = 600; // Base delay between API calls

// ============================================
// Health & Basic Endpoints
// ============================================

test.describe('API Health & Basic Endpoints', () => {
  test('Health endpoint returns OK', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBeDefined();
  });

  test('Daily endpoint returns seed and date', async ({ request }) => {
    await delay(API_DELAY);
    const response = await request.get(`${API_BASE}/api/daily`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.seed).toBeDefined();
    expect(data.date_utc).toBeDefined();
    expect(data.puzzle_index).toBeDefined();
  });

  test('Puzzle endpoint returns 81-cell puzzle', async ({ request }) => {
    await delay(API_DELAY);
    const response = await request.get(`${API_BASE}/api/puzzle/test-seed-123?d=easy`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.givens).toHaveLength(81);
    expect(data.difficulty).toBe('easy');
    expect(data.seed).toBe('test-seed-123');
  });

  test('Puzzle endpoint works for all difficulties', async ({ request }) => {
    const difficulties = ['easy', 'medium', 'hard', 'extreme', 'impossible'];
    
    for (const diff of difficulties) {
      await delay(API_DELAY);
      const response = await request.get(`${API_BASE}/api/puzzle/diff-test-${diff}?d=${diff}`);
      expect(response.ok()).toBeTruthy();
      
      const data = await response.json();
      expect(data.givens).toHaveLength(81);
      expect(data.difficulty).toBe(diff);
    }
  });

  test('Same seed produces same puzzle', async ({ request }) => {
    await delay(API_DELAY);
    const seed = 'determinism-test-12345';
    
    const response1 = await request.get(`${API_BASE}/api/puzzle/${seed}?d=medium`);
    const data1 = await response1.json();
    
    await delay(API_DELAY);
    const response2 = await request.get(`${API_BASE}/api/puzzle/${seed}?d=medium`);
    const data2 = await response2.json();
    
    expect(data1.givens).toEqual(data2.givens);
  });
});

// ============================================
// Session Management
// ============================================

test.describe('Session Management', () => {
  test('Session start returns valid token', async ({ request }) => {
    await delay(API_DELAY);
    const response = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'session-test-seed',
        difficulty: 'easy',
        device_id: 'test-device-001'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.token).toBeDefined();
    expect(data.token.length).toBeGreaterThan(10);
    expect(data.puzzle_id).toBeDefined();
  });

  test('Session start requires all fields', async ({ request }) => {
    await delay(API_DELAY);
    
    // Missing seed
    const response1 = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        difficulty: 'easy',
        device_id: 'test-device'
      }
    });
    expect(response1.status()).toBe(400);
    
    await delay(API_DELAY);
    
    // Missing difficulty
    const response2 = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'test-seed',
        device_id: 'test-device'
      }
    });
    expect(response2.status()).toBe(400);
    
    await delay(API_DELAY);
    
    // Missing device_id
    const response3 = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'test-seed',
        difficulty: 'easy'
      }
    });
    expect(response3.status()).toBe(400);
  });
});

// ============================================
// Solve Next Endpoint
// ============================================

test.describe('Solve Next Endpoint', () => {
  test('Solve next returns a move', async ({ request }) => {
    await delay(API_DELAY);
    
    // Get a puzzle
    const puzzleResponse = await request.get(`${API_BASE}/api/puzzle/solve-next-test-1?d=easy`);
    const puzzleData = await puzzleResponse.json();
    const board = puzzleData.givens;
    
    await delay(API_DELAY);
    
    // Start session
    const sessionResponse = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'solve-next-test-1',
        difficulty: 'easy',
        device_id: 'test-device-solve-next-1'
      }
    });
    const sessionData = await sessionResponse.json();
    const token = sessionData.token;
    
    await delay(API_DELAY);
    
    // Solve next
    const response = await request.post(`${API_BASE}/api/solve/next`, {
      data: {
        token,
        board,
        candidates: Array(81).fill([])
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.move).toBeDefined();
    expect(data.move.technique).toBeDefined();
    expect(data.board).toHaveLength(81);
  });

  test('First moves are fill-candidate type', async ({ request }) => {
    await delay(API_DELAY);
    
    // Get a puzzle
    const puzzleResponse = await request.get(`${API_BASE}/api/puzzle/solve-next-test-2?d=easy`);
    const puzzleData = await puzzleResponse.json();
    const board = puzzleData.givens;
    
    await delay(API_DELAY);
    
    // Start session
    const sessionResponse = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'solve-next-test-2',
        difficulty: 'easy',
        device_id: 'test-device-solve-next-2'
      }
    });
    const sessionData = await sessionResponse.json();
    const token = sessionData.token;
    
    await delay(API_DELAY);
    
    // Solve next
    const response = await request.post(`${API_BASE}/api/solve/next`, {
      data: {
        token,
        board,
        candidates: Array(81).fill([])
      }
    });
    
    const data = await response.json();
    
    // With no candidates, first move should be fill-candidate
    expect(data.move.technique).toBe('fill-candidate');
    expect(data.move.action).toBe('candidate');
    expect(data.move.digit).toBeGreaterThanOrEqual(1);
    expect(data.move.digit).toBeLessThanOrEqual(9);
  });

  test('Invalid token returns 401', async ({ request }) => {
    await delay(API_DELAY);
    
    const board = Array(81).fill(0);
    board[0] = 5;
    
    const response = await request.post(`${API_BASE}/api/solve/next`, {
      data: {
        token: 'invalid-token-xyz',
        board,
        candidates: Array(81).fill([])
      }
    });
    
    expect(response.status()).toBe(401);
  });

  test('Invalid board size returns 400', async ({ request }) => {
    await delay(500);
    
    // Get a valid token first
    const sessionResponse = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'invalid-board-test',
        difficulty: 'easy',
        device_id: 'test-device-invalid-board'
      }
    });
    const sessionData = await sessionResponse.json();
    
    await delay(200);
    
    const response = await request.post(`${API_BASE}/api/solve/next`, {
      data: {
        token: sessionData.token,
        board: [1, 2, 3], // Wrong size
        candidates: []
      }
    });
    
    expect(response.status()).toBe(400);
  });
});

// ============================================
// Solve All Endpoint
// ============================================

test.describe('Solve All Endpoint', () => {
  test('Solve all returns complete solution', async ({ request }) => {
    await delay(500);
    
    // Get puzzle
    const puzzleResponse = await request.get(`${API_BASE}/api/puzzle/solve-all-test-1?d=easy`);
    const puzzleData = await puzzleResponse.json();
    
    await delay(200);
    
    // Start session
    const sessionResponse = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'solve-all-test-1',
        difficulty: 'easy',
        device_id: 'test-device-solve-all-1'
      }
    });
    const sessionData = await sessionResponse.json();
    
    await delay(200);
    
    // Solve all
    const response = await request.post(`${API_BASE}/api/solve/all`, {
      data: {
        token: sessionData.token,
        board: puzzleData.givens,
        candidates: Array(81).fill([])
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.finalBoard).toHaveLength(81);
    expect(data.moves).toBeDefined();
    expect(data.moves.length).toBeGreaterThan(0);
    
    // All cells should be filled in final board
    const emptyCount = data.finalBoard.filter((c: number) => c === 0).length;
    expect(emptyCount).toBe(0);
  });

  test('Solve all includes fill-candidate moves', async ({ request }) => {
    await delay(500);
    
    const puzzleResponse = await request.get(`${API_BASE}/api/puzzle/fill-candidate-test?d=easy`);
    const puzzleData = await puzzleResponse.json();
    
    await delay(200);
    
    const sessionResponse = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'fill-candidate-test',
        difficulty: 'easy',
        device_id: 'test-device-fill-cand'
      }
    });
    const sessionData = await sessionResponse.json();
    
    await delay(200);
    
    const response = await request.post(`${API_BASE}/api/solve/all`, {
      data: {
        token: sessionData.token,
        board: puzzleData.givens,
        candidates: Array(81).fill([])
      }
    });
    
    const data = await response.json();
    
    // Should have fill-candidate moves
    const fillCandidateMoves = data.moves.filter(
      (m: any) => m.move.technique === 'fill-candidate'
    );
    expect(fillCandidateMoves.length).toBeGreaterThan(0);
  });

  test('Solve all uses multiple techniques', async ({ request }) => {
    await delay(500);
    
    const puzzleResponse = await request.get(`${API_BASE}/api/puzzle/multi-technique-test?d=medium`);
    const puzzleData = await puzzleResponse.json();
    
    await delay(200);
    
    const sessionResponse = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'multi-technique-test',
        difficulty: 'medium',
        device_id: 'test-device-multi-tech'
      }
    });
    const sessionData = await sessionResponse.json();
    
    await delay(200);
    
    const response = await request.post(`${API_BASE}/api/solve/all`, {
      data: {
        token: sessionData.token,
        board: puzzleData.givens,
        candidates: Array(81).fill([])
      }
    });
    
    const data = await response.json();
    
    // Count unique techniques
    const techniques = new Set(data.moves.map((m: any) => m.move.technique));
    
    // Should use at least fill-candidate and some solving technique
    expect(techniques.has('fill-candidate')).toBe(true);
    expect(techniques.size).toBeGreaterThan(1);
  });
});

// ============================================
// Validate Endpoint
// ============================================

test.describe('Validate Endpoint', () => {
  test('Valid partial board returns valid=true', async ({ request }) => {
    await delay(500);
    
    // Get a token
    const sessionResponse = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'validate-test-1',
        difficulty: 'easy',
        device_id: 'test-device-validate-1'
      }
    });
    const sessionData = await sessionResponse.json();
    
    await delay(200);
    
    const board = Array(81).fill(0);
    board[0] = 5;
    board[1] = 3;
    board[4] = 7;
    
    const response = await request.post(`${API_BASE}/api/validate`, {
      data: { token: sessionData.token, board }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.valid).toBe(true);
  });

  test('Board with conflicts returns valid=false', async ({ request }) => {
    await delay(500);
    
    // Get a token
    const sessionResponse = await request.post(`${API_BASE}/api/session/start`, {
      data: {
        seed: 'validate-test-2',
        difficulty: 'easy',
        device_id: 'test-device-validate-2'
      }
    });
    const sessionData = await sessionResponse.json();
    
    await delay(200);
    
    const board = Array(81).fill(0);
    board[0] = 5;
    board[1] = 5; // Duplicate in row!
    
    const response = await request.post(`${API_BASE}/api/validate`, {
      data: { token: sessionData.token, board }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.valid).toBe(false);
  });
});

// ============================================
// Custom Validate Endpoint
// ============================================

test.describe('Custom Validate Endpoint', () => {
  test('Valid custom puzzle with enough givens returns valid', async ({ request }) => {
    await delay(300);
    
    // A valid puzzle row (first 9 cells of a valid Sudoku)
    const givens = Array(81).fill(0);
    // Fill first two rows with valid non-conflicting values
    const row1 = [5, 3, 4, 6, 7, 8, 9, 1, 2];
    const row2 = [6, 7, 2, 1, 9, 5, 3, 4, 8];
    for (let i = 0; i < 9; i++) {
      givens[i] = row1[i];
      givens[i + 9] = row2[i];
    }
    
    const response = await request.post(`${API_BASE}/api/custom/validate`, {
      data: {
        givens,
        device_id: 'test-device-custom'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.valid).toBe(true);
  });

  test('Custom puzzle with too few givens returns invalid', async ({ request }) => {
    await delay(300);
    
    const givens = Array(81).fill(0);
    givens[0] = 5; // Only 1 given
    
    const response = await request.post(`${API_BASE}/api/custom/validate`, {
      data: {
        givens,
        device_id: 'test-device-few-givens'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.valid).toBe(false);
    expect(data.reason).toContain('17');
  });
});

// ============================================
// Error Handling
// ============================================

test.describe('Error Handling', () => {
  test('Non-existent endpoint returns 404', async ({ request }) => {
    await delay(200);
    const response = await request.get(`${API_BASE}/api/non-existent-endpoint`);
    expect(response.status()).toBe(404);
  });
});
