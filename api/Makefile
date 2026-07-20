# Sudoku API Makefile

.PHONY: all build server generate-constants wasm wasm-copy clean test coverage-gate vulncheck mutation-install mutation-go mutation-gate mutation-clean

# Go build settings
GO := go
TINYGO := tinygo
GOOS_WASM := GOOS=js GOARCH=wasm

# Output paths
WASM_OUT := ../frontend/public/sudoku.wasm
WASM_EXEC_OUT := ../frontend/public/wasm_exec.js

# TinyGo build flags for smallest WASM
TINYGO_FLAGS := -target=wasm -no-debug -opt=z

# Standard Go LDFLAGS (for fallback builds)
LDFLAGS := -ldflags="-s -w"

# TinyGo root for wasm_exec.js
TINYGO_ROOT := $(shell $(TINYGO) env TINYGOROOT 2>/dev/null)

all: server generate-constants wasm

# Build the HTTP server
server:
	$(GO) build -o bin/server ./cmd/server

# Generate TypeScript constants from Go source
generate-constants:
	@echo "Generating TypeScript constants from Go..."
	@cd scripts && go run generate-ts-constants.go
	@echo "TypeScript constants generated successfully"

# Build WASM module with TinyGo (default - smaller output)
wasm:
	$(TINYGO) build $(TINYGO_FLAGS) -o $(WASM_OUT) ./cmd/wasm

# Build WASM with standard Go (fallback if TinyGo unavailable)
wasm-go:
	$(GOOS_WASM) $(GO) build $(LDFLAGS) -o $(WASM_OUT) ./cmd/wasm

# Copy wasm_exec.js from TinyGo installation
wasm-copy:
	cp "$(TINYGO_ROOT)/targets/wasm_exec.js" $(WASM_EXEC_OUT)

# Copy wasm_exec.js from standard Go (fallback)
wasm-copy-go:
	cp "$$($(GO) env GOROOT)/misc/wasm/wasm_exec.js" $(WASM_EXEC_OUT)

# Build WASM and copy support file (TinyGo)
wasm-all: wasm wasm-copy
	@echo "TinyGo WASM build complete!"
	@echo "Output: $(WASM_OUT)"
	@ls -lh $(WASM_OUT)

# Build WASM and copy support file (standard Go fallback)
wasm-all-go: wasm-go wasm-copy-go
	@echo "Standard Go WASM build complete!"
	@echo "Output: $(WASM_OUT)"
	@ls -lh $(WASM_OUT)

# Run tests
test:
	$(GO) test ./...

# Run tests with Allure-compatible JUnit XML output (requires gotestsum)
test-allure:
	@mkdir -p allure-results
	gotestsum --junitfile allure-results/go-results.xml --format testname -- -v ./...

# Run tests with coverage report
test-coverage:
	$(GO) test -coverprofile=coverage.out -covermode=atomic ./...
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"
	@$(GO) tool cover -func=coverage.out | tail -1

# Run tests with verbose coverage per package
test-coverage-verbose:
	$(GO) test -v -coverprofile=coverage.out -covermode=atomic ./...
	$(GO) tool cover -func=coverage.out

# Per-package coverage floors. Kept just below measured coverage to absorb minor
# Go-version / test-ordering variance; see COVERAGE.md for the full policy. COV-1
# drove every gated package to an honest ceiling (measured: dp 99.4%, human 100%,
# techniques 99.1%), with the residual sub-100 being genuinely unreachable
# defensive code documented in COVERAGE.md. Floors sit at 99. Note:
# transport/http is intentionally NOT gated here. It is a dev-only HTTP harness
# (ARCH-2; see internal/transport/http/doc.go) never built for production, so it
# carries no production coverage floor. Its tests still run under "go test ./...".
DP_COVERAGE_FLOOR := 99
HUMAN_COVERAGE_FLOOR := 99
TECHNIQUES_COVERAGE_FLOOR := 99

