import { STORAGE_KEYS } from './constants'

// Generate device ID for validation. crypto.randomUUID() is only available
// in secure contexts (HTTPS or localhost); on a plain-HTTP deploy it is
// undefined and calling it throws, which previously aborted validation
// entirely. Fall back to getRandomValues / Math.random so an insecure-context
// visitor can still validate a custom puzzle.
export function getDeviceId(): string {
  const makeId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('')
    }
    return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  }
  try {
    let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID)
    if (!deviceId) {
      deviceId = makeId()
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId)
    }
    return deviceId
  } catch {
    // localStorage not available (private mode, storage full, etc.)
    // Return a session-only ID
    return makeId()
  }
}
