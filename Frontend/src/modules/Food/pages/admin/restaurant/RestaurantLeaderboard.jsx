import { useEffect, useMemo, useState } from "react"
import { Trophy, Loader2, Download, Search, Medal } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { exportReportsToCSV } from "@food/components/admin/reports/reportsExportUtils"

const inr = (v, d = 0) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: d, maximumFractionDigits: d }).format(
    Number(v) || 0,
  )

const RANGES = [
  { value: "today", label: "Today" },
  { value: "day", label: "Specific day" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "current_month", label: "This month" },
  { value: "previous_month", label: "Last month" },
  { value: "month", label: "Specific month" },
  { value: "custom", label: "Custom range" },
  { value: "all", label: "All time" },
]

const isReady = (f) =>
  f.range === "month" ? Boolean(f.month) : f.range === "day" ? Boolean(f.date) : f.range === "custom" ? Boolean(f.from && f.to) : true

const SORTS = [
  { key: "score", label: "Performance score" },
  { key: "totalSales", label: "Sales" },
  { key: "completedOrders", label: "Completed orders" },
  { key: "completionRate", label: "Completion rate" },
  { key: "rating", label: "Rating" },
  { key: "totalCommission", label: "Commission" },
]

const inputCls = "border rounded-lg px-3 py-2 text-sm bg-white"

function Kpi({ label, value }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  )
}

function RankBadge({ rank }) {
  const colors = { 1: "#d4a017", 2: "#94a3b8", 3: "#b87333" }
  if (rank <= 3) {
    return (
      <span className="inline-flex items-center gap-1 font-bold" style={{ color: colors[rank] }}>
        <Medal className="w-4 h-4" />
        {rank}
      </span>
    )
  }
  return <span className="text-gray-600 font-medium">{rank}</span>
}

export default function RestaurantLeaderboard() {
  const [filter, setFilter] = useState({ range: "this_week" })
  const [zoneId, setZoneId] = useState("")
  const [zones, setZones] = useState([])
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState("score")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const set = (patch) => setFilter((f) => ({ ...f, ...patch }))

  useEffect(() => {
    ;(async () => {
      try {
        const res = await adminAPI.getZones({ limit: 1000 })
        const list = res?.data?.data?.zones || []
        setZones(list.map((z) => ({ id: z._id || z.id, name: z.name || z.zoneName || "Zone" })))
      } catch {
        setZones([])
      }
    })()
  }, [])

  useEffect(() => {
    if (!isReady(filter)) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await adminAPI.getRestaurantLeaderboard({ ...filter, zoneId: zoneId || undefined })
        if (!cancelled) setData(res?.data?.data || null)
      } catch (e) {
        if (!cancelled) toast.error(e?.response?.data?.message || "Could not load restaurant performance")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filter, zoneId])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (data?.restaurants || []).filter((r) => !q || r.name.toLowerCase().includes(q))
    // Rank always reflects the overall score; the sort only changes the display order.
    return [...list].sort((a, b) => (b[sortBy] - a[sortBy]) || (b.score - a.score))
  }, [data, search, sortBy])

  const handleExport = () => {
    if (!rows.length) return toast.error("No data to export")
    exportReportsToCSV(
      rows,
      [
        { key: "rank", label: "Rank" },
        { key: "name", label: "Restaurant" },
        { key: "zoneName", label: "Zone" },
        { key: "totalOrders", label: "Total Orders" },
        { key: "completedOrders", label: "Completed" },
        { key: "cancelledOrders", label: "Cancelled" },
        { key: "completionRate", label: "Completion Rate %" },
        { key: "totalSales", label: "Sales" },
        { key: "totalCommission", label: "Commission" },
        { key: "aov", label: "AOV" },
        { key: "rating", label: "Rating" },
        { key: "score", label: "Performance Score" },
      ],
      "restaurant_performance",
    )
  }

  const w = data?.weights
  const t = data?.totals

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="bg-white rounded-xl border p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Restaurant Performance</h1>
            <p className="text-sm text-slate-500">Compare restaurants by day, week or month to find top performers to reward.</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-2">
          <select value={filter.range} onChange={(e) => set({ range: e.target.value })} className={inputCls}>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {filter.range === "day" && <input type="date" value={filter.date || ""} onChange={(e) => set({ date: e.target.value })} className={inputCls} />}
          {filter.range === "month" && <input type="month" value={filter.month || ""} onChange={(e) => set({ month: e.target.value })} className={inputCls} />}
          {filter.range === "custom" && (
            <>
              <input type="date" value={filter.from || ""} onChange={(e) => set({ from: e.target.value })} className={inputCls} />
              <span className="text-gray-500 text-sm">to</span>
              <input type="date" value={filter.to || ""} onChange={(e) => set({ to: e.target.value })} className={inputCls} />
            </>
          )}
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputCls}>
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={inputCls}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search restaurant" className={`${inputCls} pl-9`} />
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
          <button onClick={handleExport} className="ml-auto inline-flex items-center gap-1.5 border rounded-lg px-3 py-2 text-sm bg-white hover:bg-slate-50">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {data && (
          <div className="text-xs text-gray-500">
            Showing: {data.filter.label} (by delivery date; undelivered orders by order date)
          </div>
        )}

        {t && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Active restaurants" value={t.restaurants} />
            <Kpi label="Total orders" value={t.totalOrders} />
            <Kpi label="Completed orders" value={t.completedOrders} />
            <Kpi label="Total sales" value={inr(t.totalSales)} />
            <Kpi label="Eqosy commission" value={inr(t.totalCommission, 2)} />
          </div>
        )}

        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                <th className="p-3 font-medium">Rank</th>
                <th className="p-3 font-medium">Restaurant</th>
                <th className="p-3 font-medium">Zone</th>
                <th className="p-3 font-medium text-right">Orders</th>
                <th className="p-3 font-medium text-right">Completed</th>
                <th className="p-3 font-medium text-right">Cancelled</th>
                <th className="p-3 font-medium text-right">Completion</th>
                <th className="p-3 font-medium text-right">Sales</th>
                <th className="p-3 font-medium text-right">Commission</th>
                <th className="p-3 font-medium text-right">Rating</th>
                <th className="p-3 font-medium text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.restaurantId} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="p-3"><RankBadge rank={r.rank} /></td>
                  <td className="p-3 font-semibold">{r.name}</td>
                  <td className="p-3 text-gray-600">{r.zoneName || "-"}</td>
                  <td className="p-3 text-right">{r.totalOrders}</td>
                  <td className="p-3 text-right">{r.completedOrders}</td>
                  <td className="p-3 text-right">{r.cancelledOrders}</td>
                  <td className="p-3 text-right">{r.completionRate}%</td>
                  <td className="p-3 text-right font-medium">{inr(r.totalSales)}</td>
                  <td className="p-3 text-right">{inr(r.totalCommission, 2)}</td>
                  <td className="p-3 text-right">{r.rating ? `★ ${r.rating}` : "-"}</td>
                  <td className="p-3 text-right">
                    <span className="inline-block rounded-full bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5">{r.score}</span>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-gray-500">
                    No restaurant activity in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {w && (
          <div className="text-xs text-gray-500">
            Score (out of 100) = sales {w.sales} + completed orders {w.orders} + completion rate {w.completionRate} + rating {w.rating}. Sales and
            orders are measured relative to the best restaurant in the selected period.
          </div>
        )}
      </div>
    </div>
  )
}
