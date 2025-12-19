/**
 * Sudoku SDK - Entry Point
 * 
 * Exports all SDK implementations and types for testing.
 */

// Types
export * from './types';

// Base class
export { SudokuSDK } from './base';

// Implementations
export { DirectAPISDK } from './direct-api';
export { PlaywrightAPISDK } from './playwright-api';
export type { PlaywrightAPISDKOptions } from './playwright-api';
export { PlaywrightUISDK } from './playwright-ui';
export type { PlaywrightUISDKOptions } from './playwright-ui';

// Game session helper (standalone browser automation)
export { SudokuGameSession, createGameSession } from './game-session';
export type { GameState, ActionResult, DeviceType } from './game-session';
