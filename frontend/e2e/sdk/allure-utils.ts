/**
 * Allure Reporting Utilities
 * 
 * Constants for consistent test categorization across Playwright E2E tests.
 * 
 * Usage:
 *   import { allure } from 'allure-playwright';
 *   import { EPICS, FEATURES, STORIES } from './sdk/allure-utils';
 *   
 *   test('example test', async ({ page }) => {
 *     await allure.epic(EPICS.GAMEPLAY);
 *     await allure.feature(FEATURES.GAMEPLAY.CELL_SELECTION);
 *     await allure.story(STORIES.GAMEPLAY.SELECT_EMPTY_CELL);
 *     // ... test code
 *   });
 */

// ============================================================================
// EPICS - High-level business capabilities
// ============================================================================

export const EPICS = {
  HOMEPAGE: 'Homepage',
  GAMEPLAY: 'Gameplay',
  NAVIGATION: 'Navigation',
  HELP_SYSTEM: 'Help System',
  PERSISTENCE: 'Persistence',
  ERROR_HANDLING: 'Error Handling',
  MOBILE: 'Mobile Experience',
} as const;

// ============================================================================
// FEATURES - Mid-level functional areas within epics
// ============================================================================

export const FEATURES = {
  HOMEPAGE: {
    CORE_ELEMENTS: 'Homepage - Core Elements',
    DIFFICULTY_GRID: 'Homepage - Difficulty Grid',
    DAILY_CARD: 'Homepage - Daily Card',
    PRACTICE_MODE: 'Homepage - Practice Mode',
    CONTINUE_GAME: 'Homepage - Continue Game',
    RESPONSIVE: 'Homepage - Responsive Design',
  },
  
  GAMEPLAY: {
    CELL_SELECTION: 'Gameplay - Cell Selection',
    DIGIT_ENTRY: 'Gameplay - Digit Entry',
    NOTES: 'Gameplay - Notes',
    UNDO_REDO: 'Gameplay - Undo/Redo',
    CLEAR: 'Gameplay - Clear',
    KEYBOARD: 'Gameplay - Keyboard Controls',
    TOUCH: 'Gameplay - Touch Interaction',
    TIMER: 'Gameplay - Timer',
    AUTOSOLVE: 'Gameplay - Auto-Solve',
    CUSTOM_PUZZLES: 'Gameplay - Custom Puzzles',
  },
  
  NAVIGATION: {
    HEADER: 'Navigation - Header',
    ROUTING: 'Navigation - Routing',
    LINKS: 'Navigation - Links',
    MODAL_NAVIGATION: 'Navigation - Modal Navigation',
  },
  
  HELP_SYSTEM: {
    HINTS: 'Help System - Hints',
    TECHNIQUE_HINTS: 'Help System - Technique Hints',
    ABOUT_TECHNIQUE: 'Help System - About Technique Modal',
    DAILY_PROMPT: 'Help System - Daily Prompt',
    GLOSSARY: 'Help System - Glossary',
  },
  
  PERSISTENCE: {
    LOCAL_STORAGE: 'Persistence - Local Storage',
    GAME_STATE: 'Persistence - Game State',
    DAILY_PUZZLE: 'Persistence - Daily Puzzle',
    PRACTICE_PUZZLE: 'Persistence - Practice Puzzle',
  },
  
  ERROR_HANDLING: {
    API_ERRORS: 'Error Handling - API Errors',
    NETWORK_ERRORS: 'Error Handling - Network Errors',
    VALIDATION_ERRORS: 'Error Handling - Validation Errors',
    AUTOSOLVE_ERRORS: 'Error Handling - Auto-Solve Errors',
  },
  
  MOBILE: {
    RESPONSIVE: 'Mobile - Responsive Design',
    TOUCH_CONTROLS: 'Mobile - Touch Controls',
    MOBILE_LAYOUT: 'Mobile - Layout',
  },
} as const;

// ============================================================================
// STORIES - Low-level user stories / test scenarios
// ============================================================================

