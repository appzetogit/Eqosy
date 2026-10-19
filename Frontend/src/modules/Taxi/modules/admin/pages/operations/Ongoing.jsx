import React from 'react';
import { Filter, Search, Loader2, ChevronRight, Menu, XCircle, UserCheck, CalendarClock, Navigation } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { adminService } from '../../services/adminService';
import RideTrackingModal from './RideTrackingModal';
import AssignDriverModal from './AssignDriverModal';

const STATUS_STYLES = {
  ACCEPTED: 'bg-[#10B981] text-white', // Emerald/Green from image
  UPCOMING: 'bg-[#F59E0B] text-white', // Amber from image
  ONGOING: 'bg-[#3B82F6] text-white', 
};

const PAYMENT_STYLES = {
  CASH: 'bg-[#F97316] text-white', // Orange from image
  CARD: 'bg-red-500 text-white',
  WALLET: 'bg-teal-500 text-white',
};

const TAB_SET = ['All', 'Accepted', 'Upcoming', 'Ongoing'];

const TYPE_FILTERS = [
  { id: 'all', label: 'All types' },
  { id: 'taxi', label: 'Taxi' },
  { id: 'parcel', label: 'Parcel' },
  { id: 'outstation', label: 'Outstation' },
  { id: 'pooling', label: 'Pooling' },
  { id: 'scheduled', label: 'Scheduled' },
];

const TYPE_BADGES = {
  taxi: { label: 'Taxi', className: 'bg-blue-100 text-blue-700' },
  parcel: { label: 'Parcel', className: 'bg-orange-100 text-orange-700' },
  parcel_outstation: { label: 'Parcel • Outstation', className: 'bg-orange-100 text-orange-700' },
  outstation: { label: 'Outstation', className: 'bg-yellow-100 text-yellow-800' },
  pooling: { label: 'Pooling', className: 'bg-violet-100 text-violet-700' },
};

const matchesTypeFilter = (row, filter) => {
  if (filter === 'all') return true;
  if (filter === 'scheduled') return Boolean(row.isScheduled);
  if (filter === 'parcel') return row.rideType === 'parcel' || row.rideType === 'parcel_outstation';
  if (filter === 'outstation') return row.rideType === 'outstation' || row.rideType === 'parcel_outstation';
  return row.rideType === filter;
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
};

