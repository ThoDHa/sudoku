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
    // Directive is inline on the `catch` line so it leads the CatchClause node; a
    // disable comment placed here inside the try body attaches elsewhere and is inert.
  } /* Stryker disable next-line BlockStatement: emptying the catch returns undefined instead of false, but the sole consumer `if (isDebugModeEnabled())` treats both as falsy, so it is observationally identical */ catch {
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
    // Directive is inline on the `catch` line so it leads the CatchClause node; a
    // disable comment placed here inside the try body attaches elsewhere and is inert.
  } /* Stryker disable next-line BlockStatement: the catch body is a bare early `return` with no code after the try/catch, so emptying it falls through to the same implicit `undefined` return; observationally identical */ catch {
    return
  }
}

export function disableDebug(): void {
  logger.setLevel('error')
  try {
    localStorage.removeItem(DEBUG_STORAGE_KEY)
    window.DEBUG = false
    // Directive is inline on the `catch` line so it leads the CatchClause node; a
    // disable comment placed here inside the try body attaches elsewhere and is inert.
  } /* Stryker disable next-line BlockStatement: the catch body is a bare early `return` with no code after the try/catch, so emptying it falls through to the same implicit `undefined` return; observationally identical */ catch {
    return
  }
}

export { logger }
