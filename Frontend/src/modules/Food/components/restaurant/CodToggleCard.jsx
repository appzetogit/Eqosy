import { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@food/components/ui/switch"
import { restaurantAPI } from "@food/api"

/**
 * Restaurant-level "Accept Cash on Delivery (COD)" toggle.
 * OFF by default. Turning it ON needs explicit confirmation (risk warning).
 * Text is plain so the app's page translator renders it in the selected language.
 */
export default function CodToggleCard({ className = "" }) {
  const [codEnabled, setCodEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    let cancelled = false
    restaurantAPI
      .getCurrentRestaurant()
      .then((response) => {
        const restaurant =
          response?.data?.data?.restaurant || response?.data?.restaurant || null
        if (!cancelled) setCodEnabled(restaurant?.codEnabled === true)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async (value) => {
    if (saving) return
    setSaving(true)
    try {
      await restaurantAPI.updateCodEnabled(value)
      setCodEnabled(value)
      toast.success(value ? "Cash on Delivery enabled" : "Cash on Delivery disabled")
    } catch {
      toast.error("Could not update COD setting. Please try again.")
    } finally {
      setSaving(false)
      setShowWarning(false)
    }
  }

  const handleToggle = (checked) => {
    if (saving) return
    if (checked) {
      setShowWarning(true)
      return
    }
    void save(false)
  }

  return (
    <>
      <div className={`bg-white border border-gray-200 rounded-xl px-4 py-3 ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">Accept Cash on Delivery (COD)</p>
            <p className="text-xs text-gray-500">
              {codEnabled ? "Customers can pay cash on delivery" : "COD orders are not accepted"}
            </p>
          </div>
          <Switch
            checked={codEnabled}
            onCheckedChange={handleToggle}
            disabled={!loaded || saving}
            className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
          />
        </div>
        {codEnabled && (
          <p className="mt-2 text-xs text-orange-700 flex items-start gap-1">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            COD is on at your own risk. It can lead to order cancellations, customer refusals and returns.
          </p>
        )}
      </div>

      {showWarning && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !saving && setShowWarning(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-orange-100">
                <AlertCircle className="w-10 h-10 text-orange-600" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Warning – COD Orders</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              Accepting Cash on Delivery (COD) orders may result in order cancellations, customer refusals and order returns, which could cause financial losses to your restaurant. Do you want to proceed?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowWarning(false)}
                disabled={saving}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void save(true)}
                disabled={saving}
                className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                Yes, Enable COD
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
