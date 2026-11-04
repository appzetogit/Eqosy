import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Trophy, Search, Plus, Trash2, Save, Loader2, X, BarChart3, ScrollText, Settings2, Store } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const inr = (v, d = 0) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: d, maximumFractionDigits: d }).format(
    Number(v) || 0,
  )

const apiMsg = (e, fallback) => e?.response?.data?.message || fallback

function LeagueBadge({ league }) {
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

const TABS = [
  { id: "restaurants", label: "Restaurants", icon: Store },
  { id: "zones", label: "Zone Analytics", icon: BarChart3 },
  { id: "settings", label: "League Settings", icon: Settings2 },
  { id: "audit", label: "Change Log", icon: ScrollText },
]

/* ----------------------------- Restaurants tab ----------------------------- */

function OverrideDialog({ row, onClose, onSaved }) {
  const [mode, setMode] = useState(row.commissionMode === "custom_admin" ? "custom" : "league")
  const [type, setType] = useState(row.commissionMode === "custom_admin" ? row.appliedCommission.type : "percentage")
  const [value, setValue] = useState(row.commissionMode === "custom_admin" ? String(row.appliedCommission.value) : "")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    try {
      setSaving(true)
      await adminAPI.setRestaurantCommissionMode(row.restaurantId, { mode, type, value: Number(value), note })
      toast.success(mode === "league" ? "Automatic league commission enabled" : "Custom commission saved")
      onSaved()
    } catch (e) {
      toast.error(apiMsg(e, "Could not save commission"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">Commission for {row.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {row.league.name} league this month · {inr(row.monthlySales)} sales
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {[
            { id: "league", title: "Automatic League Commission", desc: "Rate follows the restaurant's monthly sales slab." },
            { id: "custom", title: "Custom Admin Commission", desc: "Fixed rate. League rules are skipped for this restaurant." },
          ].map((o) => (
            <label
              key={o.id}
              className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${mode === o.id ? "border-gray-900 bg-gray-50" : "border-gray-200"}`}
            >
              <input type="radio" name="mode" checked={mode === o.id} onChange={() => setMode(o.id)} className="mt-1" />
              <span>
                <span className="block text-sm font-semibold">{o.title}</span>
                <span className="block text-xs text-gray-500">{o.desc}</span>
              </span>
            </label>
          ))}
        </div>

        {mode === "custom" ? (
          <div className="mt-3 flex gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
              <option value="percentage">Percentage (%)</option>
              <option value="amount">Flat ₹ per order</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "percentage" ? "e.g. 6" : "e.g. 30"}
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        ) : null}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Reason for change (saved in the change log)"
          className="mt-3 w-full border rounded-lg px-3 py-2 text-sm"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || (mode === "custom" && (value === "" || Number(value) < 0))}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function RestaurantsTab({ zones }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [league, setLeague] = useState("")
  const [mode, setMode] = useState("")
  const [zoneId, setZoneId] = useState("")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getCommissionLeagueRestaurants({ league, mode, zoneId, search: query, page, limit: 25 })
      setData(res?.data?.data || null)
    } catch (e) {
      toast.error(apiMsg(e, "Could not load restaurants"))
    } finally {
      setLoading(false)
    }
  }, [league, mode, zoneId, query, page])

  useEffect(() => {
    load()
  }, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <div className="space-y-4">
      {data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => {
              setLeague("")
              setPage(1)
            }}
            className={`text-left rounded-xl border p-3 bg-white ${league === "" ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200"}`}
          >
            <div className="text-xs text-gray-500">All restaurants</div>
            <div className="text-2xl font-bold">{data.totalRestaurants}</div>
          </button>
          {data.counts.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                setLeague(league === c.key ? "" : c.key)
                setPage(1)
              }}
              className={`text-left rounded-xl border p-3 bg-white ${league === c.key ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200"}`}
            >
              <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: c.color || "#475569" }}>
                <Trophy className="w-3.5 h-3.5" />
                {c.name}
              </div>
              <div className="text-2xl font-bold">{c.count}</div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search restaurant or owner"
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-white"
          />
        </div>
        <select
          value={zoneId}
          onChange={(e) => {
            setZoneId(e.target.value)
            setPage(1)
          }}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value)
            setPage(1)
          }}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All commission types</option>
          <option value="league">Automatic League</option>
          <option value="custom_admin">Custom Admin</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
              <th className="p-3 font-medium">Restaurant</th>
              <th className="p-3 font-medium">Zone</th>
              <th className="p-3 font-medium text-right">Month sales</th>
              <th className="p-3 font-medium">League</th>
              <th className="p-3 font-medium">Commission</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            ) : !data || data.restaurants.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-gray-500">
                  No restaurants match these filters.
                </td>
              </tr>
            ) : (
              data.restaurants.map((r) => (
                <tr key={r.restaurantId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-3">
                    <div className="font-semibold text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.ownerName}</div>
                  </td>
                  <td className="p-3 text-gray-600">{r.zoneName || "—"}</td>
                  <td className="p-3 text-right">
                    <div className="font-medium">{inr(r.monthlySales)}</div>
                    <div className="text-xs text-gray-500">{r.monthlyOrders} orders</div>
                  </td>
                  <td className="p-3">
                    <LeagueBadge league={r.league} />
                    {r.nextLeague ? <div className="text-[11px] text-gray-500 mt-1">{inr(r.remainingToNext)} to {r.nextLeague.name}</div> : null}
                  </td>
                  <td className="p-3 font-semibold">
                    {r.appliedCommission.type === "amount" ? `${inr(r.appliedCommission.value)} flat` : `${r.appliedCommission.value}%`}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        r.commissionMode === "custom_admin" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {r.commissionModeLabel}
                    </span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => navigate(`/admin/food/restaurants/commission-league/${r.restaurantId}`)}
                      className="px-2.5 py-1.5 text-xs rounded-lg border hover:bg-white mr-2"
                    >
                      Performance
                    </button>
                    <button onClick={() => setEditing(r)} className="px-2.5 py-1.5 text-xs rounded-lg bg-gray-900 text-white">
                      Commission
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {page} of {pages} · {data.total} restaurants
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 border rounded-lg bg-white disabled:opacity-40">
              Prev
            </button>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 border rounded-lg bg-white disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <OverrideDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------ Settings tab ------------------------------- */

function SettingsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [fallback, setFallback] = useState("10")
  const [slabs, setSlabs] = useState([])
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getCommissionLeagueSettings()
      const d = res?.data?.data
      setEnabled(d?.enabled !== false)
      setFallback(String(d?.fallbackPercent ?? 10))
      setSlabs((d?.slabs || []).map((s) => ({ ...s, maxSales: s.maxSales ?? "" })))
    } catch (e) {
      toast.error(apiMsg(e, "Could not load settings"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const update = (i, patch) => setSlabs((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const addSlab = () =>
    setSlabs((arr) => {
      // New slab goes before the open-ended top slab, which keeps the "last slab is open-ended" rule.
      const copy = [...arr]
      const prevMax = copy.length > 1 ? Number(copy[copy.length - 2].maxSales) || 0 : 0
      copy.splice(copy.length - 1, 0, { key: "", name: "New League", maxSales: prevMax + 10000, commissionPercent: 5, color: "#0ea5e9" })
      return copy
    })

  const removeSlab = (i) => setSlabs((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr))

  const problems = useMemo(() => {
    const out = []
    let prev = 0
    slabs.forEach((s, i) => {
      if (!String(s.name).trim()) out.push(`Slab ${i + 1}: name required`)
      const pct = Number(s.commissionPercent)
      if (!(pct >= 0 && pct <= 100)) out.push(`Slab ${i + 1}: commission must be 0–100`)
      if (i < slabs.length - 1) {
        const m = Number(s.maxSales)
        if (s.maxSales === "" || !Number.isFinite(m)) out.push(`Slab ${i + 1}: upper limit required`)
        else if (m <= prev) out.push(`Slab ${i + 1}: limit must be above the previous slab`)
        else prev = m
      }
    })
    return out
  }, [slabs])

  const save = async () => {
    try {
      setSaving(true)
      await adminAPI.updateCommissionLeagueSettings({
        enabled,
        fallbackPercent: Number(fallback),
        note,
        slabs: slabs.map((s, i) => ({
          key: s.key,
          name: s.name,
          commissionPercent: Number(s.commissionPercent),
          color: s.color,
          maxSales: i === slabs.length - 1 ? null : Number(s.maxSales),
        })),
      })
      toast.success("League settings saved. New orders use them immediately.")
      setNote("")
      load()
    } catch (e) {
      toast.error(apiMsg(e, "Could not save settings"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-10 text-center text-gray-500">Loading…</div>

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4" />
          Automatic league commission enabled
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Flat commission when league system is off:</span>
          <input
            type="number"
            min="0"
            max="100"
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            className="w-20 border rounded-lg px-2 py-1.5"
          />
          <span>%</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
              <th className="p-3 font-medium">League name</th>
              <th className="p-3 font-medium">Monthly sales up to (₹)</th>
              <th className="p-3 font-medium">Commission %</th>
              <th className="p-3 font-medium">Colour</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {slabs.map((s, i) => {
              const last = i === slabs.length - 1
              const from = i === 0 ? 0 : Number(slabs[i - 1].maxSales) || 0
              return (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2">
                    <input value={s.name} onChange={(e) => update(i, { name: e.target.value })} className="w-full border rounded-lg px-2 py-1.5" />
                  </td>
                  <td className="p-2">
                    {last ? (
                      <span className="text-gray-600">Above {inr(from)} (no upper limit)</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        value={s.maxSales}
                        onChange={(e) => update(i, { maxSales: e.target.value })}
                        className="w-36 border rounded-lg px-2 py-1.5"
                      />
                    )}
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={s.commissionPercent}
                      onChange={(e) => update(i, { commissionPercent: e.target.value })}
                      className="w-24 border rounded-lg px-2 py-1.5"
                    />
                  </td>
                  <td className="p-2">
                    <input type="color" value={s.color || "#475569"} onChange={(e) => update(i, { color: e.target.value })} className="w-10 h-8 p-0 border rounded" />
                  </td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => removeSlab(i)}
                      disabled={slabs.length <= 1}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-30"
                      aria-label="Remove league"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={addSlab} disabled={slabs.length >= 10} className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg bg-white text-sm disabled:opacity-40">
          <Plus className="w-4 h-4" /> Add league
        </button>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Reason for change (saved in change log)"
          className="flex-1 min-w-[220px] border rounded-lg px-3 py-2 text-sm bg-white"
        />
        <button
          onClick={save}
          disabled={saving || problems.length > 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save settings
        </button>
      </div>

      {problems.length ? (
        <ul className="text-xs text-red-600 list-disc pl-5">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-gray-500">
        A restaurant is in a league when its calendar-month sales are above the previous league's limit and up to this league's limit.
        Changes affect only orders placed after saving — existing orders keep the commission they were placed with.
      </p>
    </div>
  )
}

/* ------------------------------- Zones tab -------------------------------- */

export function DateFilterBar({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={value.range} onChange={(e) => set({ range: e.target.value })} className="border rounded-lg px-3 py-2 text-sm bg-white">
        <option value="current_month">Current month</option>
        <option value="previous_month">Previous month</option>
        <option value="month">Specific month</option>
        <option value="day">Single day</option>
        <option value="custom">Custom range</option>
        <option value="all">All time</option>
      </select>
      {value.range === "month" ? (
        <input type="month" value={value.month || ""} onChange={(e) => set({ month: e.target.value })} className="border rounded-lg px-3 py-2 text-sm bg-white" />
      ) : null}
      {value.range === "day" ? (
        <input type="date" value={value.date || ""} onChange={(e) => set({ date: e.target.value })} className="border rounded-lg px-3 py-2 text-sm bg-white" />
      ) : null}
      {value.range === "custom" ? (
        <>
          <input type="date" value={value.from || ""} onChange={(e) => set({ from: e.target.value })} className="border rounded-lg px-3 py-2 text-sm bg-white" />
          <span className="text-gray-500 text-sm">to</span>
          <input type="date" value={value.to || ""} onChange={(e) => set({ to: e.target.value })} className="border rounded-lg px-3 py-2 text-sm bg-white" />
        </>
      ) : null}
    </div>
  )
}

/** True when the chosen range has all inputs it needs, so we don't fire half-filled requests. */
export const isDateFilterReady = (f) =>
  f.range === "month" ? Boolean(f.month) : f.range === "day" ? Boolean(f.date) : f.range === "custom" ? Boolean(f.from && f.to) : true

function ZonesTab({ zones }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState({ range: "current_month" })
  const [zoneId, setZoneId] = useState("")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isDateFilterReady(filter)) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await adminAPI.getCommissionLeagueZones({ ...filter, zoneId })
        if (!cancelled) setData(res?.data?.data || null)
      } catch (e) {
        if (!cancelled) toast.error(apiMsg(e, "Could not load zone analytics"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filter, zoneId])

  const Cell = ({ r }) => (
    <>
      <td className="p-3 text-right">{r.totalOrders}</td>
      <td className="p-3 text-right">{r.completedOrders}</td>
      <td className="p-3 text-right">{r.cancelledOrders}</td>
      <td className="p-3 text-right font-medium">{inr(r.totalSales)}</td>
      <td className="p-3 text-right">{inr(r.totalCommission, 2)}</td>
      <td className="p-3 text-right">{inr(r.aov)}</td>
    </>
  )
  const head = (
    <>
      <th className="p-3 font-medium text-right">Orders</th>
      <th className="p-3 font-medium text-right">Completed</th>
      <th className="p-3 font-medium text-right">Cancelled</th>
      <th className="p-3 font-medium text-right">Sales</th>
      <th className="p-3 font-medium text-right">Eqosy commission</th>
      <th className="p-3 font-medium text-right">AOV</th>
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
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
      {data ? <div className="text-xs text-gray-500">Showing: {data.filter.label} (by delivery date; undelivered orders by order date)</div> : null}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="px-4 py-3 font-bold border-b">Zone comparison</div>
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
              <th className="p-3 font-medium">Zone</th>
              {head}
            </tr>
          </thead>
          <tbody>
            {(data?.zones || []).map((z) => (
              <tr key={z.zoneId || "none"} className="border-b last:border-0">
                <td className="p-3 font-semibold">{z.zoneName}</td>
                <Cell r={z} />
              </tr>
            ))}
            {data && data.zones.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  No orders in this period.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="px-4 py-3 font-bold border-b">Restaurants (top 500 by sales)</div>
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
              <th className="p-3 font-medium">Restaurant</th>
              <th className="p-3 font-medium">Zone</th>
              {head}
            </tr>
          </thead>
          <tbody>
            {(data?.restaurants || []).map((r) => (
              <tr
                key={`${r.restaurantId}-${r.zoneId}`}
                onClick={() => navigate(`/admin/food/restaurants/commission-league/${r.restaurantId}`)}
                className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-3 font-semibold">{r.name}</td>
                <td className="p-3 text-gray-600">{r.zoneName}</td>
                <Cell r={r} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* -------------------------------- Audit tab -------------------------------- */

const ACTION_LABEL = {
  settings_updated: "League settings changed",
  restaurant_custom_set: "Custom commission set",
  restaurant_custom_updated: "Custom commission edited",
  restaurant_league_enabled: "Switched to league commission",
}

function describe(x) {
  if (!x) return "—"
  if (x.slabs) return `${x.enabled ? "ON" : "OFF"} · fallback ${x.fallbackPercent}% · ` + x.slabs.map((s) => `${s.name} ≤${s.maxSales ?? "∞"} @${s.commissionPercent}%`).join(", ")
  if (x.mode === "league") return "Automatic league"
  if (x.mode === "custom_admin") return `Custom ${x.type === "amount" ? `₹${x.value} flat` : `${x.value}%`}`
  return JSON.stringify(x)
}

function AuditTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    ;(async () => {
      try {
        const res = await adminAPI.getCommissionLeagueAudit({ limit: 100 })
        setItems(res?.data?.data?.items || [])
      } catch (e) {
        toast.error(apiMsg(e, "Could not load change log"))
      } finally {
        setLoading(false)
      }
    })()
  }, [])
  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
            <th className="p-3 font-medium">When</th>
            <th className="p-3 font-medium">By</th>
            <th className="p-3 font-medium">Change</th>
            <th className="p-3 font-medium">Restaurant</th>
            <th className="p-3 font-medium">From → To</th>
            <th className="p-3 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="p-8 text-center text-gray-500">
                Loading…
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-8 text-center text-gray-500">
                No changes recorded yet.
              </td>
            </tr>
          ) : (
            items.map((a) => (
              <tr key={a._id} className="border-b last:border-0 align-top">
                <td className="p-3 whitespace-nowrap">{new Date(a.createdAt).toLocaleString("en-IN")}</td>
                <td className="p-3">{a.adminName || "—"}</td>
                <td className="p-3 font-medium">{ACTION_LABEL[a.action] || a.action}</td>
                <td className="p-3">{a.restaurantName || "All"}</td>
                <td className="p-3 text-xs text-gray-700 max-w-sm">
                  {describe(a.before)} <span className="text-gray-400">→</span> {describe(a.after)}
                </td>
                <td className="p-3 text-xs text-gray-600">{a.note || "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/* --------------------------------- Page ----------------------------------- */

export default function CommissionLeague() {
  const [tab, setTab] = useState("restaurants")
  const [zones, setZones] = useState([])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await adminAPI.getZones({ limit: 1000 })
        const list = res?.data?.data?.zones || res?.data?.data?.items || res?.data?.zones || []
        setZones(list.map((z) => ({ id: z._id || z.id, name: z.name || z.zoneName || "Zone" })))
      } catch {
        setZones([])
      }
    })()
  }, [])

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-gray-50 min-h-screen">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Trophy className="w-6 h-6" /> Commission & Performance League
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Restaurants move between leagues by their calendar-month sales; the league sets the commission on each new order. Resets automatically on the 1st.
        </p>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "restaurants" ? <RestaurantsTab zones={zones} /> : null}
      {tab === "zones" ? <ZonesTab zones={zones} /> : null}
      {tab === "settings" ? <SettingsTab /> : null}
      {tab === "audit" ? <AuditTab /> : null}
    </div>
  )
}
