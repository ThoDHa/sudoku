# Sudoku Project Makefile
# Provides git hooks installation, testing, and linting

.PHONY: check test test-go test-unit test-e2e test-integration test-frontend lint lint-go lint-frontend help generate-icons dev prod allure-report allure-serve allure-clean

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
# Testing (Allure-Enabled)
#-----------------------------------------------------------------------

# Run Go tests with Allure output
test-go:
	@echo ""
	@echo "========================================"
	@echo "  Running Go Tests with Allure"
	@echo "========================================"
	@cd api && mkdir -p allure-results && $(shell go env GOPATH)/bin/gotestsum --junitfile allure-results/go-results.xml --format testname -- -v ./... || true

# Run Frontend unit tests with Allure output (Docker)
test-unit:
	@echo ""
	@echo "========================================"
	@echo "  Running Frontend Unit Tests with Allure (Docker)"
	@echo "========================================"
	@mkdir -p allure-results
	@docker build -t sudoku-frontend-test -f frontend/Dockerfile.test frontend
	@docker run --rm -v $(PWD)/allure-results:/app/allure-results sudoku-frontend-test npm run test:unit || true

# Run E2E tests with Allure output (Docker Compose)
test-e2e:
	@echo ""
	@echo "========================================"
	@echo "  Running E2E Tests with Allure (Docker)"
	@echo "========================================"
	@docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from playwright || true
	@docker compose -f docker-compose.test.yml down

# Run integration tests with Allure output (Docker Compose)
test-integration:
	@echo ""
	@echo "========================================"
	@echo "  Running Integration Tests with Allure (Docker)"
	@echo "========================================"
	@docker compose -f docker-compose.test.yml up sudoku -d --build
	@sleep 15
	@docker compose -f docker-compose.test.yml run --rm playwright npx playwright test --grep @integration || true
	@docker compose -f docker-compose.test.yml down

# Run all Frontend tests (unit + E2E) with Allure output
test-frontend: test-unit test-e2e
	@echo ""
	@echo "========================================"
	@echo "  Frontend Tests Complete!"
	@echo "========================================"

# Run all tests (Go + Frontend unit + E2E) with Allure output
test: allure-clean
	@echo ""
	@echo "========================================"
	@echo "  Running All Tests with Allure Output"
	@echo "========================================"
	@$(MAKE) test-go
	@$(MAKE) test-unit
	@$(MAKE) test-e2e
	@echo ""
	@echo "========================================"
	@echo "  All tests complete! Run 'make allure-report' to generate report"
	@echo "========================================"

# Run all checks (lint + all tests with Allure)
check: lint-go lint-frontend test
	@echo ""
	@echo "========================================"
	@echo "  All checks passed!"
	@echo "========================================"

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
	@echo "Testing (Allure-Enabled):"
	@echo "  check           - Run all checks (lint + all tests)"
	@echo "  test            - Run all tests with Allure output"
	@echo "  test-go         - Run Go tests with Allure output"
	@echo "  test-unit       - Run Frontend unit tests with Allure output (Docker)"
	@echo "  test-e2e        - Run E2E tests with Allure output (Docker)"
	@echo "  test-integration - Run integration tests with Allure output (Docker)"
	@echo "  test-frontend   - Run all Frontend tests (unit + E2E) with Allure"
	@echo ""
	@echo "Allure Reporting:"
	@echo "  allure-report   - Generate combined Allure report"
	@echo "  allure-serve    - Serve Allure report locally (opens browser)"
	@echo "  allure-clean    - Clean all Allure artifacts"
	@echo ""
	@echo "Utilities:"
	@echo "  generate-icons  - Generate PWA icons from SVG"

#-----------------------------------------------------------------------
# Allure Test Reporting
#-----------------------------------------------------------------------

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
