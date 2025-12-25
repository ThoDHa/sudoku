# Sudoku Project Makefile
# Provides git hooks installation, testing, and linting

.PHONY: install-hooks test test-e2e test-go test-frontend lint lint-go lint-frontend help generate-icons dev prod test-allure allure-report allure-serve allure-clean

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
# Development & Production
#-----------------------------------------------------------------------

# Run development server with hot reload (default)
dev:
	@echo "Starting development server..."
	@docker compose up

# Run production build
prod:
	@echo "Starting production server..."
	@docker compose -f docker-compose.prod.yml up --build

#-----------------------------------------------------------------------
# Linting
#-----------------------------------------------------------------------

# Run all linters
lint: lint-go lint-frontend
	@echo ""
	@echo "========================================"
	@echo "  All linting passed!"
	@echo "========================================"

# Run Go linter
lint-go:
	@echo ""
	@echo "[Go] Running linter..."
	@cd api && golangci-lint run ./...
	@echo "[Go] Linting passed!"

# Run Frontend linter
lint-frontend:
	@echo ""
	@echo "[Frontend] Running linter..."
	@cd frontend && npm run lint
	@echo "[Frontend] Linting passed!"

#-----------------------------------------------------------------------
# Testing (Local)
#-----------------------------------------------------------------------

# Run all checks (same as pre-push hook, for manual use)
test: lint-go lint-frontend test-go test-frontend
	@echo ""
	@echo "========================================"
	@echo "  All checks passed!"
	@echo "========================================"

# Run Go checks only
test-go:
	@echo ""
	@echo "[Go] Running tests..."
	@cd api && go vet ./... && go test -short -v -timeout=5m ./...
	@echo "[Go] Tests passed!"

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
# Asset Generation
#-----------------------------------------------------------------------

# Generate PWA icons from SVG (runs in Docker with correct permissions)
generate-icons:
	@echo "Generating PWA icons from SVG..."
	@docker run --rm -u $$(id -u):$$(id -g) \
		-v $(PWD)/frontend/public:/app -w /app \
		node:20-alpine sh -c "npm install --silent sharp && node generate-icons.js"
	@echo "Icons generated!"

#-----------------------------------------------------------------------
# Help
#-----------------------------------------------------------------------

help:
	@echo "Available targets:"
	@echo "  dev             - Run development server with hot reload (default)"
	@echo "  prod            - Run production build"
	@echo "  install-hooks   - Install git pre-push hook"
	@echo "  lint            - Run all linters (Go + Frontend)"
	@echo "  lint-go         - Run Go linter only"
	@echo "  lint-frontend   - Run Frontend linter only"
	@echo "  test            - Run all checks (lint + test)"
	@echo "  test-go         - Run Go tests only"
	@echo "  test-frontend   - Run Frontend tests only"
	@echo "  test-e2e        - Run full E2E tests in Docker (slow)"
	@echo "  test-allure     - Run all tests with Allure output"
	@echo "  allure-report   - Generate combined Allure report"
	@echo "  allure-serve    - Serve Allure report locally"
	@echo "  allure-clean    - Clean all Allure artifacts"
	@echo "  generate-icons  - Generate PWA icons from SVG"

#-----------------------------------------------------------------------
# Allure Test Reporting
#-----------------------------------------------------------------------

# Run all tests with Allure output
test-allure: allure-clean
	@echo ""
	@echo "========================================"
	@echo "  Running All Tests with Allure Output"
	@echo "========================================"
	@echo ""
	@echo "[Go] Running tests with Allure output..."
	@cd api && mkdir -p allure-results && $(shell go env GOPATH)/bin/gotestsum --junitfile allure-results/go-results.xml --format testname -- -v ./... || true
	@echo ""
	@echo "[Frontend] Running unit tests with Allure output..."
	@cd frontend && npm run test:unit || true
	@echo ""
	@echo "[E2E] Running Playwright tests with Allure output..."
	@cd frontend && npm run test:e2e || true
	@echo ""
	@echo "========================================"
	@echo "  All tests complete! Run 'make allure-report' to generate report"
	@echo "========================================"

# Generate combined Allure report from all test results
allure-report:
	@echo "Generating combined Allure report..."
	@mkdir -p allure-results
	@cp -r frontend/allure-results/* allure-results/ 2>/dev/null || true
	@cp -r api/allure-results/* allure-results/ 2>/dev/null || true
	@cd frontend && npx allure generate ../allure-results -o allure-report --clean
	@echo "Report generated at frontend/allure-report/"

# Serve Allure report locally (opens in browser)
allure-serve:
	@echo "Serving Allure report..."
	@mkdir -p allure-results
	@cp -r frontend/allure-results/* allure-results/ 2>/dev/null || true
	@cp -r api/allure-results/* allure-results/ 2>/dev/null || true
	@cd frontend && npx allure serve ../allure-results

# Clean all Allure artifacts
allure-clean:
	@echo "Cleaning Allure artifacts..."
	@rm -rf allure-results
	@rm -rf frontend/allure-results frontend/allure-report
	@rm -rf api/allure-results
	@echo "Allure artifacts cleaned!"
