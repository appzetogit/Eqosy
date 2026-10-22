import { useState, useMemo, useEffect } from "react"
import { Users, ChevronDown, FileText, FileSpreadsheet, Loader2, Info } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { exportReportsToCSV, exportReportsToExcel } from "@food/components/admin/reports/reportsExportUtils"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

// Report days are counted in IST, matching the backend.
const REPORT_TZ = "Asia/Kolkata"
const dayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
const shiftDays = (key, days) => {
  const d = new Date(`${key}T12:00:00+05:30`)
  d.setUTCDate(d.getUTCDate() + days)
  return dayKey(d)
}

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "custom", label: "Custom range" },
]

const rangeForPreset = (preset) => {
  const today = dayKey(new Date())
  switch (preset) {
    case "yesterday": {
      const y = shiftDays(today, -1)
      return { fromDate: y, toDate: y }
    }
    case "last7":
      return { fromDate: shiftDays(today, -6), toDate: today }
    case "last30":
      return { fromDate: shiftDays(today, -29), toDate: today }
    case "thisMonth":
      return { fromDate: `${today.slice(0, 8)}01`, toDate: today }
    default:
      return { fromDate: today, toDate: today }
  }
}

const formatDay = (key) =>
  new Date(`${key}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: REPORT_TZ })

const EMPTY_SUMMARY = { totalOrders: 0, newOrders: 0, repeatOrders: 0, repeatPercent: 0, uniqueCustomers: 0, newCustomers: 0, repeatCustomers: 0 }

export default function CustomerOrdersReport() {
  const [preset, setPreset] = useState("last7")
  const [range, setRange] = useState(() => rangeForPreset("last7"))
  const [zoneId, setZoneId] = useState("")
  const [restaurantId, setRestaurantId] = useState("")
  const [zones, setZones] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [daily, setDaily] = useState([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        const [zonesResponse, restaurantsResponse] = await Promise.all([
          adminAPI.getZones({ limit: 1000 }),
          adminAPI.getRestaurants({ limit: 1000 }),
        ])
        setZones(zonesResponse?.data?.data?.zones || [])
        setRestaurants(restaurantsResponse?.data?.data?.restaurants || [])
      } catch {
        // Filters stay empty; the report itself still loads.
      }
    }
    fetchFilterData()
  }, [])

  const restaurantOptions = useMemo(() => {
    if (!zoneId) return restaurants
    return restaurants.filter((r) => {
      const rZoneId = typeof r.zoneId === "string" ? r.zoneId : (r.zoneId?._id || r.zoneId?.id || "")
      return String(rZoneId) === String(zoneId)
    })
  }, [restaurants, zoneId])

  useEffect(() => {
    if (restaurantId && !restaurantOptions.some((r) => String(r._id || r.id) === String(restaurantId))) {
      setRestaurantId("")
    }
  }, [restaurantOptions, restaurantId])

  useEffect(() => {
    if (!range.fromDate || !range.toDate || range.fromDate > range.toDate) return
    let cancelled = false
    const fetchReport = async () => {
      try {
        setIsRefreshing(true)
        const response = await adminAPI.getCustomerOrdersReport({
          fromDate: range.fromDate,
          toDate: range.toDate,
          zoneId: zoneId || undefined,
          restaurantId: restaurantId || undefined,
        })
        if (cancelled) return
        const data = response?.data?.data
        setSummary(data?.summary || EMPTY_SUMMARY)
        setDaily(data?.daily || [])
      } catch (error) {
        if (cancelled) return
        toast.error(error?.response?.data?.message || "Could not load the report. Please try again.")
        setSummary(EMPTY_SUMMARY)
        setDaily([])
      } finally {
        if (!cancelled) {
          setIsRefreshing(false)
          setLoading(false)
        }
      }
    }
    fetchReport()
    return () => {
      cancelled = true
    }
  }, [range, zoneId, restaurantId])

  const handlePresetChange = (value) => {
    setPreset(value)
    if (value !== "custom") setRange(rangeForPreset(value))
  }

  const handleReset = () => {
    setPreset("last7")
    setRange(rangeForPreset("last7"))
    setZoneId("")
    setRestaurantId("")
  }

  const chartData = useMemo(
    () => daily.map((d) => ({ ...d, label: formatDay(d.date).slice(0, 6) })),
    [daily],
  )
  const tableRows = useMemo(() => [...daily].reverse(), [daily])

  const exportHeaders = [
    { key: "date", label: "Date" },
    { key: "totalOrders", label: "Total Orders" },
    { key: "newOrders", label: "New Orders" },
    { key: "repeatOrders", label: "Repeat Orders" },
    { key: "repeatPercent", label: "Repeat %" },
    { key: "uniqueCustomers", label: "Customers" },
  ]

  const handleExport = (format) => {
    if (tableRows.length === 0) {
      toast.error("There is no data to export for this range.")
      return
    }
    // Stringify numbers so zero values are not dropped by the export helper.
    const rows = tableRows.map((d) => Object.fromEntries(exportHeaders.map((h) => [h.key, String(d[h.key])])))
    const filename = `new_vs_repeat_orders_${range.fromDate}_to_${range.toDate}`
    if (format === "csv") exportReportsToCSV(rows, exportHeaders, filename)
    else exportReportsToExcel(rows, exportHeaders, filename)
  }

  const rangeInvalid = range.fromDate > range.toDate

  if (loading) {
    return (
      <div className="p-2 lg:p-3 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-600">Loading new vs repeat orders...</p>
        </div>
      </div>
    )
  }

  const selectClass = "w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">New vs Repeat Orders</h1>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-px flex-shrink-0" />
            A new order is a customer's first order on the platform, from any restaurant. Every later order is a repeat order. Cancelled and unpaid orders are not counted. Days follow Indian time (IST).
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex flex-col lg:flex-row lg:items-end gap-2">
            <label className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-600">Period</span>
              <div className="relative">
                <select id="cor-period" value={preset} onChange={(e) => handlePresetChange(e.target.value)} className={selectClass}>
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
              </div>
            </label>

            <label className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-600">From</span>
              <input
                id="cor-from"
                type="date"
                value={range.fromDate}
                max={range.toDate}
                onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, fromDate: e.target.value })) }}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
              />
            </label>

            <label className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-600">To</span>
              <input
                id="cor-to"
                type="date"
                value={range.toDate}
                min={range.fromDate}
                onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, toDate: e.target.value })) }}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
              />
            </label>

            <label className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-600">Zone</span>
              <div className="relative">
                <select id="cor-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={selectClass}>
                  <option value="">All zones</option>
                  {zones.map((z) => (
                    <option key={z._id} value={z._id}>{z.zoneName || z.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
              </div>
            </label>

            <label className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-600">Restaurant</span>
              <div className="relative">
                <select id="cor-restaurant" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} className={selectClass}>
                  <option value="">All restaurants</option>
                  {restaurantOptions.map((r) => (
                    <option key={r._id || r.id} value={r._id || r.id}>{r.restaurantName || r.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
              </div>
            </label>

            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all whitespace-nowrap"
            >
              Reset
            </button>
          </div>
          {rangeInvalid && (
            <p className="mt-2 text-xs text-red-600">The From date must be on or before the To date.</p>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <SummaryCard label="Total orders" value={summary.totalOrders} hint={`${summary.uniqueCustomers} customers`} tone="slate" />
          <SummaryCard label="New orders" value={summary.newOrders} hint="First order on the platform" tone="emerald" />
          <SummaryCard label="Repeat orders" value={summary.repeatOrders} hint={`${summary.repeatCustomers} returning customers`} tone="blue" />
          <SummaryCard label="Repeat share" value={`${summary.repeatPercent}%`} hint="Repeat ÷ total orders" tone="amber" />
        </div>

        {/* Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-slate-900">Orders per day</h2>
            {isRefreshing && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          </div>
          {summary.totalOrders === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-slate-700">No orders in this period</p>
              <p className="text-xs text-slate-500">Choose a different date range, zone or restaurant.</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} minTickGap={8} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.12)" }}
                    labelFormatter={(_, payload) => (payload?.[0]?.payload?.date ? formatDay(payload[0].payload.date) : "")}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="newOrders" name="New" stackId="orders" fill="#10b981" />
                  <Bar dataKey="repeatOrders" name="Repeat" stackId="orders" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Daily table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-slate-900">Day-wise breakdown</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1 transition-all self-start sm:self-auto">
                  <span>Export</span>
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                <DropdownMenuLabel>Export format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                  <FileText className="w-4 h-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Export as Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Date", "Total", "New", "Repeat", "Repeat %", "Customers"].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-bold text-slate-700 uppercase tracking-wider ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">No data for this period</td>
                  </tr>
                ) : (
                  tableRows.map((d) => (
                    <tr key={d.date} className={`hover:bg-slate-50 ${d.totalOrders === 0 ? "text-slate-400" : "text-slate-700"}`}>
                      <td className="px-3 py-2 text-xs">{formatDay(d.date)}</td>
                      <td className="px-3 py-2 text-xs text-right font-semibold">{d.totalOrders}</td>
                      <td className="px-3 py-2 text-xs text-right text-emerald-700">{d.newOrders}</td>
                      <td className="px-3 py-2 text-xs text-right text-blue-700">{d.repeatOrders}</td>
                      <td className="px-3 py-2 text-xs text-right">{d.totalOrders ? `${d.repeatPercent}%` : "–"}</td>
                      <td className="px-3 py-2 text-xs text-right">{d.uniqueCustomers}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {tableRows.length > 1 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 tabular-nums">
                  <tr className="text-slate-900 font-semibold">
                    <td className="px-3 py-2 text-xs">Total</td>
                    <td className="px-3 py-2 text-xs text-right">{summary.totalOrders}</td>
                    <td className="px-3 py-2 text-xs text-right text-emerald-700">{summary.newOrders}</td>
                    <td className="px-3 py-2 text-xs text-right text-blue-700">{summary.repeatOrders}</td>
                    <td className="px-3 py-2 text-xs text-right">{summary.totalOrders ? `${summary.repeatPercent}%` : "–"}</td>
                    <td className="px-3 py-2 text-xs text-right">{summary.uniqueCustomers}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

const TONES = {
  slate: "text-slate-900",
  emerald: "text-emerald-600",
  blue: "text-blue-600",
  amber: "text-amber-600",
}

function SummaryCard({ label, value, hint, tone }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${TONES[tone] || TONES.slate}`}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
    </div>
  )
}
