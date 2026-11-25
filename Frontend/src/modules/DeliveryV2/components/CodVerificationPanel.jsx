import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, PhoneOff, CheckCircle2, Clock3, Loader2, ShieldAlert, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { deliveryAPI } from '@food/api';

// Must match COD_MIN_CALL_ATTEMPTS / COD_CALL_WINDOW_MS in codVerification.service.js (server).
const MIN_CALL_ATTEMPTS = 3;
const CALL_WINDOW_MS = 2 * 60 * 1000;

const formatClock = (totalSeconds) => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

const unwrapOrder = (res) => {
  const data = res?.data?.data;
  return data?.order || data || null;
};

/**
 * COD order accepted by the rider but not yet sent to the restaurant. The rider calls the customer and,
 * within 2 minutes, either confirms the order or (after 3+ unanswered calls) marks the customer not reachable.
 * If neither happens in time the server cancels the order.
 */
export const CodVerificationPanel = ({ order, onConfirmed, onCancelled }) => {
  const orderId = order?.orderMongoId || order?._id || order?.orderId;
  const cv = order?.codVerification || {};
  const [attempts, setAttempts] = useState(Number(cv.callAttempts || 0));
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => setAttempts(Number(order?.codVerification?.callAttempts || 0)), [orderId, order?.codVerification?.callAttempts]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const deadline = useMemo(() => {
    if (cv.callDeadlineAt) return new Date(cv.callDeadlineAt).getTime();
    if (cv.approvedAt) return new Date(cv.approvedAt).getTime() + CALL_WINDOW_MS;
    return Date.now() + CALL_WINDOW_MS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, cv.callDeadlineAt, cv.approvedAt]);
  const secondsLeft = Math.max(0, (deadline - now) / 1000);
  const timeUp = secondsLeft <= 0;

  // The server cancels on time-up and tells us by socket; check once in case that event was missed.
  const syncAfterTimeout = useCallback(async () => {
    if (!orderId) return;
    try {
      const fresh = unwrapOrder(await deliveryAPI.getOrderDetails(orderId));
      const status = String(fresh?.orderStatus || '');
      if (status.startsWith('cancelled')) onCancelled?.(fresh);
      else if (status && status !== 'pending_cod_verification') onConfirmed?.(fresh);
    } catch {
      /* socket / next sync will catch up */
    }
  }, [onCancelled, onConfirmed, orderId]);

  useEffect(() => {
    if (!timeUp) return undefined;
    const t = setTimeout(syncAfterTimeout, 10000);
    return () => clearTimeout(t);
  }, [timeUp, syncAfterTimeout]);

  const customerName = order?.customerName || order?.deliveryAddress?.fullName || order?.deliveryAddress?.name || order?.userId?.name || 'Customer';
  const customerPhone = order?.customerPhone || order?.deliveryAddress?.phone || order?.userId?.phone || '';
  const cashToCollect = Number(order?.pricing?.total || order?.total || 0);
  const codCharge = Number(order?.pricing?.codCharge || order?.codCharge || 0);
  const items = Array.isArray(order?.items) ? order.items : [];
  const canMarkUnreachable = attempts >= MIN_CALL_ATTEMPTS;

  const handleCall = async () => {
    if (!customerPhone) {
      toast.error('Customer phone number is not available');
      return;
    }
    try {
      const res = await deliveryAPI.logCodCallAttempt(orderId);
      const next = res?.data?.data?.codVerification?.callAttempts;
      setAttempts((a) => (Number.isFinite(Number(next)) ? Number(next) : a + 1));
    } catch (err) {
      const msg = err?.response?.data?.message;
      if (msg) toast.error(msg);
    }
    window.location.href = `tel:${customerPhone}`;
  };

  const handleConfirm = async () => {
    if (busy) return;
    setBusy('confirm');
    try {
      const res = await deliveryAPI.confirmCodOrder(orderId);
      toast.success('Order confirmed and sent to the restaurant');
      onConfirmed?.(unwrapOrder(res));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not confirm the order. Please try again.');
      if (String(err?.response?.data?.message || '').toLowerCase().includes('cancel')) onCancelled?.();
    } finally {
      setBusy('');
    }
  };

  const handleUnreachable = async () => {
    if (busy || !canMarkUnreachable) return;
    if (!window.confirm('Cancel this order because the customer is not answering?')) return;
    setBusy('unreachable');
    try {
      await deliveryAPI.markCodCustomerUnreachable(orderId);
      toast('Order cancelled: customer not reachable');
      onCancelled?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update the order. Please try again.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="absolute inset-0 z-[120] flex items-end justify-center pointer-events-none">
      <div className="w-full max-w-lg bg-white rounded-t-[2rem] shadow-[0_-25px_80px_rgba(0,0,0,0.5)] pointer-events-auto max-h-[90dvh] overflow-y-auto">
        <div className={`px-6 py-5 text-white ${timeUp ? 'bg-gray-700' : 'bg-gradient-to-br from-amber-500 to-orange-600'}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">
            Confirm COD order #{order?.order_id || order?.orderId || ''}
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <h2 className="text-xl font-black leading-tight">Call the customer to confirm</h2>
            <div className="rounded-2xl bg-white/15 border border-white/25 px-3 py-1.5 text-center min-w-[78px]">
              <span className="block text-[9px] font-black uppercase tracking-widest text-white/70">Time left</span>
              <span className="block text-2xl font-black tabular-nums leading-none">{formatClock(secondsLeft)}</span>
            </div>
          </div>
          <p className="mt-2 text-xs font-semibold text-white/85">
            The restaurant gets this order only after the customer confirms it with you.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Customer</p>
              <p className="text-lg font-black text-gray-950 truncate">{customerName}</p>
              <p className="text-xs font-bold text-gray-500">
                {customerPhone || 'Phone not available'} · Calls made: {attempts}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCall}
              disabled={timeUp || Boolean(busy)}
              className="shrink-0 w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 disabled:bg-gray-300 disabled:shadow-none active:scale-90"
              aria-label="Call customer"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-gray-100 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Collect cash</p>
              <p className="text-lg font-black text-gray-950 flex items-center"><IndianRupee className="w-4 h-4" />{cashToCollect.toFixed(cashToCollect % 1 ? 2 : 0)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">COD charge (yours)</p>
              <p className="text-lg font-black text-emerald-700 flex items-center"><IndianRupee className="w-4 h-4" />{codCharge}</p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="rounded-2xl border border-gray-100 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Read the order to the customer</p>
              <ul className="space-y-0.5">
                {items.slice(0, 8).map((it, i) => (
                  <li key={`${it.itemId || i}-${i}`} className="text-xs font-bold text-gray-700">
                    {it.quantity} × {it.name}{it.variantName ? ` (${it.variantName})` : ''}
                  </li>
                ))}
                {items.length > 8 && <li className="text-xs font-bold text-gray-400">+{items.length - 8} more</li>}
              </ul>
            </div>
          )}

          {timeUp ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-red-700">Time is up. The order was not confirmed and is being cancelled.</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={timeUp || Boolean(busy)}
            className="w-full rounded-2xl bg-emerald-600 py-4 text-[12px] font-black uppercase tracking-[0.15em] text-white disabled:bg-gray-300 flex items-center justify-center gap-2 active:scale-95"
          >
            {busy === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Customer confirmed the order
          </button>

          <button
            type="button"
            onClick={handleUnreachable}
            disabled={timeUp || Boolean(busy) || !canMarkUnreachable}
            className="w-full rounded-2xl border-2 border-gray-200 py-3.5 text-[11px] font-black uppercase tracking-[0.15em] text-gray-800 disabled:text-gray-400 flex items-center justify-center gap-2 active:scale-95"
          >
            {busy === 'unreachable' ? <Loader2 className="w-4 h-4 animate-spin" /> : canMarkUnreachable ? <PhoneOff className="w-4 h-4" /> : <Clock3 className="w-4 h-4" />}
            {canMarkUnreachable
              ? 'Customer not reachable - cancel order'
              : `Not reachable (call ${MIN_CALL_ATTEMPTS - attempts} more time${MIN_CALL_ATTEMPTS - attempts === 1 ? '' : 's'})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CodVerificationPanel;
