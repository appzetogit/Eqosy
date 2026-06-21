import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '@food/api/config';
import {
  clearSharedOrderStorage,
  readSharedOrder,
  resolveSharerDisplayName,
  saveSharedOrder,
} from '@food/utils/sharedOrderStorage';

function isTerminalStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'delivered' || s === 'completed' || s.includes('cancelled');
}

async function fetchPublicOrder(shareId) {
  const base = (API_BASE_URL || '/api/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/public/order-track/${encodeURIComponent(shareId)}`);
  if (!res.ok) {
    throw new Error('Order not found');
  }
  const json = await res.json();
  if (!json?.success || !json?.data) {
    throw new Error(json?.message || 'Failed to load order');
  }
  return json.data;
}

export default function SharedOrderCard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [shared, setShared] = useState(() => readSharedOrder());
  const [order, setOrder] = useState(null);

  const isOnSharedTrackingPage = /\/track-shared(?:\/|$)/.test(location.pathname);

  const refresh = useCallback(async () => {
    const current = readSharedOrder();
    if (!current?.shareId) {
      setShared(null);
      setOrder(null);
      return;
    }

    setShared(current);

    try {
      const payload = await fetchPublicOrder(current.shareId);
      const data = payload?.order || payload;
      const status = data?.orderStatus || data?.status;
      if (isTerminalStatus(status)) {
        clearSharedOrderStorage();
        setShared(null);
        setOrder(null);
        return;
      }

      const displayName = resolveSharerDisplayName({
        urlName: searchParams.get('name'),
        storedName: current.userName,
        order: data,
      });
      const savedName = saveSharedOrder(current.shareId, displayName);
      setShared({ ...current, userName: savedName || displayName });
      setOrder(data);
    } catch {
      clearSharedOrderStorage();
      setShared(null);
      setOrder(null);
    }
  }, [searchParams]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (isOnSharedTrackingPage || !shared?.shareId) {
    return null;
  }

  const userName = resolveSharerDisplayName({
    urlName: searchParams.get('name'),
    storedName: shared.userName,
    order,
  });
  const restaurantName =
    order?.restaurantName ||
    order?.restaurantId?.restaurantName ||
    order?.restaurant ||
    'Restaurant';
  const initial = userName.charAt(0).toUpperCase() || 'S';

  const openSharedTracking = () => {
    const params = new URLSearchParams();
    if (userName && userName !== 'Someone') {
      params.set('name', userName);
    }
    const query = params.toString();
    navigate(
      `/food/user/track-shared/${shared.shareId}${query ? `?${query}` : ''}`,
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed bottom-24 left-4 right-4 z-[9998]"
      >
        <div
          onClick={openSharedTracking}
          className="relative cursor-pointer overflow-visible rounded-[20px] border border-orange-100/60 bg-white/95 p-4 shadow-[0_8px_30px_rgba(235,89,14,0.15)] backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute inset-0 rounded-[20px] bg-gradient-to-r from-orange-50/50 via-white/40 to-white/80 opacity-60" />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearSharedOrderStorage();
              setShared(null);
              setOrder(null);
            }}
            className="absolute right-2 top-2 z-20 rounded-full bg-orange-50/80 p-1.5 text-orange-400 shadow-sm transition-colors hover:bg-orange-100/80 hover:text-orange-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="relative z-10 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EB590E] text-lg font-bold text-white shadow-md">
              {initial}
            </div>

            <div className="min-w-0 flex-1 pr-4">
              <p className="truncate text-base font-bold tracking-tight text-gray-900">
                {userName}&apos;s order
              </p>
              <p className="mt-0.5 truncate text-sm font-medium text-gray-500">{restaurantName}</p>
            </div>

            <ChevronRight className="h-5 w-5 shrink-0 text-[#EB590E]" />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
