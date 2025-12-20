# Sudoku Project Makefile
# Provides git hooks installation and testing via Docker

.PHONY: install-hooks test test-e2e test-go test-frontend

# Repository root directory
REPO_ROOT := $(shell pwd)

#-----------------------------------------------------------------------
# Git Hooks
#-----------------------------------------------------------------------

# Install git hooks (symlinks hooks/ to .git/hooks/)
install-hooks:
	@echo "Installing git hooks..."
	@ln -sf ../../hooks/pre-push .git/hooks/pre-push
	@chmod +x hooks/pre-push
	@echo "Git hooks installed!"

#-----------------------------------------------------------------------
# Testing (Docker-based)
#-----------------------------------------------------------------------

# Run all checks (same as pre-push hook, for manual use)
test: test-go test-frontend
	@echo ""
	@echo "========================================"
	@echo "  All checks passed!"
	@echo "========================================"

# Run Go checks only
test-go:
	@echo ""
	@echo "[Go] Running checks..."
	@docker run --rm -v "$(REPO_ROOT)/api:/app" -w /app golang:1.23 sh -c \
		"go vet ./... && go test -short -race -timeout=5m ./..."
	@echo "[Go] Checks passed!"

# Run Frontend checks only
test-frontend:
	@echo ""
	@echo "[Frontend] Running checks..."
	@docker run --rm -v "$(REPO_ROOT)/frontend:/app" -w /app node:20 sh -c \
		"npm ci && npx tsc --noEmit && npm run test:unit && npm run build"
	@echo "[Frontend] Checks passed!"

# Run full E2E tests (use after big changes)
test-e2e:
	@echo ""
	@echo "========================================"
	@echo "  Running E2E Tests"
	@echo "========================================"
	@docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from playwright
	@docker compose -f docker-compose.test.yml down

#-----------------------------------------------------------------------
# Help
#-----------------------------------------------------------------------

help:
	@echo "Available targets:"
	@echo "  install-hooks  - Install git pre-push hook"
	@echo "  test           - Run all checks (Go + Frontend) in Docker"
	@echo "  test-go        - Run Go checks only"
	@echo "  test-frontend  - Run Frontend checks only"
	@echo "  test-e2e       - Run full E2E tests in Docker (slow)"
