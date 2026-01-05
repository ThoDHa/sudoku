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

### 🧩 **Game Modes**
- **5 Difficulty Levels**: Easy → Medium → Hard → Extreme → Impossible
- **Daily Puzzles**: Fresh puzzle every day, synchronized globally
- **Game Mode**: Play random puzzles at your chosen difficulty
- **Custom Puzzles**: Enter, validate, and solve your own creations

### 🧠 **Intelligent Assistance**
- **Educational Hints (💡)**: Step-by-step guidance with technique explanations
- **Auto-Solve (🤖)**: Watch the solver work through puzzles with battery optimization
- **Auto-fill Candidates (📝)**: Smart candidate placement with visual feedback
- **Error Correction (🔧)**: Intelligent detection and fixing of user mistakes
- **Validation**: Real-time error detection and board state checking

### 🎨 **User Experience**
- **Responsive Design**: Seamless experience across desktop, tablet, and mobile
- **Dark/Light Themes**: Multiple color schemes with system preference detection
- **Intuitive Controls**: Click, keyboard, and touch-optimized interactions
- **Visual Highlighting**: Smart digit and cell highlighting with consistent behavior
- **Gesture Support**: Tap to place, long-press for notes, swipe navigation

### ⚡ **Performance & Reliability**
- **Fast Loading**: Initial bundle ~170KB (reduced from 770KB)
- **Battery Efficient**: Automatic pause when backgrounded, extended suspension after 30s
- **Offline-First**: Complete functionality without internet after first load
- **WASM Solver**: Go-based solver running in a dedicated Web Worker for non-blocking UI (~600KB cached)
- **Progressive Enhancement**: Works with JavaScript disabled (basic functionality)

## 🎮 How to Play

### Basic Controls
- **Place Numbers**: Click cell + click digit, or select cell + press 1-9
- **Notes Mode**: Toggle with 'N' key or notes button to add/remove candidate digits
- **Erase**: Select erase mode or press Delete/Backspace on selected cell
- **Navigation**: Arrow keys, Tab, or click to move between cells
- **Undo/Redo**: Ctrl+Z/Ctrl+Y or use toolbar buttons

### Getting Assistance
- **Hints (💡)**: Click hint button for step-by-step guidance with technique explanations
- **Auto-fill (📝)**: Fill all valid candidates automatically for a great starting point
- **Auto-solve (🤖)**: Watch the AI solve with educational explanations
- **Validation**: Check your progress with highlighted errors and incomplete regions

### Learning Features
- **Technique Practice**: Focus on specific solving methods with curated puzzles
- **Progressive Difficulty**: Start easy and work up to expert-level techniques
- **Detailed Explanations**: Every hint includes why the move works and what technique applies
- **Visual Aids**: Highlighting shows you exactly where techniques apply

## ⚙️ How It Works

The entire application runs locally in your browser with no server required after initial load!

### 🧱 **Architecture Overview**
- **WASM Solver**: Go-based constraint solver compiled with TinyGo to WebAssembly (~600KB, cached)
- **Web Worker Isolation**: Solver runs in a dedicated Web Worker thread for non-blocking UI
- **Static Puzzles**: 1000+ pre-generated puzzles embedded for instant access
- **Practice Database**: Pre-sorted puzzles categorized by required techniques
- **Daily Determinism**: UTC date-based seeding ensures same daily puzzle globally
- **Offline-First**: Service Worker + PWA manifest for complete offline functionality

### 🔧 **Technical Stack**
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, PWA
- **WASM Solver**: Go 1.23, TinyGo, WebAssembly, constraint propagation + backtracking
- **State Management**: React hooks, Context API, localStorage persistence
- **Performance**: Route-based code splitting, lazy loading, WASM in dedicated Web Worker
- **Testing**: Vitest unit tests, Playwright E2E, Go test suite (all via Docker)

## 📊 Performance & Mobile Optimization

### ⚡ **Loading Performance**
- **Lightning Fast**: Initial bundle ~170KB (down from 770KB)
- **Tiny WASM**: Solver compiled with TinyGo (~600KB, down from 3.3MB)
- **Smart Chunking**: Route-based code splitting for optimal loading
- **Aggressive Caching**: Service Worker caches everything for instant offline access
- **Progressive Loading**: Core game loads first, features load as needed

### 🔋 **Battery & Mobile Efficiency**
- **Background Pause**: All operations pause when app loses focus
- **Extended Suspension**: Complete shutdown after 30s to prevent battery drain
- **Touch Optimization**: Gesture-friendly controls optimized for mobile devices
- **Memory Management**: Smart WASM lifecycle prevents memory leaks
- **Network Aware**: Minimal data usage, works completely offline after first visit

