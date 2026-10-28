import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download, ChevronDown, FileText, FileSpreadsheet, Code, Settings, Filter, Search, Loader2,
  Calendar, CalendarDays, Car, IndianRupee, Receipt,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@food/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@food/components/ui/dialog';
import {
  exportReportsToCSV, exportReportsToExcel, exportReportsToPDF, exportReportsToJSON,
} from '@food/components/admin/reports/reportsExportUtils';
import { adminService } from '../../services/adminService';

const SERVICE_LABELS = { ride: 'Ride', parcel: 'Parcel', intercity: 'Intercity' };
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const QUICK_PRESETS = ['All Time', 'Today', 'This Month', 'Last Month', 'This Year', 'Last Year'];
const DATE_RANGE_OPTIONS = [
  ['All Time', 'All Time (All Historical Data)'],
  ['Today', 'Today'],
  ['Yesterday', 'Yesterday'],
  ['This Week', 'This Week'],
  ['Last Week', 'Last Week'],
  ['This Month', 'This Month'],
  ['Last Month', 'Last Month'],
  ['Past 3 Months', 'Past 3 Months'],
  ['Past 6 Months', 'Past 6 Months'],
  ['This Year', 'This Year'],
  ['Last Year', 'Last Year'],
  ['Specific Month & Year', 'Specific Month & Year'],
  ['Custom Range', 'Custom Date Range (Calendar)'],
];
const GROUP_OPTIONS = [
  { id: 'service', label: 'By Service', longLabel: 'By Service (Ride / Parcel / Intercity)', icon: Car },
  { id: 'day', label: 'Day-Wise Tax Report', longLabel: 'Day-Wise Breakdown (Daily GST)', icon: Calendar },
  { id: 'month', label: 'Month-Wise Tax Report', longLabel: 'Month-Wise Breakdown (Monthly GST)', icon: CalendarDays },
];
const TAX_FILTER_OPTIONS = [
  ['all', 'All Rides'],
  ['taxed', 'Only Rides With GST'],
  ['untaxed', 'Only Rides Without GST'],
  ['split', 'Rides With CGST / SGST Split'],
];

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const defaultFilters = () => ({
  dateRangeType: 'All Time',
  groupBy: 'service',
  serviceType: '',
  taxFilter: 'all',
  customFromDate: '',
  customToDate: '',
  selectedMonth: String(new Date().getMonth() + 1),
  selectedYear: String(new Date().getFullYear()),
  search: '',
});

const labelFor = (groupBy, key) => {
  if (groupBy === 'service') return SERVICE_LABELS[key] || key;
  if (groupBy === 'month') {
    const [year, month] = String(key).split('-');
    return MONTH_NAMES[Number(month) - 1] ? `${MONTH_NAMES[Number(month) - 1]} ${year}` : key;
  }
  return key;
};

const buildParams = (filters) => {
  const params = { dateRangeType: filters.dateRangeType };
  if (filters.serviceType) params.service_type = filters.serviceType;
  if (filters.taxFilter !== 'all') params.taxFilter = filters.taxFilter;
  if (filters.search.trim()) params.search = filters.search.trim();
  if (filters.dateRangeType === 'Custom Range') {
    if (filters.customFromDate) params.fromDate = filters.customFromDate;
    if (filters.customToDate) params.toDate = filters.customToDate;
  } else if (filters.dateRangeType === 'Specific Month & Year') {
    params.selectedMonth = filters.selectedMonth;
    params.selectedYear = filters.selectedYear;
  }
  return params;
};

