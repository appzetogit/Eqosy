import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"

const PRESET_MESSAGES = [
  "Due to heavy rain we are not taking orders in your area right now. Please try again a little later.",
  "Bhaari barish ki wajah se abhi aapke area mein orders nahi liye ja rahe hain. Kripya thodi der baad try karein.",
  "Orders are temporarily paused in your area due to bad weather. We will be back soon.",
]

const getList = (res) => {
  const d = res?.data?.data
  return d?.zones || d?.data?.zones || (Array.isArray(d) ? d : [])
}

export default function ZoneOrderControl() {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [messages, setMessages] = useState({})

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getZones({ limit: 500 })
      const list = getList(res)
      setZones(list)
      setMessages((prev) => {
        const next = { ...prev }
        list.forEach((z) => {
          const id = String(z._id)
          if (next[id] === undefined) next[id] = z.orderingPausedMessage || PRESET_MESSAGES[0]
        })
        return next
      })
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load zones")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const apply = async (zone, paused) => {
    const id = String(zone._id)
    const message = String(messages[id] || "").trim()
    if (paused && !message) {
      toast.error("Please enter the message customers should see")
      return
    }
    try {
      setSavingId(id)
      const res = await adminAPI.setZoneOrdering(id, { paused, message })
      const updated = res?.data?.data?.zone
      setZones((prev) => prev.map((z) => (String(z._id) === id ? { ...z, ...updated } : z)))
      toast.success(paused ? `Orders paused in ${zone.name}` : `Orders resumed in ${zone.name}`)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update zone")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900">Zone Order Control</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        Pause "Place Order" for a whole zone (for example during heavy rain). Customers in that zone see
        your message when they tap the button. The message is shown to customers in their selected language.
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Loading zones...</p>
      ) : zones.length === 0 ? (
        <p className="text-sm text-slate-500">No zones found. Create a zone under Zone Setup first.</p>
      ) : (
        <div className="space-y-4">
          {zones.map((zone) => {
            const id = String(zone._id)
            const paused = Boolean(zone.orderingPaused)
            const busy = savingId === id
            return (
              <div key={id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{zone.name || zone.zoneName}</p>
                    <p className="text-xs text-slate-500">{zone.serviceLocation || zone.country}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      paused ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {paused ? "Orders paused" : "Taking orders"}
                  </span>
                </div>

                <label className="mt-3 block text-xs font-semibold text-slate-600">Message for customers</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={messages[id] ?? ""}
                  onChange={(e) => setMessages((m) => ({ ...m, [id]: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRESET_MESSAGES.map((text, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setMessages((m) => ({ ...m, [id]: text }))}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Template {i + 1}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  {paused ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => apply(zone, false)}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {busy ? "Saving..." : "Resume orders"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => apply(zone, true)}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                      >
                        Update message
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => apply(zone, true)}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {busy ? "Saving..." : "Pause orders in this zone"}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
