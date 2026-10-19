import React from 'react';
import { Loader2, X } from 'lucide-react';
import { adminService } from '../../services/adminService';

const unwrap = (response) => response?.data?.data || response?.data || response || {};

/**
 * Pick a driver for an outstation ride. Drivers come from the database, filtered to the ride's
 * zone by default (the admin can switch zone or look at all).
 */
const AssignDriverModal = ({ ride, onClose, onAssigned }) => {
  const [data, setData] = React.useState({ drivers: [], serviceLocations: [], area: {}, selectedServiceLocationId: '', currentDriverId: '' });
  const [zoneFilter, setZoneFilter] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [assigningId, setAssigningId] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    adminService
      .getOutstationRideDrivers(ride.id, zoneFilter)
      .then((response) => {
        if (!active) return;
        const payload = unwrap(response);
        setData({
          drivers: payload.drivers || payload.results || [],
          serviceLocations: payload.serviceLocations || [],
          area: payload.area || {},
          selectedServiceLocationId: payload.selectedServiceLocationId || '',
          currentDriverId: payload.currentDriverId || '',
        });
      })
      .catch((err) => active && setError(err?.message || 'Failed to load drivers'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [ride.id, zoneFilter]);

  const assign = async (driver) => {
    setAssigningId(driver.id);
    setError('');
    try {
      await adminService.assignOutstationRide(ride.id, driver.id);
      onAssigned?.(driver);
    } catch (err) {
      setError(err?.message || 'Could not assign this ride');
    } finally {
      setAssigningId('');
    }
  };

  const needle = search.trim().toLowerCase();
  const drivers = data.drivers.filter((driver) =>
    !needle || `${driver.name} ${driver.phone} ${driver.vehicleNumber}`.toLowerCase().includes(needle),
  );
  const zoneValue = zoneFilter || data.selectedServiceLocationId || 'all';
  const areaLabel = [data.area?.zoneName, data.area?.serviceLocationName].filter(Boolean).join(' • ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{data.currentDriverId ? 'Reassign driver' : 'Assign driver'}</h2>
            <p className="mt-1 truncate text-xs text-slate-500">{ride.title}</p>
            {areaLabel ? <p className="mt-1 text-[11px] font-bold text-indigo-600">Ride zone: {areaLabel}</p> : null}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="p-5">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <select
              value={zoneValue}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            >
              <option value="all">All zones</option>
              {data.serviceLocations.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone or vehicle no."
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </div>

          {error ? <p className="mb-3 text-sm font-medium text-red-600">{error}</p> : null}

          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" size={20} /></div>
            ) : drivers.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No Outstation drivers found in this zone.</p>
            ) : drivers.map((driver) => {
              const isCurrent = driver.id === data.currentDriverId;
              return (
                <div key={driver.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{driver.name || 'Driver'}</p>
                    <p className="truncate text-xs text-slate-500">{driver.phone} • {driver.vehicleType || 'vehicle'} {driver.vehicleNumber}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase">
                      <span className={`rounded-full px-2 py-0.5 ${driver.isOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{driver.isOnline ? 'Online' : 'Offline'}</span>
                      {driver.isOnRide ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">On a ride</span> : null}
                      {driver.isFleetDriver ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600">Fleet</span> : null}
                      {driver.vehicleMatch ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-600">Vehicle match</span> : null}
                      {isCurrent ? <span className="rounded-full bg-slate-900 px-2 py-0.5 text-white">Current driver</span> : null}
                    </div>
                  </div>
                  <button
                    disabled={driver.isOnRide || isCurrent || Boolean(assigningId)}
                    onClick={() => assign(driver)}
                    className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {assigningId === driver.id ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignDriverModal;
