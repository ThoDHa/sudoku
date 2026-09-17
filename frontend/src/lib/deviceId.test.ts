import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getDeviceId } from './deviceId'
import { STORAGE_KEYS } from './constants'

// Structural stub for the crypto globals the module probes. Deliberately not
// Pick<Crypto>: the DOM types peg randomUUID to a UUID-shaped template
// literal, and the stubs must be free to return sentinel strings.
interface CryptoStub {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

function stubCrypto(cryptoLike: CryptoStub | undefined) {
  vi.stubGlobal('crypto', cryptoLike)
}

describe('getDeviceId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('crypto.randomUUID path', () => {
    it('returns the randomUUID value when the method is available', () => {
      stubCrypto({ randomUUID: vi.fn(() => 'urn-uuid-1') })

      expect(getDeviceId()).toBe('urn-uuid-1')
    })

    it('persists the generated id and reuses it on the next call', () => {
      const randomUUID = vi
        .fn<() => string>()
        .mockReturnValueOnce('urn-uuid-first')
        .mockReturnValueOnce('urn-uuid-second')
      stubCrypto({ randomUUID })

      expect(getDeviceId()).toBe('urn-uuid-first')
      expect(getDeviceId()).toBe('urn-uuid-first')
      expect(randomUUID).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem(STORAGE_KEYS.DEVICE_ID)).toBe('urn-uuid-first')
    })

    it('returns the stored id without generating when one is already persisted', () => {
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, 'stored-id')
      const randomUUID = vi.fn<() => string>(() => 'urn-uuid-should-not-fire')
      stubCrypto({ randomUUID })

      expect(getDeviceId()).toBe('stored-id')
      expect(randomUUID).not.toHaveBeenCalled()
    })
  })

  describe('crypto.getRandomValues fallback path', () => {
    it('returns 32 hex chars built from 16 random bytes', () => {
      stubCrypto({
        getRandomValues: vi.fn((array: Uint8Array) => {
          array.fill(0xab)
          return array
        }),
      })

      expect(getDeviceId()).toBe('ab'.repeat(16))
    })

    it('zero-pads hex output for small byte values', () => {
      stubCrypto({
        getRandomValues: vi.fn((array: Uint8Array) => {
          for (let i = 0; i < array.length; i++) array[i] = i
          return array
        }),
      })

      expect(getDeviceId()).toBe('000102030405060708090a0b0c0d0e0f')
    })

    it('is chosen when randomUUID is absent rather than undefined-but-crypto-present', () => {
      stubCrypto({
        getRandomValues: vi.fn((array: Uint8Array) => {
          array.fill(0x11)
          return array
        }),
      })

      expect(getDeviceId()).toBe('11'.repeat(16))
    })

    it('falls through to the Math.random path when crypto lacks both generators', () => {
      stubCrypto({})
      vi.spyOn(Math, 'random').mockReturnValue(0.25)
      vi.spyOn(Date, 'now').mockReturnValue(1700000000000)

      expect(getDeviceId()).toBe('id-9-loyw3v28')
    })
  })

  describe('Math.random fallback path', () => {
    it('builds the id-prefixed fallback from Math.random and Date.now', () => {
      stubCrypto(undefined)
      vi.spyOn(Math, 'random').mockReturnValue(0.25)
      vi.spyOn(Date, 'now').mockReturnValue(1700000000000)

      expect(getDeviceId()).toBe('id-9-loyw3v28')
    })

    it('is reached when crypto itself is missing entirely', () => {
      stubCrypto(undefined)
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const id = getDeviceId()

      expect(id).toMatch(/^id-[a-z0-9]+-[a-z0-9]+$/)
    })
  })

  describe('localStorage failure path', () => {
    it('returns a fresh session-only id when getItem throws', () => {
      stubCrypto({ randomUUID: vi.fn(() => 'session-uuid') })
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage blocked')
      })
      const setItem = vi.spyOn(Storage.prototype, 'setItem')

      expect(getDeviceId()).toBe('session-uuid')
      expect(setItem).not.toHaveBeenCalled()
    })

    it('returns a fresh session-only id when setItem throws', () => {
      stubCrypto({
        randomUUID: vi
          .fn<() => string>()
          .mockReturnValueOnce('throwing-uuid')
          .mockReturnValueOnce('second-session-uuid'),
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage full')
      })

      // The catch branch regenerates: the id built inside the try is
      // discarded and a second makeId() result is returned.
      expect(getDeviceId()).toBe('second-session-uuid')
      expect(localStorage.getItem(STORAGE_KEYS.DEVICE_ID)).toBeNull()
    })
  })
})
