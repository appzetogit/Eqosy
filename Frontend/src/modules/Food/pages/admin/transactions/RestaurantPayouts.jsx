import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, RefreshCw, Download, Loader2, Wallet, CheckCircle2, Clock, Landmark, Info } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const inr = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"

const BALANCE_KEY = "eqosy_admin_bank_balance"

function SummaryCard({ icon: Icon, label, value, sub, tone = "slate" }) {
  const tones = {
    slate: "bg-white border-slate-200 text-slate-900",
    green: "bg-emerald-50 border-emerald-200 text-emerald-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    red: "bg-rose-50 border-rose-200 text-rose-900",
  }
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-70">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs opacity-70">{sub}</p> : null}
    </div>
  )
}

/**
 * Admin: how much each restaurant has earned, how much was already paid, what is waiting in withdrawal
 * requests, and the total the platform still has to pay. Numbers match each restaurant's own wallet.
 */
export default function RestaurantPayouts() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [onlyPayable, setOnlyPayable] = useState(true)
  const [sort, setSort] = useState("payable")
  const [bankBalance, setBankBalance] = useState(() => {
    try {
      return localStorage.getItem(BALANCE_KEY) || ""
    } catch {
      return ""
    }
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminAPI.getRestaurantPayoutOverview()
      setData(res?.data?.data || null)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load restaurant payouts")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    try {
      localStorage.setItem(BALANCE_KEY, bankBalance)
    } catch {
      /* ignore */
    }
  }, [bankBalance])

  const totals = data?.totals || {}

  const rows = useMemo(() => {
    let list = Array.isArray(data?.restaurants) ? [...data.restaurants] : []
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((r) => `${r.restaurantName} ${r.ownerName} ${r.city}`.toLowerCase().includes(q))
    if (onlyPayable) list = list.filter((r) => r.totalPayable > 0)
    const sorters = {
      payable: (a, b) => b.totalPayable - a.totalPayable,
      pending: (a, b) => b.pendingRequests - a.pendingRequests,
      earned: (a, b) => b.earned - a.earned,
      name: (a, b) => a.restaurantName.localeCompare(b.restaurantName),
    }
    return list.sort(sorters[sort] || sorters.payable)
  }, [data, search, onlyPayable, sort])

  const balanceNum = bankBalance === "" ? null : Number(bankBalance)
  const hasBalance = balanceNum !== null && Number.isFinite(balanceNum)
  const afterPending = hasBalance ? balanceNum - (Number(totals.pendingRequests) || 0) : null
  const afterAll = hasBalance ? balanceNum - (Number(totals.totalPayable) || 0) : null

  const exportCsv = () => {
    const header = ["Restaurant", "Owner", "Phone", "City", "Completed orders", "Earned", "Paid out", "Pending requests", "Available to withdraw", "Total payable", "Payout to", "Last withdrawal"]
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = [header.map(esc).join(",")]
    for (const r of rows) {
      lines.push([
        r.restaurantName, r.ownerName, r.phone, r.city, r.completedOrders, r.earned, r.paidOut,
        r.pendingRequests, r.availableBalance, r.totalPayable, r.payoutTo, formatDate(r.lastWithdrawalAt),
      ].map(esc).join(","))
    }
    lines.push(["TOTAL (all restaurants)", "", "", "", "", totals.earned, totals.paidOut, totals.pendingRequests, totals.availableBalance, totals.totalPayable, "", ""].map(esc).join(","))
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `restaurant-payouts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Restaurant Payouts</h1>
          <p className="text-sm text-slate-500 mt-1">
            What each restaurant earned, what was already paid, and what you still owe.
            {data?.generatedAt ? ` Updated ${new Date(data.generatedAt).toLocaleTimeString("en-IN")}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!rows.length}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard icon={Wallet} label="Total credited to restaurants" value={inr(totals.earned)} sub={`${totals.restaurantCount || 0} restaurants · completed orders only`} />
        <SummaryCard icon={CheckCircle2} label="Already paid out" value={inr(totals.paidOut)} sub="Approved withdrawals" tone="green" />
        <SummaryCard icon={Clock} label="Pending withdrawal requests" value={inr(totals.pendingRequests)} sub={`${totals.pendingCount || 0} request(s) waiting for approval`} tone="amber" />
        <SummaryCard icon={Landmark} label="Total payable to restaurants" value={inr(totals.totalPayable)} sub={`${totals.restaurantsWithBalance || 0} restaurant(s) still to be paid`} tone="red" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 max-w-sm">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Your current bank / Razorpay balance (₹)</label>
            <input
              type="number"
              min="0"
              value={bankBalance}
              onChange={(e) => setBankBalance(e.target.value)}
              placeholder="Enter the balance you see in your account"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
            <p className="text-xs text-slate-500 mt-1">Only saved in this browser. Used for the comparison on the right.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-[2]">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500">Left after paying pending requests</p>
              <p className={`text-xl font-bold tabular-nums ${afterPending !== null && afterPending < 0 ? "text-rose-600" : "text-slate-900"}`}>
                {afterPending === null ? "-" : inr(afterPending)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500">Left after paying every restaurant in full</p>
              <p className={`text-xl font-bold tabular-nums ${afterAll !== null && afterAll < 0 ? "text-rose-600" : "text-slate-900"}`}>
                {afterAll === null ? "-" : inr(afterAll)}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Total payable = credited minus already paid (pending requests included). Your balance also holds delivery-partner
          money and your own commission, so a positive "left after paying" amount is not all profit.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-200">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search restaurant, owner or city"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyPayable} onChange={(e) => setOnlyPayable(e.target.checked)} />
            Only restaurants we still owe
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="payable">Sort: Highest payable</option>
            <option value="pending">Sort: Highest pending request</option>
            <option value="earned">Sort: Highest earned</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Restaurant</th>
                <th className="text-right px-4 py-3 font-semibold">Orders</th>
                <th className="text-right px-4 py-3 font-semibold">Credited</th>
                <th className="text-right px-4 py-3 font-semibold">Paid out</th>
                <th className="text-right px-4 py-3 font-semibold">Pending request</th>
                <th className="text-right px-4 py-3 font-semibold">Remaining balance</th>
                <th className="text-right px-4 py-3 font-semibold">Total payable</th>
                <th className="text-left px-4 py-3 font-semibold">Payout to</th>
                <th className="text-left px-4 py-3 font-semibold">Last request</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    {onlyPayable ? "No restaurant has a balance to be paid." : "No restaurants found."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.restaurantId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{r.restaurantName}</p>
                      <p className="text-xs text-slate-500">{[r.ownerName, r.phone, r.city].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.completedOrders}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.earned)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                      {inr(r.paidOut)}
                      {r.paidCount ? <span className="block text-[11px] text-slate-400">{r.paidCount} paid</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700">
                      {inr(r.pendingRequests)}
                      {r.pendingCount ? <span className="block text-[11px] text-slate-400">{r.pendingCount} request(s)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.availableBalance)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-rose-700">{inr(r.totalPayable)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{r.payoutTo || <span className="text-slate-400">Not added</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(r.lastWithdrawalAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-slate-50 font-semibold text-slate-900">
                <tr>
                  <td className="px-4 py-3">Total ({rows.length} shown)</td>
                  <td className="px-4 py-3 text-right tabular-nums">{rows.reduce((s, r) => s + r.completedOrders, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inr(rows.reduce((s, r) => s + r.earned, 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inr(rows.reduce((s, r) => s + r.paidOut, 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inr(rows.reduce((s, r) => s + r.pendingRequests, 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inr(rows.reduce((s, r) => s + r.availableBalance, 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-rose-700">{inr(rows.reduce((s, r) => s + r.totalPayable, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
