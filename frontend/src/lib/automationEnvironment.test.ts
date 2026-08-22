import { describe, it, expect } from 'vitest'
import { isAutomatedEnvironment } from './automationEnvironment'

// The predicate takes its environment as an argument rather than reading the
// navigator global, so these reach the absent-environment branch and both
// directions of the userAgent type check without stubbing anything.

describe('isAutomatedEnvironment', () => {
  it('reports a non-automated environment when no navigator is available', () => {
    expect(isAutomatedEnvironment(undefined)).toBe(false)
  })

  it('reports an automated environment when webdriver is set', () => {
    expect(isAutomatedEnvironment({ webdriver: true, userAgent: 'Mozilla/5.0' })).toBe(true)
  })

  it('reports a non-automated environment when userAgent is not a string', () => {
    expect(isAutomatedEnvironment({ webdriver: false, userAgent: undefined })).toBe(false)
  })

  it('reports an automated environment for a HeadlessChrome userAgent', () => {
    expect(
      isAutomatedEnvironment({
        webdriver: false,
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0',
      }),
    ).toBe(true)
  })

  it('reports an automated environment for a playwright userAgent', () => {
    expect(
      isAutomatedEnvironment({
        webdriver: false,
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) playwright/1.40.0',
      }),
    ).toBe(true)
  })

  it('reports a non-automated environment for an ordinary browser userAgent', () => {
    expect(
      isAutomatedEnvironment({
        webdriver: false,
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
      }),
    ).toBe(false)
  })
})
