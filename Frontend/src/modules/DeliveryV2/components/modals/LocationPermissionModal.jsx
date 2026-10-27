import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Settings, Loader2 } from 'lucide-react';

/**
 * Blocking popup shown to a delivery partner who is ONLINE but whose browser
 * location is unavailable:
 * - permission === 'prompt'  -> "Enable Location" triggers the browser dialog
 *   (getCurrentPosition must run inside the click for Safari).
 * - permission === 'denied'  -> browser cannot re-prompt; show steps to
 *   re-enable in site settings. Closes automatically when permission flips
 *   to granted (parent re-renders via useGeoPermission).
 */
export function LocationPermissionModal({ open, permission, onEnabled }) {
  const [requesting, setRequesting] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!open) return null;

  const isDenied = permission === 'denied';

  const handleEnable = () => {
    if (!navigator.geolocation) return;
    setRequesting(true);
    setFailed(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequesting(false);
        onEnabled?.(pos);
      },
      () => {
        setRequesting(false);
        setFailed(true);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6"
        >
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              {isDenied ? (
                <Settings className="w-7 h-7 text-red-500" />
              ) : (
                <MapPin className="w-7 h-7 text-red-500" />
              )}
            </div>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">
              {isDenied ? 'Location Blocked' : 'Location Needed'}
            </h2>
            {isDenied ? (
              <div className="text-sm text-gray-500 text-left space-y-1">
                <p>You are online but location is blocked, so you can't receive orders or share live tracking. To fix it:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Tap the lock icon next to the address bar</li>
                  <li>Open <b>Site settings / Permissions</b></li>
                  <li>Set <b>Location</b> to <b>Allow</b></li>
                </ol>
                <p>This popup closes automatically once location is enabled.</p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Live location is required while you are online — it's used for order
                assignment and customer tracking.
              </p>
            )}
            {failed && (
              <p className="text-xs text-red-500">
                Still couldn't get your location. Check GPS and browser permission, then try again.
              </p>
            )}
            <button
              onClick={handleEnable}
              disabled={requesting}
              className="mt-2 w-full py-3 rounded-2xl bg-gray-900 text-white font-bold uppercase tracking-wide text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {requesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Getting location…
                </>
              ) : isDenied ? 'Retry' : 'Enable Location'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default LocationPermissionModal;
