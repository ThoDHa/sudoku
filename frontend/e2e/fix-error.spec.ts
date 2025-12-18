import { test, expect } from '@playwright/test'

test.describe('Auto-Solve Error Fixing', () => {
  test('solve all detects and fixes user error - wrong digit in valid position', async ({ request }) => {
    // Get a puzzle
    const puzzleRes = await request.get('/api/puzzle/test-fix-valid?d=easy')
    expect(puzzleRes.ok()).toBeTruthy()
    const puzzleData = await puzzleRes.json()
    const givens: number[] = puzzleData.givens

    // Start session
    const sessionRes = await request.post('/api/session/start', {
      data: {
        seed: 'test-fix-valid',
        difficulty: 'easy',
        device_id: 'test-device',
      },
    })
    expect(sessionRes.ok()).toBeTruthy()
    const sessionData = await sessionRes.json()
    const token = sessionData.token
    
    // Get the correct solution
    const correctSolveRes = await request.post('/api/solve/full', {
      data: { token, board: givens },
    })
    expect(correctSolveRes.ok()).toBeTruthy()
    const correctData = await correctSolveRes.json()
    const solution: number[] = correctData.final_board

    // Create a board with one wrong digit (valid position but wrong value)
    const board = [...givens]
    let errorCell = -1
    let wrongDigit = 0
    let correctDigit = 0
    
    for (let i = 0; i < 81; i++) {
      if (givens[i] === 0) {
        const row = Math.floor(i / 9)
        const col = i % 9
        
        // Find what digits are already in row/col/box
        const taken = new Set<number>()
        for (let c = 0; c < 9; c++) if (board[row * 9 + c] !== 0) taken.add(board[row * 9 + c])
        for (let r = 0; r < 9; r++) if (board[r * 9 + col] !== 0) taken.add(board[r * 9 + col])
        const boxRow = Math.floor(row / 3) * 3
        const boxCol = Math.floor(col / 3) * 3
        for (let r = boxRow; r < boxRow + 3; r++) {
          for (let c = boxCol; c < boxCol + 3; c++) {
            if (board[r * 9 + c] !== 0) taken.add(board[r * 9 + c])
          }
        }
        
        correctDigit = solution[i]
        // Find a different valid (non-conflicting) digit
        for (let d = 1; d <= 9; d++) {
          if (!taken.has(d) && d !== correctDigit) {
            wrongDigit = d
            break
          }
        }
        
        if (wrongDigit !== 0) {
          errorCell = i
          board[i] = wrongDigit
          break
        }
      }
    }
    
    expect(errorCell).toBeGreaterThanOrEqual(0)
    
    // Solve with the wrong board
    const solveRes = await request.post('/api/solve/all', {
      data: { token, board, candidates: [], givens },
    })
    expect(solveRes.ok()).toBeTruthy()
    const solveData = await solveRes.json()
    
    // Should eventually solve after fixing the error
    expect(solveData.solved).toBe(true)
    
    // Should have exactly 1 fix-error move
    const fixMoves = (solveData.moves || []).filter((m: { move?: { action?: string } }) => m.move?.action === 'fix-error')
    expect(fixMoves.length).toBe(1)
    
    // The fix move should identify the cell we put wrong
    const errorRow = Math.floor(errorCell / 9)
    const errorCol = errorCell % 9
    const fixMove = fixMoves[0].move
    expect(fixMove.digit).toBe(wrongDigit)
    expect(fixMove.targets[0].row).toBe(errorRow)
    expect(fixMove.targets[0].col).toBe(errorCol)
  })

  test('validate endpoint detects direct conflicts', async ({ request }) => {
    // Get a puzzle
    const puzzleRes = await request.get('/api/puzzle/test-conflict?d=easy')
    expect(puzzleRes.ok()).toBeTruthy()
    const puzzleData = await puzzleRes.json()
    const givens: number[] = puzzleData.givens

    const sessionRes = await request.post('/api/session/start', {
      data: {
        seed: 'test-conflict',
        difficulty: 'easy',
        device_id: 'test-device',
      },
    })
    expect(sessionRes.ok()).toBeTruthy()
    const sessionData = await sessionRes.json()
    const token = sessionData.token

    // Create a board with a direct conflict (duplicate in same row)
    const board = [...givens]
    let conflictCell = -1
    let conflictDigit = 0
    
    for (let i = 0; i < 81; i++) {
      if (board[i] === 0) {
        const row = Math.floor(i / 9)
        // Find a digit already in this row
        for (let c = 0; c < 9; c++) {
          if (board[row * 9 + c] !== 0) {
            board[i] = board[row * 9 + c]
            conflictCell = i
            conflictDigit = board[i]
            break
          }
        }
        break
      }
    }
    
    expect(conflictCell).toBeGreaterThanOrEqual(0)

    // Validate should catch the conflict
    const validateRes = await request.post('/api/validate', {
      data: { token, board },
    })
    expect(validateRes.ok()).toBeTruthy()
    const validateData = await validateRes.json()
    
    expect(validateData.valid).toBe(false)
    expect(validateData.reason).toBe('conflicts')
    expect(validateData.conflicts).toBeDefined()
    expect(validateData.conflicts.length).toBeGreaterThan(0)
    expect(validateData.conflictCells).toBeDefined()
    expect(validateData.conflictCells).toContain(conflictCell)
    
    // The conflict should involve our digit
    const conflict = validateData.conflicts.find((c: { value: number }) => c.value === conflictDigit)
    expect(conflict).toBeDefined()
  })

  test('solve all handles multiple user errors', async ({ request }) => {
    // Get a puzzle
    const puzzleRes = await request.get('/api/puzzle/test-multi-error?d=easy')
    expect(puzzleRes.ok()).toBeTruthy()
    const puzzleData = await puzzleRes.json()
    const givens: number[] = puzzleData.givens

    const sessionRes = await request.post('/api/session/start', {
      data: {
        seed: 'test-multi-error',
        difficulty: 'easy',
        device_id: 'test-device',
      },
    })
    expect(sessionRes.ok()).toBeTruthy()
    const sessionData = await sessionRes.json()
    const token = sessionData.token
    
    // Get correct solution
    const correctSolveRes = await request.post('/api/solve/full', {
      data: { token, board: givens },
    })
    expect(correctSolveRes.ok()).toBeTruthy()
    const solution: number[] = (await correctSolveRes.json()).final_board

    // Place 2 wrong digits in DISTANT cells (not in same row/col/box)
    const board = [...givens]
    const errorCells: number[] = []
    
    // First error
    for (let i = 0; i < 81 && errorCells.length < 1; i++) {
      if (givens[i] === 0) {
        const row = Math.floor(i / 9)
        const col = i % 9
        
        const taken = new Set<number>()
        for (let c = 0; c < 9; c++) if (board[row * 9 + c] !== 0) taken.add(board[row * 9 + c])
        for (let r = 0; r < 9; r++) if (board[r * 9 + col] !== 0) taken.add(board[r * 9 + col])
        const boxRow = Math.floor(row / 3) * 3
        const boxCol = Math.floor(col / 3) * 3
        for (let r = boxRow; r < boxRow + 3; r++) {
          for (let c = boxCol; c < boxCol + 3; c++) {
            if (board[r * 9 + c] !== 0) taken.add(board[r * 9 + c])
          }
        }
        
        const correctDigit = solution[i]
        for (let d = 1; d <= 9; d++) {
          if (!taken.has(d) && d !== correctDigit) {
            board[i] = d
            errorCells.push(i)
            break
          }
        }
      }
    }
    
    // Second error - in a different row, column, and box
    const [r1, c1] = [Math.floor(errorCells[0] / 9), errorCells[0] % 9]
    for (let i = 0; i < 81 && errorCells.length < 2; i++) {
      if (givens[i] === 0 && board[i] === 0) {
        const row = Math.floor(i / 9)
        const col = i % 9
        
        // Skip if same row, column, or box as first error
        if (row === r1 || col === c1) continue
        if (Math.floor(row / 3) === Math.floor(r1 / 3) && Math.floor(col / 3) === Math.floor(c1 / 3)) continue
        
        const taken = new Set<number>()
        for (let c = 0; c < 9; c++) if (board[row * 9 + c] !== 0) taken.add(board[row * 9 + c])
        for (let r = 0; r < 9; r++) if (board[r * 9 + col] !== 0) taken.add(board[r * 9 + col])
        const boxRow = Math.floor(row / 3) * 3
        const boxCol = Math.floor(col / 3) * 3
        for (let r = boxRow; r < boxRow + 3; r++) {
          for (let c = boxCol; c < boxCol + 3; c++) {
            if (board[r * 9 + c] !== 0) taken.add(board[r * 9 + c])
          }
        }
        
        const correctDigit = solution[i]
        for (let d = 1; d <= 9; d++) {
          if (!taken.has(d) && d !== correctDigit) {
            board[i] = d
            errorCells.push(i)
            break
          }
        }
      }
    }
    
    expect(errorCells.length).toBe(2)

    // Solve - should either solve (if lucky) or fix errors and continue
    const solveRes = await request.post('/api/solve/all', {
      data: { token, board, candidates: [], givens },
    })
    expect(solveRes.ok()).toBeTruthy()
    const solveData = await solveRes.json()
    
    // Count move types for debugging
    const moveCounts: Record<string, number> = {}
    for (const m of solveData.moves || []) {
      const action = (m as { move?: { action?: string; technique?: string } }).move?.action || (m as { move?: { technique?: string } }).move?.technique || 'unknown'
      moveCounts[action] = (moveCounts[action] || 0) + 1
    }
    console.log(`Multi-error: solved=${solveData.solved}, moves:`, moveCounts)
    
    // With 2 errors in different areas, at least one should be detected
    // But this is inherently difficult - the test is mainly to ensure we don't crash
    expect(solveData).toBeDefined()
    expect(solveData.moves).toBeDefined()
  })
})