### 📱 **Responsive Design**
- **Mobile-First**: Optimized touch interactions and gesture support
- **Adaptive Layout**: Scales seamlessly from phone to desktop
- **Accessibility**: Full keyboard navigation and screen reader support
- **PWA Features**: Install to home screen, splash screens, background sync

## Recent Improvements

### ✅ **Latest Updates (December 2024)**
- **🔧 Intelligent Error Correction**: Smart error detection system that finds and fixes mistakes
  - Direct conflicts (duplicate digits in row/column/box)
  - Blocking cells (entries that eliminate all candidates from another cell)
  - Complex errors with guided recovery suggestions
- **🧪 Comprehensive Test Suite**: 50+ backend tests for conflict detection across all scenarios
- **📡 E2E API Tests**: Playwright tests verify error correction through the full stack
- **🔄 WASM Parity**: Synchronized error handling between HTTP API and WASM solver
- **📚 Enhanced Documentation**: Detailed solver documentation with API response formats

### 🏗️ **Architecture Improvements**
- **🧵 Web Worker Isolation**: WASM solver now runs in a dedicated Web Worker thread, preventing UI blocking during hint and auto-solve operations
- **🐛 Highlighting Bug Fix**: Fixed persistent digit highlights after candidate removal operations
- **🏗️ Centralized Highlight Manager**: `useHighlightManager` for consistent UI behavior
- **🎯 UX Polish**: Highlights clear appropriately across all interaction methods
- **📱 Mobile Enhancement**: Improved touch interactions and gesture consistency

### 🚀 **Performance Optimizations (2024)**
- **Bundle Size Reduction**: Cut initial load from 770KB → 170KB via intelligent code splitting
- **Battery Life**: Extended background pause (30s) prevents drain in forgotten tabs
- **Memory Management**: Smart WASM lifecycle management with proper cleanup
- **Caching Strategy**: Aggressive service worker caching for instant offline access

## 🤖 Assistance Features Explained

The app provides three distinct types of help, each serving different learning goals:

### 💡 **Hints: Learn Step by Step**
- **Purpose**: Educational guidance that teaches real solving techniques
- **How it Works**: Analyzes current board state and suggests the next logical move
- **What You Get**: Detailed explanation of why the move works and what technique applies
- **Learning Value**: High, builds your solving skills progressively
- **Usage**: Perfect for learning new techniques or when stuck on a specific step

### 🤖 **Auto-Solve: Watch and Learn**
- **Purpose**: Demonstration of complete solving process with educational value
- **How it Works**: AI solver completes puzzle step-by-step with real-time explanations
- **What You Get**: Full solution path with technique annotations and timing control
- **Learning Value**: Medium, great for seeing advanced techniques in action
- **Usage**: Study complex puzzles, verify your approach, or just enjoy the show

### 📝 **Auto-fill: Smart Starting Point**
- **Purpose**: Automatically fill in valid candidates to reduce manual work  
- **How it Works**: Analyzes empty cells and fills all mathematically valid candidate digits
- **What You Get**: Complete candidate notation without the tedious manual entry
- **Learning Value**: Low, a convenience feature that saves time
- **Usage**: Start puzzles faster, recover from mistakes, or focus on logic over notation

### 📈 **Progress Tracking**
The app separately tracks usage of each assistance type, so you can:
- Challenge yourself to solve without hints
- Compare solving approaches across difficulty levels  
- Build confidence by gradually reducing assistance dependency
- Track your learning progress over time

### 🔧 **Error Correction: Fix Your Mistakes**
Made errors while solving? The solver intelligently detects and fixes them:

- **Direct Conflicts**: Detects when you place the same digit twice in a row, column, or box. Explains exactly which cells conflict.
- **Blocking Cells**: Finds when your entry eliminates all possibilities for another cell. Traces the logical chain to identify the problem.
- **Complex Errors**: When errors can't be traced to a single cell, provides guidance based on the number of user entries.

Errors are corrected **one at a time** with clear explanations, so you learn from each mistake.

## Quick Start

### GitHub Pages (Live)

Visit **https://thodha.github.io/sudoku/**

### Docker

```bash
# Development (hot reload)
make dev
# or: docker compose up

# Production build
make prod
# or: docker compose -f docker-compose.prod.yml up --build

# Open http://localhost
```

### Local Development

