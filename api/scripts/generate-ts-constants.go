package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	goFile     = "../pkg/constants/constants.go"
	outputFile = "../../frontend/src/lib/constants-generated.ts"
)

type ConstantInfo struct {
	Name  string
	Value string
	Type  string
}

func main() {
	absGoFile, err := filepath.Abs(goFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error resolving Go file path: %v\n", err)
		os.Exit(1)
	}

	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, absGoFile, nil, parser.ParseComments)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing Go file: %v\n", err)
		os.Exit(1)
	}

	constants := collectConstants(node)
	output := generateTSOutput(constants)

	outputPath, err := filepath.Abs(outputFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error resolving output path: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0600); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing output file: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Generated %d constants\n", len(constants))
	fmt.Printf("Output: %s\n", outputPath)
}

// collectConstants walks the parsed Go source and returns one ConstantInfo per
// exported constant that should be exposed to the frontend.
func collectConstants(node *ast.File) []ConstantInfo {
	var constants []ConstantInfo
	for _, decl := range node.Decls {
		genDecl, ok := decl.(*ast.GenDecl)
		if !ok || genDecl.Tok != token.CONST {
			continue
		}

		for _, spec := range genDecl.Specs {
			valueSpec, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}

			for i, name := range valueSpec.Names {
				if info, ok := extractConstantInfo(valueSpec, i, name); ok {
					constants = append(constants, info)
				}
			}
		}
	}
	return constants
}

// extractConstantInfo resolves the TS-facing name, value, and type for a
// single exported const declaration. ok is false when the name should be
// skipped (unexported, or on the frontend skip-list).
func extractConstantInfo(valueSpec *ast.ValueSpec, i int, name *ast.Ident) (ConstantInfo, bool) {
	if !name.IsExported() || !shouldExport(name.Name) {
		return ConstantInfo{}, false
	}

	tsName := toTSConstantName(name.Name)
	value, typ := "", ""
	if i < len(valueSpec.Values) {
		value = extractValue(valueSpec.Values[i])
	}
	if valueSpec.Type != nil {
		typ = typeToString(valueSpec.Type)
	} else if i < len(valueSpec.Values) {
		typ = inferType(valueSpec.Values[i])
	}

	return ConstantInfo{Name: tsName, Value: value, Type: typ}, true
}

func shouldExport(name string) bool {
	skipNames := map[string]bool{
		"APIVersion":          true,
		"SolverVersion":       true,
		"DefaultPort":         true,
		"DateFormat":          true,
		"DailyDateFormat":     true,
		"DailyPuzzlePrefix":   true,
		"PuzzleIDDl":          true,
		"PracticePuzzleIDFmt": true,
		"MaxSolverSteps":      true,
		"SolutionCountLimit":  true,
		"SessionTokenExpiry":  true,
		"RouteHealth":         true,
		"RouteAPI":            true,
		"RouteVersion":        true,
		"RouteDaily":          true,
		"RoutePuzzle":         true,
		"RoutePuzzleID":       true,
		"RouteAnalyze":        true,
		"RoutePractice":       true,
		"RouteSessionStart":   true,
		"RouteSolveNext":      true,
		"RouteSolveAll":       true,
		"RouteSolveFull":      true,
		"RouteValidate":       true,
		"RouteCustomValidate": true,
	}

	return !skipNames[name]
}

func toTSConstantName(name string) string {
	mappings := map[string]string{
		"GridSize":   "BOARD_SIZE",
		"BoxSize":    "SUBGRID_SIZE",
		"TotalCells": "TOTAL_CELLS",
		"MinGivens":  "MIN_GIVENS",
	}

	if mapped, ok := mappings[name]; ok {
		return mapped
	}

	result := strings.Builder{}
	for i := range len(name) {
		if shouldInsertUnderscore(name, i) {
			result.WriteRune('_')
		}
		result.WriteRune(rune(name[i]))
	}

	return strings.ToUpper(result.String())
}

