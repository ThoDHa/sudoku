# Sudoku Project Makefile
# Provides git hooks installation, testing, and linting

.PHONY: check check-fast check-full check-wasm test test-go test-scripts test-unit test-e2e test-integration test-frontend lint lint-go tools-go lint-frontend typecheck-frontend coverage-frontend dup-frontend coverage-go vulncheck mutation-frontend mutation-go mutation-gate mutation-clean format format-frontend format-go format-check format-check-frontend format-check-go help generate-icons wasm dev prod prod-test report serve-reports allure-report allure-serve allure-clean

#-----------------------------------------------------------------------
# Development & Production
#-----------------------------------------------------------------------

# Build the WASM solver + wasm_exec.js glue into frontend/public/.
# These are gitignored build outputs (never committed); this target regenerates
# them from current Go source so the dev server never serves a stale solver.
# Requires TinyGo + Go on the host.
wasm:
	@$(MAKE) -C api wasm-all

# Run development server with hot reload (default). Builds the WASM first so a
# fresh clone works and the served solver always matches current Go source.
dev: wasm
	@echo "Starting development server..."
	@docker compose up

# Run production build
prod:
	@echo "Starting production server..."
	@docker compose -f docker-compose.prod.yml up --build

# Bring up the prod stack, run the post-deploy smoke against it, tear down.
# Mirrors `test-e2e`/`test-integration` for the production image: builds
# docker-compose.prod.yml, blocks on the container healthcheck (--wait),
# runs the deployment smoke spec against http://localhost/, and tears down
# on any exit via trap. Unlike `test-e2e` (test stack on :4173, full suite),
# this targets the prod nginx image on :80 with the deploy smoke only.
prod-test:
	@echo ""
	@echo "========================================"
	@echo "  Running Post-Deploy Smoke vs Prod Image"
	@echo "========================================"
	@trap 'docker compose -f $(PWD)/docker-compose.prod.yml down' EXIT; \
	docker compose -f docker-compose.prod.yml up -d --build --wait && \
	cd frontend && PLAYWRIGHT_BASE_URL=http://localhost/ npx playwright test e2e/deployment/ --project=chrome-desktop --reporter=list

#-----------------------------------------------------------------------
# Linting
#-----------------------------------------------------------------------

# Pin golangci-lint to the exact version CI installs (deploy.yml) so the
# local binary cannot drift from CI's binary and produce false failures.
GOLANGCI_LINT_VERSION := v2.12.2
GOLANGCI_LINT := $(shell go env GOPATH)/bin/golangci-lint

# Run all linters
lint: lint-go lint-frontend
	@echo ""
	@echo "========================================"
	@echo "  All linting passed!"
	@echo "========================================"

# Install the pinned golangci-lint binary into GOPATH/bin; matches CI so
# local linting and CI linting run the same version.
tools-go:
	@cd api && go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)

# Run Go linter
lint-go: tools-go
	@echo ""
	@echo "[Go] Running linter..."
	@cd api && $(GOLANGCI_LINT) run ./...
	@echo "[Go] Linting passed!"

# Run Frontend linter
lint-frontend:
	@echo ""
	@echo "[Frontend] Running linter..."
	@cd frontend && npm run lint
	@echo "[Frontend] Linting passed!"

# Type-check the frontend production build (catches tsc errors the vitest unit gate cannot)
typecheck-frontend:
	@echo ""
	@echo "[Frontend] Running TypeScript type-check..."
	@cd frontend && npx tsc --noEmit
	@cd frontend && npx tsc --noEmit -p tsconfig.test.json
	@echo "[Frontend] Type-check passed!"

#-----------------------------------------------------------------------
# Formatting
#-----------------------------------------------------------------------

# Format frontend (Prettier) and Go (gofmt) source in place
format: format-frontend format-go

# Format frontend source with Prettier (writes)
format-frontend:
	@cd frontend && npx prettier --write "src/**/*.{ts,tsx,css}" "e2e/**/*.{ts,tsx}"

