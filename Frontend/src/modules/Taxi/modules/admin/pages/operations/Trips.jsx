import React from 'react';
import { ChevronLeft, ChevronRight, Copy, Eye, Filter, Loader2, MoreVertical, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { adminService } from '../../services/adminService';

const STATUS_STYLES = {
  CANCELLED: 'bg-orange-500 text-white',
  COMPLETED: 'bg-teal-500 text-white',
  UPCOMING: 'bg-amber-400 text-white',
  ONGOING: 'bg-blue-500 text-white',
  ACCEPTED: 'bg-emerald-500 text-white',
};

const PAYMENT_STYLES = {
  CASH: 'bg-orange-500 text-white',
  CARD: 'bg-red-500 text-white',
  WALLET: 'bg-teal-500 text-white',
};

const TAB_SET = ['All', 'Completed', 'Cancelled', 'Upcoming', 'On Trip'];
const STATUS_OPTIONS = ['UPCOMING', 'ACCEPTED', 'ONGOING', 'COMPLETED', 'CANCELLED'];
const EMPTY_FILTERS = { transportType: '', status: '', from: '', to: '' };

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeTab = (tab) => {
  if (tab === 'On Trip') return 'ongoing';
  return tab.toLowerCase();
};

const normalizeRow = (row = {}) => ({
  id: String(row._id || row.id || row.requestId || Math.random()),
  requestId: row.requestId || row.request_id || row.ride_request_id || '--',
  date: row.date || row.createdAt || row.created_at || row.trip_date || row.updatedAt,
  userName: row.userName || row.user_name || row.customer_name || row.user?.name || '--',
  userPhone: row.user?.phone || '',
  driverName: row.driverName || row.driver_name || row.driver?.name || '--',
  driverPhone: row.driver?.phone || '',
  transportType: row.transportType || row.transport_type || row.service_type || row.module || '--',
  tripStatus: String(row.tripStatus || row.trip_status || row.status || '').toUpperCase(),
  paymentOption: String(row.paymentOption || row.payment_option || row.payment_method || 'CASH').toUpperCase(),
  fare: Number(row.fare || 0),
  pickupLabel: row.pickupLabel || '--',
  dropLabel: row.dropLabel || '--',
});

const DetailRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
    <span className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
    <span className="max-w-[60%] text-right text-[14px] font-semibold text-slate-800 break-words">{value || '--'}</span>
  </div>
);