# Enforce per-package coverage floors. Runs `go test -cover` per gated package,
# parses the reported percentage, and exits non-zero on breach. CI invokes this
# from the test-go job; run locally with `make coverage-gate`.
coverage-gate:
	@set -e; \
	check_pkg() { \
		pkg="$$1"; floor="$$2"; \
		out=$$(go test -cover "$$pkg" 2>&1) || { \
			echo "coverage-gate: ERROR go test failed for $$pkg" >&2; \
			echo "$$out" >&2; \
			exit 2; \
		}; \
		pct=$$(printf '%s\n' "$$out" | grep -oE 'coverage:[[:space:]]+[0-9]+(\.[0-9]+)?%' | grep -oE '[0-9]+(\.[0-9]+)?' | head -1); \
		if [ -z "$$pct" ]; then \
			echo "coverage-gate: ERROR could not parse coverage for $$pkg" >&2; \
			echo "$$out" >&2; \
			exit 2; \
		fi; \
		ok=$$(awk -v p="$$pct" -v f="$$floor" 'BEGIN { print (p+0 >= f+0) ? 1 : 0 }'); \
		if [ "$$ok" = "1" ]; then \
			printf 'coverage-gate: OK   %s %s%% (floor %s%%)\n' "$$pkg" "$$pct" "$$floor"; \
		else \
			delta=$$(awk -v p="$$pct" -v f="$$floor" 'BEGIN { printf "%.1f", f - p }'); \
			printf 'coverage-gate: FAIL %s %s%% < floor %s%% (short by %spp)\n' "$$pkg" "$$pct" "$$floor" "$$delta" >&2; \
			exit 1; \
		fi; \
	}; \
	check_pkg ./internal/sudoku/dp $(DP_COVERAGE_FLOOR); \
	check_pkg ./internal/sudoku/human $(HUMAN_COVERAGE_FLOOR); \
	check_pkg ./internal/sudoku/human/techniques $(TECHNIQUES_COVERAGE_FLOOR); \
	echo "coverage-gate: all gated packages met their floors."

# Per-package mutation efficacy floors (MUT-1-2; Decisions 4 + 9). The Go
# solver is the source of truth for game correctness, so it carries the
# strictest floor. Efficacy is defined in the mutation-gate target below.
DP_MUTATION_FLOOR := 100
HUMAN_MUTATION_FLOOR := 100
TECHNIQUES_MUTATION_FLOOR := 99.9

# go-mutesting binary. avito-tech/go-mutesting v2.3.1 carries an upstream
# packaging defect: its go.mod declares `module github.com/avito-tech/go-mutesting`
# without the /v2 suffix the v2.x tag requires, so `go install ...@v2.3.1`
# fails (both with and without /v2). `make mutation-install` builds the exact
# v2.3.1 tag from a local clone as the documented workaround; CI (MUT-1-6)
# must use the same path. GOPATH/bin is not assumed to be on PATH.
GO_MUTESTESTING_BIN := $(shell go env GOPATH)/bin/go-mutesting
GO_MUTESTESTING_TAG := v2.3.1
MUTATION_REPORT_DIR := reports/mutation

# Build the go-mutesting v2.3.1 binary from a pinned-tag local clone,
# working around the upstream go.mod major-version defect above.
mutation-install:
	@set -e; \
	if [ -x "$(GO_MUTESTESTING_BIN)" ]; then \
		echo "mutation-install: go-mutesting already installed at $(GO_MUTESTESTING_BIN)"; \
	else \
		tmp=$$(mktemp -d); \
		echo "mutation-install: cloning avito-tech/go-mutesting $(GO_MUTESTESTING_TAG) and building (upstream go install is broken; see Makefile note)"; \
		git clone --depth=1 --branch $(GO_MUTESTESTING_TAG) https://github.com/avito-tech/go-mutesting.git "$$tmp/go-mutesting"; \
		GOTOOLCHAIN=local go -C "$$tmp/go-mutesting" build -o "$(GO_MUTESTESTING_BIN)" ./cmd/go-mutesting; \
		rm -rf "$$tmp"; \
		echo "mutation-install: installed $(GO_MUTESTESTING_BIN)"; \
	fi

