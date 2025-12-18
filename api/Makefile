# Sudoku API Makefile

.PHONY: all build server wasm wasm-copy clean test

# Go build settings
GO := go
GOOS_WASM := GOOS=js GOARCH=wasm

# Output paths
WASM_OUT := ../frontend/public/sudoku.wasm
WASM_EXEC_OUT := ../frontend/public/wasm_exec.js

# Build flags for smaller WASM
LDFLAGS := -ldflags="-s -w"

all: server wasm

# Build the HTTP server
server:
	$(GO) build -o bin/server ./cmd/server

# Build WASM module
wasm:
	$(GOOS_WASM) $(GO) build $(LDFLAGS) -o $(WASM_OUT) ./cmd/wasm

# Copy wasm_exec.js from Go installation
wasm-copy:
	cp "$$($(GO) env GOROOT)/misc/wasm/wasm_exec.js" $(WASM_EXEC_OUT)

# Build WASM and copy support file
wasm-all: wasm wasm-copy
	@echo "WASM build complete!"
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
