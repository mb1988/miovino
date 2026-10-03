import { BookOpen, Home, MoreHorizontal, Plus, Sparkles } from 'lucide-react'
import { t } from './lib/i18n'
import { lazy, Suspense, useEffect } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { cx } from './components/ui'
import { DemoBanner } from './components/DemoBanner'
import { DEMO, showcaseWanted } from './lib/demo'
import CellarPage from './pages/CellarPage'
import SignInPage from './pages/SignInPage'
import { useSync } from './lib/sync'
import { useLang } from './lib/i18n'

// Screens load on first visit, so the cellar (the first screen) starts faster.
const AddPage = lazy(() => import('./pages/AddPage'))
const DrinkPage = lazy(() => import('./pages/DrinkPage'))
const EditWinePage = lazy(() => import('./pages/EditWinePage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))
const JournalPage = lazy(() => import('./pages/JournalPage'))
const MorePage = lazy(() => import('./pages/MorePage'))
const ScanPage = lazy(() => import('./pages/ScanPage'))
const SuggestPage = lazy(() => import('./pages/SuggestPage'))
const TastePage = lazy(() => import('./pages/TastePage'))
const AskPage = lazy(() => import('./pages/AskPage'))
const BarcodePage = lazy(() => import('./pages/BarcodePage'))
const RackPage = lazy(() => import('./pages/RackPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const WineListPage = lazy(() => import('./pages/WineListPage'))
const WindowsPage = lazy(() => import('./pages/WindowsPage'))
const WishlistPage = lazy(() => import('./pages/WishlistPage'))
const FindBottlePage = lazy(() => import('./pages/FindBottlePage'))
const GrapesPage = lazy(() => import('./pages/GrapesPage'))
const WinePage = lazy(() => import('./pages/WinePage'))
const DemoShowcase = lazy(() => import('./components/DemoShowcase').then((m) => ({ default: m.DemoShowcase })))

export default function App() {
  const loc = useLocation()
  const navType = useNavigationType()
  // New screens start at the top; back/forward keeps the browser's restored position.
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0)
  }, [loc.pathname, navType])
  const sync = useSync()
  const lang = useLang()
  // Demo on a laptop: intro + the app in a phone frame (the frame loads the app itself).
  if (DEMO && showcaseWanted())
    return (
      <Suspense fallback={null}>
        <DemoShowcase />
      </Suspense>
    )
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
    // key={lang}: switching language re-renders every screen in the new language.
    <div key={lang} className="mx-auto min-h-dvh max-w-2xl px-4">
      {DEMO && <DemoBanner />}
      <main className={cx(hideNav ? 'pb-10' : 'pb-28')}>
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<CellarPage />} />
          <Route path="/wine/:id" element={<WinePage />} />
          <Route path="/wine/:id/edit" element={<EditWinePage />} />
          <Route path="/wine/:id/drink" element={<DrinkPage />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/add/manual" element={<EditWinePage />} />
          <Route path="/add/scan" element={<ScanPage />} />
          <Route path="/add/barcode" element={<BarcodePage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/suggest" element={<SuggestPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/taste" element={<TastePage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/buy" element={<FindBottlePage />} />
          <Route path="/grapes" element={<GrapesPage />} />
          <Route path="/rack" element={<RackPage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/winelist" element={<WineListPage />} />
          <Route path="/windows" element={<WindowsPage />} />
          <Route path="*" element={<CellarPage />} />
        </Routes>
        </Suspense>
      </main>
      {!hideNav && <BottomNav />}
    </div>
  )
}

function BottomNav() {
  const item = (to: string, label: string, Icon: typeof Home, description?: string) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition', isActive ? 'text-cream-50' : 'text-cream-500 hover:text-cream-300')}
    >
      <Icon size={22} strokeWidth={1.8} aria-hidden />
      {t(label)}
      {description && <span className="sr-only">{t(description)}</span>}
    </NavLink>
  )
  return (
    <nav className="pb-[max(env(safe-area-inset-bottom),0.5rem)] fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-2xl items-end px-2">
        {item('/', 'Cellar', Home)}
        {item('/suggest', 'Drink', Sparkles)}
        <NavLink to="/add" aria-label={t('Add wine')} className="flex flex-1 justify-center">
          <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-wine-600 text-cream-50 shadow-xl shadow-wine-900/50 ring-4 ring-ink-900 transition hover:bg-wine-500">
            <Plus size={28} />
          </span>
        </NavLink>
        {item('/journal', 'Journal', BookOpen)}
        {item('/more', 'More', MoreHorizontal, ' — settings, backup, rack map')}
      </div>
    </nav>
  )
}