const Trips = () => {
  const [activeTab, setActiveTab] = React.useState('All');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [limit, setLimit] = React.useState(10);
  const [page, setPage] = React.useState(1);
  const [pageInfo, setPageInfo] = React.useState({ total: 0, lastPage: 1 });
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const [filters, setFilters] = React.useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = React.useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [transportTypes, setTransportTypes] = React.useState([]);

  const [menuRowId, setMenuRowId] = React.useState(null);
  const [selectedRow, setSelectedRow] = React.useState(null);
  const [copied, setCopied] = React.useState(false);

  // Wait for the admin to stop typing before hitting the API.
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Any change to what is being listed starts again from page 1.
  React.useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, limit, filters]);

  const loadRows = React.useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await adminService.getRideRequests({
        page,
        limit,
        tab: normalizeTab(activeTab),
        search: debouncedSearch,
        ...filters,
      });
      const payload = response?.data?.data || response?.data || response || {};
      const results = Array.isArray(payload?.results) ? payload.results : [];
      setRows(results.map(normalizeRow));
      setPageInfo({
        total: Number(payload?.paginator?.total ?? results.length),
        lastPage: Math.max(1, Number(payload?.paginator?.last_page || 1)),
      });
      if (Array.isArray(payload?.filterOptions?.transportTypes)) {
        setTransportTypes(payload.filterOptions.transportTypes);
      }
    } catch (err) {
      setRows([]);
      setError(err?.message || 'Failed to load trip requests');
    } finally {
      setLoading(false);
    }
  }, [activeTab, limit, page, debouncedSearch, filters]);

  React.useEffect(() => {
    loadRows();
  }, [loadRows]);

  // Close the row menu when clicking anywhere else.
  React.useEffect(() => {
    if (!menuRowId) return undefined;
    const close = () => setMenuRowId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuRowId]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const openFilters = () => {
    setDraftFilters(filters);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
  };

  const copyRequestId = async (requestId) => {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) - nothing to do */
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between px-4 py-2 bg-white rounded-t-xl">
          <h1 className="text-[20px] font-black tracking-tight text-slate-800 uppercase">RIDE REQUESTS</h1>
          <div className="flex items-center gap-2 text-[12px] font-medium text-slate-400">
            <span>Operations</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-slate-500">Ride Requests</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm relative">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-6 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2 text-[14px] font-medium text-slate-500">
              <span>show</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-9 w-16 border border-slate-200 rounded-md bg-white px-2 text-[13px] outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>entries</span>
            </div>

            <div className="flex flex-1 justify-center items-center gap-8 flex-wrap">
              {TAB_SET.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative py-1 text-[15px] font-bold transition-all ${
                    activeTab === tab ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div layoutId="trip-tab" className="absolute -bottom-3 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search trips"
                  className="h-10 w-52 rounded-full border border-slate-200 bg-white pl-9 pr-4 text-[13px] outline-none focus:border-slate-300"
                />
              </div>
              <button
                type="button"
                onClick={openFilters}
                className="relative flex items-center gap-2 px-5 py-2.5 bg-[#f46b45] text-white rounded-lg text-[13px] font-bold shadow-sm active:scale-95 transition"
              >
                <Filter size={16} /> Filters
                {activeFilterCount > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-black">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-50">
                  {['Request Id', 'Date', 'User Name', 'Driver Name', 'Transport Type', 'Trip Status', 'Payment Option', 'Action'].map((heading) => (
                    <th key={heading} className="px-6 py-4 text-[13px] font-bold text-slate-900 border-b border-slate-100">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center">
                      <Loader2 className="animate-spin text-slate-300 mx-auto" size={32} />
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center text-[14px] font-medium text-red-500">
                      {error}
                    </td>
                  </tr>
                ) : rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/30">
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.requestId}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{formatDate(row.date)}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.userName}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.driverName}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.transportType}</td>
                      <td className="px-6 py-5">
                        <span className={`inline-block px-3 py-1 text-[10px] font-bold rounded uppercase ${STATUS_STYLES[row.tripStatus] || 'bg-slate-200 text-slate-700'}`}>
                          {row.tripStatus || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-block px-3 py-1 text-[10px] font-bold rounded uppercase ${PAYMENT_STYLES[row.paymentOption] || 'bg-orange-500 text-white'}`}>
                          {row.paymentOption}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="relative">
                          <button
                            type="button"
                            aria-label="Row actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuRowId((current) => (current === row.id ? null : row.id));
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                          >
                            <MoreVertical size={18} />
                          </button>
                          {menuRowId === row.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRow(row);
                                  setMenuRowId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Eye size={15} /> View details
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  copyRequestId(row.requestId);
                                  setMenuRowId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Copy size={15} /> Copy request ID
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-20 text-center text-[14px] font-medium text-slate-400">
                      No ride requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row">
            <p className="text-[13px] font-medium text-slate-500">
              Page {page} of {pageInfo.lastPage} · {pageInfo.total} request{pageInfo.total === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-[13px] font-bold text-slate-700 disabled:opacity-40"
              >
                <ChevronLeft size={15} /> Prev
              </button>
              <button
                type="button"
                disabled={page >= pageInfo.lastPage || loading}
                onClick={() => setPage((p) => Math.min(pageInfo.lastPage, p + 1))}
                className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-[13px] font-bold text-slate-700 disabled:opacity-40"
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {copied && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white shadow-lg">
          Request ID copied
        </div>
      )}

      {/* Filters panel */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setFiltersOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[18px] font-black text-slate-900">Filter ride requests</h2>
              <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-400">Trip status</span>
                <select
                  value={draftFilters.status}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, status: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[14px] outline-none"
                >
                  <option value="">All statuses</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-400">Transport type</span>
                <select
                  value={draftFilters.transportType}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, transportType: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[14px] outline-none"
                >
                  <option value="">All types</option>
                  {transportTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-400">From</span>
                  <input
                    type="date"
                    value={draftFilters.from}
                    max={draftFilters.to || undefined}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, from: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-[14px] outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-slate-400">To</span>
                  <input
                    type="date"
                    value={draftFilters.to}
                    min={draftFilters.from || undefined}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, to: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-[14px] outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={clearFilters} className="h-11 flex-1 rounded-lg border border-slate-200 text-[14px] font-bold text-slate-700 hover:bg-slate-50">
                Clear
              </button>
              <button type="button" onClick={applyFilters} className="h-11 flex-1 rounded-lg bg-[#f46b45] text-[14px] font-bold text-white hover:opacity-90">
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedRow(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[18px] font-black text-slate-900">Ride request</h2>
                <p className="text-[13px] font-semibold text-slate-400">{selectedRow.requestId}</p>
              </div>
              <button type="button" onClick={() => setSelectedRow(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <DetailRow label="Status" value={selectedRow.tripStatus} />
            <DetailRow label="Date" value={formatDate(selectedRow.date)} />
            <DetailRow label="Customer" value={[selectedRow.userName, selectedRow.userPhone].filter(Boolean).join(' · ')} />
            <DetailRow label="Driver" value={[selectedRow.driverName, selectedRow.driverPhone].filter(Boolean).join(' · ')} />
            <DetailRow label="Vehicle type" value={selectedRow.transportType} />
            <DetailRow label="Pickup" value={selectedRow.pickupLabel} />
            <DetailRow label="Drop" value={selectedRow.dropLabel} />
            <DetailRow label="Fare" value={`₹${selectedRow.fare.toLocaleString('en-IN')}`} />
            <DetailRow label="Payment" value={selectedRow.paymentOption} />

            <button
              type="button"
              onClick={() => copyRequestId(selectedRow.requestId)}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-[14px] font-bold text-slate-700 hover:bg-slate-50"
            >
              <Copy size={15} /> Copy request ID
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Trips;
