// Package http is the dev-only HTTP harness for the Sudoku solver.
//
// Quarantine notice (ARCH-2): this package is NOT shipped. The production
// application runs the same Go solver packages compiled to WebAssembly
// directly in the browser (see cmd/wasm and ARCHITECTURE.md); the production
// deploy (.github/workflows/deploy.yml -> make wasm-all + vite build -> GitHub
// Pages) never builds the server that hosts these routes.
//
// The package exists for local development and the E2E/SDK test suite only.
// Its sole importer is cmd/server, run via "make server"/"make run" and the
// dev docker-compose. See docs/dev-api-reference.md for the route catalog.
//
// Because this is a development harness, it is exempt from the production
// quality gates that the shipped solver packages carry: it is not in the
// per-package coverage floor (api/Makefile coverage-gate) and it is not in
// the nightly mutation cron (.github/workflows/nightly-mutation.yml). The
// package must still build, vet, and test clean under "go build ./...".
package http
