package main

import (
	"fmt"
	"os"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run main.go <puzzle_string>")
		os.Exit(1)
	}

	puzzleStr := os.Args[1]
	if len(puzzleStr) != 81 {
		fmt.Printf("Puzzle must be 81 characters, got %d\n", len(puzzleStr))
		os.Exit(1)
	}

	cells := make([]int, 81)
	for i, c := range puzzleStr {
		if c >= '0' && c <= '9' {
			cells[i] = int(c - '0')
		}
	}

	solver := human.NewSolver()
	board := human.NewBoard(cells)
	moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

	fmt.Printf("Status: %s\n", status)

	// Count solving steps (excluding fill-candidate which is bookkeeping)
	solvingSteps := 0
	techniques := make(map[string]int)
	for _, move := range moves {
		techniques[move.Technique]++
		if move.Technique != "fill-candidate" {
			solvingSteps++
		}
	}

	fmt.Printf("Solving steps: %d\n", solvingSteps)
	fmt.Printf("Total moves (incl. candidates): %d\n", len(moves))
	fmt.Printf("Techniques used: %v\n", techniques)
}