# Format Go source with gofmt (writes); excludes cmd/wasm/ build files
format-go:
	@gofmt -w $(shell find api -name '*.go' -not -path '*/cmd/wasm/*')

# Check formatting without writing; exits non-zero on drift (CI-friendly)
format-check: format-check-frontend format-check-go

# Check frontend formatting (Prettier --check)
format-check-frontend:
	@cd frontend && npx prettier --check "src/**/*.{ts,tsx,css}" "e2e/**/*.{ts,tsx}"

# Check Go formatting; list and fail if any file is unformatted
format-check-go:
	@out=$$(gofmt -l $(shell find api -name '*.go' -not -path '*/cmd/wasm/*')); if [ -n "$$out" ]; then echo "$$out"; exit 1; fi

#-----------------------------------------------------------------------
# Testing (Allure-Enabled)
#-----------------------------------------------------------------------

# Run Go tests with Allure output
test-go:
	@echo ""
	@echo "========================================"
	@echo "  Running Go Tests with Allure"
	@echo "========================================"
	@cd api && mkdir -p allure-results && $(shell go env GOPATH)/bin/gotestsum --junitfile allure-results/go-results.xml --format testname -- -v ./...

# Run the Python script tests: the report-portal suite (including the drift
# guard that holds api/Makefile and nightly-mutation.yml to reading the
# canonical mutation floors in api/mutation-floors.json rather than copying
# them) and the mutation floor gate and ratchet. Mirrors the test-go job's steps
# in deploy.yml.
test-scripts:
	@echo ""
	@echo "========================================"
	@echo "  Running report-portal script tests"
	@echo "========================================"
	@cd .github/scripts && python3 -m unittest gen_report_portal_test
	@echo ""
	@echo "========================================"
	@echo "  Running mutation floor gate tests"
	@echo "========================================"
	@cd api/scripts && python3 -m unittest mutation_floors_test mutation_aggregate_test
	@echo ""
	@echo "========================================"
	@echo "  Running frontend mutation aggregate tests"
	@echo "========================================"
	@cd frontend/scripts && python3 -m unittest mutation_aggregate_test

# Run Frontend unit tests with Allure output (Docker)
test-unit:
	@echo ""
	@echo "========================================"
	@echo "  Running Frontend Unit Tests with Allure (Docker)"
	@echo "========================================"
	@mkdir -p allure-results
	@docker build -t sudoku-frontend-test -f frontend/Dockerfile.test frontend
	@docker run --rm --user $$(id -u):$$(id -g) -e HOME=/tmp \
		-e ALLURE_SKIP_CLEAN=$${ALLURE_SKIP_CLEAN:-} \
		-v $(PWD)/allure-results:/app/allure-results \
		sudoku-frontend-test npm run test:unit

# Run frontend unit tests WITH coverage thresholds (85/75/85/85). Superset
# of test-unit; this is the gate CI's test-frontend-unit job enforces.
coverage-frontend:
	@echo ""
	@echo "========================================"
	@echo "  Running Frontend Coverage Gate"
	@echo "========================================"
	@cd frontend && npm run test:coverage

# Run frontend duplication gate (jscpd, hard-fails over 5%).
dup-frontend:
	@echo ""
	@echo "========================================"
	@echo "  Running Frontend Duplication Gate (jscpd)"
	@echo "========================================"
	@cd frontend && npm run dup-check

# Run Go per-package coverage floors (dp, human, techniques at 99%).
# transport/http is exempt (dev-only harness, ARCH-2).
coverage-go:
	@cd api && make coverage-gate

# Run Go vulnerability scan (govulncheck). Requires network access to fetch
# the vuln DB; run `make check-fast` instead when offline.
vulncheck:
	@cd api && make vulncheck

# ============================================
# Mutation Testing (slow; nightly CI or manual)
# ============================================

# Run frontend mutation testing (StrykerJS). ~100 min for full scope.
mutation-frontend:
	@echo ""
	@echo "========================================"
	@echo "  Running Frontend Mutation Testing"
	@echo "========================================"
	@cd frontend && npm run mutation

