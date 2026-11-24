// Removes the ringing new-order notification(s) from the phone / browser tray once the restaurant or rider
// has acted on the order inside the app (accept, reject, items unavailable, offer passed).
// Closing the notification is what stops its ringtone; the server also sends a silent replacement
// (type "ring_stop") for phones where the web page cannot reach the tray.

const ORDER_TAG_PREFIXES = ['order-', 'restaurant-order-', 'delivery-order-'];

const orderIdsOf = (orderOrId) => {
  if (!orderOrId) return [];
  if (typeof orderOrId !== 'object') return [String(orderOrId).trim()].filter(Boolean);
  return [
    orderOrId.orderMongoId,
    orderOrId._id,
    orderOrId.orderId,
    orderOrId.order_id,
    orderOrId.id,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim());
};

/**
 * @param {string|object} [orderOrId] - the order acted on. Omit to clear every order alert notification.
 */
export async function dismissOrderAlertNotifications(orderOrId) {
  if (typeof window === 'undefined') return;
  const ids = new Set(orderIdsOf(orderOrId));

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        const list = await registration.getNotifications();
        list.forEach((n) => {
          const tag = String(n.tag || '');
          const isOrderAlert =
            ORDER_TAG_PREFIXES.some((p) => tag.startsWith(p)) ||
            Boolean(n.data?.orderId || n.data?.orderMongoId);
          if (!isOrderAlert) return;
          if (ids.size === 0) {
            n.close();
            return;
          }
          const nIds = [n.data?.orderMongoId, n.data?.orderId].filter(Boolean).map(String);
          const tagMatches = [...ids].some((id) => ORDER_TAG_PREFIXES.some((p) => tag === `${p}${id}`));
          if (tagMatches || nIds.some((id) => ids.has(id))) n.close();
        });
      }
    }
  } catch {
    // Notifications API not available: nothing to close.
  }

  // Native wrapper app (if it exposes one of these handlers): stop its ringtone. Fire-and-forget, never awaited,
  // because an unregistered handler may never answer.
  try {
    const bridge = window.flutter_inappwebview;
    if (bridge && typeof bridge.callHandler === 'function') {
      const payload = { orderId: [...ids][0] || '' };
      ['stopNotificationSound', 'stopRingtone', 'cancelOrderNotification'].forEach((name) => {
        try {
          const p = bridge.callHandler(name, payload);
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {
          // handler not present
        }
      });
    }
  } catch {
    // ignore
  }
}
