/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

const sanitize = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");
const PUSH_DEBUG_PREFIX = "[push-sw]";
const pushDebugLog = () => { };
const getNotificationKey = (payload) =>
  payload?.data?.notificationId ||
  payload?.data?.messageId ||
  payload?.messageId ||
  [
    payload?.notification?.title || payload?.data?.title || "",
    payload?.notification?.body || payload?.data?.body || "",
    payload?.data?.orderId || "",
    payload?.data?.targetUrl || payload?.data?.link || "",
  ].join("::");

// Only new-order style pushes (data.ring === "true") and chat may make a sound.
// Status updates (rider arrived, picked up, delivered...) are shown silently.
function shouldPlaySound(payload = {}) {
  const data = payload?.data || {};
  const type = String(data.type || payload?.type || "").toLowerCase();
  if (type.includes("chat") || data.openChat === "true" || data.conversationId) return true;
  if (type.includes("ride") || type.includes("delivery") || data.serviceType || data.rideId) return true;
  return String(data.ring) === "true";
}

function getSoundPath(payload = {}) {
  const data = payload?.data || {};
  const type = String(data.type || payload?.type || "").toLowerCase();
  const serviceType = String(data.serviceType || "").toLowerCase();
  const isTaxiRide =
    type.includes("ride") ||
    type === "ride_request" ||
    serviceType === "ride" ||
    serviceType === "parcel" ||
    serviceType === "intercity" ||
    Boolean(data.rideId);
  return isTaxiRide ? "/ride-request-alert.mp3" : "/zomato_sms.mp3";
}

async function notifyOpenClients(payload) {
  pushDebugLog(PUSH_DEBUG_PREFIX, "Broadcasting push to open clients", { payload });
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  windowClients.forEach((client) => {
    client.postMessage({
      type: "push-notification-received",
      payload,
    });
  });
}

