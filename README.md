# Sudoku

An advanced educational Sudoku web application that teaches solving techniques through human-like hints and intelligent assistance features.

**[Play Now](https://thodha.github.io/sudoku/)** - Lightning-fast PWA (~170KB), fully offline-capable

## 🎯 What Makes This Different

This isn't just another Sudoku app - it's a comprehensive learning platform that:

- **Teaches Real Techniques**: Learn 30+ solving methods from basic Singles to advanced Forcing Chains
- **Thinks Like You Do**: Human-like solver explains each step with detailed reasoning
- **Works Everywhere**: PWA with aggressive offline caching - play anywhere, anytime
- **Optimized Performance**: Code-split architecture with battery-efficient background handling
- **Educational Focus**: Practice specific techniques with curated puzzle sets

## ✨ Key Features

### 🧩 **Game Modes**
- **5 Difficulty Levels**: Easy → Medium → Hard → Extreme → Impossible
- **Daily Puzzles**: Fresh puzzle every day, synchronized globally
- **Practice Mode**: Target specific techniques with hand-selected puzzles
- **Custom Puzzles**: Enter, validate, and solve your own creations

### 🧠 **Intelligent Assistance**
- **Educational Hints (💡)**: Step-by-step guidance with technique explanations
- **Auto-Solve (🤖)**: Watch the solver work through puzzles with battery optimization
- **Auto-fill Candidates (📝)**: Smart candidate placement with visual feedback
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
- **WASM Solver**: Go-based solver running locally at native speeds (~3.5MB cached)
- **Progressive Enhancement**: Works with JavaScript disabled (basic functionality)

## 🎮 How to Play

### Basic Controls
- **Place Numbers**: Click cell + click digit, or select cell + press 1-9
- **Notes Mode**: Toggle with 'N' key or notes button - add/remove candidate digits
- **Erase**: Select erase mode or press Delete/Backspace on selected cell
- **Navigation**: Arrow keys, Tab, or click to move between cells
- **Undo/Redo**: Ctrl+Z/Ctrl+Y or use toolbar buttons

### Getting Assistance
- **Hints (💡)**: Click hint button for step-by-step guidance with technique explanations
- **Auto-fill (📝)**: Fill all valid candidates automatically - great starting point
- **Auto-solve (🤖)**: Watch the AI solve with educational explanations
- **Validation**: Check your progress - highlights errors and incomplete regions

### Learning Features
- **Technique Practice**: Focus on specific solving methods with curated puzzles
- **Progressive Difficulty**: Start easy and work up to expert-level techniques
- **Detailed Explanations**: Every hint includes why the move works and what technique applies
- **Visual Aids**: Highlighting shows you exactly where techniques apply

## ⚙️ How It Works

The entire application runs locally in your browser - no server required after initial load!

### 🧱 **Architecture Overview**
- **WASM Solver**: Go-based constraint solver compiled to WebAssembly (~3.5MB, cached)
- **Static Puzzles**: 1000+ pre-generated puzzles embedded for instant access
- **Practice Database**: Pre-analyzed puzzles categorized by required techniques
- **Daily Determinism**: UTC date-based seeding ensures same daily puzzle globally
- **Offline-First**: Service Worker + PWA manifest for complete offline functionality

### 🔧 **Technical Stack**
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, PWA
- **Solver**: Go 1.23, WebAssembly, constraint propagation + backtracking
- **State Management**: React hooks, Context API, localStorage persistence
- **Performance**: Route-based code splitting, lazy loading, WASM worker threads
- **Testing**: Playwright E2E, Jest unit tests, Go test suite

## 📊 Performance & Mobile Optimization

### ⚡ **Loading Performance**
- **Lightning Fast**: Initial bundle ~170KB (down from 770KB)
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
- **🐛 Highlighting Bug Fix**: Fixed persistent digit highlights after candidate removal operations
- **🏗️ Architecture Enhancement**: Introduced centralized `useHighlightManager` for consistent UI behavior
- **🎯 UX Improvement**: Highlights now clear appropriately across all interaction methods (click, keyboard, touch)
- **📱 Mobile Polish**: Enhanced touch interactions and gesture consistency
- **🔧 Code Quality**: Semantic highlight management methods for improved maintainability

### 🚀 **Performance Optimizations (2024)**
- **Bundle Size Reduction**: Cut initial load from 770KB → 170KB via intelligent code splitting
- **Battery Life**: Extended background pause (30s) prevents drain in forgotten tabs
- **Memory Management**: Smart WASM lifecycle management with proper cleanup
- **Caching Strategy**: Aggressive service worker caching for instant offline access

### 🎨 **User Experience Enhancements**
- **Auto-fill Feedback**: Clear messaging for candidate operations ("Auto-filled X cells")
- **Auto-solve Intelligence**: Battery-aware step timing with visual progress indicators
- **Accessibility**: Improved keyboard navigation and screen reader support
- **Visual Polish**: Consistent highlighting behavior across all game interactions

## 🤖 Assistance Features Explained

The app provides three distinct types of help, each serving different learning goals:

### 💡 **Hints - Learn Step by Step**
- **Purpose**: Educational guidance that teaches real solving techniques
- **How it Works**: Analyzes current board state and suggests the next logical move
- **What You Get**: Detailed explanation of why the move works and what technique applies
- **Learning Value**: High - builds your solving skills progressively
- **Usage**: Perfect for learning new techniques or when stuck on a specific step

### 🤖 **Auto-Solve - Watch and Learn** 
- **Purpose**: Demonstration of complete solving process with educational value
- **How it Works**: AI solver completes puzzle step-by-step with real-time explanations
- **What You Get**: Full solution path with technique annotations and timing control
- **Learning Value**: Medium - great for seeing advanced techniques in action
- **Usage**: Study complex puzzles, verify your approach, or just enjoy the show

### 📝 **Auto-fill - Smart Starting Point**
- **Purpose**: Automatically populate valid candidates to reduce manual work  
- **How it Works**: Analyzes empty cells and fills all mathematically valid candidate digits
- **What You Get**: Complete candidate notation without the tedious manual entry
- **Learning Value**: Low - convenience feature that saves time
- **Usage**: Start puzzles faster, recover from mistakes, or focus on logic over notation

### 📈 **Progress Tracking**
The app separately tracks usage of each assistance type, so you can:
- Challenge yourself to solve without hints
- Compare solving approaches across difficulty levels  
- Build confidence by gradually reducing assistance dependency
- Track your learning progress over time

## Quick Start

### GitHub Pages (Live)

Visit **https://thodha.github.io/sudoku/** - Fast loading (~170KB initial), offline-capable PWA

### Docker

```bash
docker compose up -d
# Open http://localhost
```

### Local Development

```bash
# Frontend only (uses WASM solver)
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
│       └── sudoku/human/   # Human-like solver with 30+ techniques
├── frontend/               # React + Vite + TypeScript + Tailwind
│   ├── public/
│   │   └── sudoku.wasm     # Compiled WASM solver (~3.5MB cached)
│   └── src/
│       ├── components/     # UI components (code-split)
│       ├── hooks/          # React hooks (game-logic chunk)
│       ├── lib/
│       │   ├── wasm.ts     # WASM loader
│       │   ├── solver-service.ts  # Solver interface (solver chunk)
│       │   └── puzzles-data.ts    # Static puzzle data
│       └── pages/          # Route pages (lazy-loaded)
├── puzzles.json            # Pre-generated puzzle database
└── practice_puzzles.json   # Technique -> puzzle mappings
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

The solver implements techniques across 4 tiers:

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

- Node.js 20+
- Go 1.23+ (only for rebuilding WASM)

### Rebuild WASM Solver

```bash
cd api
make wasm
# Outputs to frontend/public/sudoku.wasm
```

### Regenerate Practice Puzzles

```bash
docker run --rm -v "$(pwd):/app" -w /app/api golang:1.23-alpine \
  go run ./cmd/generate_practice \
    -puzzles /app/puzzles.json \
    -o /app/practice_puzzles.json \
    -max 5
```

### Run Tests

```bash
# Go tests
cd api && go test ./...

# Frontend unit tests
cd frontend && npm run test:unit

# E2E tests
cd frontend && npm run test
```

## Deployment

### GitHub Pages (Automatic)

Push to `main` branch - GitHub Actions will build and deploy automatically.

### Docker

```bash
docker compose up -d
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
