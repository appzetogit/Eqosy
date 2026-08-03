import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, MapPin, CheckCircle, AlertCircle, X, Sparkles, Layers } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';

export const BookGigModal = ({ isOpen, onClose, onGigBooked }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Generate 4 date options (Today, Tomorrow, Upcoming)
  const dateOptions = Array.from({ length: 4 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const isoDate = d.toISOString().slice(0, 10);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return { isoDate, label, dayNum: d.getDate() };
  });

  const fetchGigs = async (dateStr) => {
    setLoading(true);
    try {
      const res = await deliveryAPI.getPartnerGigs({ date: dateStr });
      if (res.data?.success && Array.isArray(res.data.data)) {
        setGigs(res.data.data);
      } else {
        setGigs([]);
      }
    } catch (err) {
      toast.error('Failed to load available gigs');
      setGigs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGigs(selectedDate);
    }
  }, [isOpen, selectedDate]);

  const handleBookGig = async (gig) => {
    setActionLoadingId(gig._id);
    try {
      const res = await deliveryAPI.bookGig(gig._id);
      if (res.data?.success) {
        toast.success(`Gig booked for ${gig.startTime} - ${gig.endTime}!`);
        fetchGigs(selectedDate);
        if (onGigBooked) onGigBooked(res.data.data);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to book gig';
      toast.error(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelGig = async (gig) => {
    if (!window.confirm(`Are you sure you want to cancel your booked gig for ${gig.startTime} - ${gig.endTime}?`)) {
      return;
    }
    setActionLoadingId(gig._id);
    try {
      const res = await deliveryAPI.cancelGig(gig._id);
      if (res.data?.success) {
        toast.success('Gig booking cancelled');
        fetchGigs(selectedDate);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to cancel gig';
      toast.error(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[400] bg-slate-950/70 backdrop-blur-md flex items-end justify-center pointer-events-auto sm:p-4"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-[0_-25px_80px_rgba(0,0,0,0.4)] flex flex-col max-h-[88vh] sm:max-h-[85vh] overflow-hidden border border-slate-100"
        >
          {/* Top Handle bar for mobile feel */}
          <div className="pt-3 pb-1 flex justify-center bg-white cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-5 sm:px-6 pb-4 bg-white flex items-center justify-between border-b border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 text-emerald-600 mb-0.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Shift Booking</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight leading-none">
                Book a Delivery Gig
              </h2>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Date Selector Tabs with hidden scrollbar */}
          <div className="px-4 sm:px-6 py-3 bg-slate-50/80 flex gap-2 overflow-x-auto border-b border-slate-100 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden shrink-0">
            {dateOptions.map((opt) => {
              const active = selectedDate === opt.isoDate;
              return (
                <button
                  key={opt.isoDate}
                  onClick={() => setSelectedDate(opt.isoDate)}
                  className={`px-4 py-2.5 rounded-2xl flex items-center gap-2 font-black text-xs transition-all shrink-0 active:scale-95 ${
                    active
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-100/80'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 touch-pan-y overscroll-contain [scrollbar-width:thin]">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Loading available shifts...</span>
              </div>
            ) : gigs.length === 0 ? (
              <div className="py-14 flex flex-col items-center justify-center text-center text-slate-400 gap-3 bg-slate-50/60 rounded-3xl border border-dashed border-slate-200 p-6">
                <Clock className="w-12 h-12 text-slate-300 stroke-[1.5]" />
                <div>
                  <h4 className="text-sm font-bold text-slate-800">No Shifts Available</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">There are no delivery shift slots created for this date yet. Check back soon!</p>
                </div>
              </div>
            ) : (
              gigs.map((gig) => {
                const isBooked = gig.partnerStatus === 'booked';
                const isFull = gig.partnerStatus === 'full';
                const isExpired = gig.partnerStatus === 'expired';
                const isLoading = actionLoadingId === gig._id;

                return (
                  <div
                    key={gig._id}
                    className={`p-4 sm:p-5 rounded-3xl border transition-all duration-200 ${
                      isBooked
                        ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20 shadow-md shadow-emerald-500/5'
                        : isExpired || isFull
                        ? 'bg-slate-50/80 border-slate-200 opacity-75'
                        : 'bg-white border-slate-200 hover:border-emerald-400 shadow-sm hover:shadow-md'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4" />
                          </div>
                          <h3 className="text-base sm:text-lg font-black text-slate-950 tracking-tight">
                            {gig.startTime} – {gig.endTime}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 font-semibold mt-1.5 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>Zone: <strong className="text-slate-800">{gig.zoneName || 'All Zones'}</strong></span>
                        </p>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border shrink-0 ${
                          isBooked
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                            : isFull
                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                            : isExpired
                            ? 'bg-slate-200 text-slate-600 border-slate-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {isBooked ? 'BOOKED ✓' : isFull ? 'FULL' : isExpired ? 'EXPIRED' : 'AVAILABLE'}
                      </span>
                    </div>

                    {/* Slots Breakdown Table */}
                    <div className="grid grid-cols-3 gap-2 p-3 bg-white/90 rounded-2xl border border-slate-100 text-center my-3 shadow-inner">
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 block">Total Slots</span>
                        <span className="text-sm font-black text-slate-900">{gig.capacity}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 block">Booked</span>
                        <span className="text-sm font-black text-blue-600">{gig.bookedCount}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 block">Remaining</span>
                        <span className="text-sm font-black text-emerald-600">{gig.remainingSlots}</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    {isBooked ? (
                      <button
                        onClick={() => handleCancelGig(gig)}
                        disabled={isLoading}
                        className="w-full py-3.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-black uppercase tracking-widest hover:bg-rose-100 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        {isLoading ? (
                          <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <X className="w-4 h-4" />
                            <span>Cancel Booking</span>
                          </>
                        )}
                      </button>
                    ) : isFull ? (
                      <button
                        disabled
                        className="w-full py-3.5 rounded-2xl bg-slate-100 text-slate-400 text-xs font-black uppercase tracking-widest cursor-not-allowed border border-slate-200"
                      >
                        Slot Full
                      </button>
                    ) : isExpired ? (
                      <button
                        disabled
                        className="w-full py-3.5 rounded-2xl bg-slate-100 text-slate-400 text-xs font-black uppercase tracking-widest cursor-not-allowed border border-slate-200"
                      >
                        Expired
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBookGig(gig)}
                        disabled={isLoading}
                        className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 text-xs font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Book This Gig</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
