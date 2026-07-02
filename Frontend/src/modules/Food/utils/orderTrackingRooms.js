/**
 * Shared order tracking room helpers — same ids on driver + user so socket.io
 * `tracking:{orderId}` rooms stay in sync (Zomato/Swiggy-style live tracking).
 */

function pushTrackingId(ids, value) {
  if (value == null || value === '') return;

  if (typeof value === 'object') {
    if (value._id != null) pushTrackingId(ids, value._id);
    if (value.orderId != null) pushTrackingId(ids, value.orderId);
    if (value.mongoId != null) pushTrackingId(ids, value.mongoId);
    if (value.id != null && value.id !== value._id) pushTrackingId(ids, value.id);
    return;
  }

  const normalized = String(value).trim();
  if (!normalized || normalized === '[object Object]' || normalized.startsWith('{')) return;
  ids.push(normalized);
}

export function collectOrderTrackingIds(orderOrId, extraIds = []) {
  const ids = [];

  if (typeof orderOrId === 'object' && orderOrId) {
    pushTrackingId(ids, orderOrId.orderId);
    pushTrackingId(ids, orderOrId.mongoId);
    pushTrackingId(ids, orderOrId._id);
    pushTrackingId(ids, orderOrId.id);
  } else {
    pushTrackingId(ids, orderOrId);
  }

  if (Array.isArray(extraIds)) {
    extraIds.forEach((id) => pushTrackingId(ids, id));
  }

  return [...new Set(ids)];
}

export function joinOrderTrackingRooms(socket, orderOrId, joinedSet = null, extraIds = []) {
  if (!socket?.connected) return [];

  const ids = collectOrderTrackingIds(orderOrId, extraIds);
  ids.forEach((id) => {
    if (joinedSet?.has(id)) return;
    socket.emit('join-tracking', id);
    joinedSet?.add(id);
  });

  return ids;
}

export function leaveOrderTrackingRooms(socket, ids, joinedSet = null) {
  if (!socket) return;

  (Array.isArray(ids) ? ids : []).forEach((id) => {
    const key = String(id);
    socket.emit('leave-tracking', key);
    joinedSet?.delete(key);
  });
}

export function leaveAllOrderTrackingRooms(socket, joinedSet) {
  if (!socket || !joinedSet) return;
  leaveOrderTrackingRooms(socket, [...joinedSet], joinedSet);
}
