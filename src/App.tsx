import { BookOpen, Home, MoreHorizontal, Plus, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { cx } from './components/ui'
import AddPage from './pages/AddPage'
import CellarPage from './pages/CellarPage'
import DrinkPage from './pages/DrinkPage'
import EditWinePage from './pages/EditWinePage'
import ImportPage from './pages/ImportPage'
import JournalPage from './pages/JournalPage'
import MorePage from './pages/MorePage'
import ScanPage from './pages/ScanPage'
import SignInPage from './pages/SignInPage'
import { useSync } from './lib/sync'
import SuggestPage from './pages/SuggestPage'
import TastePage from './pages/TastePage'
import AskPage from './pages/AskPage'
import RackPage from './pages/RackPage'
import WishlistPage from './pages/WishlistPage'
import WinePage from './pages/WinePage'

export default function App() {
  const loc = useLocation()
  const navType = useNavigationType()
  // New screens start at the top; back/forward keeps the browser's restored position.
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0)
  }, [loc.pathname, navType])
  const sync = useSync()
  const hideNav = /\/(drink|edit)$|^\/add\/|^\/import/.test(loc.pathname)
  // Setup links always show the setup screen; otherwise lock the app while the server says we're signed out.
  // Offline (no server answer) the app keeps working on this device's own copy.
  if (loc.pathname === '/setup' || (sync.available && !sync.authenticated))
    return (
      <div className="mx-auto max-w-2xl px-4">
        <SignInPage />
      </div>
    )

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4">
      <main className={cx(hideNav ? 'pb-10' : 'pb-28')}>
        <Routes>
          <Route path="/" element={<CellarPage />} />
          <Route path="/wine/:id" element={<WinePage />} />
          <Route path="/wine/:id/edit" element={<EditWinePage />} />
          <Route path="/wine/:id/drink" element={<DrinkPage />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/add/manual" element={<EditWinePage />} />
          <Route path="/add/scan" element={<ScanPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/suggest" element={<SuggestPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/taste" element={<TastePage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/rack" element={<RackPage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="*" element={<CellarPage />} />
        </Routes>
      </main>
      {!hideNav && <BottomNav />}
    </div>
  )
}

function BottomNav() {
  const item = (to: string, label: string, Icon: typeof Home) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition', isActive ? 'text-cream-50' : 'text-cream-500 hover:text-cream-300')}
    >
      <Icon size={22} strokeWidth={1.8} />
      {label}
    </NavLink>
  )
  return (
    <nav className="pb-[max(env(safe-area-inset-bottom),0.5rem)] fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-2xl items-end px-2">
        {item('/', 'Cellar', Home)}
        {item('/suggest', 'Drink', Sparkles)}
        <NavLink to="/add" aria-label="Add wine" className="flex flex-1 justify-center">
          <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-wine-600 text-cream-50 shadow-xl shadow-wine-900/50 ring-4 ring-ink-900 transition hover:bg-wine-500">
            <Plus size={28} />
          </span>
        </NavLink>
        {item('/journal', 'Journal', BookOpen)}
        {item('/more', 'More', MoreHorizontal)}
      </div>
    </nav>
  )
}
