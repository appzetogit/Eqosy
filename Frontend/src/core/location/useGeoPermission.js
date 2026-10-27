import { useEffect, useState, useCallback } from "react";

/**
 * useGeoPermission — reactive browser geolocation permission state.
 *
 * Returns one of: 'granted' | 'prompt' | 'denied' | 'unsupported' | 'unknown'
 * and re-renders automatically when the user changes the permission from the
 * browser UI (lock icon / site settings), so popups can appear/disappear live.
 *
 * Note: the browser only shows its own permission dialog when state is
 * 'prompt' AND getCurrentPosition/watchPosition is called from a user gesture.
 * When state is 'denied' the app cannot re-prompt — the user must re-enable
 * it in browser settings; show instructions for that case.
 */
export function useGeoPermission() {
  const [permission, setPermission] = useState("unknown");

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      return "unsupported";
    }
    if (!navigator.permissions?.query) {
      // Permissions API unavailable (older Safari) — state can't be observed.
      setPermission("unknown");
      return "unknown";
    }
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      setPermission(status.state);
      return status.state;
    } catch {
      setPermission("unknown");
      return "unknown";
    }
  }, []);

  useEffect(() => {
    let active = true;
    let statusObj = null;
    let listener = null;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      return undefined;
    }
    if (!navigator.permissions?.query) {
      setPermission("unknown");
      return undefined;
    }

    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (!active) return;
        statusObj = status;
        setPermission(status.state);
        listener = () => setPermission(status.state);
        status.addEventListener("change", listener);
        // Safari fallback
        status.onchange = listener;
      })
      .catch(() => {
        if (active) setPermission("unknown");
      });

    return () => {
      active = false;
      if (statusObj && listener) {
        statusObj.removeEventListener("change", listener);
        statusObj.onchange = null;
      }
    };
  }, []);

  return { permission, refresh };
}
