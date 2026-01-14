# Sudoku

[![CI/CD Pipeline](https://github.com/thodha/sudoku/actions/workflows/deploy.yml/badge.svg)](https://github.com/thodha/sudoku/actions/workflows/deploy.yml)
[![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)](./frontend/coverage/index.html)

An advanced educational Sudoku web application that teaches solving techniques through human-like hints and intelligent assistance features.

**[Play Now](https://thodha.github.io/sudoku/)**

## 🎯 What Makes This Different

This isn't just another Sudoku app. It's a comprehensive learning platform that:

- **Teaches Real Techniques**: Learn 39+ solving methods from basic Singles to advanced Forcing Chains
- **Thinks Like You Do**: Human-like solver explains each step with detailed reasoning
- **Fixes Your Mistakes**: Intelligent error detection and correction with clear explanations
- **Works Everywhere**: Fully offline-capable PWA with aggressive caching
- **Optimized Performance**: Code-split architecture with battery-efficient background handling
- **Educational Focus**: Practice specific techniques with curated puzzle sets

## ✨ Key Features
...
[Snipped for brevity: All content before line 283 remains UNCHANGED]
...
## Development

### Prerequisites

- Go 1.22+
- TinyGo 0.32+ (for WASM builds only)
- Node.js 20+
- Docker (for E2E tests and CI/CD runs)

### Setup

```bash
# Install dependencies
cd frontend && npm install && cd ..
```

### Run Tests Locally

```bash
# Run all tests (lint + unit tests)
make test

# Run Go tests only
make test-go

# Run Frontend tests only (TypeScript check + unit tests + build)
make test-frontend

# Run E2E tests (Playwright in Docker sidecar with prod image)
make test-e2e
```

---

### 🐳 Docker-Based E2E CI Pipeline (Playwright Sidecar)

**Why use containerized E2E?**

End-to-end (E2E) integration tests now run in a dedicated Playwright Docker sidecar, against the actual production image (served by nginx in a container). This ensures:
- Full isolation from host dependencies and permission issues
- Locally mirrors CI/CD pipeline with 100% parity
- Works identically on all platforms, even if Playwright or browsers fail to run locally

**How it works:**

1. **Build & Run Production App Container:**
   ```bash
   docker build -t sudoku-frontend -f frontend/Dockerfile .
   docker run --rm -p 8080:80 sudoku-frontend
   # App now accessible at http://localhost:8080
   ```
   You can use `make prod` or `docker compose up` for dev builds.

2. **Run Playwright E2E in Sidecar:**
   ```bash
   docker run --rm -it \
     --network host \
     -e PLAYWRIGHT_BASE_URL=http://localhost:8080 \
     -v "$PWD/frontend:/work" \
     -w /work \
     mcr.microsoft.com/playwright:v1.57.0-jammy \
     npx playwright test
   ```
- This mounts your frontend/test code into the sidecar,
- Points Playwright to the running prod container,
- Ensures no local dependencies or browsers are required and results match CI runs.

3. **CI Pipeline:**
   - GitHub Actions runs the same sidecar test step after Docker build/deploy.
   - Failing E2E locally = failing in CI. If tests pass in this setup, they will pass in your pipeline.

**Troubleshooting/Notes:**
- If Playwright, Chromium, or webkit errors appear locally, always run E2E in Docker as above.
- If a test fails locally but passes in CI (or vice versa), check for race conditions or improper network base URLs.
- Sidecar logs will show all E2E and UI failures for direct debug.
- Extend Playwright E2E tests in `frontend/e2e/` and rerun sidecar as above to verify fixes.

---

### About Check & Fix

The game’s “Check & Fix” button now strictly applies user-entry corrections only: it does **not** automatically resume the solver or auto-complete the puzzle when a fix has been made. This ensures users learn from each correction and prevents data loss due to previous autosolver behaviors.

---

[Everything else after this, including CI/CD and WASM details, build output, and deployment, is unchanged.]
