// Package compileprobe is a frozen fixture for the mutation compile-probe
// regression check (`make mutation-probe-check`). It is not production code and
// nothing imports it.
//
// go-mutesting scored every mutant that fails to compile as a kill, because
// `go test` exits 1 for a build failure exactly as it does for a failing test.
// The local patch in patches/ compiles each mutant before testing it and
// reports a non-compiling one as skipped. This package exists so that fix has
// something deterministic to be asserted against: the constant index below is
// rewritten to -1 by the numbers/decrementer mutator, and the Go compiler
// rejects a negative constant index, so at least one mutant here can never
// compile no matter what the toolchain does.
//
// Keep this package frozen. Changing it changes the mutant population the check
// asserts on.
package compileprobe

// Row is a fixed-size row of cells.
type Row [3]int

// First returns the leading cell of r.
func First(r Row) int {
	return r[0]
}
