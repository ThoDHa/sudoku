# Sudoku API Makefile

.PHONY: all build server generate-constants wasm wasm-copy clean test coverage-gate

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

# Per-package coverage floors. Kept below measured coverage to absorb minor
# Go-version / test-ordering variance; see COVERAGE.md for the full policy.
TECHNIQUES_COVERAGE_FLOOR := 88
TRANSPORT_HTTP_COVERAGE_FLOOR := 80

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
	check_pkg ./internal/sudoku/human/techniques $(TECHNIQUES_COVERAGE_FLOOR); \
	check_pkg ./internal/transport/http $(TRANSPORT_HTTP_COVERAGE_FLOOR); \
	echo "coverage-gate: all gated packages met their floors."

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