# Run Go mutation testing (go-mutesting). ~17 min for dp; hours for techniques.
mutation-go:
	@cd api && make mutation-go

# Enforce per-package mutation efficacy floors. Run after mutation-go.
mutation-gate:
	@cd api && make mutation-gate

# Clean all mutation testing artifacts.
mutation-clean:
	@cd api && make mutation-clean
	@rm -rf frontend/reports/mutation
	@echo "Mutation artifacts cleaned."

# Run E2E tests with Allure output (Docker Compose).
# DOCKER_USER maps the container to the host user so the bind-mounted
# frontend/ tree gets user-owned artifacts (root-owned test-results/ breaks
# later local Playwright runs with EACCES). CI invokes compose directly
# without DOCKER_USER and keeps the image's root default.
test-e2e:
	@echo ""
	@echo "========================================"
	@echo "  Running E2E Tests with Allure (Docker)"
	@echo "========================================"
	@export DOCKER_USER="$$(id -u):$$(id -g)"; \
	trap 'docker compose -f docker-compose.test.yml down' EXIT; \
	docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from playwright

# Run integration tests with Allure output (Docker Compose).
# DOCKER_USER: see test-e2e.
test-integration:
	@echo ""
	@echo "========================================"
	@echo "  Running Integration Tests with Allure (Docker)"
	@echo "========================================"
	@export DOCKER_USER="$$(id -u):$$(id -g)"; \
	trap 'docker compose -f docker-compose.test.yml down' EXIT; \
	docker compose -f docker-compose.test.yml up sudoku -d --build --wait && \
	docker compose -f docker-compose.test.yml run --rm playwright npx playwright test --grep @integration

# Run all Frontend tests (unit + E2E) with Allure output
test-frontend: test-unit test-e2e
	@echo ""
	@echo "========================================"
	@echo "  Frontend Tests Complete!"
	@echo "========================================"

# Run all tests (Go + Frontend unit + E2E) with Allure output.
# allure-clean wipes once up front; ALLURE_SKIP_CLEAN=1 stops each suite's
# global setup from re-cleaning, so unit and e2e results combine into the
# single report `make report` generates.
test: allure-clean
	@echo ""
	@echo "========================================"
	@echo "  Running All Tests with Allure Output"
	@echo "========================================"
	@$(MAKE) test-go
	@ALLURE_SKIP_CLEAN=1 $(MAKE) test-unit
	@ALLURE_SKIP_CLEAN=1 $(MAKE) test-e2e
	@echo ""
	@echo "========================================"
	@echo "  All tests complete! Run 'make report' to generate report"
	@echo "========================================"

# Type-check the WASM entry point (cmd/wasm) under its js&&wasm build
# constraint. Host `go build ./...` skips these files, so without this target
# the non-WASM gate cannot see compile errors in cmd/wasm that CI's TinyGo
# WASM build (and the deployed solver) would hit. Standard go (not TinyGo) is
# enough to catch signature/symbol errors; the production artifact is still
# built by TinyGo via `make wasm`.
check-wasm:
	@echo ""
	@echo "[WASM] Type-checking cmd/wasm (GOOS=js GOARCH=wasm)..."
	@cd api && GOOS=js GOARCH=wasm go build ./cmd/wasm/
	@echo "[WASM] cmd/wasm type-check passed!"

# Full local gate: mirrors what CI enforces (minus e2e). Run before pushing
# so local-green guarantees CI-green. Slower than check-fast because it adds
# the coverage thresholds, the duplication gate, and govulncheck.
# e2e/integration stay in `make check-full` and `make test`; e2e-green is
# owned by TEST-001.F.
check: lint-go lint-frontend typecheck-frontend check-wasm test-go test-scripts coverage-go vulncheck coverage-frontend dup-frontend
	@echo ""
	@echo "========================================"
	@echo "  Full gate passed (lint + go + frontend"
	@echo "  + coverage + duplication + vulncheck)."
	@echo "  Run 'make check-full' for e2e."
	@echo "========================================"

