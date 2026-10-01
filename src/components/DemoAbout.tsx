import { Link } from 'react-router-dom'
import { t } from '../lib/i18n'

/** What MioVino is, for demo visitors: shown in the demo's About sheet and beside the app on wide screens. */
const TRY = [
  ['/rack', 'Rack map'],
  ['/suggest', 'What should I drink?'],
  ['/ask', 'Ask my cellar'],
  ['/taste', 'Your Wine DNA'],
] as const
const pill = 'min-h-9 rounded-full bg-ink-800 px-3 py-2 text-xs text-cream-100 ring-1 ring-ink-600 hover:ring-ink-500'

/** `go` opens a screen somewhere else (the phone frame on wide screens); otherwise the links navigate here. */
export function DemoAbout({ onPick, go }: { onPick?: () => void; go?: (path: string) => void }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-cream-200">
      <p>{t('A private wine-cellar app, built as a personal project and used every day for a real cellar. This demo runs on made-up wines, entirely in your browser: change anything, nothing is sent anywhere.')}</p>
      <ul className="list-disc space-y-1.5 pl-5 text-cream-300">
        <li>{t('Offline-first PWA: the cellar lives on the phone (IndexedDB) and syncs to a Cloudflare Worker with a D1 database.')}</li>
        <li>{t('Passkey sign-in (Face ID / fingerprint), no passwords.')}</li>
        <li>{t('AI label scanner, “Ask my cellar” chat and a restaurant wine-list reader, on free AI models with automatic fallback.')}</li>
        <li>{t('Rack map with slot suggestions, drinking windows, monthly push reminders, several cellars.')}</li>
        <li>{t('English and Italian, accessibility-checked, end-to-end tests in CI, preview deploy for every change.')}</li>
      </ul>
      <p className="text-xs text-cream-400">React · TypeScript · Vite · Tailwind · Dexie · Cloudflare Workers · D1 · Web Push · Vitest · Playwright</p>
      <p className="font-medium text-cream-100">{t('Things to try:')}</p>
      <div className="flex flex-wrap gap-2">
        {TRY.map(([path, label]) =>
          go ? (
            <button key={path} onClick={() => go(path)} className={pill}>
              {t(label)}
            </button>
          ) : (
            <Link key={path} to={path} onClick={onPick} className={pill}>
              {t(label)}
            </Link>
          ),
        )}
      </div>
    </div>
  )
}
