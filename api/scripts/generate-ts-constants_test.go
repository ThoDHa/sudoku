package main

import (
	"fmt"
	"go/parser"
	"go/token"
	"os"
	"strings"
	"testing"
)

// frontend/src/lib/constants-generated.ts is machine-written from
// api/pkg/constants/constants.go and is excluded from frontend mutation on the
// grounds that this test guards it, so the exclusion is honest only while this
// test exists and passes. It drives the generator's own collectConstants and
// generateTSOutput over the committed Go source and holds the committed
// TypeScript artifact against the result byte for byte, so a changed value, a
// renamed constant, an added or dropped constant, or a hand edit of the
// artifact all fail here rather than surfacing as silent drift between the two
// trees. The paths come from the generator's own goFile and outputFile
// constants, so the test checks exactly the files the generator reads and
// writes, and go test resolves them from this package's directory.
func TestConstantsGeneratedTSMatchesGeneratorOutputByteForByte(t *testing.T) {
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, goFile, nil, parser.ParseComments)
	if err != nil {
		t.Fatalf("parse %s: %v", goFile, err)
	}

	constants := collectConstants(node)
	if len(constants) == 0 {
		t.Fatalf("collectConstants(%s) returned no constants: parity against an empty render would be vacuous", goFile)
	}

	rendered := generateTSOutput(constants)

	committed, err := os.ReadFile(outputFile)
	if err != nil {
		t.Fatalf("read %s: %v", outputFile, err)
	}

	// Go string equality compares byte for byte, so this is the byte-for-byte
	// comparison the exclusion above rests on.
	if rendered == string(committed) {
		return
	}

	t.Fatalf("%s is out of parity with %s: %s", outputFile, goFile, firstDifferingLine(rendered, string(committed)))
}

// firstDifferingLine describes where the generator's render and the committed
// file first diverge, so a failure names the offending line instead of forcing
// a manual diff.
func firstDifferingLine(want, got string) string {
	wantLines := strings.Split(want, "\n")
	gotLines := strings.Split(got, "\n")

	for i := range min(len(wantLines), len(gotLines)) {
		if wantLines[i] != gotLines[i] {
			return fmt.Sprintf("first difference at line %d: the generator renders %q, the committed file has %q", i+1, wantLines[i], gotLines[i])
		}
	}

	if len(wantLines) != len(gotLines) {
		shorter, longer := wantLines, gotLines
		ends, continues := "the generator's render", "the committed file"
		if len(wantLines) > len(gotLines) {
			shorter, longer = gotLines, wantLines
			ends, continues = "the committed file", "the generator's render"
		}
		return fmt.Sprintf("first difference at line %d: %s ends while %s continues with %q", len(shorter)+1, ends, continues, longer[len(shorter)])
	}

	return "outputs differ without a differing line"
}
