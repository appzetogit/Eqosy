import { useEffect, useState, useCallback } from "react"
import { ArrowLeft, Loader2, X, ChevronLeft, ChevronRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"

const inr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const toISO = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`
}

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
]

function presetRange(id) {
  const now = new Date()
  if (id === "today") return { from: toISO(now), to: toISO(now) }
  if (id === "7" || id === "30") {
    const s = new Date(now)
    s.setDate(s.getDate() - (Number(id) - 1))
    return { from: toISO(s), to: toISO(now) }
  }
  return { from: "", to: "" }
}

const PAGE_SIZE = 20

export default function SalesReport() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [preset, setPreset] = useState("30")
  const [range, setRange] = useState(presetRange("30"))
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ summary: null, orders: [], total: 0 })
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await restaurantAPI.getSalesReport({
        from: range.from || undefined,
        to: range.to || undefined,
        page,
        limit: PAGE_SIZE,
      })
      const d = res?.data?.data
      setData({ summary: d?.summary || null, orders: d?.orders || [], total: d?.total || 0 })
    } catch (e) {
      toast.error("Sales report load nahi ho paya")
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, page])

  useEffect(() => {
    load()
  }, [load])

  const choosePreset = (id) => {
    setPreset(id)
    setPage(1)
    if (id !== "custom") setRange(presetRange(id))
  }

  const s = data.summary
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  const cards = [
    { label: "Total Orders", value: s ? s.totalOrders : 0 },
    { label: "Total Sales", value: inr(s?.totalSales) },
    { label: "Admin Commission", value: inr(s?.totalCommission), tone: "text-red-600" },
    { label: "Your Earning", value: inr(s?.totalEarning), tone: "text-green-600" },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="sticky top-0 z-20 bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-200">
        <button onClick={goBack || (() => navigate(-1))} className="p-1" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Sales &amp; Earnings</h1>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-3xl mx-auto">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => choosePreset(p.id)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm border ${
                preset === p.id ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) => {
                setPage(1)
                setRange((r) => ({ ...r, from: e.target.value }))
              }}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            />
            <span className="text-gray-500 text-sm">to</span>
            <input
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => {
                setPage(1)
                setRange((r) => ({ ...r, to: e.target.value }))
              }}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className={`text-lg font-semibold mt-1 ${c.tone || "text-gray-900"}`}>{c.value}</p>
            </div>
          ))}
        </div>
        {s && (
          <p className="text-xs text-gray-500">
            Settled: {inr(s.settledEarning)} · Pending: {inr(s.pendingEarning)} (sirf delivered orders count hote hain)
          </p>
        )}

        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : data.orders.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">Is period me koi order nahi mila</p>
          ) : (
            data.orders.map((o) => (
              <div key={o.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">#{o.orderId}</p>
                  <p className="text-xs text-gray-500">{new Date(o.createdAt).toLocaleString("en-IN")}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Sale {inr(o.sale)} · Commission {inr(o.commission)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-green-600">{inr(o.earning)}</p>
                  <button onClick={() => setSelected(o)} className="text-xs text-blue-600 underline mt-1">
                    View
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {data.total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-4">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-2 disabled:opacity-30">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-2 disabled:opacity-30"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Order #{selected.orderId}</h2>
              <button onClick={() => setSelected(null)} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {new Date(selected.createdAt).toLocaleString("en-IN")} · {String(selected.paymentMethod).toUpperCase()} ·{" "}
              {selected.orderStatus}
            </p>
            <div className="space-y-1.5 mb-3">
              {selected.items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>
                    {it.quantity} × {it.name}
                  </span>
                  <span>{inr(it.price * it.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 pt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Order sale</span>
                <span>{inr(selected.sale)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Admin commission</span>
                <span>- {inr(selected.commission)}</span>
              </div>
              <div className="flex justify-between font-semibold text-green-600">
                <span>Your earning</span>
                <span>{inr(selected.earning)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Payout status</span>
                <span>{selected.settled ? "Settled" : "Pending"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
