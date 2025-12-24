# Sudoku API Makefile

.PHONY: all build server wasm wasm-copy clean test

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

all: server wasm

# Build the HTTP server
server:
	$(GO) build -o bin/server ./cmd/server

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
