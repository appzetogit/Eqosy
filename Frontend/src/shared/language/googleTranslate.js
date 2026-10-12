import { LANGUAGES, LANGUAGE_CHOSEN_KEY, LANGUAGE_STORAGE_KEY } from './languages.js'

const SCRIPT_ID = 'google-translate-script'
const CONTAINER_ID = 'google_translate_element'
let loadPromise = null

export const getStoredLanguage = () => {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en'
  } catch {
    return 'en'
  }
}

export const hasChosenLanguage = () => {
  try {
    return localStorage.getItem(LANGUAGE_CHOSEN_KEY) === '1'
  } catch {
    return true
  }
}

const setCookie = (value) => {
  const host = window.location.hostname
  const base = `googtrans=${value}; path=/`
  document.cookie = base
  if (host && host.includes('.')) document.cookie = `${base}; domain=${host}`
}

const clearCookie = () => {
  const expired = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  document.cookie = expired
  const host = window.location.hostname
  if (host && host.includes('.')) document.cookie = `${expired}; domain=${host}`
}

// Google rewrites text nodes React still owns; make React's DOM calls tolerate that.
let reactPatched = false
const patchDomForReact = () => {
  if (reactPatched || typeof Node === 'undefined') return
  reactPatched = true
  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) return child
    return originalRemoveChild.apply(this, arguments)
  }
  const originalInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) return newNode
    return originalInsertBefore.apply(this, arguments)
  }
}

// Google injects a "Translated into ..." bar and shifts <body> down. Remove it, but cheaply:
// watch only <body>'s direct children and its own inline style (never the whole subtree), and
// coalesce bursts into one pass per animation frame so scrolling and React updates stay smooth.
let bannerWatcher = null
let bannerPassQueued = false
const BANNER_SELECTOR = 'iframe.goog-te-banner-frame, body > iframe.skiptranslate, body > .skiptranslate, body > .VIpgJd-ZVi9od-ORHb-OEVmcd, body > .VIpgJd-ZVi9od-aZ2wEe-wOHMyf'
const stripBanner = () => {
  bannerPassQueued = false
  document.querySelectorAll(BANNER_SELECTOR).forEach((node) => {
    if (node.id === CONTAINER_ID || node.querySelector?.('select.goog-te-combo')) return
    if (node.style.display !== 'none') node.style.setProperty('display', 'none', 'important')
  })
  const bodyStyle = document.body.style
  if (bodyStyle.top && bodyStyle.top !== '0px') bodyStyle.setProperty('top', '0px', 'important')
}
const queueStripBanner = () => {
  if (bannerPassQueued) return
  bannerPassQueued = true
  requestAnimationFrame(stripBanner)
}
const watchBanner = () => {
  if (bannerWatcher || typeof MutationObserver === 'undefined') return
  bannerWatcher = new MutationObserver(queueStripBanner)
  bannerWatcher.observe(document.body, { childList: true })
  bannerWatcher.observe(document.body, { attributes: true, attributeFilter: ['style'] })
  stripBanner()
}

const loadWidget = () => {
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    if (!document.getElementById(CONTAINER_ID)) {
      const container = document.createElement('div')
      container.id = CONTAINER_ID
      container.className = 'notranslate'
      container.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;'
      document.body.appendChild(container)
    }
    window.googleTranslateElementInit = () => {
      try {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            includedLanguages: LANGUAGES.filter((l) => l.code !== 'en').map((l) => l.code).join(','),
            autoDisplay: false,
          },
          CONTAINER_ID
        )
        resolve()
      } catch (error) {
        reject(error)
      }
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
    script.async = true
    script.onerror = () => {
      loadPromise = null
      reject(new Error('Translate script failed to load'))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}

const waitForCombo = (timeout = 6000) =>
  new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      const combo = document.querySelector('select.goog-te-combo')
      if (combo) return resolve(combo)
      if (Date.now() - started > timeout) return resolve(null)
      setTimeout(tick, 100)
    }
    tick()
  })

export const setLanguage = async (code) => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    localStorage.setItem(LANGUAGE_CHOSEN_KEY, '1')
  } catch {
    /* ignore */
  }
  document.documentElement.lang = code

  if (code === 'en') {
    const wasTranslated = document.cookie.includes('googtrans=')
    clearCookie()
    if (wasTranslated) window.location.reload()
    return
  }

  patchDomForReact()
  watchBanner()
  setCookie(`/en/${code}`)
  await loadWidget().catch(() => {})
  const combo = await waitForCombo()
  if (combo) {
    combo.value = code
    combo.dispatchEvent(new Event('change'))
  }
}

// Re-apply the saved language when the app starts.
// Only a language the user explicitly picked is applied; a new user must choose first, so a
// leftover translate cookie must never translate their first screen.
export const initLanguage = () => {
  if (!hasChosenLanguage()) {
    clearCookie()
    document.documentElement.lang = 'en'
    return
  }
  const code = getStoredLanguage()
  document.documentElement.lang = code
  if (code !== 'en') setLanguage(code)
}
