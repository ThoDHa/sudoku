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
				if !name.IsExported() {
					continue
				}

				if !shouldExport(name.Name) {
					continue
				}

				tsName := toTSConstantName(name.Name)
				var value string
				var typ string

				if i < len(valueSpec.Values) {
					value = extractValue(valueSpec.Values[i])
				}

				if valueSpec.Type != nil {
					typ = typeToString(valueSpec.Type)
				} else if i < len(valueSpec.Values) {
					typ = inferType(valueSpec.Values[i])
				}

				constants = append(constants, ConstantInfo{
					Name:  tsName,
					Value: value,
					Type:  typ,
				})
			}
		}
	}

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
	for i, r := range name {
		if i > 0 && r >= 'A' && r <= 'Z' {
			nextChar := ' '
			if i+1 < len(name) {
				nextChar = rune(name[i+1])
			}

			prevChar := ' '
			if i > 0 {
				prevChar = rune(name[i-1])
			}

			if (prevChar < 'A' || prevChar > 'Z') && (nextChar < 'A' || nextChar > 'Z') {
				result.WriteRune('_')
			}
		}
		result.WriteRune(r)
	}

	return strings.ToUpper(result.String())
}

func extractValue(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.BasicLit:
		return e.Value
	case *ast.BinaryExpr:
		left := extractValue(e.X)
		right := extractValue(e.Y)

		leftNum, _ := strconv.Atoi(left)
		rightNum, _ := strconv.Atoi(right)

		if leftNum > 0 && rightNum > 0 {
			switch e.Op {
			case token.MUL:
				return strconv.Itoa(leftNum * rightNum)
			case token.ADD:
				return strconv.Itoa(leftNum + rightNum)
			case token.SUB:
				return strconv.Itoa(leftNum - rightNum)
			case token.QUO:
				return strconv.Itoa(leftNum / rightNum)
			}
		}

		if strings.Contains(right, "Hour") || strings.Contains(right, "Minute") || strings.Contains(right, "Second") {
			hours := leftNum
			return strconv.Itoa(hours * 3600000)
		}

		return fmt.Sprintf("%s %s %s", left, e.Op, right)
	case *ast.Ident:
		return e.Name
	case *ast.CallExpr:
		if sel, ok := e.Fun.(*ast.SelectorExpr); ok {
			if x, ok := sel.X.(*ast.Ident); ok && x.Name == "time" {
				switch sel.Sel.Name {
				case "Hour":
					return "3600000"
				case "Minute":
					return "60000"
				case "Second":
					return "1000"
				}
			}
		}
		return ""
	default:
		return ""
	}
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
