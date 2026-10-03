import { useState, useEffect } from "react"
import { Download, ChevronDown, FileText, DollarSign, Settings, FileSpreadsheet, Code, Loader2, Calendar, Filter, Search, Building2, CalendarDays, Clock } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { exportReportsToCSV, exportReportsToExcel, exportReportsToPDF, exportReportsToJSON } from "@food/components/admin/reports/reportsExportUtils"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const debugError = (...args) => {}

export default function TaxReport() {
  const [filters, setFilters] = useState({
    dateRangeType: "All Time",
    groupBy: "restaurant",
    customFromDate: "",
    customToDate: "",
    selectedMonth: String(new Date().getMonth() + 1),
    selectedYear: String(new Date().getFullYear()),
    search: "",
  })
  const [reports, setReports] = useState([])
  const [stats, setStats] = useState({
    totalIncome: "₹0.00",
    totalTax: "₹0.00",
    totalOrders: 0
  })
  const [loading, setLoading] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedReport, setSelectedReport] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reportDetail, setReportDetail] = useState(null)

  const fetchTaxReport = async () => {
    try {
      setLoading(true)

      const params = {
        dateRangeType: filters.dateRangeType,
        groupBy: filters.groupBy,
        search: filters.search.trim() || undefined,
        limit: 1000
      }

      if (filters.dateRangeType === "Custom Range") {
        if (filters.customFromDate) params.fromDate = new Date(filters.customFromDate + "T00:00:00").toISOString()
        if (filters.customToDate) params.toDate = new Date(filters.customToDate + "T23:59:59.999").toISOString()
      } else if (filters.dateRangeType === "Specific Month & Year") {
        params.selectedMonth = filters.selectedMonth
        params.selectedYear = filters.selectedYear
      }

      const response = await adminAPI.getTaxReport(params)

      if (response?.data?.success && response.data.data) {
        setReports(response.data.data.reports || [])
        setStats(response.data.data.stats || {
          totalIncome: "₹0.00",
          totalTax: "₹0.00",
          totalOrders: 0
        })
      } else {
        setReports([])
        if (response?.data?.message) {
          toast.error(response.data.message)
        }
      }
    } catch (error) {
      debugError("Error fetching tax report:", error)
      toast.error("Failed to fetch tax report")
      setReports([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTaxReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.dateRangeType, filters.groupBy, filters.selectedMonth, filters.selectedYear])

  const handleReset = () => {
    setFilters({
      dateRangeType: "All Time",
      groupBy: "restaurant",
      customFromDate: "",
      customToDate: "",
      selectedMonth: String(new Date().getMonth() + 1),
      selectedYear: String(new Date().getFullYear()),
      search: "",
    })
  }

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    fetchTaxReport()
  }

  const handleViewDetails = async (report) => {
    setSelectedReport(report)
    setDetailLoading(true)
    try {
      const params = {
        groupBy: filters.groupBy,
        dateRangeType: filters.dateRangeType
      }
      if (filters.dateRangeType === "Custom Range") {
        if (filters.customFromDate) params.fromDate = new Date(filters.customFromDate + "T00:00:00").toISOString()
        if (filters.customToDate) params.toDate = new Date(filters.customToDate + "T23:59:59.999").toISOString()
      } else if (filters.dateRangeType === "Specific Month & Year") {
        params.selectedMonth = filters.selectedMonth
        params.selectedYear = filters.selectedYear
      }

      const response = await adminAPI.getTaxReportDetail(report.rawKey || report.id, params)
      if (response?.data?.success) {
        setReportDetail(response.data.data)
      } else {
        toast.error(response?.data?.message || "Failed to fetch details")
      }
    } catch (error) {
      debugError("Error fetching tax detail:", error)
      toast.error("An error occurred while fetching details")
    } finally {
      setDetailLoading(false)
    }
  }

  const handleExport = (format) => {
    if (reports.length === 0) {
      alert("No data to export")
      return
    }
    const headers = [
      { key: "sl", label: "SI" },
      { key: "incomeSource", label: filters.groupBy === "day" ? "Date" : filters.groupBy === "month" ? "Month" : "Income Source" },
      { key: "totalIncome", label: "Total Sales / Income" },
      { key: "totalTax", label: "Tax Collected" },
      { key: "orderCount", label: "Orders" },
    ]
    const filename = `tax_report_${filters.groupBy}_${filters.dateRangeType.toLowerCase().replace(/\s+/g, '_')}`
    switch (format) {
      case "csv": exportReportsToCSV(reports, headers, filename); break
      case "excel": exportReportsToExcel(reports, headers, filename); break
      case "pdf": exportReportsToPDF(reports, headers, filename, `Tax Report (${filters.dateRangeType})`); break
      case "json": exportReportsToJSON(reports, filename); break
    }
  }

  const filteredReports = reports.filter(r => {
    if (!filters.search.trim()) return true
    const term = filters.search.toLowerCase()
    return String(r.incomeSource || '').toLowerCase().includes(term) || String(r.id || '').toLowerCase().includes(term)
  })

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  const getDisplayPeriodText = () => {
    if (filters.dateRangeType === "Custom Range") {
      if (filters.customFromDate || filters.customToDate) {
        return `${filters.customFromDate || 'Beginning'} → ${filters.customToDate || 'Today'}`
      }
      return "Custom Date Range"
    }
    if (filters.dateRangeType === "Specific Month & Year") {
      const mName = monthNames[parseInt(filters.selectedMonth, 10) - 1] || filters.selectedMonth
      return `${mName} ${filters.selectedYear}`
    }
    return filters.dateRangeType
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen overflow-x-hidden font-sans">
      <div className="w-full max-w-full">
        {/* Page Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tax & GST Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              View and filter GST / tax collected day-wise, month-wise, or by restaurant for any past date, month, or year.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 flex items-center gap-2 shadow-sm transition-all">
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>Export Report</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50">
                <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                  <FileText className="w-4 h-4 mr-2 text-slate-600" /> Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer">
                  <FileText className="w-4 h-4 mr-2 text-red-600" /> Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")} className="cursor-pointer">
                  <Code className="w-4 h-4 mr-2 text-purple-600" /> Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
              title="Report Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Tax Report Filters</h2>
            </div>
            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {["All Time", "Today", "This Month", "Last Month", "This Year", "Last Year"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, dateRangeType: preset }))}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    filters.dateRangeType === preset
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Top row: Date Range & Group By & Search */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Date Range Type */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tax Period (Date Filter)
                </label>
                <select
                  value={filters.dateRangeType}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateRangeType: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm font-medium rounded-xl border border-slate-300 bg-white text-slate-800 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                >
                  <option value="All Time">All Time (All Historical Data)</option>
                  <option value="Today">Today</option>
                  <option value="Yesterday">Yesterday</option>
                  <option value="This Week">This Week</option>
                  <option value="Last Week">Last Week</option>
                  <option value="This Month">This Month</option>
                  <option value="Last Month">Last Month</option>
                  <option value="Past 3 Months">Past 3 Months</option>
                  <option value="Past 6 Months">Past 6 Months</option>
                  <option value="This Year">This Year</option>
                  <option value="Last Year">Last Year</option>
                  <option value="Specific Month & Year">Specific Month & Year</option>
                  <option value="Custom Range">Custom Date Range (Calendar)</option>
                </select>
                <ChevronDown className="absolute right-3 bottom-3 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>

              {/* Breakdown Group By */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Report Breakdown Type
                </label>
                <select
                  value={filters.groupBy}
                  onChange={(e) => setFilters(prev => ({ ...prev, groupBy: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm font-medium rounded-xl border border-slate-300 bg-white text-slate-800 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                >
                  <option value="restaurant">🏢 By Restaurant / Income Source</option>
                  <option value="day">📅 Day-Wise Breakdown (Daily GST)</option>
                  <option value="month">📆 Month-Wise Breakdown (Monthly GST)</option>
                </select>
                <ChevronDown className="absolute right-3 bottom-3 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>

              {/* Search Bar */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Search Source / Date / Order
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    placeholder="Search restaurant or date..."
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-medium rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>

            {/* Custom Range Inputs if "Custom Range" is selected */}
            {filters.dateRangeType === "Custom Range" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">From Date (Calendar)</label>
                  <input
                    type="date"
                    value={filters.customFromDate}
                    onChange={(e) => setFilters(prev => ({ ...prev, customFromDate: e.target.value }))}
                    className="w-full px-4 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">To Date (Calendar)</label>
                  <input
                    type="date"
                    value={filters.customToDate}
                    onChange={(e) => setFilters(prev => ({ ...prev, customToDate: e.target.value }))}
                    className="w-full px-4 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Specific Month & Year Inputs */}
            {filters.dateRangeType === "Specific Month & Year" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Select Month</label>
                  <select
                    value={filters.selectedMonth}
                    onChange={(e) => setFilters(prev => ({ ...prev, selectedMonth: e.target.value }))}
                    className="w-full px-4 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {monthNames.map((m, idx) => (
                      <option key={m} value={String(idx + 1)}>
                        {m} ({idx + 1})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Select Year</label>
                  <select
                    value={filters.selectedYear}
                    onChange={(e) => setFilters(prev => ({ ...prev, selectedYear: e.target.value }))}
                    className="w-full px-4 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(yr => (
                      <option key={yr} value={String(yr)}>{yr}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-5 py-2 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset
              </button>
              <button
                type="submit"
                className="px-6 py-2 text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all flex items-center gap-1.5"
              >
                Apply Filters
              </button>
            </div>
          </form>
        </div>

        {/* Quick Breakdown Tab Buttons */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          <button
            onClick={() => setFilters(prev => ({ ...prev, groupBy: "restaurant" }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              filters.groupBy === "restaurant"
                ? "bg-slate-900 text-white shadow-md"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <Building2 className="w-4 h-4" /> By Income Source / Restaurant
          </button>
          <button
            onClick={() => setFilters(prev => ({ ...prev, groupBy: "day" }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              filters.groupBy === "day"
                ? "bg-slate-900 text-white shadow-md"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <Calendar className="w-4 h-4 text-emerald-500" /> Day-Wise Tax Report
          </button>
          <button
            onClick={() => setFilters(prev => ({ ...prev, groupBy: "month" }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              filters.groupBy === "month"
                ? "bg-slate-900 text-white shadow-md"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <CalendarDays className="w-4 h-4 text-blue-500" /> Month-Wise Tax Report
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total Period Tax Card (Crucial for knowing current period tax to pay) */}
          <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-950/20 dark:to-pink-950/20 rounded-2xl shadow-sm border border-red-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-100 text-red-700 mb-1">
                  Tax Due / Collected ({getDisplayPeriodText()})
                </span>
                <p className="text-3xl font-extrabold text-red-600">{stats.totalTax}</p>
                <p className="text-xs text-red-500 mt-1 font-medium">
                  Tax collected in this period
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <FileText className="w-7 h-7" />
              </div>
            </div>
          </div>

          {/* Total Sales / Income Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Period Sales</p>
                <p className="text-3xl font-bold text-blue-600">{stats.totalIncome}</p>
                <p className="text-xs text-slate-500 mt-1">Delivered order total</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <DollarSign className="w-7 h-7" />
              </div>
            </div>
          </div>

          {/* Total Orders Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Delivered Orders</p>
                <p className="text-3xl font-bold text-emerald-600">{stats.totalOrders || reports.reduce((acc, r) => acc + (r.orderCount || 0), 0)}</p>
                <p className="text-xs text-slate-500 mt-1">Orders in selected timeframe</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Clock className="w-7 h-7" />
              </div>
            </div>
          </div>
        </div>

        {/* Tax Report Table Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {filters.groupBy === "day"
                  ? "Day-Wise Tax Report"
                  : filters.groupBy === "month"
                  ? "Month-Wise Tax Report"
                  : "Tax Report by Income Source"} ({filteredReports.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Period: <span className="font-semibold text-slate-800">{getDisplayPeriodText()}</span>
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
              <p className="text-sm font-medium text-slate-600">Calculating tax breakdown...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="py-20 text-center">
              <div className="flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                  <FileText className="w-8 h-8" />
                </div>
                <p className="text-base font-bold text-slate-800 mb-1">No Tax Data Found</p>
                <p className="text-xs text-slate-500 max-w-sm">
                  No delivered order tax records exist for the selected date range and filter criteria.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3.5 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      SI
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      {filters.groupBy === "day" ? "Date" : filters.groupBy === "month" ? "Month" : "Income Source (Restaurant)"}
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      Orders Count
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      Total Sales / Income
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      Tax Collected (Due)
                    </th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredReports.map((report) => (
                    <tr key={report.sl} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 text-sm font-semibold text-slate-600">
                        {report.sl}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-bold text-slate-900">
                        {report.incomeSource}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-slate-700">
                        {report.orderCount} order{report.orderCount === 1 ? '' : 's'}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">
                        {report.totalIncome}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-bold text-red-600">
                        {report.totalTax}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => handleViewDetails(report)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs rounded-xl transition-all"
                        >
                          View Orders
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-600" />
              Tax Report Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Tax rates and fee settings can be managed dynamically from <strong>Delivery & Platform Fee</strong> settings.
            </p>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => { if (!open) setSelectedReport(null); }}>
        <DialogContent className="max-w-2xl bg-white p-0 rounded-2xl overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-base font-bold text-slate-900">
                <FileText className="w-5 h-5 text-blue-600" />
                {selectedReport?.incomeSource}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 max-h-[65vh] overflow-y-auto">
            {detailLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
                <p className="text-sm font-medium text-slate-600">Fetching order breakdown...</p>
              </div>
            ) : reportDetail?.orders?.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-700 uppercase tracking-wider">Order ID</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-700 uppercase tracking-wider">Date & Time</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total Amount</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">Tax Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {reportDetail.orders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-bold text-slate-900">#{order.orderId}</td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700">{order.restaurantName}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {new Date(order.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-right text-slate-800">{order.totalAmount}</td>
                        <td className="px-4 py-3 text-xs font-bold text-right text-red-600">{order.taxAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm font-medium text-slate-500">No detailed orders found for this selection.</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">
              Selected Period Tax: <span className="font-extrabold text-red-600">{selectedReport?.totalTax}</span>
            </div>
            <button
              onClick={() => setSelectedReport(null)}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-all"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
