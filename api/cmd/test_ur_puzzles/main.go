package main

import (
	"fmt"
	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"
)

func parsePuzzle(s string) []int {
	cells := make([]int, 81)
	for i, c := range s {
		cells[i] = int(c - '0')
	}
	return cells
}

func main() {
	// Let's test the SudokuWiki Type2 puzzle step by step
	puzzle := "020000000060000794809060200700003000900102003000500008004020507682000030000000010"
	name := "SudokuWiki Type2"

	fmt.Printf("=== Deep dive into %s ===\n", name)
	fmt.Printf("Puzzle: %s\n\n", puzzle)

	cells := parsePuzzle(puzzle)

	// Verify validity
	if dp.Solve(cells) == nil {
		fmt.Println("❌ INVALID")
		return
	}
	if !dp.HasUniqueSolution(cells) {
		fmt.Println("❌ NOT UNIQUE")
		return
	}
	fmt.Println("✅ Valid puzzle")

	// Get the technique registry
	registry := human.NewTechniqueRegistry()

	urType1 := registry.GetBySlug("unique-rectangle")
	urType2 := registry.GetBySlug("unique-rectangle-type-2")
	urType3 := registry.GetBySlug("unique-rectangle-type-3")
	urType4 := registry.GetBySlug("unique-rectangle-type-4")

	// Create board and solve step by step, testing UR detectors after each step
	board := human.NewBoard(cells)
	solver := human.NewSolver()

	fmt.Println("Solving step by step and testing UR detectors at each step...")
	fmt.Println("=============================================================")

	for step := 0; step < constants.MaxSolverSteps; step++ {
		// Count empty cells
		emptyCells := 0
		for i := 0; i < 81; i++ {
			if board.Cells[i] == 0 {
				emptyCells++
			}
		}

		if emptyCells == 0 {
			fmt.Printf("\n✅ Puzzle solved after %d steps!\n", step)
			break
		}

		// Test UR detectors every 5 steps
		if step%5 == 0 || step < 10 {
			ur1Result := urType1.Detector(board)
			ur2Result := urType2.Detector(board)
			ur3Result := urType3.Detector(board)
			ur4Result := urType4.Detector(board)

			hasUR := ur1Result != nil || ur2Result != nil || ur3Result != nil || ur4Result != nil

			if hasUR {
				fmt.Printf("\n>>> Step %d (empty: %d) - UR FOUND! <<<\n", step, emptyCells)
				if ur1Result != nil {
					fmt.Printf("  UR Type 1: %s\n", ur1Result.Explanation)
				}
				if ur2Result != nil {
					fmt.Printf("  UR Type 2: %s\n", ur2Result.Explanation)
				}
				if ur3Result != nil {
					fmt.Printf("  UR Type 3: %s\n", ur3Result.Explanation)
				}
				if ur4Result != nil {
					fmt.Printf("  UR Type 4: %s\n", ur4Result.Explanation)
				}
			}
		}

		// Get next move
		move := solver.FindNextMove(board)
		if move == nil {
			fmt.Printf("\n❌ Solver stalled after %d steps (empty: %d)\n", step, emptyCells)

			// Final UR check
			fmt.Println("\nFinal UR detector check:")
			if ur1Result := urType1.Detector(board); ur1Result != nil {
				fmt.Printf("  UR Type 1: %s\n", ur1Result.Explanation)
			}
			if ur2Result := urType2.Detector(board); ur2Result != nil {
				fmt.Printf("  UR Type 2: %s\n", ur2Result.Explanation)
			}
			if ur3Result := urType3.Detector(board); ur3Result != nil {
				fmt.Printf("  UR Type 3: %s\n", ur3Result.Explanation)
			}
			if ur4Result := urType4.Detector(board); ur4Result != nil {
				fmt.Printf("  UR Type 4: %s\n", ur4Result.Explanation)
			}
			break
		}

		// Apply the move
		if move.Action == "set" {
			for _, target := range move.Targets {
				idx := target.Row*9 + target.Col
				board.SetCell(idx, move.Digit)
			}
		} else {
			for _, elim := range move.Eliminations {
				delete(board.Candidates[elim.Row*9+elim.Col], elim.Digit)
			}
		}

		// Print every move
		if step < 30 || move.Technique == "unique-rectangle" || move.Technique == "unique-rectangle-type-2" ||
			move.Technique == "unique-rectangle-type-3" || move.Technique == "unique-rectangle-type-4" {
			fmt.Printf("Step %d: %s - %s\n", step+1, move.Technique, move.Explanation)
		}
	}

	fmt.Println("\n\n========================================")
	fmt.Println("Now testing with the SudokuWiki puzzle bank")
	fmt.Println("========================================")

	// Test more puzzles from practice_puzzles.json in the repo
	// These are known to be valid
	testPuzzles := []string{
		// From the existing test files - known valid
		"009006002045003008000010030080001050004000080100760000000207500000090000000000023",
		"400000006000109000030405900090201080001050200070904010006502070000308000900000008",
		"700406001020800005100000090304005000070030010000600309030000008500003040600109003",
		"001000400030500098000006000300000009008000654620000000040020000005380000060400703",
		"000010200000504030020000006050002040003000005600800070010405007000001020930068000",
	}

	for i, puzz := range testPuzzles {
		cells := parsePuzzle(puzz)
		if dp.Solve(cells) == nil || !dp.HasUniqueSolution(cells) {
			continue
		}

		board := human.NewBoard(cells)
		moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

		// Check for UR types 2/3/4
		for _, m := range moves {
			switch m.Technique {
			case "unique-rectangle-type-2":
				fmt.Printf("Puzzle %d: ✅ UR TYPE 2 - %s\n", i+1, m.Explanation)
			case "unique-rectangle-type-3":
				fmt.Printf("Puzzle %d: ✅ UR TYPE 3 - %s\n", i+1, m.Explanation)
			case "unique-rectangle-type-4":
				fmt.Printf("Puzzle %d: ✅ UR TYPE 4 - %s\n", i+1, m.Explanation)
			}
		}
		_ = status // suppress unused warning
	}
}
