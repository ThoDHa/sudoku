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
    // Stryker disable next-line BlockStatement: emptying the catch makes the function return undefined instead of false; the only consumer (`if (isDebugModeEnabled())`) treats both as falsy, so the change is observationally identical at module init
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
    window.DEBUG = true
  } catch {
    return
  }
}

export function disableDebug(): void {
  logger.setLevel('error')
  try {
    localStorage.removeItem(DEBUG_STORAGE_KEY)
    window.DEBUG = false
  } catch {
    return
  }
}

export { logger }
