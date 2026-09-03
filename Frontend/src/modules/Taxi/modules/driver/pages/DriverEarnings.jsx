import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Clock,
  Filter,
  IndianRupee,
  MapPin,
  RefreshCw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import api from '../../../shared/api/axiosInstance';
import { getLocalDriverToken } from '../services/registrationService';

const money = (val) => {
  const amount = Number(val || 0);
  return `Rs ${amount.toFixed(2)}`;
};

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const DriverEarnings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isOwnerPortal = location.pathname.startsWith('/taxi/owner');
  const [period, setPeriod] = useState('today');
  const [tipFilter, setTipFilter] = useState('all'); // 'all', 'online', 'cash'
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [earningsData, setEarningsData] = useState({
    summary: {
      totalTrips: 0,
      totalNetEarnings: 0,
      totalGrossFare: 0,
      totalCommission: 0,
      totalTips: 0,
      onlineTips: 0,
      cashTips: 0,
      onlineEarnings: 0,
      cashEarnings: 0,
    },
    trips: [],
  });

  const fetchEarnings = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = getLocalDriverToken();
      const params = { period };

      if (period === 'custom_date') {
        params.date = customDate;
      } else if (period === 'custom_range') {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await api.get('/drivers/earnings', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        params,
      });

      const data = response?.data?.data || response?.data || response || {};
      setEarningsData({
        summary: data.summary || {
          totalTrips: 0,
          totalNetEarnings: 0,
          totalGrossFare: 0,
          totalCommission: 0,
          totalTips: 0,
          onlineTips: 0,
          cashTips: 0,
          onlineEarnings: 0,
          cashEarnings: 0,
        },
        trips: Array.isArray(data.trips) ? data.trips : [],
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to fetch earnings');
    } finally {
      setLoading(false);
    }
  }, [period, customDate, startDate, endDate]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const FILTER_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'tomorrow', label: 'Tomorrow' },
    { id: 'this_week', label: 'This Week' },
    { id: 'last_week', label: 'Last Week' },
    { id: 'custom_date', label: 'Single Date' },
    { id: 'custom_range', label: 'Custom Interval' },
  ];

  const filteredTrips = earningsData.trips.filter((item) => {
    const tipAmount = Number(item.tip || 0);
    if (tipFilter === 'online') {
      return (Number(item.onlineTip || 0) > 0) || (item.isOnlineTip && tipAmount > 0);
    }
    if (tipFilter === 'cash') {
      return (Number(item.cashTip || 0) > 0) || (!item.isOnlineTip && tipAmount > 0);
    }
    return true;
  });

  const onlineTipTripsCount = earningsData.trips.filter((item) => (Number(item.onlineTip || 0) > 0) || (item.isOnlineTip && Number(item.tip || 0) > 0)).length;
  const cashTipTripsCount = earningsData.trips.filter((item) => (Number(item.cashTip || 0) > 0) || (!item.isOnlineTip && Number(item.tip || 0) > 0)).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900 px-4 py-4 text-white shadow-lg">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-all"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="text-center">
            <h1 className="text-base font-black uppercase tracking-wider text-white">
              {isOwnerPortal ? 'Fleet Earnings' : 'My Earnings'}
            </h1>
            <p className="text-[11px] font-bold text-slate-400">
              {isOwnerPortal ? 'Filter & track fleet ride income' : 'Filter & track ride income'}
            </p>
          </div>
          <button
            type="button"
            onClick={fetchEarnings}
            disabled={loading}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-all"
            aria-label="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="mx-auto mt-4 max-w-md">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                  period === opt.id
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 scale-105'
                    : 'bg-white/10 text-slate-300 hover:bg-white/15'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Pickers */}
        <AnimatePresence>
          {period === 'custom_date' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mx-auto mt-3 max-w-md overflow-hidden"
            >
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-2.5 backdrop-blur-md">
                <Calendar size={16} className="text-emerald-400 shrink-0 ml-1" />
                <span className="text-xs font-bold text-slate-300 shrink-0">Select Date:</span>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full rounded-xl bg-white px-3 py-1.5 text-xs font-black text-slate-900 border-0 focus:outline-none"
                />
              </div>
            </motion.div>
          )}

          {period === 'custom_range' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mx-auto mt-3 max-w-md overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/10 p-2.5 backdrop-blur-md">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">From Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl bg-white px-2.5 py-1.5 text-xs font-black text-slate-900 border-0 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">To Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl bg-white px-2.5 py-1.5 text-xs font-black text-slate-900 border-0 focus:outline-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Content Body */}
      <main className="mx-auto max-w-md px-4 pt-5 space-y-4">
        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs font-bold text-rose-700">
            {error}
          </div>
        )}

        {/* Big Earnings Summary Card */}
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 text-white shadow-xl border border-slate-700/50">
          <div className="absolute right-0 top-0 h-32 w-32 -mr-10 -mt-10 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-black text-emerald-300 border border-emerald-500/30">
              <TrendingUp size={12} />
              Net Earnings Summary
            </span>
            <span className="text-xs font-bold text-slate-400">
              {earningsData.summary.totalTrips} {earningsData.summary.totalTrips === 1 ? 'Trip' : 'Trips'}
            </span>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Total Net Income</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-white">
              {money(earningsData.summary.totalNetEarnings)}
            </h2>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Gross Fare</p>
              <p className="mt-0.5 text-sm font-black text-emerald-400">{money(earningsData.summary.totalGrossFare)}</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Commission</p>
              <p className="mt-0.5 text-sm font-black text-rose-400">-{money(earningsData.summary.totalCommission)}</p>
            </div>

            {/* Total Tips Received Section with Online vs Cash Breakdown */}
            <div className="col-span-2 rounded-2xl bg-white/5 p-3.5 border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Tips Received</p>
                  <p className="mt-0.5 text-base font-black text-amber-300">+{money(earningsData.summary.totalTips)}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 px-2.5 py-1 text-[10px] font-black text-emerald-300 border border-emerald-500/30">
                    💳 Online: {money(earningsData.summary.onlineTips)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-xl bg-amber-500/20 px-2.5 py-1 text-[10px] font-black text-amber-300 border border-amber-500/30">
                    💵 Cash: {money(earningsData.summary.cashTips)}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[10px] font-medium text-slate-400 border-t border-white/5 pt-1.5">
                Note: Cash tips are collected directly by hand and tracked in your profile, but not added to online wallet payout.
              </p>
            </div>

            <div className="col-span-2 rounded-2xl bg-white/5 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Online Payout</p>
              <p className="mt-0.5 text-sm font-black text-blue-300">{money(earningsData.summary.onlineEarnings)}</p>
            </div>
          </div>
        </div>

        {/* Tip Filter Scroller Bar */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setTipFilter('all')}
            className={`shrink-0 rounded-2xl px-3.5 py-2 text-[11px] font-black transition-all ${
              tipFilter === 'all'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Trips ({earningsData.trips.length})
          </button>
          <button
            type="button"
            onClick={() => setTipFilter('online')}
            className={`shrink-0 rounded-2xl px-3.5 py-2 text-[11px] font-black transition-all flex items-center gap-1.5 ${
              tipFilter === 'online'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <span>💳 Online Tip</span>
            <span className="rounded-full bg-emerald-100/30 px-1.5 py-0.5 text-[9px]">
              {onlineTipTripsCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTipFilter('cash')}
            className={`shrink-0 rounded-2xl px-3.5 py-2 text-[11px] font-black transition-all flex items-center gap-1.5 ${
              tipFilter === 'cash'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-white border border-amber-200 text-amber-700 hover:bg-amber-50'
            }`}
          >
            <span>💵 Cash Tip</span>
            <span className="rounded-full bg-amber-100/30 px-1.5 py-0.5 text-[9px]">
              {cashTipTripsCount}
            </span>
          </button>
        </div>

        {/* Detailed Trips Header */}
        <div className="flex items-center justify-between px-1 pt-1">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              {tipFilter === 'online' ? 'Online Tip Trips' : tipFilter === 'cash' ? 'Cash Tip Trips' : 'Filtered Trips'}
            </h3>
            <p className="text-[11px] font-bold text-slate-500">
              Showing completed rides for selected filter
            </p>
          </div>
          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-black text-slate-800">
            {filteredTrips.length}
          </span>
        </div>

        {/* Trips List */}
        {loading ? (
          <div className="py-12 text-center text-slate-400">
            <RefreshCw size={24} className="mx-auto animate-spin" />
            <p className="mt-2 text-xs font-bold">Loading earnings...</p>
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center shadow-xs">
            <Wallet size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-black text-slate-800">No trips found</p>
            <p className="mt-1 text-xs font-bold text-slate-400">
              {tipFilter === 'online'
                ? 'No trips with online tips in this filter.'
                : tipFilter === 'cash'
                  ? 'No trips with cash tips in this filter.'
                  : 'No completed trips in this selected date filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTrips.map((item) => {
              const tipAmt = Number(item.tip || 0);
              const cashTipAmt = Number(item.cashTip || (!item.isOnlineTip ? tipAmt : 0));
              const onlineTipAmt = Number(item.onlineTip || (item.isOnlineTip ? tipAmt : 0));

              return (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-xs hover:border-slate-300 transition-all"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-xs font-black text-slate-900">{item.customerName}</span>
                      <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-slate-600">
                        {item.serviceType}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-base font-black text-emerald-600 leading-none">
                        +{money(item.netEarnings)}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-bold text-slate-400 capitalize">
                        {item.paymentMethod} payment
                      </span>
                    </div>
                  </div>

                  {/* Tip Badge Indicator */}
                  {tipAmt > 0 && (
                    <div className="mt-2.5 flex items-center gap-2">
                      {onlineTipAmt > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                          💳 +{money(onlineTipAmt)} Online Tip
                        </span>
                      ) : null}
                      {cashTipAmt > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-800">
                          💵 +{money(cashTipAmt)} Cash Tip (Hand Collected)
                        </span>
                      ) : null}
                    </div>
                  )}

                  <div className="mt-3 space-y-1.5 text-xs font-bold text-slate-600">
                    <div className="flex items-center gap-2 truncate">
                      <MapPin size={13} className="text-emerald-500 shrink-0" />
                      <span className="truncate">{item.pickupAddress}</span>
                    </div>
                    <div className="flex items-center gap-2 truncate">
                      <MapPin size={13} className="text-rose-500 shrink-0" />
                      <span className="truncate">{item.dropAddress}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] font-bold text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatDateDisplay(item.createdAt)}
                    </span>
                    <span>
                      Fare: {money(item.fare)} {item.commission > 0 ? `| Comm: -${money(item.commission)}` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {!isOwnerPortal && <DriverBottomNav activeTab="home" />}
    </div>
  );
};

export default DriverEarnings;
