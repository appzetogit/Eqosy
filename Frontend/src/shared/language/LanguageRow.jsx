import { useEffect, useState } from 'react'
import { ChevronRight, Globe } from 'lucide-react'
import { LANGUAGES, LANGUAGE_CHANGED_EVENT, OPEN_LANGUAGE_EVENT } from './languages.js'
import { getStoredLanguage } from './googleTranslate.js'

// Drop-in "Language" row for any Profile page. Opens the shared picker mounted in App.jsx.
export default function LanguageRow({ className = '' }) {
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
      onClick={() => window.dispatchEvent(new Event(OPEN_LANGUAGE_EVENT))}
      className={`flex w-full items-center justify-between rounded-2xl bg-white px-4 py-4 text-left shadow-sm ${className}`}
    >
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Globe size={18} />
        </span>
        <span>
          <span className="block text-sm font-bold text-slate-900">Language</span>
          <span className="notranslate block text-xs text-slate-500">{active.native}</span>
        </span>
      </span>
      <ChevronRight size={18} className="text-slate-400" />
    </button>
  )
}
