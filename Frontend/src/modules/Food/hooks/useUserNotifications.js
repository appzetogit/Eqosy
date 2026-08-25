import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { toast } from 'sonner';
import { API_BASE_URL, resolveSocketOrigin } from '@food/api/config';
import { userAPI } from '@food/api';
import { dispatchNotificationInboxRefresh } from '@food/hooks/useNotificationInbox';

const debugLog = (...args) => {
  if (import.meta.env.DEV) {
    console.log('📬 [UserSocket]', ...args);
  }
};

const sanitizeNotificationText = (value) =>
  String(value || '')
    .replace(/â€”/g, '-')
    .replace(/â€¢/g, '•')
    .replace(/Â/g, '')
    .replace(/â[^\s]*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

let sharedSocket = null;
let activeSubscribers = 0;

export const getSocket = () => sharedSocket;

/**
 * Hook for user to receive real-time order notifications.
 * Dispatches 'orderStatusNotification' custom event for OrderTrackingCard.
 */
export const useUserNotifications = () => {
  const [isConnected, setIsConnected] = useState(sharedSocket?.connected || false);
  const [userId, setUserId] = useState(null);

  // Fetch current user ID
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const response = await userAPI.getProfile();
        if (response.data?.success && response.data.data?.user) {
          const user = response.data.data.user;
          const id = user._id?.toString() || user.userId || user.id;
          setUserId(id);
        }
      } catch (error) {
        // Not logged in or error
      }
    };
    fetchUserId();
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const socketUrl = resolveSocketOrigin(API_BASE_URL);

    // Auth token
    const token = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken');
    if (!token) return;

    activeSubscribers++;

    if (!sharedSocket) {
      debugLog('🔌 Connecting to User Socket.IO:', socketUrl);

      sharedSocket = io(socketUrl, {
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        reconnection: true,
        auth: { token }
      });

      sharedSocket.on('connect', () => {
        debugLog('✅ User Socket connected, userId:', userId);
        if (typeof window !== 'undefined') window.orderSocketConnected = true;
        // Backend auto-joins 'user:userId' room based on role/token in config/socket.js
      });

      sharedSocket.on('order_status_update', (data) => {
        debugLog('🔔 Order status update received:', data);

        const statusRaw = String(data?.orderStatus || '').toLowerCase();
        const isCancelled = statusRaw.includes('cancel');

        let title = sanitizeNotificationText(
          data.title || `Order #${data.orderId || 'Update'}`
        );
        let message = sanitizeNotificationText(
          data.message || `Your order status is now ${String(data.orderStatus || '').replace(/_/g, ' ')}`
        );

        if (isCancelled) {
          title = 'Order Cancelled';
          if (!message) message = 'Your order was cancelled.';
        }

        // Optional: Show toast for important updates (Cancel, Ready, etc.)
        const isImportant = isCancelled || ['ready_for_pickup', 'ready', 'confirmed'].includes(data.orderStatus);
        if (isImportant) {
          toast.message(title, {
            description: message,
            duration: 10000,
            id: `order-status-${data.orderId}-${data.orderStatus}`
          });
        }

        // Dispatch custom event for OrderTrackingCard and other listeners
        const event = new CustomEvent('orderStatusNotification', {
          detail: {
            orderMongoId: data.orderMongoId,
            orderId: data.orderId,
            status: data.orderStatus,
            orderStatus: data.orderStatus, // Ensure compatibility with different UI checks
            title,
            message,
            note: data.note,
            deliveryState: data.deliveryState,
            deliveryVerification: data.deliveryVerification,
            timestamp: new Date().toISOString()
          }
        });
        window.dispatchEvent(event);
      });

      /** Customer receives handover OTP when partner confirms "reached drop" (never shown to partner). */
      sharedSocket.on('delivery_drop_otp', (payload) => {
        debugLog('🔐 Delivery handover OTP:', payload?.orderId);
        const otp = payload?.otp != null ? String(payload.otp) : '';
        const orderId = payload?.orderId != null ? String(payload.orderId) : '';
        const message = payload?.message != null ? String(payload.message) : '';
        window.dispatchEvent(
          new CustomEvent('deliveryDropOtp', {
            detail: {
              orderMongoId: payload?.orderMongoId,
              orderId,
              otp,
              message
            }
          })
        );
        const title = orderId ? `Order ${orderId}` : 'Delivery OTP';
        const parts = [message, otp ? `OTP: ${otp}` : ''].filter(Boolean);
        toast.message(title, {
          description: parts.join(' — ') || 'Handover OTP from your delivery partner.',
          duration: 90_000,
          id: `drop-otp-${orderId}`
        });
      });

      sharedSocket.on('admin_notification', (payload) => {
        toast.message(payload?.title || 'Notification', {
          description: payload?.message || 'New broadcast notification received.',
          duration: 8000
        });
        dispatchNotificationInboxRefresh();
      });

      sharedSocket.on('connect_error', (error) => {
        if (import.meta.env.DEV) {
          // debugLog('❌ Socket connection error:', error.message);
        }
      });
    }

    const onConnect = () => {
      setIsConnected(true);
      if (typeof window !== 'undefined') window.orderSocketConnected = true;
    };
    
    const onDisconnect = () => {
      setIsConnected(false);
      if (typeof window !== 'undefined') window.orderSocketConnected = false;
    };

    sharedSocket.on('connect', onConnect);
    sharedSocket.on('disconnect', onDisconnect);
    setIsConnected(sharedSocket.connected);

    return () => {
      activeSubscribers--;
      if (sharedSocket) {
        sharedSocket.off('connect', onConnect);
        sharedSocket.off('disconnect', onDisconnect);

        if (activeSubscribers <= 0) {
          debugLog('🔌 Disconnecting User Socket.IO (No more subscribers)');
          sharedSocket.disconnect();
          sharedSocket = null;
          activeSubscribers = 0;
        }
      }
    };
  }, [userId]);

  return { isConnected };
};
