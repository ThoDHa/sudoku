/**
 * Playwright Diagnostic Helper: Difficulty-Navigation Event Log
 *
 * Records, inside the page, the events that classify a lost click under load
 * (TEST-17): whether the physical click reached a card button (with the
 * button's bounding rect at pointerdown/mouseup/click, so a rect that changes
 * between stages is the layout-shift signature) and whether React Router
 * completed the history update. The in-page log survives on window.__navlog
 * and is dumped into the Playwright report as a file attachment when a test
 * fails.
 *
 * Whether DifficultyGrid#handlePlay itself ran is not observable from the
 * test side; when a log shows click-on-button without pushState, the gap is
 * closed by the marker procedure: temporarily push a marker entry from
 * handlePlay and re-run (the TEST-17 task log records the procedure's use,
 * not its text).
 */

import type { Page, TestInfo } from '@playwright/test'

/**
 * Install the in-page event log. Must be called before page.goto so the log
 * exists before any app code runs.
 *
 * @param page - Playwright Page instance to instrument
 */
export async function installNavLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __navlog: { t: number; kind: string; detail?: unknown }[]
    }
    w.__navlog = []
    const log = (kind: string, detail?: unknown) => {
      w.__navlog.push({ t: Math.round(performance.now()), kind, detail })
    }

    const describe = (el: EventTarget | null) => {
      if (!(el instanceof Element)) return String(el)
      const text = (el.textContent || '').trim().slice(0, 24)
      return `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ').join('.')}` : ''}${text ? ` "${text}"` : ''}`
    }

    const rectOf = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }

    const buttonOf = (target: EventTarget | null): Element | null => {
      if (target instanceof Element) return target.closest('button')
      return null
    }

    log('init-script', { href: location.href, readyState: document.readyState })
    document.addEventListener('DOMContentLoaded', () => log('DOMContentLoaded'))
    window.addEventListener('load', () => log('window-load'))

    const wrap = (method: 'pushState' | 'replaceState') => {
      const original = History.prototype[method]
      History.prototype[method] = function (data, unused, url) {
        log(method, { url: String(url) })
        return original.call(this, data, unused, url)
      }
    }
    wrap('pushState')
    wrap('replaceState')

    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click'] as const) {
      document.addEventListener(
        type,
        (e) => {
          const button = buttonOf(e.target)
          log(type, {
            target: describe(e.target),
            button: button ? describe(button) : null,
            coords: { x: e.clientX, y: e.clientY },
            buttonRect: rectOf(button),
            stylesheets: document.styleSheets.length,
            readyState: document.readyState,
          })
        },
        true,
      )
    }
  })
}

/**
 * Dump the in-page event log into the test report as an attachment.
 *
 * Diagnostic-only path: the caller rethrows the original test error after
 * this returns, so a dump failure here is swallowed with a note and must not
 * surface as (or replace) the failure itself.
 *
 * @param page - Playwright Page whose window.__navlog is read
 * @param testInfo - Playwright TestInfo to attach the dump to
 * @param label - Distinguishing label for the attachment name
 */
export async function dumpNavLog(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  let entries: unknown = null
  try {
    entries = await page.evaluate(() => (window as unknown as { __navlog?: unknown }).__navlog)
  } catch {
    entries = 'unavailable (page navigating or closed)'
  }
  try {
    await testInfo.attach(`navlog-${label}`, {
      body: typeof entries === 'string' ? entries : (JSON.stringify(entries, null, 2) ?? 'null'),
      contentType: 'text/plain',
    })
  } catch (dumpError) {
    console.warn(`navlog dump for ${label} failed (diagnostic only): ${String(dumpError)}`)
  }
}