function getTargetPathFromPayload(payload = {}) {
  const rawTarget =
    payload?.data?.targetUrl ||
    payload?.data?.link ||
    payload?.data?.click_action ||
    payload?.fcmOptions?.link ||
    "/";

  try {
    const url = new URL(rawTarget, self.location.origin);
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

async function hasVisibleClientForTarget(payload = {}) {
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const targetPath = getTargetPathFromPayload(payload);
  const targetSegments = String(targetPath).split("/").filter(Boolean);
  // "/taxi" and "/food" hold several apps (user, driver, restaurant...). Match on the app, so a visible
  // /taxi/user tab does not suppress the notification meant for a background /taxi/driver tab.
  const targetRoot = `/${(["taxi", "food"].includes(targetSegments[0]) ? targetSegments.slice(0, 2) : targetSegments.slice(0, 1)).join("/")}`;
  const visibleClient = windowClients.find((client) => {
    const isVisible = client.visibilityState === "visible" || client.focused;
    if (!isVisible) return false;
    try {
      const clientUrl = new URL(client.url);
      if (targetRoot === "/" || !targetRoot) {
        return true;
      }
      return clientUrl.pathname.startsWith(targetRoot);
    } catch {
      return false;
    }
  });
  pushDebugLog(PUSH_DEBUG_PREFIX, "Visible client check", {
    count: windowClients.length,
    targetPath,
    targetRoot,
    hasVisibleClient: Boolean(visibleClient),
    clients: windowClients.map((client) => ({
      url: client.url,
      visibilityState: client.visibilityState,
      focused: client.focused,
    })),
  });
  return Boolean(visibleClient);
}

async function loadFirebaseWebConfig() {
  const candidates = [
    "/api/v1/food/public/env",
    "/api/v1/env/public",
    "/api/env/public",
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const json = await response.json();
      const data = (json && json.data) || {};
      const config = {
        apiKey: sanitize(data.VITE_FIREBASE_API_KEY || data.FIREBASE_API_KEY),
        authDomain: sanitize(data.VITE_FIREBASE_AUTH_DOMAIN || data.FIREBASE_AUTH_DOMAIN),
        projectId: sanitize(data.VITE_FIREBASE_PROJECT_ID || data.FIREBASE_PROJECT_ID),
        appId: sanitize(data.VITE_FIREBASE_APP_ID || data.FIREBASE_APP_ID),
        messagingSenderId: sanitize(data.VITE_FIREBASE_MESSAGING_SENDER_ID || data.FIREBASE_MESSAGING_SENDER_ID),
        storageBucket: sanitize(data.VITE_FIREBASE_STORAGE_BUCKET || data.FIREBASE_STORAGE_BUCKET),
        measurementId: sanitize(data.VITE_FIREBASE_MEASUREMENT_ID || data.FIREBASE_MEASUREMENT_ID),
      };

      if (config.apiKey && config.projectId && config.appId && config.messagingSenderId) {
        pushDebugLog(PUSH_DEBUG_PREFIX, "Loaded Firebase web config");
        return config;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

(async () => {
  const config = await loadFirebaseWebConfig();
  if (!config || !config.apiKey || !config.projectId || !config.appId || !config.messagingSenderId) {
    return;
  }

  firebase.initializeApp(config);
  pushDebugLog(PUSH_DEBUG_PREFIX, "Firebase messaging service worker initialized");
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(async (payload) => {
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received Firebase background message", { payload });

    const visibleClient = await hasVisibleClientForTarget(payload);

    if (!visibleClient) {
      const title = payload?.notification?.title || payload?.data?.title || "New Notification";
      const body = payload?.notification?.body || payload?.data?.body || "";
      const image =
        payload?.notification?.image ||
        payload?.data?.image ||
        payload?.data?.imageUrl ||
        undefined;
      const notificationKey = getNotificationKey(payload);

      pushDebugLog(PUSH_DEBUG_PREFIX, "Showing service worker notification", {
        title,
        body,
        image,
        notificationKey,
      });

      const playSound = shouldPlaySound(payload);
      const isRide = String(payload?.data?.type || "").includes("ride") || Boolean(payload?.data?.rideId);

      self.registration.showNotification(title, {
        body,
        icon: "/eqosy-logo.png",
        badge: "/eqosy-logo.png",
        image,
        tag: notificationKey || ("ride_" + Date.now()),
        renotify: true,
        silent: !playSound,
        requireInteraction: playSound,
        sound: playSound ? getSoundPath(payload) : undefined,
        vibrate: playSound
          ? (isRide ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200, 100, 300])
          : undefined,
        data: payload?.data || {},
      });
    }

    // Always notify clients regardless of visibility
    await notifyOpenClients(payload);
  });
})();

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const promiseChain = (async () => {
    try {
      let payload = {};
      try {
        payload = event.data.json();
      } catch {
        payload = { data: { title: "Eqosy Notification", body: event.data.text() } };
      }

      pushDebugLog(PUSH_DEBUG_PREFIX, "Received push event in service worker", { payload });

      const title = payload?.notification?.title || payload?.data?.title || "Eqosy Notification";
      const body = payload?.notification?.body || payload?.data?.body || "";
      const image =
        payload?.notification?.image ||
        payload?.data?.image ||
        payload?.data?.imageUrl ||
        undefined;
      const notificationKey = getNotificationKey(payload);

      // Check if user has an active, focused tab open for this target
      const visibleClient = await hasVisibleClientForTarget(payload);

      // If app/tab is closed or in background, show native OS notification popup!
      if (!visibleClient) {
        const playSound = shouldPlaySound(payload);
        const isRide = String(payload?.data?.type || "").includes("ride") || Boolean(payload?.data?.rideId);

        await self.registration.showNotification(title, {
          body,
          icon: "/eqosy-logo.png",
          badge: "/eqosy-logo.png",
          image,
          tag: notificationKey || ("push_" + Date.now()),
          renotify: true,
          silent: !playSound,
          requireInteraction: playSound,
          sound: playSound ? getSoundPath(payload) : undefined,
          vibrate: playSound
            ? (isRide ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200, 100, 300])
            : undefined,
          data: payload?.data || {},
        });
      }

      await notifyOpenClients(payload);
    } catch (err) {
      console.error("[push-sw] Error processing push event:", err);
    }
  })();

  event.waitUntil(promiseChain);
});

self.addEventListener("notificationclick", (event) => {
  pushDebugLog(PUSH_DEBUG_PREFIX, "Notification click received", {
    data: event?.notification?.data || {},
    tag: event?.notification?.tag || "",
  });
  event.notification.close();
  const notificationData = event?.notification?.data || {};
  const notifTag = String(event?.notification?.tag || "");
  const rideId = notificationData.rideId || notificationData.ride_id || "";
  const orderId = notificationData.orderId || notificationData.order_id || "";
  const isRestaurantNotification =
    notifTag.includes("restaurant") ||
    notificationData.role === "restaurant" ||
    notificationData.ownerType === "RESTAURANT" ||
    Boolean(notificationData.targetUrl && String(notificationData.targetUrl).includes("restaurant"));

  const isDeliveryNotification =
    notifTag.includes("delivery") ||
    notificationData.role === "delivery" ||
    notificationData.ownerType === "DELIVERY_PARTNER" ||
    notificationData.type === "new_order" ||
    Boolean(notificationData.targetUrl && String(notificationData.targetUrl).includes("delivery"));

  let rawLink =
    notificationData.link ||
    notificationData.targetUrl ||
    (notificationData.click_action && String(notificationData.click_action).startsWith("/") ? notificationData.click_action : null);

  if (rawLink && String(rawLink).startsWith("/restaurant")) {
    rawLink = `/food${rawLink}`;
  }

  if (rawLink && (rawLink === "/food/restaurant/orders" || rawLink.startsWith("/food/restaurant/orders/"))) {
    rawLink = "/food/restaurant";
  }

  if (!rawLink || !rawLink.startsWith("/")) {
    if (notificationData.type === 'chat_message' || notificationData.chatType === 'food_order_chat' || notificationData.openChat === 'true') {
      if (orderId) {
        const isDelivery = notificationData.role === 'delivery' || notificationData.ownerType === 'DELIVERY_PARTNER';
        rawLink = isDelivery 
          ? `/food/delivery/orders/${orderId}/chat` 
          : `/food/user/orders/${orderId}/chat`;
      }
    } else if (rideId) {
      rawLink = `/taxi/driver/home?rideId=${encodeURIComponent(rideId)}`;
    } else if (isRestaurantNotification) {
      rawLink = "/food/restaurant";
    } else if (isDeliveryNotification) {
      rawLink = "/food/delivery/feed";
    } else {
      rawLink = "/";
    }
  }

  const targetUrl = String(rawLink || "/").startsWith("/") ? String(rawLink || "/") : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const client = windowClients.find((c) => c.url.includes(self.location.origin));
      if (client) {
        client.focus();
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname !== targetUrl) {
            return client.navigate(targetUrl);
          }
        } catch {
          return client.navigate(targetUrl);
        }
        return;
      }
      return clients.openWindow(targetUrl);
    }),
  );
});

