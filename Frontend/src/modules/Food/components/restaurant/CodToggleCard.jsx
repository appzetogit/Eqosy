import { useEffect, useState } from "react"
import { Banknote, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"

const DEFAULT_COD_MAX_ORDER_AMOUNT = 300

const readMax = (restaurant) => {
  const n = Number(restaurant?.codMaxOrderAmount)
  return restaurant?.codMaxOrderAmount == null || !Number.isFinite(n) || n < 0
    ? DEFAULT_COD_MAX_ORDER_AMOUNT
    : n
}

/**
 * Restaurant-level "Maximum COD order amount".
 * COD orders up to this amount reach the restaurant; above it the customer must pay online. 0 = no COD orders.
 * Text is plain so the app's page translator renders it in the selected language.
 */
export default function CodToggleCard({ className = "" }) {
  const [savedMax, setSavedMax] = useState(DEFAULT_COD_MAX_ORDER_AMOUNT)
  const [value, setValue] = useState(String(DEFAULT_COD_MAX_ORDER_AMOUNT))
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    restaurantAPI
      .getCurrentRestaurant()
      .then((response) => {
        const restaurant =
          response?.data?.data?.restaurant || response?.data?.restaurant || null
        if (cancelled) return
        const max = readMax(restaurant)
        setSavedMax(max)
        setValue(String(max))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const parsed = value.trim() === "" ? NaN : Number(value)
  const isValid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 100000
  const isDirty = isValid && parsed !== savedMax

  const save = async () => {
    if (saving || !isValid || !isDirty) return
    setSaving(true)
    try {
      await restaurantAPI.updateCodMaxOrderAmount(parsed)
      setSavedMax(parsed)
      toast.success(
        parsed === 0
          ? "COD turned off. You will not get Cash on Delivery orders."
          : `Saved. You will get COD orders up to ₹${parsed}.`,
      )
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save the COD limit. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-xl px-4 py-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
          <Banknote className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">Maximum COD order amount</p>
          <p className="text-xs text-gray-500">
            {savedMax === 0
              ? "No Cash on Delivery orders will come to you"
              : `COD orders up to ₹${savedMax} only. Above this, customers pay online.`}
          </p>
        </div>
      </div>

      <form
        className="mt-3 flex items-stretch gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div
          className={`flex-1 flex items-center rounded-lg border-2 bg-gray-50 px-3 focus-within:bg-white ${
            value !== "" && !isValid ? "border-red-400" : "border-gray-200 focus-within:border-gray-900"
          }`}
        >
          <span className="text-sm font-bold text-gray-500 mr-1">₹</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Maximum COD order amount in rupees"
            value={value}
            disabled={!loaded || saving}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full bg-transparent py-2 text-base font-bold text-gray-900 outline-none"
            placeholder="300"
          />
        </div>
        <button
          type="submit"
          disabled={!loaded || saving || !isDirty}
          className="px-4 rounded-lg bg-gray-900 text-white text-sm font-bold disabled:bg-gray-200 disabled:text-gray-500 flex items-center justify-center min-w-[72px]"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </button>
      </form>
      <p className="mt-1.5 text-[11px] text-gray-400">
        {value !== "" && !isValid ? "Enter an amount from ₹0 to ₹1,00,000" : "Set ₹0 to stop all COD orders."}
      </p>
    </div>
  )
}
