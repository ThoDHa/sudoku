# Sudoku Project Makefile
# Provides git hooks installation and testing

.PHONY: install-hooks test test-e2e test-go test-frontend help

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
# Testing (Local)
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
	@cd api && go vet ./... && go test -short -v -timeout=5m ./...
	@echo "[Go] Checks passed!"

# Run Frontend checks only
test-frontend:
	@echo ""
	@echo "[Frontend] Running checks..."
	@cd frontend && npx tsc --noEmit && npm run test:unit && npm run build
	@echo "[Frontend] Checks passed!"

# Run full E2E tests in Docker (use after big changes)
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
	@echo "  install-hooks   - Install git pre-push hook"
	@echo "  test            - Run all checks (Go + Frontend)"
	@echo "  test-go         - Run Go checks only"
	@echo "  test-frontend   - Run Frontend checks only"
	@echo "  test-e2e        - Run full E2E tests in Docker (slow)"
