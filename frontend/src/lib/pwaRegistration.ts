// User-gated service worker registration for offline/PWA support.
//
// Offline mode is OPT-IN (see gameSettings.ts, default OFF). main.tsx registers
// the service worker only when the user has enabled it; Menu.tsx toggles it.
// Toggling OFF must fully remove the offline artifacts, so unregisterOfflineMode
// unregisters every service worker AND deletes every Cache Storage entry
// (Workbox precache + runtime caches), mirroring cache-version.ts's
// clearAllCaches. registerType is 'autoUpdate' in vite.config.ts, so a plain
// registerSW() call is enough; no injectRegister/auto-injection is used because
// registration is explicit and preference-gated.

import { registerSW } from 'virtual:pwa-register'

let offlineRegistered = false

/**
 * Register the PWA service worker. Idempotent: a no-op once already registered,
 * and a no-op in environments without serviceWorker support (jsdom, older
 * browsers).
 */
export function registerOfflineMode(): void {
  if (offlineRegistered) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  offlineRegistered = true
  registerSW()
}

/**
 * Fully remove offline support: unregister every service worker and delete every
 * Cache Storage entry. Called when the user toggles offline mode OFF so the
 * cached shell does not linger. Errors propagate to the caller; the SW and
 * caches APIs are guarded so this is a no-op where they are undefined.
 */
export async function unregisterOfflineMode(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }
  if (typeof caches !== 'undefined') {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((name) => caches.delete(name)))
  }
}
