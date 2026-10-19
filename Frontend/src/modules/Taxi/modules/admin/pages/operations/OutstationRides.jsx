import React from 'react';
import { Loader2, RefreshCw, UserCheck } from 'lucide-react';
import { adminService } from '../../services/adminService';
import AssignDriverModal from './AssignDriverModal';

const unwrapResults = (response) => {
  const payload = response?.data?.data || response?.data || response || {};
  return Array.isArray(payload?.results) ? payload.results : [];
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const OutstationRides = () => {
  const [rides, setRides] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [activeRide, setActiveRide] = React.useState(null);
  const [message, setMessage] = React.useState('');

  const loadRides = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRides(unwrapResults(await adminService.getOutstationRides()));
    } catch (err) {
      setRides([]);
      setError(err?.message || 'Failed to load outstation rides');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadRides();
  }, [loadRides]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Outstation Rides</h1>
          <p className="mt-1 text-sm text-slate-500">Open outstation requests. Assign one to a driver who opted in to Outstation.</p>
        </div>
        <button
          onClick={loadRides}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div> : null}
      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Requested</th>
              <th className="px-5 py-3">Rider</th>
              <th className="px-5 py-3">Route</th>
              <th className="px-5 py-3">Trip</th>
              <th className="px-5 py-3">Fare</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" size={20} /></td></tr>
            ) : rides.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No open outstation requests.</td></tr>
            ) : rides.map((ride) => (
              <tr key={ride.id} className="border-t border-slate-100 align-top">
                <td className="px-5 py-4 text-slate-600">
                  {formatDate(ride.createdAt)}
                  {ride.scheduledAt ? <div className="text-[11px] font-semibold text-amber-600">For {formatDate(ride.scheduledAt)}</div> : null}
                </td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-900">{ride.user.name || '--'}</div>
                  <div className="text-xs text-slate-500">{ride.user.phone}</div>
                </td>
                <td className="px-5 py-4 text-slate-700">
                  <div>{ride.intercity?.fromCity || ride.pickupAddress || '--'}</div>
                  <div className="text-xs text-slate-400">to {ride.intercity?.toCity || ride.dropAddress || '--'}</div>
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {ride.intercity?.tripType || '--'}
                  {ride.intercity?.travelDate ? <div className="text-xs text-slate-400">{ride.intercity.travelDate}</div> : null}
                </td>
                <td className="px-5 py-4 font-semibold text-slate-900">Rs {Number(ride.fare || 0).toFixed(0)}</td>
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={() => setActiveRide(ride)}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    <UserCheck size={14} /> Assign driver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeRide ? (
        <AssignDriverModal
          ride={{ id: activeRide.id, title: `${activeRide.intercity?.fromCity || activeRide.pickupAddress} to ${activeRide.intercity?.toCity || activeRide.dropAddress}` }}
          onClose={() => setActiveRide(null)}
          onAssigned={(driver) => {
            setMessage(`Ride assigned to ${driver.name || 'driver'}.`);
            setActiveRide(null);
            loadRides();
          }}
        />
      ) : null}
    </div>
  );
};

export default OutstationRides;