export const STORIES = {
  HOMEPAGE: {
    // Core Elements
    PAGE_LOADS: 'Homepage loads with correct title',
    DISPLAYS_LOGO: 'Displays Enso logo',
    DISPLAYS_HEADING: 'Displays main heading',
    DISPLAYS_HEADER_NAV: 'Displays header navigation',
    LOGO_ALT_TEXT: 'Logo has correct alt text for accessibility',
    
    // Difficulty Grid
    DISPLAYS_ALL_DIFFICULTIES: 'Displays all 5 difficulty levels',
    DIFFICULTY_ORDER: 'Difficulty levels are in correct order',
    DIFFICULTY_CLICKABLE: 'Difficulty buttons are clickable',
    DIFFICULTY_NAVIGATION: 'Clicking difficulty navigates to game',
    
    // Daily Card
    DAILY_CARD_VISIBLE: 'Daily card is visible',
    DAILY_CARD_PLAY_STATE: 'Daily card shows play button for new daily',
    DAILY_CARD_RESUME_STATE: 'Daily card shows resume button for in-progress daily',
    DAILY_CARD_COMPLETE_STATE: 'Daily card shows complete state',
    
    // Practice Mode
    SWITCH_TO_PRACTICE: 'Can switch to practice mode',
    PRACTICE_SHOWS_DIFFICULTY_GRID: 'Practice mode shows difficulty grid',
    
    // Continue Game
    CONTINUE_GAME_VISIBLE: 'Continue game button visible when game in progress',
    CONTINUE_GAME_NAVIGATES: 'Continue game navigates to correct puzzle',
  },
  
  GAMEPLAY: {
    // Cell Selection
    SELECT_EMPTY_CELL: 'Clicking an empty cell selects it',
    SELECT_GIVEN_CELL: 'Clicking a given cell highlights the digit',
    KEYBOARD_ARROW_NAVIGATION: 'Arrow keys navigate between cells',
    
    // Digit Entry
    ENTER_DIGIT_KEYBOARD: 'Entering digit via keyboard updates cell',
    ENTER_DIGIT_MOUSE: 'Entering digit via mouse click updates cell',
    CLEAR_CELL: 'Clearing a cell removes the digit',
    
    // Notes
    TOGGLE_NOTES_MODE: 'Toggle notes mode',
    ENTER_NOTE: 'Enter note in a cell',
    CLEAR_NOTES: 'Clear notes from a cell',
    NOTES_PERSIST: 'Notes persist across page reload',
    
    // Undo/Redo
    UNDO_ACTION: 'Undo action reverts last change',
    REDO_ACTION: 'Redo action reapplies last undone change',
    UNDO_REDO_DISABLED_STATES: 'Undo/Redo buttons disabled when no actions',
    
    // Timer
    TIMER_STARTS: 'Timer starts when puzzle loads',
    TIMER_PAUSES: 'Timer pauses when navigating away',
    TIMER_RESUMES: 'Timer resumes when returning to puzzle',
    
    // Auto-Solve
    AUTOSOLVE_COMPLETES_PUZZLE: 'Auto-solve completes the puzzle',
    AUTOSOLVE_ERROR_HANDLING: 'Auto-solve handles errors gracefully',
    
    // Custom Puzzles
    CUSTOM_PUZZLE_INPUT: 'Can input custom puzzle',
    CUSTOM_PUZZLE_VALIDATION: 'Custom puzzle validates input',
    CUSTOM_PUZZLE_PLAYS: 'Custom puzzle is playable',
  },
  
  NAVIGATION: {
    // Header
    HEADER_LOGO_HOME: 'Header logo navigates to home',
    HEADER_LINKS_VISIBLE: 'Header links are visible',
    
    // Routing
    ROUTE_HOMEPAGE: 'Can navigate to homepage',
    ROUTE_GAME: 'Can navigate to game page',
    ROUTE_LEADERBOARD: 'Can navigate to leaderboard',
    ROUTE_ABOUT: 'Can navigate to about page',
    ROUTE_CUSTOM: 'Can navigate to custom puzzle page',
    
    // Modal Navigation
    MODAL_OPENS: 'Modal opens on trigger',
    MODAL_CLOSES: 'Modal closes on dismiss',
    MODAL_ESC_CLOSES: 'ESC key closes modal',
  },
  
  HELP_SYSTEM: {
    // Hints
    HINT_BUTTON_VISIBLE: 'Hint button is visible',
    HINT_PROVIDES_SUGGESTION: 'Hint provides valid suggestion',
    HINT_HIGHLIGHTS_CELL: 'Hint highlights the relevant cell',
    
    // Technique Hints
    TECHNIQUE_HINT_AVAILABLE: 'Technique hint available for puzzle',
    TECHNIQUE_HINT_SHOWS_EXPLANATION: 'Technique hint shows explanation',
    
    // About Technique
    ABOUT_TECHNIQUE_MODAL_OPENS: 'About technique modal opens',
    ABOUT_TECHNIQUE_SHOWS_DETAILS: 'About technique shows technique details',
    
    // Daily Prompt
    DAILY_PROMPT_SHOWS_ON_FIRST_VISIT: 'Daily prompt shows on first visit',
    DAILY_PROMPT_DISMISSED: 'Daily prompt can be dismissed',
  },
  
  PERSISTENCE: {
    // Local Storage
    GAME_STATE_SAVES: 'Game state saves to local storage',
    GAME_STATE_LOADS: 'Game state loads from local storage',
    DAILY_PUZZLE_PERSISTS: 'Daily puzzle state persists',
    PRACTICE_PUZZLE_PERSISTS: 'Practice puzzle state persists',
  },
  
  ERROR_HANDLING: {
    // API Errors
    API_ERROR_SHOWS_MESSAGE: 'API error shows user-friendly message',
    API_ERROR_RETRY: 'API error allows retry',
    
    // Network Errors
    NETWORK_ERROR_SHOWS_MESSAGE: 'Network error shows user-friendly message',
    
    // Validation Errors
    VALIDATION_ERROR_SHOWN: 'Validation error is shown to user',
    
    // Auto-Solve Errors
    AUTOSOLVE_ERROR_GRACEFUL: 'Auto-solve error handled gracefully',
  },
  
  MOBILE: {
    // Responsive Design
    MOBILE_LAYOUT_ADAPTS: 'Layout adapts to mobile viewport',
    MOBILE_TOUCH_TARGETS: 'Touch targets are appropriately sized',
    
    // Touch Controls
    TOUCH_CELL_SELECTION: 'Touch selects cell on mobile',
    TOUCH_DIGIT_ENTRY: 'Touch enters digit on mobile',
  },
} as const;

// ============================================================================
// Type exports for TypeScript autocompletion
// ============================================================================

export type Epic = typeof EPICS[keyof typeof EPICS];
export type Feature = typeof FEATURES[keyof typeof FEATURES][keyof typeof FEATURES[keyof typeof FEATURES]];
export type Story = typeof STORIES[keyof typeof STORIES][keyof typeof STORIES[keyof typeof STORIES]];