// shouldInsertUnderscore reports whether a word-boundary underscore should be
// written before the byte at position i in an identifier. An underscore is
// inserted at an uppercase rune only when both neighbors are non-uppercase,
// so runs of capitals (acronyms such as "URL") stay together.
func shouldInsertUnderscore(name string, i int) bool {
	if i == 0 {
		return false
	}
	r := rune(name[i])
	if r < 'A' || r > 'Z' {
		return false
	}
	prevChar := rune(name[i-1])
	nextChar := byte(' ')
	if i+1 < len(name) {
		nextChar = name[i+1]
	}
	return (prevChar < 'A' || prevChar > 'Z') && (nextChar < 'A' || nextChar > 'Z')
}

func extractValue(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.BasicLit:
		return e.Value
	case *ast.BinaryExpr:
		return evalBinaryExpr(e)
	case *ast.Ident:
		return e.Name
	case *ast.CallExpr:
		if sel, ok := e.Fun.(*ast.SelectorExpr); ok {
			if v, ok := evalTimeConstant(sel); ok {
				return v
			}
		}
		return ""
	default:
		return ""
	}
}

// evalBinaryExpr folds a constant binary expression into its literal value
// when both sides are positive integers, handles the time-duration idiom the
// constants file uses, and otherwise falls back to a textual reconstruction.
func evalBinaryExpr(e *ast.BinaryExpr) string {
	left := extractValue(e.X)
	right := extractValue(e.Y)

	leftNum, _ := strconv.Atoi(left)
	rightNum, _ := strconv.Atoi(right)

	if leftNum > 0 && rightNum > 0 {
		if folded, ok := evalIntOp(leftNum, rightNum, e.Op); ok {
			return folded
		}
	}

	if strings.Contains(right, "Hour") || strings.Contains(right, "Minute") || strings.Contains(right, "Second") {
		return strconv.Itoa(leftNum * 3600000)
	}

	return fmt.Sprintf("%s %s %s", left, e.Op, right)
}

func evalIntOp(left, right int, op token.Token) (string, bool) {
	switch op {
	case token.MUL:
		return strconv.Itoa(left * right), true
	case token.ADD:
		return strconv.Itoa(left + right), true
	case token.SUB:
		return strconv.Itoa(left - right), true
	case token.QUO:
		return strconv.Itoa(left / right), true
	}
	return "", false
}

// evalTimeConstant recognizes time.Hour/Minute/Second calls in the constants
// source and returns their millisecond equivalents. The boolean is false when
// the call is not one of these time constructors.
func evalTimeConstant(sel *ast.SelectorExpr) (string, bool) {
	x, ok := sel.X.(*ast.Ident)
	if !ok || x.Name != "time" {
		return "", false
	}
	switch sel.Sel.Name {
	case "Hour":
		return "3600000", true
	case "Minute":
		return "60000", true
	case "Second":
		return "1000", true
	}
	return "", false
}

func typeToString(expr ast.Expr) string {
	if expr == nil {
		return ""
	}
	switch e := expr.(type) {
	case *ast.Ident:
		return e.Name
	case *ast.BasicLit:
		return e.Value
	default:
		return ""
	}
}

func inferType(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.BasicLit:
		switch e.Kind {
		case token.INT:
			return "number"
		case token.STRING:
			return "string"
		case token.FLOAT:
			return "number"
		default:
			return "any"
		}
	case *ast.BinaryExpr:
		return "number"
	default:
		return "any"
	}
}

func generateTSOutput(constants []ConstantInfo) string {
	output := `// Auto-generated from api/pkg/constants/constants.go
// DO NOT EDIT MANUALLY - Changes will be overwritten
// Generated by: api/scripts/generate-ts-constants.go

`

	output += `// =============================================================================
// SHARED GRID CONSTANTS
// =============================================================================
`

	for _, c := range constants {
		switch c.Type {
		case "string":
			output += fmt.Sprintf("export const %s = %s\n", c.Name, c.Value)
		case "number":
			if val, err := strconv.Atoi(c.Value); err == nil && val >= 0 {
				output += fmt.Sprintf("export const %s = %s\n", c.Name, c.Value)
			} else {
				output += fmt.Sprintf("export const %s = Number('%s')\n", c.Name, c.Value)
			}
		default:
			output += fmt.Sprintf("export const %s = %s\n", c.Name, c.Value)
		}
	}

	return output
}
