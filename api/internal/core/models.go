package core

type Difficulty string

const (
	DifficultyEasy       Difficulty = "easy"
	DifficultyMedium     Difficulty = "medium"
	DifficultyHard       Difficulty = "hard"
	DifficultyExtreme    Difficulty = "extreme"
	DifficultyImpossible Difficulty = "impossible"
)

// Move represents a single step in the human solver
type Move struct {
	StepIndex    int          `json:"step_index"`
	Technique    string       `json:"technique"`
	Action       string       `json:"action"` // move action; see constants.Action* (assign, eliminate, contradiction, candidate, ...)
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