const TaxReport = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reportDetail, setReportDetail] = useState(null);

  const setFilter = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  const fetchReport = useCallback(async (activeFilters) => {
    setLoading(true);
    setError('');
    try {
      setData(await adminService.getTaxReport(buildParams(activeFilters)));
    } catch (err) {
      setData(null);
      setError(err?.response?.data?.message || 'Failed to load tax report');
    } finally {
      setLoading(false);
    }
  }, []);

  // Dropdown-style filters reload straight away; search and the custom dates wait for "Apply Filters".
  useEffect(() => {
    fetchReport(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.dateRangeType, filters.serviceType, filters.taxFilter,
    filters.selectedMonth, filters.selectedYear, fetchReport,
  ]);

  const handleSubmit = (event) => {
    event.preventDefault();
    fetchReport(filters);
  };

  const handleReset = () => {
    const next = defaultFilters();
    setFilters(next);
    fetchReport(next);
  };

  const periodText = useMemo(() => {
    if (filters.dateRangeType === 'Custom Range') {
      if (filters.customFromDate || filters.customToDate) {
        return `${filters.customFromDate || 'Beginning'} → ${filters.customToDate || 'Today'}`;
      }
      return 'Custom Date Range';
    }
    if (filters.dateRangeType === 'Specific Month & Year') {
      return `${MONTH_NAMES[Number(filters.selectedMonth) - 1] || filters.selectedMonth} ${filters.selectedYear}`;
    }
    return filters.dateRangeType;
  }, [filters.dateRangeType, filters.customFromDate, filters.customToDate, filters.selectedMonth, filters.selectedYear]);

  const rows = useMemo(() => {
    if (!data) return [];
    const list = filters.groupBy === 'day' ? data.byDay : filters.groupBy === 'month' ? data.byMonth : data.byService;
    return (list || []).map((row, index) => ({ ...row, sl: index + 1, label: labelFor(filters.groupBy, row.key) }));
  }, [data, filters.groupBy]);

  const groupMeta = GROUP_OPTIONS.find((g) => g.id === filters.groupBy) || GROUP_OPTIONS[0];
  const firstColumnLabel = filters.groupBy === 'day' ? 'Date' : filters.groupBy === 'month' ? 'Month' : 'Service';

  const handleViewDetails = async (row) => {
    setSelectedReport(row);
    setReportDetail(null);
    setDetailLoading(true);
    try {
      setReportDetail(await adminService.getTaxReportDetail({
        ...buildParams(filters),
        groupBy: filters.groupBy,
        key: row.key,
      }));
    } catch (err) {
      setReportDetail({ rides: [], error: err?.response?.data?.message || 'Failed to fetch details' });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = (format) => {
    if (!rows.length) {
      window.alert('No data to export');
      return;
    }
    const headers = [
      { key: 'sl', label: 'SI' },
      { key: 'label', label: firstColumnLabel },
      { key: 'rides', label: 'Rides' },
      { key: 'totalSales', label: 'Total Sales' },
      { key: 'taxableAmount', label: 'Taxable Amount' },
      { key: 'cgstAmount', label: 'CGST' },
      { key: 'sgstAmount', label: 'SGST' },
      { key: 'gstAmount', label: 'GST Collected' },
    ];
    const filename = `taxi_tax_report_${filters.groupBy}_${filters.dateRangeType.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const title = `Taxi Tax Report (${periodText})`;
    switch (format) {
      case 'csv': exportReportsToCSV(rows, headers, filename); break;
      case 'excel': exportReportsToExcel(rows, headers, filename); break;
      case 'pdf': exportReportsToPDF(rows, headers, filename, title); break;
      case 'json': exportReportsToJSON(rows, filename); break;
      default: break;
    }
  };

  const summary = data?.summary;
  const cards = [
    { label: 'GST Collected', value: money(summary?.gstAmount), hint: `GST collected in ${periodText}`, icon: Receipt, tone: 'text-red-600 bg-red-100', highlight: true },
    { label: 'Total Period Sales', value: money(summary?.totalSales), hint: 'Completed ride total (incl. GST)', icon: IndianRupee, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Taxable Amount', value: money(summary?.taxableAmount), hint: 'Sales before GST', icon: FileText, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Completed Rides', value: summary?.rides ?? 0, hint: `${summary?.taxedRides ?? 0} with GST`, icon: Car, tone: 'text-amber-600 bg-amber-50' },
  ];

  const labelClass = 'block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5';
  const selectClass = 'w-full px-4 py-2.5 pr-8 text-sm font-medium rounded-xl border border-slate-300 bg-white text-slate-800 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm';
  const inputClass = 'w-full px-4 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none';
  const thClass = 'px-4 py-3.5 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider';

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen overflow-x-hidden font-sans">
      <div className="w-full max-w-full">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tax &amp; GST Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              View and filter GST collected on completed Ride, Parcel and Intercity trips service-wise, day-wise or
              month-wise for any past date, month or year. Rates come from each trip&apos;s own snapshot.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 flex items-center gap-2 shadow-sm transition-all">
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>Export Report</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50">
                <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExport('csv')} className="cursor-pointer">
                  <FileText className="w-4 h-4 mr-2 text-slate-600" /> Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')} className="cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')} className="cursor-pointer">
                  <FileText className="w-4 h-4 mr-2 text-red-600" /> Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')} className="cursor-pointer">
                  <Code className="w-4 h-4 mr-2 text-purple-600" /> Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
              title="Report Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Tax Report Filters</h2>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFilter({ dateRangeType: preset })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    filters.dateRangeType === preset ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="relative">
                <label className={labelClass}>Tax Period (Date Filter)</label>
                <select value={filters.dateRangeType} onChange={(e) => setFilter({ dateRangeType: e.target.value })} className={selectClass}>
                  {DATE_RANGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <ChevronDown className="absolute right-3 bottom-3 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>

              <div className="relative">
                <label className={labelClass}>Report Breakdown Type</label>
                <select value={filters.groupBy} onChange={(e) => setFilter({ groupBy: e.target.value })} className={selectClass}>
                  {GROUP_OPTIONS.map((g) => <option key={g.id} value={g.id}>{g.longLabel}</option>)}
                </select>
                <ChevronDown className="absolute right-3 bottom-3 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>

              <div className="relative">
                <label className={labelClass}>Service</label>
                <select value={filters.serviceType} onChange={(e) => setFilter({ serviceType: e.target.value })} className={selectClass}>
                  <option value="">All Services</option>
                  {Object.entries(SERVICE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <ChevronDown className="absolute right-3 bottom-3 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>

              <div className="relative">
                <label className={labelClass}>Tax Filter</label>
                <select value={filters.taxFilter} onChange={(e) => setFilter({ taxFilter: e.target.value })} className={selectClass}>
                  {TAX_FILTER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <ChevronDown className="absolute right-3 bottom-3 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className={labelClass}>Search Service / Date / Ride / Driver / User</label>
              <div className="relative">
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilter({ search: e.target.value })}
                  placeholder="Search ride ID, driver, user, phone, service or date..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm font-medium rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              </div>
            </div>

            {filters.dateRangeType === 'Custom Range' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">From Date (Calendar)</label>
                  <input type="date" value={filters.customFromDate} onChange={(e) => setFilter({ customFromDate: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">To Date (Calendar)</label>
                  <input type="date" value={filters.customToDate} onChange={(e) => setFilter({ customToDate: e.target.value })} className={inputClass} />
                </div>
              </div>
            )}

            {filters.dateRangeType === 'Specific Month & Year' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Select Month</label>
                  <select value={filters.selectedMonth} onChange={(e) => setFilter({ selectedMonth: e.target.value })} className={inputClass}>
                    {MONTH_NAMES.map((m, idx) => <option key={m} value={String(idx + 1)}>{m} ({idx + 1})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Select Year</label>
                  <select value={filters.selectedYear} onChange={(e) => setFilter({ selectedYear: e.target.value })} className={inputClass}>
                    {Array.from({ length: 11 }, (_, i) => 2020 + i).map((yr) => <option key={yr} value={String(yr)}>{yr}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={handleReset} className="px-5 py-2 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all">
                Reset
              </button>
              <button type="submit" className="px-6 py-2 text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all">
                Apply Filters
              </button>
            </div>
          </form>
        </div>

        {/* Breakdown tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {GROUP_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter({ groupBy: id })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                filters.groupBy === id ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {cards.map(({ label, value, hint, icon: Icon, tone, highlight }) => (
            <div
              key={label}
              className={`rounded-2xl shadow-sm border p-6 ${highlight ? 'bg-gradient-to-br from-red-50 to-pink-50 border-red-200' : 'bg-white border-slate-200'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${highlight ? 'text-red-700' : 'text-slate-500'}`}>{label}</p>
                  <p className={`text-3xl font-extrabold ${highlight ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
                  <p className="text-xs text-slate-500 mt-1">{hint}</p>
                </div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-7 h-7" /></div>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-900">
              {groupMeta.id === 'service' ? 'Tax Report by Service' : groupMeta.label} ({rows.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Period: <span className="font-semibold text-slate-800">{periodText}</span>
            </p>
          </div>

          {error && <p className="mb-3 text-sm font-semibold text-rose-600">{error}</p>}

          {loading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
              <p className="text-sm font-medium text-slate-600">Calculating tax breakdown...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                <FileText className="w-8 h-8" />
              </div>
              <p className="text-base font-bold text-slate-800 mb-1">No Tax Data Found</p>
              <p className="text-xs text-slate-500 max-w-sm">No completed ride tax records exist for the selected date range and filter criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[820px] text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className={thClass}>SI</th>
                    <th className={thClass}>{firstColumnLabel}</th>
                    <th className={thClass}>Rides</th>
                    <th className={thClass}>Total Sales</th>
                    <th className={thClass}>Taxable</th>
                    <th className={thClass}>CGST</th>
                    <th className={thClass}>SGST</th>
                    <th className={thClass}>GST Collected</th>
                    <th className={`${thClass} text-center`}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {rows.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 text-sm font-semibold text-slate-600">{row.sl}</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-slate-900">{row.label}</td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-slate-700">{row.rides} ride{row.rides === 1 ? '' : 's'}</td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">{money(row.totalSales)}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-700">{money(row.taxableAmount)}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-700">{money(row.cgstAmount)}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-700">{money(row.sgstAmount)}</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-red-600">{money(row.gstAmount)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleViewDetails(row)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs rounded-xl transition-all"
                        >
                          View Rides
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">CGST/SGST show values only for trips where the split was enabled in GST Settings.</p>
        </div>
      </div>

      {/* Settings dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-600" />
              Tax Report Settings
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-600">
            GST rates and the CGST/SGST split can be managed from <strong>Settings → GST Settings</strong>. Changing a
            rate only affects new trips; past reports keep each trip&apos;s own rate.
          </p>
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={() => setIsSettingsOpen(false)} className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all">
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ride details dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => { if (!open) setSelectedReport(null); }}>
        <DialogContent className="max-w-4xl bg-white p-0 rounded-2xl overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <FileText className="w-5 h-5 text-blue-600" />
              {selectedReport?.label}
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 max-h-[65vh] overflow-y-auto">
            {detailLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
                <p className="text-sm font-medium text-slate-600">Fetching ride breakdown...</p>
              </div>
            ) : reportDetail?.rides?.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Ride ID', 'Service', 'Date & Time', 'User', 'Driver'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-[10px] font-bold text-slate-700 uppercase tracking-wider">{h}</th>
                      ))}
                      {['Total Amount', 'GST %', 'GST Amount'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {reportDetail.rides.map((ride) => (
                      <tr key={ride.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-bold text-slate-900">#{ride.rideId}</td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700">{ride.serviceLabel}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {new Date(ride.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">
                          {ride.userName || '—'}
                          {ride.userPhone && <span className="block text-slate-400">{ride.userPhone}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">
                          {ride.driverName || '—'}
                          {ride.driverPhone && <span className="block text-slate-400">{ride.driverPhone}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-right text-slate-800">{money(ride.totalAmount)}</td>
                        <td className="px-4 py-3 text-xs text-right text-slate-700">{ride.gstRate ? `${ride.gstRate}%` : '—'}</td>
                        <td className="px-4 py-3 text-xs font-bold text-right text-red-600">{money(ride.gstAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm font-medium text-slate-500">{reportDetail?.error || 'No detailed rides found for this selection.'}</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">
              Selected Period GST: <span className="font-extrabold text-red-600">{money(selectedReport?.gstAmount)}</span>
            </div>
            <button type="button" onClick={() => setSelectedReport(null)} className="px-4 py-2 text-xs font-bold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-all">
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaxReport;
