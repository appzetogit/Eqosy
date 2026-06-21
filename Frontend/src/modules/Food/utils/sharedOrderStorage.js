export const SHARED_ORDER_KEY = 'eqosy:sharedOrder';

export function sanitizeSharerName(raw) {
  if (raw == null) return '';
  let name = String(raw).trim();
  if (!name || name === 'undefined' || name === 'null') return '';
  if (/^https?:\/\//i.test(name)) return '';
  if (name.includes('http://') || name.includes('https://')) return '';
  if (/^someonehttps?:\/\//i.test(name)) return '';
  if (name.length > 60) name = name.slice(0, 60);
  return name;
}

export function readSharedOrder() {
  try {
    const raw = localStorage.getItem(SHARED_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.shareId) return null;
    const userName = sanitizeSharerName(parsed.userName);
    return {
      ...parsed,
      shareId: String(parsed.shareId).split('?')[0].split('#')[0],
      userName: userName || null,
    };
  } catch {
    return null;
  }
}

export function saveSharedOrder(shareId, userName) {
  try {
    const cleanName = sanitizeSharerName(userName) || 'Someone';
    localStorage.setItem(
      SHARED_ORDER_KEY,
      JSON.stringify({
        shareId: String(shareId || '').split('?')[0].split('#')[0],
        userName: cleanName,
        savedAt: Date.now(),
      }),
    );
    return cleanName;
  } catch {
    return null;
  }
}

export function clearSharedOrderStorage() {
  try {
    localStorage.removeItem(SHARED_ORDER_KEY);
  } catch {
    // ignore
  }
}

export function resolveSharerDisplayName({ urlName, storedName, order } = {}) {
  const candidates = [
    urlName,
    storedName,
    order?.customerName,
    order?.userName,
    order?.userId?.name,
    order?.userId?.fullName,
  ];
  for (const candidate of candidates) {
    const clean = sanitizeSharerName(candidate);
    if (clean) return clean;
  }
  return 'Someone';
}