# Run go-mutesting on each in-scope Go package (Decision 9: explicit
# enumeration; human/techniquetest is excluded as pure test-fixture data).
# Emits reports/mutation/<pkg-slug>/{report.json,go-mutesting-report.html}.
# go-mutesting v2.3.1 has NO --output flag; JSON+HTML are config keys
# (json_output / html_output), so a config.yml is generated per package.
# The tool writes report.json/go-mutesting-report.html to CWD and mirrors the
# target path inside its tmp sandbox, so targets must be clean ./pkg paths
# (relative ../ escapes panic) and outputs are relocated per package.
mutation-go: mutation-install
	@set -e; \
	for entry in \
		"./internal/sudoku/dp|$(DP_MUTATION_FLOOR)" \
		"./internal/sudoku/human|$(HUMAN_MUTATION_FLOOR)" \
		"./internal/sudoku/human/techniques|$(TECHNIQUES_MUTATION_FLOOR)" \
	; do \
		pkg=$${entry%%|*}; \
		slug=$$(echo "$$pkg" | sed 's|^\./||; s|/|-|g'); \
		outdir="$(MUTATION_REPORT_DIR)/$$slug"; \
		mkdir -p "$$outdir"; \
		printf 'skip_without_test: true\nskip_with_build_tags: true\njson_output: true\nhtml_output: true\nsilent_mode: false\n' > "$$outdir/config.yml"; \
		echo "mutation-go: running go-mutesting on $$pkg -> $$outdir/"; \
		"$(GO_MUTESTESTING_BIN)" --config="$$outdir/config.yml" "$$pkg"; \
		mv -f report.json go-mutesting-report.html "$$outdir/" 2>/dev/null; \
	done; \
	echo "mutation-go: all in-scope packages done. Reports under $(MUTATION_REPORT_DIR)/."

# Enforce per-package mutation efficacy floors by parsing each package's
# report.json. Efficacy = (killed + timeout) / (killed + timeout + escaped)
# as a percentage, where:
#   killed  = killedCount   (tests failed on the mutant)
#   timeout = timeOutCount  (mutant hung the suite; counted as caught)
#   escaped = escapedCount  (covered but tests did NOT catch it: the gap)
# notCovered/error/skipped are excluded from the denominator: notCovered is a
# coverage gap (Decision 8 separates coverage from mutation scope), error is a
# tooling/build failure, and skipped covers `// mutator-disable-next-line`
# equivalent-mutant annotations. Run `make mutation-go` first; this target
# does not run the slow sweep itself. Mirrors the coverage-gate check_pkg
# pattern. report.json field names are verified against v2.3.1 output (note
# the spelling `timeOutCount` / `timeouted`).
mutation-gate:
	@set -e; \
	check_pkg() { \
		pkg="$$1"; floor="$$2"; \
		slug=$$(echo "$$pkg" | sed 's|^\./||; s|/|-|g'); \
		report="$(MUTATION_REPORT_DIR)/$$slug/report.json"; \
		if [ ! -f "$$report" ]; then \
			echo "mutation-gate: ERROR missing $$report (run 'make mutation-go' first)" >&2; \
			exit 2; \
		fi; \
		killed=$$(grep -oE '"killedCount":[0-9]+' "$$report" | grep -oE '[0-9]+$$'); \
		timeout=$$(grep -oE '"timeOutCount":[0-9]+' "$$report" | grep -oE '[0-9]+$$'); \
		escaped=$$(grep -oE '"escapedCount":[0-9]+' "$$report" | grep -oE '[0-9]+$$'); \
		notcov=$$(grep -oE '"notCoveredCount":[0-9]+' "$$report" | grep -oE '[0-9]+$$'); \
		err=$$(grep -oE '"errorCount":[0-9]+' "$$report" | grep -oE '[0-9]+$$'); \
		skipped=$$(grep -oE '"skippedCount":[0-9]+' "$$report" | grep -oE '[0-9]+$$'); \
		total=$$(grep -oE '"totalMutantsCount":[0-9]+' "$$report" | grep -oE '[0-9]+$$'); \
		pct=$$(awk -v k="$$killed" -v t="$$timeout" -v e="$$escaped" 'BEGIN { d=k+t+e; if (d==0) print 100; else printf "%.2f", (k+t)*100/d }'); \
		if awk -v p="$$pct" -v f="$$floor" 'BEGIN { exit !(p+0 >= f+0) }'; then \
			printf 'mutation-gate: OK   %s %s%% (floor %s%%) [killed=%s timeout=%s escaped=%s notCovered=%s error=%s skipped=%s total=%s]\n' "$$pkg" "$$pct" "$$floor" "$$killed" "$$timeout" "$$escaped" "$$notcov" "$$err" "$$skipped" "$$total"; \
		else \
			delta=$$(awk -v p="$$pct" -v f="$$floor" 'BEGIN { printf "%.2f", f - p }'); \
			printf 'mutation-gate: FAIL %s %s%% < floor %s%% (short by %spp) [killed=%s timeout=%s escaped=%s notCovered=%s error=%s skipped=%s total=%s]\n' "$$pkg" "$$pct" "$$floor" "$$delta" "$$killed" "$$timeout" "$$escaped" "$$notcov" "$$err" "$$skipped" "$$total" >&2; \
			failed=1; \
		fi; \
	}; \
	failed=0; \
	check_pkg ./internal/sudoku/dp $(DP_MUTATION_FLOOR); \
	check_pkg ./internal/sudoku/human $(HUMAN_MUTATION_FLOOR); \
	check_pkg ./internal/sudoku/human/techniques $(TECHNIQUES_MUTATION_FLOOR); \
	if [ "$$failed" = "1" ]; then exit 1; fi; \
	echo "mutation-gate: all in-scope packages met their floors."

