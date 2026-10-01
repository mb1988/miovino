/**
 * Demo mode: the whole app on a made-up cellar, for showing MioVino to people (e.g. from a CV).
 * Opened at /demo. Uses its own IndexedDB database and never talks to the real server:
 * every /api call is answered in the browser, AI features with canned replies.
 * Kept dependency-free so db.ts and settings.ts can import it before anything else runs.
 */

const FLAG = 'miovino.demo'

function detect(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.location.pathname === '/demo' || window.location.pathname.startsWith('/demo/')) {
      localStorage.setItem(FLAG, '1')
      return true
    }
    return localStorage.getItem(FLAG) === '1'
  } catch {
    // No storage (private mode): demo only for this page load.
    return window.location.pathname === '/demo'
  }
}

/** Fixed for the page's lifetime: entering or leaving the demo reloads the app. */
export const DEMO = detect()

/** Per-device storage keys, kept apart so the demo never overwrites the owner's own settings or chat. */
export function storageKey(key: string) {
  return DEMO ? key.replace(/^miovino\./, 'miovino.demo.') : key
}

export function exitDemo() {
  try {
    localStorage.removeItem(FLAG)
  } catch {
    /* nothing stored */
  }
  // From inside the desktop showcase's phone frame, leave the whole page.
  ;(window.top ?? window).location.assign('/')
}

export const SHOWCASE_FULL = 'miovino.demo.full'

/** On a wide screen (and not already inside its own frame), the demo opens as a showcase: intro + app in a phone frame. */
export function showcaseWanted() {
  try {
    if (window.top !== window || sessionStorage.getItem(SHOWCASE_FULL)) return false
  } catch {
    return false
  }
  return window.matchMedia('(min-width: 1024px)').matches
}
