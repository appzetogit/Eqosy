import { useCallback, useEffect, useState } from "react"

// User-made collections of restaurants ("Date night", "Office lunch", ...), saved in the browser.
// collection = { id, name, type: "delivery" | "dining", items: [{ slug, name, image, rating, cuisine, deliveryTime, distance }] }
const KEY = "eqosy_user_collections"
const EVENT = "eqosy-collections-changed"

const read = () => {
  try {
    const raw = window.localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const write = (list) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage full or blocked: keep working in memory only */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useUserCollections() {
  const [list, setList] = useState(read)

  useEffect(() => {
    const sync = () => setList(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const create = useCallback((name, type = "delivery") => {
    const n = String(name || "").trim()
    if (!n) return null
    const c = { id: `collection-${Date.now()}`, name: n, type, items: [] }
    write([c, ...read()])
    return c.id
  }, [])

  const remove = useCallback((id) => write(read().filter((c) => c.id !== id)), [])

  const toggleItem = useCallback((id, item) => {
    write(
      read().map((c) => {
        if (c.id !== id) return c
        const has = c.items.some((i) => i.slug === item.slug)
        return { ...c, items: has ? c.items.filter((i) => i.slug !== item.slug) : [...c.items, item] }
      }),
    )
  }, [])

  return { collections: list, create, remove, toggleItem }
}
