// Daily prompt utility functions

import { STORAGE_KEYS } from './constants'
import { isTodayCompleted, getTodayUTC } from './scores'
import { getShowDailyReminder } from './preferences'

/**
 * Check if we should show the daily prompt
 * Returns true if:
 * - User preference allows daily reminders
 * - Today's daily puzzle is NOT completed
 * - We haven't already shown the prompt today
 */
export function shouldShowDailyPrompt(): boolean {
  // Check user preference
  if (!getShowDailyReminder()) return false
  
  // Check if daily already completed
  if (isTodayCompleted()) return false
  
  // Check if already prompted today
  try {
    const lastShown = localStorage.getItem(STORAGE_KEYS.DAILY_PROMPT_LAST_SHOWN)
    if (lastShown === getTodayUTC()) return false
  } catch {
    // If localStorage access fails, don't show prompt
    return false
  }
  
  return true
}

/**
 * Mark that we've shown the prompt today
 */
export function markDailyPromptShown(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DAILY_PROMPT_LAST_SHOWN, getTodayUTC())
  } catch {
    // Silently fail if localStorage is unavailable
  }
}
