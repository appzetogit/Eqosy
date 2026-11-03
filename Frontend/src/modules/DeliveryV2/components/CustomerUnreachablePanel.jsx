import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneOff, Clock3, Store, Navigation, CheckCircle2, Loader2, ShieldCheck, Hourglass } from 'lucide-react';
import { toast } from 'sonner';
import { deliveryAPI } from '@food/api';

// Must match FOOD_UNREACHABLE_MIN_WAIT_MINUTES on the server (default 5).
const RETURN_MIN_WAIT_MINUTES = 5;
const POLL_MS = 8000;

const formatClock = (totalSeconds) => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

const unwrapOrder = (res) => {
  const data = res?.data?.data;
  return data?.order || data || null;
};

/**
 * Shown at the customer's door. When the customer does not answer, the rider waits, then asks admin to approve
 * taking the food back. After approval the rider returns it and enters the OTP shown in the restaurant panel.
 */
export const CustomerUnreachablePanel = ({ order, onStatusChange, onReturned }) => {
  const orderId = order?.orderMongoId || order?._id || order?.orderId;
  const [ret, setRet] = useState(order?.undeliveredReturn || { status: 'none' });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [returned, setReturned] = useState(false);
  const firstSeenRef = useRef(Date.now());
  const status = returned ? 'returned' : (ret?.status || 'none');

  const applyReturnState = useCallback((next) => {
    if (!next) return;
    setRet(next);
    onStatusChange?.(next.status || 'none');
  }, [onStatusChange]);

  const refresh = useCallback(async () => {
    if (!orderId) return;
    try {
      const fresh = unwrapOrder(await deliveryAPI.getOrderDetails(orderId));
      if (fresh?.undeliveredReturn) applyReturnState(fresh.undeliveredReturn);
    } catch {
      /* the next poll or socket event will retry */
    }
  }, [applyReturnState, orderId]);

  useEffect(() => {
    // Also resets the parent's status when a new order opens (order may have no undeliveredReturn yet).
    applyReturnState(order?.undeliveredReturn || { status: 'none' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order?.undeliveredReturn?.status]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Admin decision arrives over the socket; also poll while we wait in case the event is missed.
  useEffect(() => {
    const onUpdate = () => refresh();
    window.addEventListener('delivery_order_return_update', onUpdate);
    return () => window.removeEventListener('delivery_order_return_update', onUpdate);
  }, [refresh]);

  useEffect(() => {
    if (status !== 'requested') return undefined;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, status]);

  const reachedAt = order?.deliveryState?.reachedDropAt
    ? new Date(order.deliveryState.reachedDropAt).getTime()
    : firstSeenRef.current;
  const waitedSeconds = Math.max(0, (now - reachedAt) / 1000);
  const secondsLeft = Math.max(0, RETURN_MIN_WAIT_MINUTES * 60 - waitedSeconds);
  const canAsk = secondsLeft <= 0;

  const handleRequest = async () => {
    if (!orderId || busy) return;
    setBusy(true);
    try {
      const res = await deliveryAPI.requestCustomerUnreachable(orderId, {
        reason: 'Customer not answering calls',
      });
      applyReturnState(unwrapOrder(res)?.undeliveredReturn || { status: 'requested' });
      toast.success('Request sent to admin. Please wait for approval.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not send the request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyReturn = async () => {
    if (otp.length !== 4 || busy) return;
    setBusy(true);
    try {
      await deliveryAPI.verifyReturnOtp(orderId, otp);
      setReturned(true);
      toast.success('Order returned. Your earning has been added to your wallet.');
      setTimeout(() => onReturned?.(), 2500);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Invalid OTP');
    } finally {
      setBusy(false);
    }
  };

  const restaurantName = order?.restaurantName || order?.restaurantId?.restaurantName || 'the restaurant';
  const restaurantAddress = order?.restaurantAddress || '';
  const rLat = order?.restaurantLocation?.lat ?? order?.restaurant_lat;
  const rLng = order?.restaurantLocation?.lng ?? order?.restaurant_lng;
  const navUrl = rLat != null && rLng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${rLat},${rLng}&travelmode=driving`
    : '';

  if (status === 'returned') {
    return (
      <div className="w-full rounded-3xl border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-3">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
        <div>
          <p className="text-sm font-black text-emerald-800">Food returned to restaurant</p>
          <p className="text-xs font-semibold text-emerald-700">Your delivery earning has been credited to your wallet.</p>
        </div>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="w-full rounded-3xl border border-blue-200 bg-blue-50 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Store className="w-7 h-7 text-blue-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-black text-blue-900">Return the food to {restaurantName}</p>
            <p className="text-xs font-semibold text-blue-700">
              Admin approved. You will still get your earning for this order.
            </p>
            {restaurantAddress ? <p className="mt-1 text-xs font-bold text-gray-700">{restaurantAddress}</p> : null}
          </div>
          {navUrl ? (
            <button
              type="button"
              onClick={() => window.open(navUrl, '_blank')}
              className="w-11 h-11 rounded-2xl bg-gray-950 flex items-center justify-center text-white shrink-0 active:scale-90"
              aria-label="Navigate to restaurant"
            >
              <Navigation className="w-5 h-5" />
            </button>
          ) : null}
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Ask the restaurant for the return OTP
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4-digit OTP"
              className="flex-1 min-w-0 rounded-2xl border-2 border-gray-200 bg-white px-4 py-3 text-center text-xl font-black tracking-[0.4em] focus:border-blue-500 outline-none"
            />
            <button
              type="button"
              onClick={handleVerifyReturn}
              disabled={otp.length !== 4 || busy}
              className="rounded-2xl bg-blue-600 px-5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40 active:scale-95"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'requested') {
    return (
      <div className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
        <Hourglass className="w-7 h-7 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-black text-amber-900">Waiting for admin approval</p>
          <p className="text-xs font-semibold text-amber-700">
            Admin was notified that the customer is not responding. Stay at the location until they reply.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-3xl border border-gray-200 bg-gray-50 p-5 space-y-3">
      {status === 'rejected' && ret?.rejectionReason ? (
        <p className="rounded-2xl bg-red-50 border border-red-100 px-3 py-2 text-xs font-bold text-red-700">
          Admin: {ret.rejectionReason}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <PhoneOff className="w-6 h-6 text-gray-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-black text-gray-900">Customer not answering?</p>
          <p className="text-xs font-semibold text-gray-500">
            Keep calling. After {RETURN_MIN_WAIT_MINUTES} minutes you can contact support to return the order.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleRequest}
        disabled={!canAsk || busy}
        className="w-full rounded-2xl bg-gray-900 py-4 text-[11px] font-black uppercase tracking-[0.18em] text-white disabled:bg-gray-300 disabled:text-gray-500 flex items-center justify-center gap-2 active:scale-95"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : canAsk ? (
          <>Contact support - customer not responding</>
        ) : (
          <><Clock3 className="w-4 h-4" /> Contact support in {formatClock(secondsLeft)}</>
        )}
      </button>
    </div>
  );
};

export default CustomerUnreachablePanel;
