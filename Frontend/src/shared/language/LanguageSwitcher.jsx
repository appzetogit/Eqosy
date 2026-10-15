import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Globe, Check } from 'lucide-react'
import { LANGUAGES } from './languages.js'
import { LANGUAGE_CHANGED_EVENT, OPEN_LANGUAGE_EVENT } from './languages.js'
import { getStoredLanguage, hasChosenLanguage, initLanguage, setLanguage } from './googleTranslate.js'

// Fixed top-right globe on every app, plus a "choose your language" sheet on first launch.
export default function LanguageSwitcher() {
  const { pathname } = useLocation()
  const [current, setCurrent] = useState(getStoredLanguage)
  const [open, setOpen] = useState(false)
  const [firstRun, setFirstRun] = useState(() => !hasChosenLanguage())

  useEffect(() => {
    initLanguage()
  }, [])

  // Profile pages open the picker through this event (see LanguageRow).
  useEffect(() => {
    const openPicker = () => setOpen(true)
    window.addEventListener(OPEN_LANGUAGE_EVENT, openPicker)
    return () => window.removeEventListener(OPEN_LANGUAGE_EVENT, openPicker)
  }, [])

  const choose = async (code) => {
    setCurrent(code)
    setOpen(false)
    setFirstRun(false)
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: code }))
    await setLanguage(code)
  }

  // The Taxi admin header has its own language button (LanguageButton), so don't float one over it.
  const isAdmin = pathname.startsWith('/admin')
  const active = LANGUAGES.find((l) => l.code === current) || LANGUAGES[0]

  const list = (
    <div className="grid grid-cols-2 gap-2">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => choose(lang.code)}
          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
            current === lang.code ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
          }`}
        >
          <span className="notranslate">
            <span className="block font-semibold leading-tight">{lang.native}</span>
            <span className="block text-[11px] opacity-70">{lang.label}</span>
          </span>
          {current === lang.code && <Check size={16} />}
        </button>
      ))}
    </div>
  )

  return (
    <div className="notranslate">
      {isAdmin && (
        <div className="fixed z-[9999]" style={{ top: 14, right: 280 }}>
          <button
            type="button"
            aria-label="Change language"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white/95 px-3 py-1.5 text-xs font-bold text-neutral-800 shadow-md backdrop-blur"
          >
            <Globe size={14} />
            {active.native}
          </button>
        </div>
      )}

      {(firstRun || open) && (
        <div
          className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => !firstRun && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-lg font-black text-neutral-900">
              <Globe size={20} /> Select your language
            </div>
            <p className="mb-4 text-sm text-neutral-500">अपनी भाषा चुनें · You can change this anytime from Profile.</p>
            {list}
            {!firstRun && (
              <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-700">
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
