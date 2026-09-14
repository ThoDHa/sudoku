// jsdom unit coverage for the PWA registration boundary. The pwa-offline e2e
// suite proves the real service-worker behavior; these tests pin the module's
// own contract: opt-in registration that is idempotent and a no-op without
// serviceWorker support, and a full unregister that sweeps every service
// worker and every Cache Storage entry, propagating API errors to the caller
// (Menu.tsx attaches .catch to the returned promise).
const pwaMocks = vi.hoisted(() => ({
  registerSW: vi.fn(),
}))

vi.mock('virtual:pwa-register', () => ({
  registerSW: pwaMocks.registerSW,
}))

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface RegistrationStub {
  unregister: Mock
}

const makeRegistration = (label: string, unregistered: string[]): RegistrationStub => ({
  unregister: vi.fn(() => {
    unregistered.push(label)
    return Promise.resolve(true)
  }),
})

const stubServiceWorker = (registrations: RegistrationStub[]): Mock => {
  const getRegistrations = vi.fn().mockResolvedValue(registrations)
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations } })
  return getRegistrations
}

interface CacheStorageStub {
  keys: Mock
  delete: Mock
  deleted: string[]
}

const stubCacheStorage = (names: string[]): CacheStorageStub => {
  const deleted: string[] = []
  const cacheStorage: CacheStorageStub = {
    keys: vi.fn().mockResolvedValue(names),
    delete: vi.fn((name: string) => {
      deleted.push(name)
      return Promise.resolve(true)
    }),
    deleted,
  }
  vi.stubGlobal('caches', cacheStorage)
  return cacheStorage
}

// offlineRegistered is module-level state: every test imports a fresh module
// copy so tests stay independent of execution order.
const importPwaRegistration = async () => {
  vi.resetModules()
  return import('./pwaRegistration')
}

describe('registerOfflineMode', () => {
  beforeEach(() => {
    pwaMocks.registerSW.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers the service worker with no arguments when the browser supports service workers', async () => {
    vi.stubGlobal('navigator', { serviceWorker: {} })
    const { registerOfflineMode } = await importPwaRegistration()

    registerOfflineMode()

    expect(pwaMocks.registerSW).toHaveBeenCalledTimes(1)
    expect(pwaMocks.registerSW).toHaveBeenCalledWith()
  })

  it('registers exactly once across repeated calls', async () => {
    vi.stubGlobal('navigator', { serviceWorker: {} })
    const { registerOfflineMode } = await importPwaRegistration()

    registerOfflineMode()
    registerOfflineMode()

    expect(pwaMocks.registerSW).toHaveBeenCalledTimes(1)
  })

  it('never registers when the browser has no serviceWorker member (jsdom default)', async () => {
    const { registerOfflineMode } = await importPwaRegistration()

    registerOfflineMode()

    expect(pwaMocks.registerSW).not.toHaveBeenCalled()
  })

  it('never registers when navigator itself is absent', async () => {
    const { registerOfflineMode } = await importPwaRegistration()
    vi.stubGlobal('navigator', undefined)

    expect(() => registerOfflineMode()).not.toThrow()
    expect(pwaMocks.registerSW).not.toHaveBeenCalled()
  })
})

describe('unregisterOfflineMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('unregisters every service worker registration and deletes every cache by name', async () => {
    const unregistered: string[] = []
    const registrations = [
      makeRegistration('sw-a', unregistered),
      makeRegistration('sw-b', unregistered),
    ]
    const getRegistrations = stubServiceWorker(registrations)
    const cacheStorage = stubCacheStorage(['workbox-precache-v2-/', 'app-assets', 'images-cache'])
    const { unregisterOfflineMode } = await importPwaRegistration()

    await expect(unregisterOfflineMode()).resolves.toBeUndefined()

    expect(getRegistrations).toHaveBeenCalledTimes(1)
    expect(unregistered).toEqual(['sw-a', 'sw-b'])
    for (const registration of registrations) {
      expect(registration.unregister).toHaveBeenCalledTimes(1)
      expect(registration.unregister).toHaveBeenCalledWith()
    }
    expect(cacheStorage.keys).toHaveBeenCalledTimes(1)
    expect(cacheStorage.deleted).toEqual(['workbox-precache-v2-/', 'app-assets', 'images-cache'])
    expect(cacheStorage.delete).toHaveBeenCalledTimes(3)
  })

  it('unregisters service workers even when the Cache Storage API is absent', async () => {
    const unregistered: string[] = []
    const registrations = [makeRegistration('sw-a', unregistered)]
    stubServiceWorker(registrations)
    vi.stubGlobal('caches', undefined)
    const { unregisterOfflineMode } = await importPwaRegistration()

    await expect(unregisterOfflineMode()).resolves.toBeUndefined()

    expect(unregistered).toEqual(['sw-a'])
  })

  it('deletes every cache even when service workers are unsupported', async () => {
    const cacheStorage = stubCacheStorage(['app-assets', 'images-cache'])
    const { unregisterOfflineMode } = await importPwaRegistration()

    await expect(unregisterOfflineMode()).resolves.toBeUndefined()

    expect(cacheStorage.deleted).toEqual(['app-assets', 'images-cache'])
  })

  it('resolves without touching any API when neither navigator nor caches exist', async () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('caches', undefined)
    const { unregisterOfflineMode } = await importPwaRegistration()

    await expect(unregisterOfflineMode()).resolves.toBeUndefined()
  })

  it('skips the service-worker sweep when navigator is absent but still deletes caches', async () => {
    vi.stubGlobal('navigator', undefined)
    const cacheStorage = stubCacheStorage(['app-assets'])
    const { unregisterOfflineMode } = await importPwaRegistration()

    await expect(unregisterOfflineMode()).resolves.toBeUndefined()

    expect(cacheStorage.deleted).toEqual(['app-assets'])
  })

  it('propagates a failing unregister and deletes no caches', async () => {
    const failing: RegistrationStub = {
      unregister: vi.fn().mockRejectedValue(new Error('unregister failed')),
    }
    stubServiceWorker([failing])
    const cacheStorage = stubCacheStorage(['app-assets'])
    const { unregisterOfflineMode } = await importPwaRegistration()

    await expect(unregisterOfflineMode()).rejects.toThrow('unregister failed')
    expect(cacheStorage.delete).not.toHaveBeenCalled()
  })

  it('propagates a failing getRegistrations', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockRejectedValue(new Error('getRegistrations failed')),
      },
    })
    const { unregisterOfflineMode } = await importPwaRegistration()

    await expect(unregisterOfflineMode()).rejects.toThrow('getRegistrations failed')
  })

  it('propagates a failing caches.keys and deletes no caches', async () => {
    stubServiceWorker([])
    const deleteMock = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('caches', {
      keys: vi.fn().mockRejectedValue(new Error('keys failed')),
      delete: deleteMock,
    })
    const { unregisterOfflineMode } = await importPwaRegistration()

    await expect(unregisterOfflineMode()).rejects.toThrow('keys failed')
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('propagates a failing caches.delete', async () => {
    stubServiceWorker([])
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['app-assets']),
      delete: vi.fn().mockRejectedValue(new Error('delete failed')),
    })
    const { unregisterOfflineMode } = await importPwaRegistration()

    await expect(unregisterOfflineMode()).rejects.toThrow('delete failed')
  })
})
