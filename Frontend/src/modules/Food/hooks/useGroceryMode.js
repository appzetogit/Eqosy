import { useLocation } from "react-router-dom"

/** True when the current URL is in Grocery / Quick Mart mode (?vertical=grocery). */
export function useGroceryMode() {
  const { search } = useLocation()
  return new URLSearchParams(search).get("vertical") === "grocery"
}

/** Append the grocery vertical flag to an in-app path. */
export const withGrocery = (path, isGrocery) => {
  if (!isGrocery) return path
  return path.includes("?") ? `${path}&vertical=grocery` : `${path}?vertical=grocery`
}
