import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Trophy, TrendingUp, IndianRupee, Percent, Wallet, CalendarClock, Info } from "lucide-react"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"

const inr = (v, digits = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(v) || 0)

const FALLBACK_COLOR = "#475569"
const leagueColor = (league) => league?.color || FALLBACK_COLOR

function LeagueBadge({ league, size = "md" }) {
  if (!league) return null
  const pad = size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs"
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold text-white ${pad}`}
      style={{ backgroundColor: leagueColor(league) }}
    >
      <Trophy className={size === "lg" ? "w-4 h-4" : "w-3 h-3"} />
      {league.name}
    </span>
  )
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold text-gray-900">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-gray-500">{hint}</div> : null}
    </div>
  )
}

export default function CommissionLeaguePage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await restaurantAPI.getCommissionLeague({ historyMonths: 24 })
        if (cancelled) return
        if (res?.data?.success) setData(res.data.data)
        else setError(res?.data?.message || "Could not load commission data")
      } catch (e) {
        if (cancelled || e?.response?.status === 401) return
        const msg = e?.response?.data?.message || "Could not load commission data"
        setError(msg)
        toast.error(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const cur = data?.currentMonth
  const avg = data?.averagePerformance
  const mode = data?.commissionMode
  const isCustom = mode?.mode === "custom_admin"

  const appliedRate = useMemo(() => {
    if (!cur) return ""
    return cur.commissionType === "amount" ? `${inr(cur.commissionPercent)} / order` : `${cur.commissionPercent}%`
  }, [cur])

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Go back">
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Commission & Performance</h1>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="py-20 text-center text-gray-500 text-sm">Loading your performance…</div>
        ) : error && !data ? (
          <div className="py-20 text-center text-red-600 text-sm">{error}</div>
        ) : data ? (
          <>
            {/* Current league hero */}
            <div className="rounded-2xl p-5 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${leagueColor(cur.league)}, #111827)` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide opacity-80">{cur.label} · Current league</div>
                  <div className="mt-1 text-3xl font-extrabold flex items-center gap-2">
                    <Trophy className="w-7 h-7" />
                    {cur.league?.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs opacity-80">Commission</div>
                  <div className="text-3xl font-extrabold">{appliedRate}</div>
                </div>
              </div>

              <div className="mt-4 text-sm opacity-95">
                This month's sales: <span className="font-bold">{inr(cur.sales)}</span>
              </div>

              {cur.nextLeague ? (
                <div className="mt-3">
                  <div className="flex justify-between text-xs opacity-90 mb-1">
                    <span>{cur.league?.name}</span>
                    <span>{cur.nextLeague.name}</span>
                  </div>
                  <div className="h-3 rounded-full bg-white/25 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-all"
                      style={{ width: `${Math.max(2, Math.min(100, cur.progressPercent))}%` }}
                    />
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="font-bold">{inr(cur.remainingToNext)}</span> more sales to reach{" "}
                    <span className="font-bold">{cur.nextLeague.name}</span> ({Math.round(cur.progressPercent)}% there)
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm font-medium">You are in the top league this month 🎉</div>
              )}
            </div>

            {isCustom ? (
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <b>Custom Admin Commission</b> is active on your account
                  {mode.type === "amount" ? ` (${inr(mode.value)} per order)` : ` (${mode.value}%)`}. League tiers are shown for
                  your progress, but your commission stays fixed until Eqosy re-enables the automatic league commission.
                </span>
              </div>
            ) : (
              <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <b>Automatic League Commission.</b> The rate applies to the food subtotal of each new order based on your sales so
                  far this month. A higher league only affects later orders — earlier orders keep the rate they were placed with.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Stat icon={IndianRupee} label="Sales this month" value={inr(cur.sales)} hint={`${cur.orders} completed orders`} />
              <Stat icon={Percent} label="Commission rate" value={appliedRate} hint={isCustom ? "Custom admin rate" : `${cur.league?.name} league`} />
              <Stat icon={Wallet} label="Commission deducted" value={inr(cur.commissionDeducted, 2)} hint="This month" />
              <Stat
                icon={TrendingUp}
                label="To next league"
                value={cur.nextLeague ? inr(cur.remainingToNext) : "—"}
                hint={cur.nextLeague ? `Next: ${cur.nextLeague.name}` : "Top league"}
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <CalendarClock className="w-4 h-4" />
              League and monthly sales reset automatically on the 1st of every month (IST). Your history is always kept.
            </div>

            {/* League ladder */}
            <section className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-bold text-gray-900 mb-3">League ladder</h2>
              <div className="space-y-2">
                {data.slabs.map((s) => {
                  const active = s.key === cur.league?.key
                  return (
                    <div
                      key={s.key}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                        active ? "border-gray-900 bg-gray-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: leagueColor(s) }} />
                        <span className="font-semibold">{s.name}</span>
                        {active ? <span className="text-[10px] font-bold uppercase text-gray-600">You are here</span> : null}
                      </div>
                      <div className="text-gray-600 text-xs sm:text-sm text-right">
                        {s.to == null ? `Above ${inr(s.from)}` : s.from ? `${inr(s.from)} – ${inr(s.to)}` : `Up to ${inr(s.to)}`}
                        <span className="ml-2 font-bold text-gray-900">{s.commissionPercent}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Average performance */}
            <section className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Average performance league</h2>
                <LeagueBadge league={avg.league} />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Long-term view only — it never changes your commission rate.
                {avg.provisional ? " No month has been completed yet, so this is based on the current month." : ""}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[11px] text-gray-500">Lifetime sales</div>
                  <div className="font-bold text-gray-900">{inr(avg.lifetimeSales)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">Completed months</div>
                  <div className="font-bold text-gray-900">{avg.completedMonths}</div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">Avg / month</div>
                  <div className="font-bold text-gray-900">{inr(avg.averageMonthlySales)}</div>
                </div>
              </div>
            </section>

            {/* History */}
            <section className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-bold text-gray-900 mb-3">Monthly history</h2>
              {data.history.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 text-center">
                  No completed months yet. Your first month will appear here after the 1st.
                </div>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b">
                        <th className="py-2 px-1 font-medium">Month</th>
                        <th className="py-2 px-1 font-medium">League</th>
                        <th className="py-2 px-1 font-medium text-right">Sales</th>
                        <th className="py-2 px-1 font-medium text-right">Orders</th>
                        <th className="py-2 px-1 font-medium text-right">Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.map((h) => (
                        <tr key={h.monthKey} className="border-b last:border-0">
                          <td className="py-2 px-1 font-medium text-gray-900">{h.label}</td>
                          <td className="py-2 px-1">
                            <LeagueBadge league={{ name: h.leagueName, color: data.slabs.find((s) => s.key === h.leagueKey)?.color }} />
                          </td>
                          <td className="py-2 px-1 text-right">{inr(h.sales)}</td>
                          <td className="py-2 px-1 text-right">{h.orders}</td>
                          <td className="py-2 px-1 text-right">
                            {inr(h.commissionDeducted, 2)}
                            <div className="text-[11px] text-gray-500">{h.effectiveCommissionPercent}% avg</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
      <BottomNavOrders />
    </div>
  )
}
