import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import log from 'loglevel'

describe('logger', () => {
  beforeEach(() => {
    localStorage.clear()
    delete (window as { DEBUG?: boolean }).DEBUG
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    delete (window as { DEBUG?: boolean }).DEBUG
  })

  describe('enableDebug', () => {
    it('raises the log level to debug, persists the flag, and exposes window.DEBUG', async () => {
      const { enableDebug } = await import('./logger')
      const setLevelSpy = vi.spyOn(log, 'setLevel')

      enableDebug()

      expect(setLevelSpy).toHaveBeenCalledWith('debug')
      expect(localStorage.getItem('debug')).toBe('true')
      expect(window.DEBUG).toBe(true)
    })

    it('swallows the error when localStorage.setItem throws rather than crashing the caller', async () => {
      const { enableDebug } = await import('./logger')
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      expect(() => enableDebug()).not.toThrow()

      spy.mockRestore()
    })

    it('does not set window.DEBUG = true when localStorage.setItem throws (catch returns early)', async () => {
      delete (window as { DEBUG?: boolean }).DEBUG
      const { enableDebug } = await import('./logger')
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      enableDebug()

      expect((window as { DEBUG?: boolean }).DEBUG).toBeUndefined()

      spy.mockRestore()
    })
  })

  describe('disableDebug', () => {
    it('lowers the log level to error, clears the flag, and unsets window.DEBUG', async () => {
      const { enableDebug, disableDebug } = await import('./logger')
      enableDebug()

      const setLevelSpy = vi.spyOn(log, 'setLevel')
      disableDebug()

      expect(setLevelSpy).toHaveBeenCalledWith('error')
      expect(localStorage.getItem('debug')).toBeNull()
      expect(window.DEBUG).toBe(false)
    })

    it('swallows the error when localStorage.removeItem throws', async () => {
      const { disableDebug } = await import('./logger')
      const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })

      expect(() => disableDebug()).not.toThrow()

      spy.mockRestore()
    })

    it('does not set window.DEBUG = false when localStorage.removeItem throws (catch returns early)', async () => {
      ;(window as { DEBUG?: boolean }).DEBUG = true
      const { disableDebug } = await import('./logger')
      const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })

      disableDebug()

      // Catch returns early; window.DEBUG remains true (not flipped to false)
      expect((window as { DEBUG?: boolean }).DEBUG).toBe(true)

      spy.mockRestore()
    })
  })

  describe('module initialization', () => {
    it('raises the log level to debug at load when the stored debug flag is "true"', async () => {
      vi.resetModules()
      localStorage.setItem('debug', 'true')

      const setLevelSpy = vi.spyOn(log, 'setLevel')
      setLevelSpy.mockClear()

      await import('./logger')

      expect(setLevelSpy).toHaveBeenCalledWith('debug')
    })

    it('keeps the default log level at load when debug mode is not enabled', async () => {
      vi.resetModules()
      localStorage.removeItem('debug')

      const setLevelSpy = vi.spyOn(log, 'setLevel')
      setLevelSpy.mockClear()

      await import('./logger')

      expect(setLevelSpy).not.toHaveBeenCalledWith('debug')
    })

    it('falls back to the default level without crashing when localStorage.getItem throws at init', async () => {
      vi.resetModules()
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })

      await expect(import('./logger')).resolves.toBeDefined()

      spy.mockRestore()
    })

    it('does not enable debug mode at init when localStorage.getItem throws (catch returns false, not true)', async () => {
      vi.resetModules()
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      const setLevelSpy = vi.spyOn(log, 'setLevel')
      setLevelSpy.mockClear()

      await import('./logger')

      expect(setLevelSpy).not.toHaveBeenCalledWith('debug')

      spy.mockRestore()
    })
  })
})
