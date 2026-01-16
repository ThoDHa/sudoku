# Sudoku Project Makefile
# Provides git hooks installation, testing, and linting

# Dockerized Playwright/Vitest for full local/CI runner
.PHONY: test-docker test-e2e-docker test-unit-docker

test-docker:
	@echo "Running ALL frontend tests (unit & E2E) in Docker via Dockerfile.test..."
	@docker build -t sudoku-frontend-test -f frontend/Dockerfile.test frontend
	@docker run --rm sudoku-frontend-test

test-e2e-docker:
	@echo "Running Playwright E2E frontend tests in Docker via Dockerfile.test..."
	@docker build -t sudoku-frontend-test -f frontend/Dockerfile.test frontend
	@docker run --rm sudoku-frontend-test npm run test:e2e

test-unit-docker:
	@echo "Running unit/integration tests in Docker via Dockerfile.test..."
	@docker build -t sudoku-frontend-test -f frontend/Dockerfile.test frontend
	@docker run --rm sudoku-frontend-test npm run test:unit


.PHONY: test test-e2e test-go test-frontend lint lint-go lint-frontend help generate-icons dev prod test-allure allure-report allure-serve allure-clean

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
	@cd api && $(shell go env GOPATH)/bin/golangci-lint run ./...
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

# Run Go checks in Docker
test-go:
	@echo ""
	@echo "========================================"
	@echo "  Running Go Tests"
	@echo "========================================"
	@docker compose -f docker-compose.test.yml run --rm go-tests
	@echo "[Go] Tests passed!"

# Run Frontend checks in Docker
test-frontend:
	@echo ""
	@echo "========================================"
	@echo "  Running Frontend Tests"
	@echo "========================================"
	@docker compose -f docker-compose.test.yml run --rm frontend-tests
	@echo "[Frontend] Checks passed!"

# Run full E2E tests in Docker (use after big changes)
test-e2e:
	@echo ""
	@echo "========================================"
	@echo "  Running E2E Tests"
	@echo "========================================"
	@docker compose -f docker-compose.test.yml up sudoku -d --build
	@docker compose -f docker-compose.test.yml run --rm playwright
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
	@echo ""
	@echo "Development:"
	@echo "  dev             - Run development server with hot reload"
	@echo "  prod            - Run production build"
	@echo ""
	@echo "Linting:"
	@echo "  lint            - Run all linters (Go + Frontend)"
	@echo "  lint-go         - Run Go linter only"
	@echo "  lint-frontend   - Run Frontend linter only"
	@echo ""
	@echo "Testing:"
	@echo "  test            - Run all checks (lint + test)"
	@echo "  test-go         - Run Go tests only"
	@echo "  test-frontend   - Run Frontend tests only"
	@echo "  test-e2e        - Run full E2E tests in Docker"
	@echo ""
	@echo "Test Reporting (Allure):"
	@echo "  test-allure     - Run all tests with Allure output"
	@echo "  allure-report   - Generate combined Allure report"
	@echo "  allure-serve    - Serve Allure report locally (opens browser)"
	@echo "  allure-clean    - Clean all Allure artifacts"
	@echo ""
	@echo "Utilities:"
	@echo "  generate-icons  - Generate PWA icons from SVG"

#-----------------------------------------------------------------------
# Allure Test Reporting
#-----------------------------------------------------------------------

# Auto-detect server URL for E2E tests
# Priority: PLAYWRIGHT_BASE_URL env var > localhost:80 (Docker) > localhost:5173 (npm dev)
define detect_server_url
$(shell \
	if [ -n "$$PLAYWRIGHT_BASE_URL" ]; then \
		echo "$$PLAYWRIGHT_BASE_URL"; \
	elif curl -s --connect-timeout 1 http://localhost:80 > /dev/null 2>&1; then \
		echo "http://localhost"; \
	elif curl -s --connect-timeout 1 http://localhost:5173 > /dev/null 2>&1; then \
		echo "http://localhost:5173"; \
	else \
		echo ""; \
	fi \
)
endef

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
	@SERVER_URL=$(detect_server_url); \
	if [ -z "$$SERVER_URL" ]; then \
		echo "[E2E] Skipping - no server detected at localhost:80 or localhost:5173"; \
		echo "      Start server with 'make dev' or 'cd frontend && npm run dev'"; \
	else \
		echo "[E2E] Running Playwright tests against $$SERVER_URL..."; \
		cd frontend && PLAYWRIGHT_BASE_URL="$$SERVER_URL" npm run test:e2e || true; \
	fi
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
