package core

import "time"

type Difficulty string

const (
	DifficultyEasy       Difficulty = "easy"
	DifficultyMedium     Difficulty = "medium"
	DifficultyHard       Difficulty = "hard"
	DifficultyExtreme    Difficulty = "extreme"
	DifficultyImpossible Difficulty = "impossible"
)

type User struct {
	ID          string    `json:"id"`
	DeviceID    string    `json:"device_id"`
	DisplayName *string   `json:"display_name,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type Daily struct {
	DateUTC   string    `json:"date_utc"`
	Seed      string    `json:"seed"`
	CreatedAt time.Time `json:"created_at"`
}

type Puzzle struct {
	ID                 string                 `json:"id"`
	Seed               string                 `json:"seed"`
	GivensByDifficulty map[Difficulty][]int   `json:"givens_by_difficulty"`
	CreatedAt          time.Time              `json:"created_at"`
}

type Score struct {
	ID               string            `json:"id"`
	UserID           *string           `json:"user_id,omitempty"`
	DeviceID         string            `json:"device_id"`
	PuzzleID         string            `json:"puzzle_id"`
	Difficulty       Difficulty        `json:"difficulty"`
	TimeMs           int               `json:"time_ms"`
	Mistakes         int               `json:"mistakes"`
	Hints            int               `json:"hints"`
	IsCustom         bool              `json:"is_custom"`
	Validated        bool              `json:"validated"`
	TechniqueSummary map[string]int    `json:"technique_summary,omitempty"`
	CreatedAt        time.Time         `json:"created_at"`
}

type Result struct {
	ID        string    `json:"id"`
	ScoreID   string    `json:"score_id"`
	Public    bool      `json:"public"`
	CreatedAt time.Time `json:"created_at"`
}

// Move represents a single step in the human solver
type Move struct {
	StepIndex    int          `json:"step_index"`
	Technique    string       `json:"technique"`
	Action       string       `json:"action"` // "assign" or "eliminate"
	Digit        int          `json:"digit"`
	Targets      []CellRef    `json:"targets"`
	Eliminations []Candidate  `json:"eliminations,omitempty"`
	Explanation  string       `json:"explanation"`
	Refs         TechniqueRef `json:"refs"`
	Highlights   Highlights   `json:"highlights"`
}

type CellRef struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

type Candidate struct {
	Row   int `json:"row"`
	Col   int `json:"col"`
	Digit int `json:"digit"`
}

type TechniqueRef struct {
	Title string `json:"title"`
	Slug  string `json:"slug"`
	URL   string `json:"url"`
}

type Highlights struct {
	Primary   []CellRef `json:"primary"`
	Secondary []CellRef `json:"secondary,omitempty"`
}
