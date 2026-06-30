package main

import (
	"fmt"

	"sudoku-api/internal/core"
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

// urCheck pairs a human-readable label with the registry slug it corresponds
// to, for the four unique-rectangle detector variants exercised below.
type urCheck struct {
	label string
	slug  string
}

var urChecks = []urCheck{
	{"UR Type 1", "unique-rectangle"},
	{"UR Type 2", "unique-rectangle-type-2"},
	{"UR Type 3", "unique-rectangle-type-3"},
	{"UR Type 4", "unique-rectangle-type-4"},
}

// detectUniqueRectangles runs every UR detector against board and returns the
// non-nil findings in label order. Empty slice means no UR was detected.
func detectUniqueRectangles(registry *human.TechniqueRegistry, board *human.Board) []urFinding {
	var findings []urFinding
	for _, ch := range urChecks {
		result := registry.GetBySlug(ch.slug).Detector(board)
		if result != nil {
			findings = append(findings, urFinding{ch.label, result.Explanation})
		}
	}
	return findings
}

type urFinding struct {
	label, explanation string
}

func printURFindings(findings []urFinding) {
	for _, f := range findings {
		fmt.Printf("  %s: %s\n", f.label, f.explanation)
	}
}

func countEmptyCells(board *human.Board) int {
	emptyCells := 0
	for i := 0; i < 81; i++ {
		if board.Cells[i] == 0 {
			emptyCells++
		}
	}
	return emptyCells
}

// applyMove mirrors the solver's ApplyMove but keeps the local print loop's
// "set vs eliminate" branch visible for the step-by-step trace.
func applyMove(board *human.Board, move *core.Move) {
	if move.Action == "set" {
		for _, target := range move.Targets {
			idx := target.Row*9 + target.Col
			board.SetCell(idx, move.Digit)
		}
		return
	}
	for _, elim := range move.Eliminations {
		idx := elim.Row*9 + elim.Col
		board.Candidates[idx] = board.Candidates[idx].Clear(elim.Digit)
	}
}

func isUniqueRectangleMove(move *core.Move) bool {
	switch move.Technique {
	case "unique-rectangle", "unique-rectangle-type-2",
		"unique-rectangle-type-3", "unique-rectangle-type-4":
		return true
	}
	return false
}

// shouldTraceMove reports whether the per-step trace should print this move.
// Every move prints early in the run; later, only unique-rectangle moves do.
func shouldTraceMove(step int, move *core.Move) bool {
	return step < 30 || isUniqueRectangleMove(move)
}

// shouldTestUniqueRectangles reports whether UR detectors should run at this
// step. They run every 5 steps, plus every step early in the run for density.
func shouldTestUniqueRectangles(step int) bool {
	return step%5 == 0 || step < 10
}

// deepDiveURPuzzle solves a single puzzle step by step, testing all UR
// detectors after selected steps and printing a detailed trace.
func deepDiveURPuzzle(puzzle, name string, registry *human.TechniqueRegistry, solver *human.Solver) {
	fmt.Printf("=== Deep dive into %s ===\n", name)
	fmt.Printf("Puzzle: %s\n\n", puzzle)

	cells := parsePuzzle(puzzle)

	if dp.Solve(cells) == nil {
		fmt.Println("❌ INVALID")
		return
	}
	if !dp.HasUniqueSolution(cells) {
		fmt.Println("❌ NOT UNIQUE")
		return
	}
	fmt.Println("✅ Valid puzzle")

	board := human.NewBoard(cells)

	fmt.Println("Solving step by step and testing UR detectors at each step...")
	fmt.Println("=============================================================")

	for step := 0; step < constants.MaxSolverSteps; step++ {
		emptyCells := countEmptyCells(board)
		if emptyCells == 0 {
			fmt.Printf("\n✅ Puzzle solved after %d steps!\n", step)
			return
		}

		// Test UR detectors every 5 steps, plus every step early in the run.
		if shouldTestUniqueRectangles(step) {
			if findings := detectUniqueRectangles(registry, board); len(findings) > 0 {
				fmt.Printf("\n>>> Step %d (empty: %d) - UR FOUND! <<<\n", step, emptyCells)
				printURFindings(findings)
			}
		}

		move := solver.FindNextMove(board)
		if move == nil {
			fmt.Printf("\n❌ Solver stalled after %d steps (empty: %d)\n", step, emptyCells)
			fmt.Println("\nFinal UR detector check:")
			printURFindings(detectUniqueRectangles(registry, board))
			return
		}

		applyMove(board, move)

		// Print every move early on, and any UR move regardless of step.
		if shouldTraceMove(step, move) {
			fmt.Printf("Step %d: %s - %s\n", step+1, move.Technique, move.Explanation)
		}
	}
}

// testURPuzzleBank runs the solver against a fixed bank of known-valid puzzles
// and reports any UR Type 2/3/4 detections in the resulting move stream.
func testURPuzzleBank(solver *human.Solver) {
	fmt.Println("\n\n========================================")
	fmt.Println("Now testing with the SudokuWiki puzzle bank")
	fmt.Println("========================================")

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

func main() {
	// Let's test the SudokuWiki Type2 puzzle step by step
	puzzle := "020000000060000794809060200700003000900102003000500008004020507682000030000000010"
	name := "SudokuWiki Type2"

	registry := human.NewTechniqueRegistry()
	solver := human.NewSolver()

	deepDiveURPuzzle(puzzle, name, registry, solver)
	testURPuzzleBank(solver)
}
