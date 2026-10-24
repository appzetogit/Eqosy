import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { playRideRequestAlertSound } from "../../modules/driver/utils/rideRequestAlertSound";
import { getLocalDriverToken, saveDriverFcmToken } from '../../modules/driver/services/registrationService';
import { getLocalUserToken, userAuthService } from '../../modules/user/services/authService';

const LAST_BROWSER_FCM_KEY = 'lastBrowserFcmRegistration';
const FIREBASE_CONFIG = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
};
const VAPID_KEY = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();

let foregroundListenerBound = false;
let swMessageListenerBound = false;

const isRideAlertPayload = (payload = {}) => {
  const data = payload?.data || {};
  const type = String(data.type || payload?.type || "").toLowerCase();
  const serviceType = String(data.serviceType || "").toLowerCase();
  return (
    type === "ride_request" ||
    type === "new_ride" ||
    type.includes("ride") ||
    serviceType === "ride" ||
    serviceType === "parcel" ||
    serviceType === "intercity" ||
    Boolean(data.rideId) ||
    String(data.ring) === "true"
  );
};

const dispatchRideRequestPushEvent = (payload) => {
  const data = payload?.data || payload || {};
  if (isRideAlertPayload(payload)) {
    console.info("[taxi-push] ride request push received, playing alert ring", data);
    playRideRequestAlertSound();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("driver-ride-request-push", { detail: payload }));
    }
  }
};

const attachForegroundPushListener = (messaging) => {
  if (foregroundListenerBound || !messaging) return;
  foregroundListenerBound = true;

  try {
    onMessage(messaging, (payload) => {
      console.info("[taxi-push] foreground FCM message received", payload);
      dispatchRideRequestPushEvent(payload);
    });
  } catch (err) {
    console.warn("[taxi-push] onMessage listener error", err);
  }
};

const attachSwMessageListener = () => {
  if (swMessageListenerBound || typeof window === "undefined") return;
  swMessageListenerBound = true;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event?.data;
      if (data?.type === "push-notification-received") {
        dispatchRideRequestPushEvent(data.payload);
      }
    });
  }

  window.addEventListener("native-push-notification", (event) => {
    dispatchRideRequestPushEvent(event?.detail);
  });

  window.__onNativePushNotification = (payload) => {
    dispatchRideRequestPushEvent(payload);
  };
};

let messagingSupportPromise = null;
let lastFcmTokenErrorTime = 0;
const FCM_ERROR_COOLOFF_MS = 300000;

const isDriverPendingApprovalScreen = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const pathname = String(window.location.pathname || '').toLowerCase();
  return pathname === '/taxi/driver/registration-status' || pathname === '/taxi/driver/status';
};

const hasFirebaseConfig = () =>
  Object.values(FIREBASE_CONFIG).every((value) => String(value || '').trim());

const hasBrowserSupport = () =>
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof Notification !== 'undefined';

const getStoredRegistration = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_BROWSER_FCM_KEY) || 'null');
  } catch {
    return null;
  }
};

const persistRegistration = (payload) => {
  localStorage.setItem(LAST_BROWSER_FCM_KEY, JSON.stringify({
    ...payload,
    updatedAt: new Date().toISOString(),
  }));
};

const getFirebaseApp = () => {
  if (!hasFirebaseConfig()) {
    return null;
  }

  return getApps()[0] || initializeApp(FIREBASE_CONFIG);
};

const getMessagingSupport = async () => {
  if (!messagingSupportPromise) {
    messagingSupportPromise = isSupported().catch(() => false);
  }

  return messagingSupportPromise;
};

const getAuthenticatedRoles = () => {
  const roles = [];

  if (getLocalUserToken()) {
    roles.push('user');
  }

  if (getLocalDriverToken() && !isDriverPendingApprovalScreen()) {
    roles.push('driver');
  }

  return roles;
};

const createServiceWorkerUrl = () => {
  const params = new URLSearchParams({
    apiKey: FIREBASE_CONFIG.apiKey,
    authDomain: FIREBASE_CONFIG.authDomain,
    projectId: FIREBASE_CONFIG.projectId,
    storageBucket: FIREBASE_CONFIG.storageBucket,
    messagingSenderId: FIREBASE_CONFIG.messagingSenderId,
    appId: FIREBASE_CONFIG.appId,
  });

  return `/firebase-messaging-sw.js?${params.toString()}`;
};

const saveTokenForRole = async (role, token) => {
  if (role === 'driver') {
    await saveDriverFcmToken(token, 'web');
    return;
  }

  await userAuthService.saveFcmToken(token, 'web');
};

const shouldSkipRegistration = (role, token) => {
  const stored = getStoredRegistration();
  return stored?.role === role && stored?.token === token;
};

const registerBrowserFcmToken = async ({ interactive = false } = {}) => {
  if (!hasBrowserSupport()) {
    return { ok: false, reason: 'browser-unsupported' };
  }

  if (!hasFirebaseConfig() || !VAPID_KEY) {
    return { ok: false, reason: 'firebase-web-config-missing' };
  }

  const roles = getAuthenticatedRoles();
  if (roles.length === 0) {
    return { ok: false, reason: 'missing-auth' };
  }

  const supported = await getMessagingSupport();
  if (!supported) {
    return { ok: false, reason: 'messaging-unsupported' };
  }

  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'permission-denied' };
  }

  if (Notification.permission !== 'granted') {
    if (!interactive) {
      return { ok: false, reason: 'permission-not-granted' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'permission-not-granted' };
    }
  }

  if (!interactive && (Date.now() - lastFcmTokenErrorTime < FCM_ERROR_COOLOFF_MS)) {
    return { ok: false, reason: 'fcm-error-cooloff' };
  }

  const app = getFirebaseApp();
  if (!app) {
    return { ok: false, reason: 'firebase-app-missing' };
  }

  const serviceWorkerRegistration = await navigator.serviceWorker.register(createServiceWorkerUrl());
  const messaging = getMessaging(app);
  attachForegroundPushListener(messaging);
  attachSwMessageListener();

  let token = null;
  try {
    token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration,
    });
  } catch (fcmErr) {
    lastFcmTokenErrorTime = Date.now();
    return { ok: false, reason: 'fcm-token-error', error: fcmErr };
  }

  if (!token) {
    return { ok: false, reason: 'missing-token' };
  }

  const rolesToSave = roles.filter((role) => !shouldSkipRegistration(role, token));
  await Promise.all(rolesToSave.map((role) => saveTokenForRole(role, token)));

  roles.forEach((role) => {
    persistRegistration({ role, token, platform: 'web' });
  });

  return {
    ok: true,
    token,
    roles,
    skippedRoles: roles.filter((role) => !rolesToSave.includes(role)),
  };
};

export const installBrowserFcmRegistration = () => {
  attachSwMessageListener();
  window.__registerBrowserFcmToken = (options) => registerBrowserFcmToken(options);

  const retryPassiveRegistration = () => {
    registerBrowserFcmToken({ interactive: false }).catch(() => {});
  };

  window.addEventListener('focus', retryPassiveRegistration);
  window.addEventListener('pageshow', retryPassiveRegistration);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      retryPassiveRegistration();
    }
  });

  window.setTimeout(retryPassiveRegistration, 2000);
};
