import { useEffect, useState } from 'react'
import { Globe } from 'lucide-react'
import { LANGUAGES, LANGUAGE_CHANGED_EVENT, OPEN_LANGUAGE_EVENT } from './languages.js'
import { getStoredLanguage } from './googleTranslate.js'

// Compact language pill for headers. Opens the shared picker mounted in App.jsx (LanguageSwitcher).
export default function LanguageButton({ className = '' }) {
  const [code, setCode] = useState(getStoredLanguage)

  useEffect(() => {
    const onChange = (event) => setCode(event.detail || getStoredLanguage())
    window.addEventListener(LANGUAGE_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(LANGUAGE_CHANGED_EVENT, onChange)
  }, [])

  const active = LANGUAGES.find((l) => l.code === code) || LANGUAGES[0]

  return (
    <button
      type="button"
      aria-label="Change language"
      onClick={() => window.dispatchEvent(new Event(OPEN_LANGUAGE_EVENT))}
      className={`notranslate flex h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3.5 text-[13px] font-extrabold text-neutral-800 shadow-sm transition-all hover:border-amber-400/30 hover:shadow-md active:scale-95 ${className}`}
    >
      <Globe size={16} className="text-amber-600" />
      {active.native}
    </button>
  )
}