const Ongoing = () => {
  const [activeTab, setActiveTab] = React.useState('All');
  const [search, setSearch] = React.useState('');
  const [limit, setLimit] = React.useState(10);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [trackingRow, setTrackingRow] = React.useState(null);
  const [assignRow, setAssignRow] = React.useState(null);

  const loadRows = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminService.getOngoingRides({
        limit,
        tab: activeTab.toLowerCase(),
        search,
      });
      const data = response?.data?.data || response?.data || response;
      setRows(data?.results || []);
    } catch (err) {
      setError(err?.message || 'Failed to load ongoing rides');
    } finally {
      setLoading(false);
    }
  }, [activeTab, limit, search]);

  React.useEffect(() => {
    loadRows();
  }, [loadRows]);

  // Keep the list fresh so rides the rider cancels (or that finish) drop off by themselves.
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        adminService
          .getOngoingRides({ limit, tab: activeTab.toLowerCase(), search })
          .then((response) => {
            const data = response?.data?.data || response?.data || response;
            setRows(data?.results || []);
          })
          .catch(() => {});
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [activeTab, limit, search]);

  const handleCancel = async (ride) => {
    const confirmed = window.confirm(`Cancel ride ${ride.requestId}? The rider and the driver will both be told it was cancelled.`);
    if (!confirmed) return;
    try {
      await adminService.deleteOngoingRide(ride.id);
      setRows((prev) => prev.filter((row) => row.id !== ride.id));
    } catch (err) {
      window.alert(err?.message || 'Failed to cancel ride');
    }
  };

  const visibleRows = rows.filter((row) => matchesTypeFilter(row, typeFilter));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <div className="p-4 space-y-4">
        {/* Header Block exactly as image */}
        <div className="flex items-center justify-between px-4 py-2 bg-white rounded-t-xl">
           <h1 className="text-[20px] font-black tracking-tight text-slate-800 uppercase">ONGOING REQUESTS</h1>
           <div className="flex items-center gap-2 text-[12px] font-medium text-slate-400">
              <span>Ongoing Requests</span>
              <ChevronRight size={14} className="text-slate-300" />
              <span className="text-slate-500">Ongoing Requests</span>
           </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm relative">
          {/* Top Controls Area */}
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

            <div className="flex flex-1 justify-center items-center gap-8">
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
                    <motion.div layoutId="ongoing-tab" className="absolute -bottom-3 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button className="w-10 h-10 border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:bg-gray-50">
                <Search size={18} />
              </button>
              <button className="flex items-center gap-2 px-5 py-2.5 bg-[#f46b45] text-white rounded-lg text-[13px] font-bold shadow-sm">
                <Filter size={16} /> Filters
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-6 py-3">
            {TYPE_FILTERS.map((item) => (
              <button
                key={item.id}
                onClick={() => setTypeFilter(item.id)}
                className={`rounded-full px-4 py-1.5 text-[12px] font-bold transition-all ${
                  typeFilter === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-50">
                  {['Request Id', 'Date', 'Type', 'Zone', 'User Name', 'Driver Name', 'Vehicle', 'Trip Status', 'Payment Option', 'Action'].map((h) => (
                    <th key={h} className="px-6 py-4 text-[13px] font-bold text-slate-900 border-b border-slate-100">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-20 text-center">
                      <Loader2 className="animate-spin text-slate-300 mx-auto" size={32} />
                    </td>
                  </tr>
                ) : visibleRows.length > 0 ? (
                  visibleRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/30">
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.requestId}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{formatDate(row.date)}</td>
                      <td className="px-6 py-5">
                        <span className={`inline-block whitespace-nowrap px-3 py-1 text-[10px] font-bold rounded uppercase ${(TYPE_BADGES[row.rideType] || TYPE_BADGES.taxi).className}`}>
                          {(TYPE_BADGES[row.rideType] || TYPE_BADGES.taxi).label}
                        </span>
                        {row.isScheduled ? (
                          <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-600">
                            <CalendarClock size={12} /> {formatDate(row.scheduledAt)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-5 text-[13px] text-slate-600 font-medium">
                        {row.serviceLocationName || row.zoneName || '--'}
                        {row.serviceLocationName && row.zoneName ? <div className="text-[11px] text-slate-400">{row.zoneName}</div> : null}
                      </td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.userName}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.driverName || '----'}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.transportType}</td>
                      <td className="px-6 py-5">
                        <span className={`inline-block px-3 py-1 text-[10px] font-bold rounded uppercase ${STATUS_STYLES[row.tripStatus] || 'bg-slate-200 text-slate-700'}`}>
                          {row.tripStatus}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-block px-3 py-1 text-[10px] font-bold rounded uppercase ${PAYMENT_STYLES[row.paymentOption] || 'bg-orange-500 text-white'}`}>
                          {row.paymentOption || 'CASH'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                         <div className="flex flex-col items-start gap-2">
                           {row.canAssignDriver ? (
                             <button onClick={() => setAssignRow(row)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white">
                               <UserCheck size={13} /> {row.driver ? 'Reassign driver' : 'Assign driver'}
                             </button>
                           ) : null}
                           {row.rideType !== 'pooling' && row.driver && ['ACCEPTED', 'ONGOING'].includes(row.tripStatus) ? (
                             <button onClick={() => setTrackingRow(row)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700">
                               <Navigation size={13} /> Track live
                             </button>
                           ) : null}
                           {row.rideType === 'pooling' ? (
                             <Link to="/taxi/admin/pooling/bookings" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">
                               Manage booking
                             </Link>
                           ) : (
                           <button onClick={() => handleCancel(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50">
                             <XCircle size={13} /> Cancel ride
                           </button>
                           )}
                         </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="py-20 text-center text-[14px] font-medium text-slate-400">
                      No Ongoing Requests Found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {assignRow ? (
            <AssignDriverModal
              ride={{ id: assignRow.id, title: `${assignRow.requestId} • ${assignRow.pickupLabel || ''} to ${assignRow.dropLabel || ''}` }}
              onClose={() => setAssignRow(null)}
              onAssigned={() => {
                setAssignRow(null);
                loadRows();
              }}
            />
          ) : null}
          {trackingRow ? <RideTrackingModal ride={trackingRow} onClose={() => setTrackingRow(null)} /> : null}

          {/* Floating Action Button from image */}
          <button className="fixed bottom-10 right-10 w-14 h-14 bg-[#00BFA5] text-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform z-50">
            <Menu size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Ongoing;
