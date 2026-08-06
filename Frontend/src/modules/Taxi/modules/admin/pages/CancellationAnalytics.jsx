import React, { useEffect, useState } from 'react';
import {
  Ban,
  TrendingDown,
  UserX,
  Car,
  DollarSign,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Clock,
  ChevronRight,
} from 'lucide-react';
import api from '../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';

export default function CancellationAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/cancellation-analytics');
      if (response.data?.success) {
        setData(response.data.data);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to fetch cancellation analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/4" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-slate-200 rounded-2xl" />
      </div>
    );
  }

  const {
    totalRidesCount = 0,
    totalCancelledRides = 0,
    cancellationRate = 0,
    customerCancellations = 0,
    driverCancellations = 0,
    totalRevenueLost = 0,
    totalCancellationFeesCollected = 0,
    reasonsBreakdown = [],
    stageBreakdown = {},
    topDriverCancellations = [],
    flaggedRides = [],
  } = data || {};

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen max-w-7xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Ban className="w-7 h-7 text-red-600" />
            Ride Cancellation Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time breakdown of ride cancellations, driver misconduct flags, and revenue impact.
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Cancelled Rides</span>
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <Ban className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{totalCancelledRides}</span>
            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              {cancellationRate}% rate
            </span>
          </div>
          <p className="text-[11px] text-slate-400">out of {totalRidesCount} total ride requests</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer Cancellations</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <UserX className="w-5 h-5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900">{customerCancellations}</span>
          <p className="text-[11px] text-slate-400">
            {totalCancelledRides > 0
              ? `${Math.round((customerCancellations / totalCancelledRides) * 100)}% of total cancellations`
              : '0%'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Driver Cancellations</span>
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
              <Car className="w-5 h-5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900">{driverCancellations}</span>
          <p className="text-[11px] text-slate-400">
            {totalCancelledRides > 0
              ? `${Math.round((driverCancellations / totalCancelledRides) * 100)}% of total cancellations`
              : '0%'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Est. Revenue Lost</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900">₹{totalRevenueLost.toLocaleString()}</span>
          <p className="text-[11px] text-emerald-600 font-semibold">
            ₹{totalCancellationFeesCollected.toLocaleString()} fees collected
          </p>
        </div>
      </div>

      {/* Flagged Driver Behavior Alerts */}
      {flaggedRides.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              <h2 className="text-sm font-bold text-red-900">
                Flagged Driver Behavior Reports ({flaggedRides.length})
              </h2>
            </div>
            <span className="text-[11px] font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-full uppercase">
              Action Required
            </span>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {flaggedRides.map((item, idx) => (
              <div
                key={idx}
                className="bg-white p-3.5 rounded-xl border border-red-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900">{item.reason}</span>
                  {item.comment && <p className="text-slate-500 italic mt-0.5">"{item.comment}"</p>}
                  <p className="text-[11px] text-slate-400 mt-1">
                    Customer: <span className="font-semibold text-slate-700">{item.customerName}</span> ({item.customerPhone}) | Driver: <span className="font-semibold text-slate-700">{item.driverName}</span> ({item.driverPhone})
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-400">
                    {new Date(item.cancelledAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Reasons & Stages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reasons Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-orange-500" />
            Most Common Cancellation Reasons
          </h2>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {reasonsBreakdown.length > 0 ? (
              reasonsBreakdown.map((item, idx) => {
                const pct = totalCancelledRides > 0 ? Math.round((item.count / totalCancelledRides) * 100) : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-800">{item.reason}</span>
                      <span className="text-slate-500 font-bold">{item.count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-400 italic">No cancellation reasons recorded yet.</p>
            )}
          </div>
        </div>

        {/* Stage & Driver Breakdown */}
        <div className="space-y-6">
          {/* Stage Breakdown Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Cancellation Stage Breakdown
            </h2>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                <p className="text-xs font-bold text-blue-600 uppercase">Searching</p>
                <p className="text-xl font-black text-slate-900 mt-1">{stageBreakdown.searching || 0}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Before Driver Acceptance</p>
              </div>

              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100">
                <p className="text-xs font-bold text-amber-600 uppercase">Accepted</p>
                <p className="text-xl font-black text-slate-900 mt-1">{stageBreakdown.accepted || 0}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Driver On The Way</p>
              </div>

              <div className="p-3 bg-red-50/60 rounded-xl border border-red-100">
                <p className="text-xs font-bold text-red-600 uppercase">Arrived</p>
                <p className="text-xl font-black text-slate-900 mt-1">{stageBreakdown.arrived || 0}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">At Pickup Location</p>
              </div>
            </div>
          </div>

          {/* Top Driver Offender Cancellations */}
          {topDriverCancellations.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Drivers With Frequent Cancellations
              </h2>

              <div className="space-y-2">
                {topDriverCancellations.map((driver, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{driver.driverName}</p>
                      <p className="text-[11px] text-slate-500">{driver.driverPhone}</p>
                    </div>
                    <span className="font-extrabold text-red-600 bg-red-100 px-2.5 py-1 rounded-full">
                      {driver.cancellationCount} cancellations
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
