import { toast } from 'sonner';
import shiftEndRingSound from '@food/assets/audio/original.mp3';

/**
 * Gig shift-end alert for the delivery partner app.
 *
 * - Rings ONCE (no loop) when the shift ends; the "Stop" button silences it at once.
 * - Each alert (one per gig booking, `alertId`) rings only once on this device: the socket event and the
 *   push for the same shift both arrive, and a reload / reconnect must not ring it again.
 */
const DONE_PREFIX = 'shift_end_alert_done_';
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;

let activeAudio = null;
let activeToastId = null;

function readStorage(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function pruneOldMarks() {
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DONE_PREFIX)) continue;
      const at = Number(localStorage.getItem(key));
      if (!Number.isFinite(at) || now - at > KEEP_MS) localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors
  }
}

function wasHandled(alertId) {
  return Boolean(readStorage(DONE_PREFIX + alertId));
}

function markHandled(alertId) {
  try {
    localStorage.setItem(DONE_PREFIX + alertId, String(Date.now()));
  } catch {
    // ignore storage errors
  }
}

export function isShiftEndPush(payload = {}) {
  const data = payload?.data || payload || {};
  return String(data.type || payload?.type || '').toLowerCase() === 'shift_ended';
}

/** Silence the shift-end ring and close its banner. */
export function stopShiftEndAlert() {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // ignore
    }
    activeAudio = null;
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(0);
  } catch {
    // ignore
  }
  if (activeToastId !== null) {
    const id = activeToastId;
    activeToastId = null;
    toast.dismiss(id);
  }
}

/**
 * Ring once for a shift end. Returns false when this alert was already shown on this device.
 * @param {{ alertId?: string, bookingId?: string, title?: string, message?: string }} alert
 */
export function presentShiftEndAlert(alert = {}) {
  const alertId = String(alert.alertId || alert.bookingId || '').trim();
  if (!alertId || wasHandled(alertId)) return false;
  markHandled(alertId);
  pruneOldMarks();

  stopShiftEndAlert();

  const audio = new Audio(shiftEndRingSound);
  audio.loop = false;
  audio.onended = () => {
    if (activeAudio === audio) activeAudio = null;
  };
  activeAudio = audio;
  audio.play().catch(() => {
    if (activeAudio === audio) activeAudio = null;
  });

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([300, 150, 300]);
    }
  } catch {
    // ignore
  }

  const toastId = `shift-end-${alertId}`;
  // Only act if this banner is still the current one (a later alert may have replaced it).
  const stopIfCurrent = () => {
    if (activeToastId === toastId) stopShiftEndAlert();
  };
  activeToastId = toastId;
  toast.warning(alert.title || 'Shift Ended — You are now Offline', {
    id: toastId,
    description: alert.message || 'Your gig shift has ended. Book a new gig to go online again.',
    duration: Infinity,
    action: { label: 'Stop', onClick: stopIfCurrent },
    onDismiss: stopIfCurrent,
  });
  return true;
}