# Fast per-commit gate: lint + Go + frontend unit (no coverage/dup/vuln).
# Use for tight dev loops; run `make check` before pushing to catch the
# quality gates CI enforces.
check-fast: lint-go lint-frontend typecheck-frontend check-wasm test-go test-scripts test-unit
	@echo ""
	@echo "========================================"
	@echo "  Fast gate passed (lint + go + unit)."
	@echo "  Run 'make check' before pushing for the"
	@echo "  full quality gate (coverage/dup/vuln)."
	@echo "========================================"

# Full gate incl. E2E + integration. Slow; a true superset of `check`.
# Cleans allure-results once after `check`, then lets e2e + integration
# accumulate into one result set (ALLURE_SKIP_CLEAN=1 stops each suite's
# global setup from wiping the previous suite's output).
check-full: check
	@$(MAKE) allure-clean
	@ALLURE_SKIP_CLEAN=1 $(MAKE) test-e2e
	@ALLURE_SKIP_CLEAN=1 $(MAKE) test-integration
	@echo ""
	@echo "========================================"
	@echo "  Full gate passed (check + e2e + integration)."
	@echo "========================================"

#-----------------------------------------------------------------------
# Asset Generation
#-----------------------------------------------------------------------

# Generate PWA icons from SVG (runs in Docker with correct permissions)
generate-icons:
	@echo "Generating PWA icons from SVG..."
	@docker run --rm -u $$(id -u):$$(id -g) \
		-v $(PWD)/frontend/public:/app -w /app \
		node:24-alpine sh -c "npm install --silent sharp && node generate-icons.js"
	@echo "Icons generated!"

#-----------------------------------------------------------------------
# Help
#-----------------------------------------------------------------------

help:
	@echo "Available targets:"
	@echo ""
	@echo "Development:"
	@echo "  wasm            - Build the WASM solver + wasm_exec.js into frontend/public"
	@echo "  dev             - Run development server with hot reload (builds WASM first)"
	@echo "  prod            - Run production build"
	@echo ""
	@echo "Linting:"
	@echo "  lint            - Run all linters (Go + Frontend)"
	@echo "  lint-go         - Run Go linter only"
	@echo "  lint-frontend   - Run Frontend linter only"
	@echo ""
	@echo "Formatting:"
	@echo "  format          - Format frontend (Prettier) and Go (gofmt) in place"
	@echo "  format-check    - Check formatting; exit non-zero on drift (CI-friendly)"
	@echo "  format-frontend - Format frontend source only (Prettier --write)"
	@echo "  format-go       - Format Go source only (gofmt -w, excl cmd/wasm)"
	@echo ""
	@echo "Testing (Allure-Enabled):"
	@echo "  check-fast       - Fast per-commit gate (lint + go + unit, no coverage)"
	@echo "  check            - Full non-e2e gate (lint + typecheck + go + coverage + dup + vuln)"
	@echo "  check-full       - Full gate incl. e2e + integration (= check + e2e + integration)"
	@echo "  check-wasm       - Type-check cmd/wasm under js&&wasm (part of check/check-fast)"
	@echo "  test             - Full test run incl. e2e (Go + unit + E2E)"
	@echo "  test-go          - Run Go tests with Allure output"
	@echo "  test-unit        - Run Frontend unit tests with Allure output (Docker)"
	@echo "  test-e2e         - Run E2E tests with Allure output (Docker)"
	@echo "  test-integration - Run integration tests with Allure output (Docker)"
	@echo "  test-frontend    - Run all Frontend tests (unit + E2E) with Allure"
	@echo ""
	@echo "Allure Reporting:"
	@echo "  report           - Generate dated Allure report from the latest full run"
	@echo "                     (reports/<YYYYMMDD-HHMM>-allure/; refreshes latest-allure)"
	@echo "  serve-reports    - Serve latest Allure report on 0.0.0.0:8099 (LAN)"
	@echo "  allure-report    - (legacy) generate combined report into ./allure-report"
	@echo "  allure-serve     - (legacy) serve Allure report locally (opens browser)"
	@echo "  allure-clean     - Clean all Allure artifacts"
	@echo ""
	@echo "Utilities:"
	@echo "  generate-icons  - Generate PWA icons from SVG"