# Remove mutation report artifacts (report.json, HTML, per-pkg config).
mutation-clean:
	rm -rf $(MUTATION_REPORT_DIR)

# govulncheck version; keep in sync with the test-go job in
# .github/workflows/deploy.yml.
GOVULNCHECK_VERSION := v1.5.0
GOVULNCHECK_BIN := $(shell go env GOPATH)/bin/govulncheck

# Vulnerability gate. Runs govulncheck against the module and fails on
# confirmed vulnerabilities reachable from the call graph. Auto-installs
# govulncheck to GOPATH/bin if missing (CI installs it fresh each run).
# CI invokes this from the test-go job; run locally with `make vulncheck`.
vulncheck:
	@set -e; \
	if [ ! -x "$(GOVULNCHECK_BIN)" ]; then \
		echo "vulncheck: installing govulncheck $(GOVULNCHECK_VERSION) to $(GOVULNCHECK_BIN)"; \
		go install golang.org/x/vuln/cmd/govulncheck@$(GOVULNCHECK_VERSION); \
	fi; \
	out=$$($(GOVULNCHECK_BIN) ./... 2>&1) || { \
		echo "vulncheck: FAIL govulncheck reported findings or errored" >&2; \
		echo "$$out" >&2; \
		exit 1; \
	}; \
	echo "vulncheck: OK no confirmed vulnerabilities."

# Memory profiling tests
test-memory:
	$(GO) test -memprofile=mem.out -run=. ./internal/sudoku/...
	@echo "Memory profile generated: mem.out"
	@echo "View with: go tool pprof mem.out"

# CPU profiling tests  
test-cpu:
	$(GO) test -cpuprofile=cpu.out -run=. ./internal/sudoku/...
	@echo "CPU profile generated: cpu.out"
	@echo "View with: go tool pprof cpu.out"

# Run benchmarks
bench:
	$(GO) test -bench=. -benchmem ./internal/sudoku/...

# Clean build artifacts
clean:
	rm -f bin/server
	rm -f $(WASM_OUT)
	rm -f $(WASM_EXEC_OUT)

# Development: build and run server
run: server
	./bin/server

# Check WASM size
wasm-size:
	@ls -lh $(WASM_OUT) 2>/dev/null || echo "WASM not built yet. Run 'make wasm' first."
