import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Check, UtensilsCrossed } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { adminAPI } from "@food/api"
import { foodImages } from "@food/constants/images"
import { normalizeImageUrl } from "@food/utils/common"
import OptimizedImage from "@food/components/OptimizedImage"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import apiClient from "@food/api"

const DEFAULT_CATEGORIES = [
  { id: "starter", name: "Starter", slug: "starter", image: null },
  { id: "indian", name: "Indian", slug: "indian", image: null },
  { id: "pizza", name: "Pizza", slug: "pizza", image: null },
  { id: "south-indian", name: "South Indian", slug: "south-indian", image: null },
  { id: "biryani", name: "Biryani", slug: "biryani", image: null },
  { id: "burgers", name: "Burgers", slug: "burgers", image: null },
  { id: "north-indian", name: "North Indian", slug: "north-indian", image: null },
  { id: "chinese", name: "Chinese", slug: "chinese", image: null },
  { id: "italian", name: "Italian", slug: "italian", image: null },
  { id: "sweets", name: "Sweets", slug: "sweets", image: null },
  { id: "momos", name: "Momos", slug: "momos", image: null },
  { id: "chaat", name: "Chaat", slug: "chaat", image: null },
]

export default function Preferences() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true)
        const zoneId = localStorage.getItem("userZoneId") || ""
        const response = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {})
        const cats =
          response?.data?.data?.categories ||
          response?.data?.categories ||
          []

        if (Array.isArray(cats) && cats.length > 0) {
          setCategories(
            cats.map((cat, idx) => ({
              id: String(cat?.id || cat?._id || cat?.slug || idx),
              name: cat?.name || "",
              slug: cat?.slug || String(cat?.name || "").toLowerCase().replace(/\s+/g, "-"),
              image: normalizeImageUrl(cat?.image || cat?.imageUrl) || foodImages[idx % foodImages.length],
            }))
          )
        } else {
          setCategories(DEFAULT_CATEGORIES)
        }
      } catch {
        setCategories(DEFAULT_CATEGORIES)
      } finally {
        setLoading(false)
      }
    }
    fetchCategories()
  }, [])

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSkip = () => {
    navigate("/food/user", { replace: true })
  }

  const handleDone = async () => {
    if (saving) return
    setSaving(true)
    try {
      const selectedSlugs = categories
        .filter((c) => selected.has(c.id))
        .map((c) => c.slug)

      if (selectedSlugs.length > 0) {
        await apiClient.patch(
          "/food/user/profile",
          { foodPreferences: selectedSlugs },
          { contextModule: "user" }
        )
      }
    } catch {
      // non-blocking — proceed regardless
    } finally {
      setSaving(false)
      navigate("/food/user", { replace: true })
    }
  }

  const handleBack = () => {
    // Go back to sign-in / previous page in history
    if (window.history.state?.idx > 0) {
      navigate(-1)
    } else {
      navigate("/food/user", { replace: true })
    }
  }

  return (
    <AnimatedPage className="min-h-[100dvh] bg-white dark:bg-[#0A0A0B] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-[#0A0A0B]/90 backdrop-blur-md border-b border-neutral-100 dark:border-neutral-800 px-4 py-4 flex items-center justify-between">
        <button
          onClick={handleBack}
          aria-label="Go back"
          className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-90 transition-all"
        >
          <ArrowLeft className="h-5 w-5 text-neutral-800 dark:text-neutral-100" />
        </button>

        <div className="text-center">
          <h1 className="text-base font-bold text-neutral-900 dark:text-white tracking-tight">
            Choose your favourites
          </h1>
        </div>

        <button
          onClick={handleSkip}
          className="text-sm font-semibold text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors px-1"
        >
          Skip
        </button>
      </div>

      {/* Personalise card */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start gap-3 bg-neutral-50 dark:bg-neutral-900 rounded-2xl px-4 py-3.5 border border-neutral-100 dark:border-neutral-800">
          <div className="shrink-0 mt-0.5 w-8 h-8 bg-white dark:bg-neutral-800 rounded-xl flex items-center justify-center shadow-sm border border-neutral-100 dark:border-neutral-700">
            <UtensilsCrossed className="h-4 w-4 text-[#EB590E]" />
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900 dark:text-white">Personalise your feed</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
              Pick what you enjoy · See better dishes, restaurants &amp; offers
            </p>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-5 mb-4">
          Food Categories
        </p>

        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(9)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse flex flex-col items-center gap-2"
              >
                <div className="w-full aspect-square rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
                <div className="h-2.5 w-16 bg-neutral-100 dark:bg-neutral-800 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {categories.map((cat, index) => {
              const isSelected = selected.has(cat.id)
              return (
                <motion.button
                  key={cat.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => toggle(cat.id)}
                  aria-pressed={isSelected}
                  className={[
                    "relative flex flex-col items-center gap-2 p-2 rounded-2xl border-2 transition-all active:scale-95",
                    isSelected
                      ? "border-[#EB590E] bg-[#EB590E]/5 dark:bg-[#EB590E]/10"
                      : "border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900",
                  ].join(" ")}
                >
                  {/* Selected badge */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        key="badge"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className="absolute top-2 right-2 w-5 h-5 bg-[#EB590E] rounded-full flex items-center justify-center z-10 shadow"
                      >
                        <Check className="h-3 w-3 text-white stroke-[3]" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Image */}
                  <div
                    className={[
                      "w-full aspect-square rounded-xl overflow-hidden",
                      isSelected ? "ring-2 ring-[#EB590E]/40" : "",
                    ].join(" ")}
                  >
                    {cat.image ? (
                      <OptimizedImage
                        src={cat.image}
                        alt={cat.name}
                        className="w-full h-full object-cover"
                        sizes="33vw"
                      />
                    ) : (
                      <div className="w-full h-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                        <UtensilsCrossed className="h-6 w-6 text-neutral-300 dark:text-neutral-600" />
                      </div>
                    )}
                  </div>

                  <span
                    className={[
                      "text-[11px] font-bold text-center leading-tight line-clamp-2",
                      isSelected
                        ? "text-[#EB590E]"
                        : "text-neutral-700 dark:text-neutral-300",
                    ].join(" ")}
                  >
                    {cat.name}
                  </span>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#0A0A0B]/95 backdrop-blur-md border-t border-neutral-100 dark:border-neutral-800 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button
          onClick={handleDone}
          disabled={saving}
          className="w-full h-14 bg-[#EB590E] hover:bg-[#d44e0c] text-white font-bold text-sm uppercase tracking-widest rounded-2xl transition-all active:scale-[0.98] shadow-[0_8px_20px_rgba(235,89,14,0.3)]"
        >
          {saving
            ? "Saving..."
            : selected.size === 0
              ? "Continue"
              : `Done · ${selected.size} selected`}
        </Button>
      </div>
    </AnimatedPage>
  )
}
