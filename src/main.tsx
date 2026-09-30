import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { migrateLegacy } from './lib/db'
import { startSync } from './lib/sync'
import './index.css'

// Ask the browser not to evict our IndexedDB under storage pressure.
navigator.storage?.persist?.().catch(() => {})

// Move data from the v0.1 local database (numeric ids) once, then start syncing with the server if there is one.
migrateLegacy()
  .catch((e) => console.error('Migration failed', e))
  .finally(startSync)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
