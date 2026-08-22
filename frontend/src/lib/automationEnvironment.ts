// The subset of Navigator the automation probe reads. Both fields are unknown
// because a non-browser runtime need not honour the Navigator shape at all, and
// the probe has to answer without trusting either one.
interface AutomationEnvironment {
  webdriver: unknown
  userAgent: unknown
}

/**
 * Whether the app is running under E2E automation (Playwright, Headless Chrome,
 * or any webdriver), where focus and visibility pausing must be bypassed: the
 * runner window may not be focused while the page is still "visible".
 *
 * Takes the environment rather than reading `navigator` itself, so both the
 * absent-environment and non-string-userAgent branches are reachable without
 * stubbing a global. Callers pass `globalThis.navigator`, a property read that
 * yields undefined rather than throwing when the runtime declares no navigator.
 * That makes the predicate safe to call anywhere; it says nothing about whether
 * a given caller is.
 */
export function isAutomatedEnvironment(env: AutomationEnvironment | undefined): boolean {
  if (env === undefined) return false
  return (
    Boolean(env.webdriver) ||
    (typeof env.userAgent === 'string' &&
      (env.userAgent.includes('HeadlessChrome') || env.userAgent.includes('playwright')))
  )
}