#-----------------------------------------------------------------------
# Allure Test Reporting
#-----------------------------------------------------------------------

# Generate the Allure report from the latest FULL test run (make test).
# Each run is kept in a dated folder reports/<YYYYMMDD-HHMM>-allure/ and
# reports/latest-allure/ is refreshed to point at it. Coverage and mutation
# outputs are intentionally excluded; use their native viewers for those.
report:
	@stamp=$$(date +%Y%m%d-%H%M); \
	outdir="reports/$$stamp-allure"; \
	if [ ! -d allure-results ] || [ -z "$$(ls -A allure-results 2>/dev/null)" ]; then \
		echo "Run 'make test' first — make report needs allure-results from a full test run." >&2; \
		exit 1; \
	fi; \
	mkdir -p allure-results reports; \
	cp -r api/allure-results/* allure-results/ 2>/dev/null || true; \
	cp -r frontend/allure-results/* allure-results/ 2>/dev/null || true; \
	(cd frontend && npx allure generate ../allure-results -o ../$$outdir --clean); \
	rm -rf reports/latest-allure; \
	ln -s "$$stamp-allure" reports/latest-allure; \
	echo ""; \
	echo "========================================"; \
	echo "  Allure report: $$outdir"; \
	echo "  latest:        reports/latest-allure -> $$stamp-allure"; \
	echo "  Serve with:    make serve-reports"; \
	echo "========================================"

# Serve the latest Allure report on the LAN (0.0.0.0:8099).
# Blocks until interrupted; browse http://<host-LAN-IP>:8099/.
serve-reports:
	@echo "Serving latest Allure report on http://0.0.0.0:8099 (LAN-reachable)..."
	@echo "Browse http://<this-host-LAN-IP>:8099/ from any machine on the network."
	@cd frontend && npx allure open ../reports/latest-allure --host 0.0.0.0 --port 8099

# Legacy: superseded by `make report` (dated output, LAN-served). Retained
# because README.md still documents it; remove once README migrates.
allure-report:
	@echo "Generating combined Allure report..."
	@mkdir -p allure-results
	@cp -r frontend/allure-results/* allure-results/ 2>/dev/null || true
	@cp -r api/allure-results/* allure-results/ 2>/dev/null || true
	@cd frontend && npx allure generate ../allure-results -o allure-report --clean
	@echo "Report generated at frontend/allure-report/"

# Legacy: superseded by `make serve-reports`. Retained because README.md
# still documents it; remove once README migrates.
allure-serve:
	@echo "Serving Allure report..."
	@mkdir -p allure-results
	@cp -r frontend/allure-results/* allure-results/ 2>/dev/null || true
	@cp -r api/allure-results/* allure-results/ 2>/dev/null || true
	@cd frontend && npx allure serve ../allure-results

# Clean all Allure artifacts. Falls back to a dockerized rm when plain rm
# fails: checkouts that ran the compose test targets before DOCKER_USER
# mapping existed hold root-owned files a plain rm cannot remove.
ALLURE_ARTIFACTS := allure-results api/allure-results \
	frontend/allure-results frontend/allure-report \
	frontend/test-results frontend/playwright-report \
	frontend/e2e/.auth frontend/console-debug.log

allure-clean:
	@echo "Cleaning Allure artifacts..."
	@if ! rm -rf $(ALLURE_ARTIFACTS) 2>/dev/null; then \
		echo "Plain rm failed (likely root-owned artifacts from an old Docker run); retrying via Docker..."; \
		docker run --rm -v "$(PWD):/w" alpine sh -c 'cd /w && rm -rf $(ALLURE_ARTIFACTS)'; \
	fi
	@echo "Allure artifacts cleaned!"
