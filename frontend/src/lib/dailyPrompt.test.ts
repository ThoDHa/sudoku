import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shouldShowDailyPrompt, markDailyPromptShown } from './dailyPrompt'
import { STORAGE_KEYS } from './constants'

vi.mock('./preferences', () => ({
  getShowDailyReminder: vi.fn(() => true),
}))

vi.mock('./scores', () => ({
  isTodayCompleted: vi.fn(() => false),
  getTodayLocal: vi.fn(() => '2024-03-15'),
}))

import { getShowDailyReminder } from './preferences'
import { isTodayCompleted, getTodayLocal } from './scores'

const mockedGetShowDailyReminder = vi.mocked(getShowDailyReminder)
const mockedIsTodayCompleted = vi.mocked(isTodayCompleted)
const mockedGetTodayLocal = vi.mocked(getTodayLocal)

describe('shouldShowDailyPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    mockedGetShowDailyReminder.mockReset()
    mockedIsTodayCompleted.mockReset()
    mockedGetTodayLocal.mockReset()
    mockedGetShowDailyReminder.mockReturnValue(true)
    mockedIsTodayCompleted.mockReturnValue(false)
    mockedGetTodayLocal.mockReturnValue('2024-03-15')
  })

  it('returns false when the user has disabled daily reminders', () => {
    mockedGetShowDailyReminder.mockReturnValue(false)
    expect(shouldShowDailyPrompt()).toBe(false)
  })

  it("returns false when today's daily puzzle is already completed", () => {
    mockedIsTodayCompleted.mockReturnValue(true)
    expect(shouldShowDailyPrompt()).toBe(false)
  })

  it('returns false when the prompt was already shown today', () => {
    localStorage.setItem(STORAGE_KEYS.DAILY_PROMPT_LAST_SHOWN, '2024-03-15')
    expect(shouldShowDailyPrompt()).toBe(false)
  })

  it('returns true when reminders are on, daily is incomplete, and not yet shown today', () => {
    expect(shouldShowDailyPrompt()).toBe(true)
  })

  it('returns true when the last-shown value is from a different day', () => {
    localStorage.setItem(STORAGE_KEYS.DAILY_PROMPT_LAST_SHOWN, '2024-03-14')
    expect(shouldShowDailyPrompt()).toBe(true)
  })

  it('returns false when reading localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    expect(shouldShowDailyPrompt()).toBe(false)
    spy.mockRestore()
  })
})

describe('markDailyPromptShown', () => {
  beforeEach(() => {
    localStorage.clear()
    mockedGetTodayLocal.mockReset()
    mockedGetTodayLocal.mockReturnValue('2024-03-15')
  })

  it("persists today's local date under the daily-prompt key", () => {
    markDailyPromptShown()
    expect(localStorage.getItem(STORAGE_KEYS.DAILY_PROMPT_LAST_SHOWN)).toBe('2024-03-15')
  })

  it('does not throw when writing to localStorage fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    expect(() => markDailyPromptShown()).not.toThrow()
    spy.mockRestore()
  })
})
