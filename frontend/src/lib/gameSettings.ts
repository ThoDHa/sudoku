// Game-specific settings (separate from theme preferences)

const AUTO_SAVE_KEY = 'sudoku_autosave_enabled'

export function getAutoSaveEnabled(): boolean {
  try {
    const value = localStorage.getItem(AUTO_SAVE_KEY)
    return value !== null ? JSON.parse(value) : true // Default: enabled
  } catch {
    return true
  }
}

export function setAutoSaveEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(enabled))
  } catch (e) {
    console.warn('Failed to save auto-save preference:', e)
  }
}