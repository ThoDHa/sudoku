import log from 'loglevel'

declare global {
  interface Window {
    DEBUG?: boolean
  }
}

log.setDefaultLevel('error')

const DEBUG_STORAGE_KEY = 'debug'

function isDebugModeEnabled(): boolean {
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

if (isDebugModeEnabled()) {
  log.setLevel('debug')
}

const logger = log

export function enableDebug(): void {
  logger.setLevel('debug')
  try {
    localStorage.setItem(DEBUG_STORAGE_KEY, 'true')
  } catch {
  }
  if (typeof window !== 'undefined') {
    window.DEBUG = true
  }
}

export function disableDebug(): void {
  logger.setLevel('error')
  try {
    localStorage.removeItem(DEBUG_STORAGE_KEY)
  } catch {
  }
  if (typeof window !== 'undefined') {
    window.DEBUG = false
  }
}

export { logger }
