import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Trophy, Loader2 } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { DateFilterBar, isDateFilterReady } from "./CommissionLeague"

const inr = (v, d = 0) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: d, maximumFractionDigits: d }).format(
    Number(v) || 0,
  )

const SOURCE_LABEL = { league: "League", custom_admin: "Custom admin", default: "Standard", legacy: "Before league system" }

function Badge({ league }) {
  if (!league) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: league.color || "#475569" }}
    >
      <Trophy className="w-3 h-3" />
      {league.name}
    </span>
  )
}

function Kpi({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
      {sub ? <div className="text-xs text-gray-500 mt-0.5">{sub}</div> : null}
    </div>
  )
}

export default function RestaurantPerformance() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [filter, setFilter] = useState({ range: "current_month" })
  const [zones, setZones] = useState([])
  const [zoneId, setZoneId] = useState("")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

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
    if (!isDateFilterReady(filter)) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await adminAPI.getRestaurantPerformance(id, { ...filter, zoneId })
        if (!cancelled) setData(res?.data?.data || null)
      } catch (e) {
        if (!cancelled) toast.error(e?.response?.data?.message || "Could not load performance")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, filter, zoneId])

  const s = data?.summary
  const cm = data?.currentMonth
  const mode = data?.commissionMode

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-gray-50 min-h-screen">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/admin/food/restaurants/commission-league")} className="p-2 rounded-lg hover:bg-gray-200" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{data?.restaurant?.name || "Restaurant performance"}</h1>
          <p className="text-sm text-gray-500">
            {data?.restaurant?.ownerName ? `${data.restaurant.ownerName} · ` : ""}Sales & commission performance
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateFilterBar value={filter} onChange={setFilter} />
        <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : null}
      </div>

      {data ? (
        <>
          <div className="text-xs text-gray-500">Period: {data.filter.label}</div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Total orders" value={s.totalOrders} />
            <Kpi label="Completed orders" value={s.completedOrders} />
            <Kpi label="Cancelled orders" value={s.cancelledOrders} />
            <Kpi label="Average order value" value={inr(s.aov)} sub="Completed orders" />
            <Kpi label="Restaurant sales" value={inr(s.totalSales)} sub="Food subtotal, delivered orders" />
            <Kpi label="Eqosy commission earned" value={inr(s.totalCommission, 2)} />
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-500 font-medium">Current league (this month)</div>
              <div className="mt-1.5">
                <Badge league={cm.league} />
              </div>
              <div className="text-xs text-gray-500 mt-1">{inr(cm.sales)} sales</div>
            </div>
            <Kpi
              label="Current commission"
              value={cm.commissionType === "amount" ? `${inr(cm.commissionPercent)} flat` : `${cm.commissionPercent}%`}
              sub={mode.label}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <section className="bg-white rounded-xl border p-4">
              <h2 className="font-bold mb-2">Average performance league</h2>
              <div className="flex items-center gap-3 mb-3">
                <Badge league={data.averagePerformance.league} />
                <span className="text-xs text-gray-500">Display only — never changes commission</span>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-500">Lifetime sales</dt>
                  <dd className="font-bold">{inr(data.averagePerformance.lifetimeSales)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Completed months</dt>
                  <dd className="font-bold">{data.averagePerformance.completedMonths}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Avg / month</dt>
                  <dd className="font-bold">{inr(data.averagePerformance.averageMonthlySales)}</dd>
                </div>
              </dl>
            </section>

            <section className="bg-white rounded-xl border p-4">
              <h2 className="font-bold mb-2">Zone split ({data.filter.label})</h2>
              {data.byZone.length === 0 ? (
                <div className="text-sm text-gray-500">No orders in this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 text-left border-b">
                      <th className="py-1.5 font-medium">Zone</th>
                      <th className="py-1.5 font-medium text-right">Orders</th>
                      <th className="py-1.5 font-medium text-right">Sales</th>
                      <th className="py-1.5 font-medium text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byZone.map((z) => (
                      <tr key={z.zoneId || "none"} className="border-b last:border-0">
                        <td className="py-1.5">{z.zoneName}</td>
                        <td className="py-1.5 text-right">{z.totalOrders}</td>
                        <td className="py-1.5 text-right">{inr(z.totalSales)}</td>
                        <td className="py-1.5 text-right">{inr(z.totalCommission, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="bg-white rounded-xl border overflow-x-auto">
            <div className="px-4 py-3 font-bold border-b">Monthly league history</div>
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                  <th className="p-3 font-medium">Month</th>
                  <th className="p-3 font-medium">League</th>
                  <th className="p-3 font-medium text-right">Sales</th>
                  <th className="p-3 font-medium text-right">Orders</th>
                  <th className="p-3 font-medium text-right">Commission</th>
                  <th className="p-3 font-medium text-right">Effective %</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlyHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      No completed months yet.
                    </td>
                  </tr>
                ) : (
                  data.monthlyHistory.map((h) => (
                    <tr key={h.monthKey} className="border-b last:border-0">
                      <td className="p-3 font-medium">{h.label}</td>
                      <td className="p-3">
                        <Badge league={{ name: h.leagueName }} />
                      </td>
                      <td className="p-3 text-right">{inr(h.sales)}</td>
                      <td className="p-3 text-right">{h.orders}</td>
                      <td className="p-3 text-right">{inr(h.commissionDeducted, 2)}</td>
                      <td className="p-3 text-right">{h.effectiveCommissionPercent}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="bg-white rounded-xl border overflow-x-auto">
            <div className="px-4 py-3 border-b">
              <div className="font-bold">Historical commission records</div>
              <div className="text-xs text-gray-500">The rate frozen on each order when it was placed, grouped for the selected period.</div>
            </div>
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                  <th className="p-3 font-medium">Month</th>
                  <th className="p-3 font-medium">Applied as</th>
                  <th className="p-3 font-medium">League at order time</th>
                  <th className="p-3 font-medium text-right">Rate</th>
                  <th className="p-3 font-medium text-right">Orders</th>
                  <th className="p-3 font-medium text-right">Sales</th>
                  <th className="p-3 font-medium text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {data.commissionRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-gray-500">
                      No delivered orders in this period.
                    </td>
                  </tr>
                ) : (
                  data.commissionRecords.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-3 font-medium">{r.monthLabel}</td>
                      <td className="p-3">{SOURCE_LABEL[r.source] || r.source}</td>
                      <td className="p-3">{r.league || "—"}</td>
                      <td className="p-3 text-right">{r.ratePercent == null ? "—" : `${r.ratePercent}%`}</td>
                      <td className="p-3 text-right">{r.orders}</td>
                      <td className="p-3 text-right">{inr(r.sales)}</td>
                      <td className="p-3 text-right">{inr(r.commission, 2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  )
}