```bash
# With Docker (recommended)
make dev
# Open http://localhost

# Without Docker
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

## Architecture

```
sudoku/
├── api/                    # Go backend (optional, for development)
│   ├── cmd/
│   │   ├── server/         # API server (not needed for production)
│   │   ├── wasm/           # WASM build target
│   │   └── generate_practice/  # Practice puzzle generator
│   └── internal/
│       ├── sudoku/
│       │   ├── dp/         # Dancing Links constraint solver
│       │   └── human/      # Human-like solver with 39+ techniques
│       └── transport/http/ # API routes with error correction
├── frontend/               # React + Vite + TypeScript + Tailwind
│   ├── public/
│   │   └── sudoku.wasm     # Compiled WASM solver (~600KB with TinyGo)
│   ├── e2e/                # Playwright E2E tests
│   │   ├── api/            # API endpoint tests
│   │   ├── integration/    # UI integration tests
│   │   └── sdk/            # Type-safe test SDK
│   └── src/
│       ├── components/     # UI components (code-split)
│       ├── hooks/          # React hooks (game-logic chunk)
│       ├── lib/
│       │   ├── wasm.worker.ts    # Web Worker for WASM isolation
│       │   ├── worker-client.ts  # Type-safe worker communication
│       │   ├── solver-service.ts # Solver interface (solver chunk)
│       │   └── puzzles-data.ts   # Static puzzle data
│       └── pages/          # Route pages (lazy-loaded)
└── tools/                  # Development utilities
```

**Build Output** (optimized chunks):
- `react-vendor` (165KB): React, React DOM, React Router
- `game-page` (32KB): Game page component
- `pages` (72KB): Other pages (lazy-loaded)
- `ui-components` (634KB): UI components and Game dependencies
- `auto-solve` (10KB): Auto-solve functionality
- `game-logic` (8KB): Game state management hooks
- `game-components` (9.5KB): Board, History components
- `solver` (2.7KB): Solver service interface

## Solving Techniques

The solver implements 39+ techniques across 4 tiers:

**Simple (Easy puzzles)**
- Naked Single, Hidden Single
- Pointing Pair, Box-Line Reduction
- Naked/Hidden Pairs

**Medium (Medium puzzles)**
- Naked/Hidden Triples, Quads
- X-Wing, XY-Wing
- Simple Coloring

**Hard (Hard/Extreme puzzles)**
- Swordfish, Jellyfish
- W-Wing, Skyscraper
- X-Chains, XY-Chains
- Unique Rectangles (Types 1-4)
- ALS-XZ, Remote Pairs

**Extreme (Impossible puzzles)**
- 3D Medusa, Grouped X-Cycles
- ALS chains (XY-Wing, XY-Chain)
- Forcing Chains, Digit Forcing Chains
- Sue de Coq, Death Blossom

## Development

### Prerequisites

- Go 1.22+
- TinyGo 0.32+ (for WASM builds only)
- Node.js 20+
- Docker (for E2E tests only)

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

# Run E2E tests (Playwright in Docker)
make test-e2e
```

### Test Reporting with Allure

Create beautiful HTML test reports locally:

```bash
# Run all tests with Allure output
make test-allure

# Create combined report from all test results
make allure-report

# Serve report locally (opens in browser)
make allure-serve

# Clean all Allure artifacts
make allure-clean
```

### CI/CD Pipeline

Tests run automatically on every push and PR via GitHub Actions:

- **Frontend Unit Tests**: Vitest with coverage
- **Go Tests**: Full test suite with linting
- **E2E Tests**: Playwright integration tests

**View Test Results**: After tests complete, the Allure report is published to:
**[https://thodha.github.io/sudoku/test-report/](https://thodha.github.io/sudoku/test-report/)**

The report includes:
- Test results from all suites (unit, Go, E2E)
- Historical trends across runs
- Detailed failure analysis
- Test duration metrics

### Rebuild WASM Solver

The WASM solver is built with TinyGo for a smaller bundle size (~600KB vs 3.3MB with standard Go).

```bash
# Install TinyGo: https://tinygo.org/getting-started/install/

# Build WASM with TinyGo (default)
cd api && make wasm
# Outputs to frontend/public/sudoku.wasm

# Or build with standard Go (fallback, larger output)
cd api && make wasm-go
```

### Regenerate Practice Puzzles

```bash
cd api && go run ./cmd/generate_practice \
  -puzzles ../frontend/puzzles.json \
  -o ../frontend/practice_puzzles.json \
  -max 5
```

## Deployment

### GitHub Pages (Automatic)

Pushing to `main` triggers the full CI/CD pipeline:

1. **Test Workflow** (`test.yml`): Runs all tests, generates Allure report
2. **Deploy Workflow** (`deploy.yml`): Builds and deploys the app

Both the app and test report are deployed:
- **App**: [https://thodha.github.io/sudoku/](https://thodha.github.io/sudoku/)
- **Test Report**: [https://thodha.github.io/sudoku/test-report/](https://thodha.github.io/sudoku/test-report/)

### Manual Build

```bash
cd frontend
npm run build
# Deploy dist/ to any static host
```

### Docker

```bash
# Production build
make prod
# or: docker compose -f docker-compose.prod.yml up --build
```

### Static Hosting

Build and deploy the `dist` folder to any static host:

```bash
cd frontend
npm run build
# Deploy dist/ to S3, Cloudflare Pages, Netlify, etc.
```

## License

MIT
