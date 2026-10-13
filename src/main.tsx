import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { DEMO } from './lib/demo'
import { migrateLegacy } from './lib/db'
import { startSync } from './lib/sync'
import './index.css'

// Ask the browser not to evict our IndexedDB under storage pressure.
navigator.storage?.persist?.().catch(() => {})

// Offline support: register the service worker after the first screen is up (its precache download waits too).
if ('serviceWorker' in navigator)
  window.addEventListener('load', () => {
    const register = () => void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
    if ('requestIdleCallback' in window) requestIdleCallback(register, { timeout: 4000 })
    else setTimeout(register, 2000)
  })

async function boot() {
  if (DEMO) {
    // Demo: answer /api in the browser and fill the demo database before the first screen reads it.
    const { installDemoApi, seedDemo } = await import('./lib/demoApi')
    installDemoApi()
    await seedDemo().catch((e) => console.error('Demo seed failed', e))
    if (location.pathname.startsWith('/demo')) history.replaceState(null, '', '/')
  } else {
    // Move data from the v0.1 local database (numeric ids) once.
    await migrateLegacy().catch((e) => console.error('Migration failed', e))
  }
  startSync()
}

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )

// The demo waits for its data (and its /demo → / redirect) so the first screen is already full.
if (DEMO) void boot().finally(render)
else {
  render()
  void boot()
}
