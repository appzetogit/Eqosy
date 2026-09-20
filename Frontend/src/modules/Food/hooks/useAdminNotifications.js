import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAPI, supportAPI } from "@food/api";
import { io } from "socket.io-client";
import { API_BASE_URL, resolveSocketOrigin } from "@food/api/config";
import { toast } from "sonner";

const STORAGE_KEY = "admin_notifications_dismissed_v1";
const REALTIME_KEY = "admin_realtime_notifications_v1";
const UPDATE_EVENT = "adminNotificationsUpdated";

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const getDismissedIds = () => {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(STORAGE_KEY), []);
};

const saveDismissedIds = (ids = []) => {
  if (typeof window === "undefined") return;
  try {
    const unique = [...new Set(ids.filter(Boolean))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  } catch (err) {
    console.warn("Failed to save dismissed notification IDs", err);
  }
};

const getStoredRealtimeNotifs = () => {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(REALTIME_KEY), []);
};

const saveStoredRealtimeNotifs = (items = []) => {
  if (typeof window === "undefined") return;
  try {
    const uniqueItems = uniqueById(items).slice(0, 100);
    localStorage.setItem(REALTIME_KEY, JSON.stringify(uniqueItems));
  } catch (err) {
    console.warn("Failed to save realtime notifications", err);
  }
};

export const dispatchAdminNotificationsUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UPDATE_EVENT));
};

const toDateValue = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const toDateLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const uniqueById = (items = []) => {
  const map = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    map.set(item.id, item);
  }
  return [...map.values()];
};

const joinMeta = (...parts) => parts.filter(Boolean).join(" • ");

const extractRows = (res) => {
  if (!res) return [];
  // Axios wraps: res.data = { success, message, data: { ... } }
  // So res.data.data is the actual payload object
  const payload = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.requests)) return payload.requests;
  if (Array.isArray(payload?.partners)) return payload.partners;
  if (Array.isArray(payload?.deliveryPartners)) return payload.deliveryPartners;
  if (Array.isArray(payload?.deliverymen)) return payload.deliverymen;
  if (Array.isArray(payload?.restaurants)) return payload.restaurants;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.tickets)) return payload.tickets;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const mapPendingHandovers = (response) => {
  const list = extractRows(response);

  // Only show orders with PENDING handover request (backend already filters but double-check)
  return list.filter((item) => {
    const hrStatus = String(item?.dispatch?.handoverRequest?.status || "").toLowerCase();
    return !hrStatus || hrStatus === "pending";
  }).map((item) => {
    const requestedBy = item?.dispatch?.handoverRequest?.requestedBy;
    const partnerName =
      (typeof requestedBy === "object" ? (requestedBy?.name || requestedBy?.fullName) : null) ||
      item?.deliveryPartnerName ||
      item?.deliveryPartner?.fullName ||
      item?.deliveryPartner?.name ||
      "Delivery Partner";
    const partnerPhone =
      (typeof requestedBy === "object" ? requestedBy?.phone : null) ||
      item?.deliveryPartnerPhone ||
      item?.deliveryPartner?.phone ||
      "";
    const partnerVehicle =
      (typeof requestedBy === "object"
        ? [requestedBy?.vehicleType, requestedBy?.vehicleNumber].filter(Boolean).join(" - ")
        : null) || "";

    const restaurantObj = typeof item?.restaurantId === "object" ? item.restaurantId : null;
    const restaurantName = restaurantObj?.restaurantName || restaurantObj?.name || item?.restaurantName || "Restaurant";
    const zoneName = (typeof restaurantObj?.zoneId === "object" ? restaurantObj.zoneId?.name : null) || restaurantObj?.area || item?.zoneName || "Zone";

    const userObj = typeof item?.userId === "object" ? item.userId : null;
    const customerName = userObj?.name || userObj?.fullName || item?.customerName || item?.deliveryAddress?.contactName || "Customer";
    const customerPhone = userObj?.phone || item?.customerPhone || item?.deliveryAddress?.contactPhone || "";
    const customerAddress = item?.customerAddress || item?.deliveryAddress?.formattedAddress || [item?.deliveryAddress?.addressLine1, item?.deliveryAddress?.city].filter(Boolean).join(", ") || "";

    const reason = item?.dispatch?.handoverRequest?.reason || item?.reason || "Emergency";
    const note = item?.dispatch?.handoverRequest?.note || item?.note || "";
    const orderDisplayId = item?.order_id || item?.orderId || item?._id;
    const orderMongoId = String(item?._id || item?.id || item?.orderMongoId || "");

    return {
      id: `approval-handover-${orderMongoId}`,
      orderMongoId,
      orderId: orderDisplayId,
      title: "🚨 Order Handover Request",
      message: `Driver ${partnerName}${partnerPhone ? ` (${partnerPhone})` : ""} requested handover for Order #${orderDisplayId} (${restaurantName}). Reason: ${reason}${note ? ` (${note})` : ""}. Driver set Offline. Admin approval required.`,
      type: "approval",
      category: "handover_approval",
      path: `/admin/food/delivery-partners/gigs?handoverId=${orderMongoId}`,
      createdAt:
        item?.dispatch?.handoverRequest?.requestedAt ||
        item?.updatedAt ||
        item?.createdAt,
      timeLabel: toDateLabel(
        item?.dispatch?.handoverRequest?.requestedAt ||
          item?.updatedAt ||
          item?.createdAt
      ),
      metaLabel: joinMeta(`Order #${orderDisplayId}`, partnerName, restaurantName, zoneName, reason),
      partnerName,
      partnerPhone,
      partnerVehicle,
      restaurantName,
      zoneName,
      customerName,
      customerPhone,
      customerAddress,
      reason,
      note,
      rawOrder: item,
    };
  });
};

const mapPendingRestaurants = (response) => {
  const rows = extractRows(response);
  return rows
    .filter((item) => !item?.status || String(item?.status).toLowerCase() === "pending")
    .map((item) => ({
      id: `approval-restaurant-${String(item?._id || item?.id || "")}`,
      title: "Restaurant Approval Pending",
      message: `${item?.restaurantName || "Restaurant"} submitted a restaurant approval request. Owner: ${item?.ownerName || "N/A"}. Contact: ${item?.ownerPhone || "N/A"}.`,
      type: "approval",
      category: "restaurant_approval",
      path: "/admin/food/restaurants/joining-request",
      createdAt: item?.createdAt || item?.updatedAt,
      timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
      metaLabel: joinMeta(item?.restaurantName, item?.ownerName, item?.ownerPhone),
    }));
};

const mapDeliveryJoinRequests = (response) => {
  const rows = extractRows(response);
  return rows
    .filter((item) => !item?.status || String(item?.status).toLowerCase() === "pending")
    .map((item) => ({
      id: `approval-delivery-${String(item?._id || item?.id || "")}`,
      title: "Delivery Partner Approval Pending",
      message: `${item?.name || "Delivery partner"} submitted a joining request. Phone: ${item?.phone || "N/A"}. Email: ${item?.email || "N/A"}.`,
      type: "approval",
      category: "delivery_approval",
      path: "/admin/food/delivery-partners/join-request",
      createdAt: item?.createdAt || item?.updatedAt,
      timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
      metaLabel: joinMeta(item?.name, item?.phone, item?.email),
    }));
};

const mapFoodApprovals = (response) => {
  const rows = extractRows(response);
  return rows
    .filter((item) => !item?.approvalStatus || String(item?.approvalStatus).toLowerCase() === "pending")
    .map((item) => ({
      id: `approval-food-${String(item?._id || item?.id || "")}`,
      title: "Food Approval Pending",
      message: `${item?.itemName || "Food item"} from ${item?.restaurantName || "Restaurant"} is waiting for review. Category: ${item?.category || item?.type || "N/A"}.`,
      type: "approval",
      category: "food_approval",
      path: "/admin/food/food-approval",
      createdAt: item?.requestedAt || item?.createdAt || item?.updatedAt,
      timeLabel: toDateLabel(item?.requestedAt || item?.createdAt || item?.updatedAt),
      metaLabel: joinMeta(item?.restaurantName, item?.itemName, item?.category || item?.type),
    }));
};

const mapUserRestaurantSupport = (response) => {
  const rows = extractRows(response);
  return rows
    .filter((item) => !["resolved", "closed"].includes(String(item?.status || "").toLowerCase()))
    .map((item) => {
      const isRestaurantTicket = item?.source === "restaurant";
      const title = isRestaurantTicket ? "Restaurant Support Ticket" : "User Support Ticket";
      const message = isRestaurantTicket
        ? `${item?.restaurantName || "Restaurant"} raised a support ticket. Subject: ${item?.subject || item?.issueType || "N/A"}. Status: ${item?.status || "open"}.`
        : `${item?.user?.name || "User"} raised a support ticket${item?.restaurantName ? ` for ${item.restaurantName}` : ""}. Issue: ${item?.issueType || item?.type || "N/A"}. Status: ${item?.status || "open"}.`;

      const metaLabel = isRestaurantTicket
        ? joinMeta(item?.restaurantName, item?.subject || item?.issueType, item?.status)
        : joinMeta(item?.user?.name, item?.user?.phone, item?.issueType || item?.type, item?.status);

      return {
        id: `support-main-${String(item?._id || item?.id || "")}`,
        title,
        message,
        type: "support",
        category: "support",
        path: "/admin/food/support-tickets",
        createdAt: item?.createdAt || item?.updatedAt,
        timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
        metaLabel,
      };
    });
};

const mapDeliverySupport = (response) => {
  const rows = extractRows(response);
  return rows
    .filter((item) => !["resolved", "closed"].includes(String(item?.status || "").toLowerCase()))
    .map((item) => ({
      id: `support-delivery-${String(item?._id || item?.id || "")}`,
      title: "Delivery Support Ticket",
      message: `${item?.deliveryPartner?.name || "Delivery partner"} raised a support ticket. Subject: ${item?.subject || "N/A"}. Priority: ${item?.priority || "medium"}. Status: ${item?.status || "open"}.`,
      type: "support",
      category: "delivery_support",
      path: "/admin/food/delivery-support-tickets",
      createdAt: item?.createdAt || item?.updatedAt,
      timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
      metaLabel: joinMeta(item?.deliveryPartner?.name, item?.deliveryPartner?.phone, item?.priority, item?.status),
    }));
};

const mapExpiredFssai = (response) => {
  const rows = extractRows(response);
  return rows.map((item) => ({
    id: String(item?.id || `fssai-expired-${item?.restaurantId || ""}`),
    title: item?.title || "FSSAI License Expired",
    message:
      item?.message ||
      `${item?.restaurantName || "Restaurant"} FSSAI license has expired.`,
    type: "compliance",
    category: "fssai_expired",
    path: "/admin/food/restaurants",
    createdAt: item?.createdAt || item?.fssaiExpiry,
    timeLabel: toDateLabel(item?.createdAt || item?.fssaiExpiry),
    metaLabel: joinMeta(item?.restaurantName, item?.ownerName, item?.ownerPhone, item?.fssaiNumber),
  }));
};

const mapWithdrawalRequests = (response) => {
  const rows = extractRows(response);
  return rows
    .filter((item) => String(item?.status || "pending").toLowerCase() === "pending")
    .map((item) => ({
      id: `withdrawal-restaurant-${String(item?._id || item?.id || "")}`,
      title: "💸 Restaurant Withdrawal Request",
      message: `${item?.restaurantName || item?.restaurantId?.restaurantName || "Restaurant"} requested a withdrawal of ₹${item?.amount || 0}. Status: ${item?.status || "pending"}.`,
      type: "approval",
      category: "withdrawals",
      path: "/admin/food/restaurants/withdrawals",
      createdAt: item?.createdAt || item?.updatedAt,
      timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
      metaLabel: joinMeta(item?.restaurantName || item?.restaurantId?.restaurantName, `₹${item?.amount || 0}`, item?.status || "pending"),
    }));
};

const mapDeliveryWithdrawals = (response) => {
  const rows = extractRows(response);
  return rows
    .filter((item) => String(item?.status || "pending").toLowerCase() === "pending")
    .map((item) => ({
      id: `withdrawal-delivery-${String(item?._id || item?.id || "")}`,
      title: "💸 Delivery Partner Withdrawal Request",
      message: `${item?.deliveryPartner?.name || item?.deliveryPartnerName || "Delivery partner"} requested a withdrawal of ₹${item?.amount || 0}. Status: ${item?.status || "pending"}.`,
      type: "approval",
      category: "delivery_withdrawals",
      path: "/admin/food/delivery-partners/withdrawals",
      createdAt: item?.createdAt || item?.updatedAt,
      timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
      metaLabel: joinMeta(item?.deliveryPartner?.name || item?.deliveryPartnerName, `₹${item?.amount || 0}`, item?.status || "pending"),
    }));
};

const mapEmergencyOfflineRequests = (response) => {
  const rows = extractRows(response);
  return rows
    .filter((item) => String(item?.emergencyOfflineRequest?.status || "").toLowerCase() === "pending")
    .map((item) => {
      const partnerName = item?.name || item?.fullName || "Delivery Partner";
      const partnerPhone = item?.phone || "";
      const reason = item?.emergencyOfflineRequest?.reason || "Emergency";
      const rawId = String(item?._id || item?.id || "");

      return {
        id: `emergency-offline-${rawId}`,
        deliveryPartnerId: rawId,
        title: "⚠️ Emergency Offline Request",
        message: `Driver ${partnerName}${partnerPhone ? ` (${partnerPhone})` : ""} requested emergency offline approval. Reason: "${reason}"`,
        type: "approval",
        category: "handover_approval",
        path: "/admin/food/delivery-partners",
        createdAt: item?.emergencyOfflineRequest?.requestedAt || item?.updatedAt || item?.createdAt,
        timeLabel: toDateLabel(item?.emergencyOfflineRequest?.requestedAt || item?.updatedAt || item?.createdAt),
        metaLabel: joinMeta(partnerName, partnerPhone, `Reason: ${reason}`),
        isEmergencyOffline: true,
        deliveryman: item,
      };
    });
};

export default function useAdminNotifications(options = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(options?.autoload !== false));

  const loadNotifications = useCallback(async () => {
    const dismissed = new Set(getDismissedIds());
    const storedRealtime = getStoredRealtimeNotifs();

    try {
      setLoading(true);

      const results = await Promise.allSettled([
        adminAPI.getPendingRestaurants(),
        adminAPI.getDeliveryPartnerJoinRequests({ page: 1, limit: 50 }),
        adminAPI.getPendingFoodApprovals({ page: 1, limit: 50 }),
        supportAPI.getSupportTicketsAdmin({ page: 1, limit: 50, source: "all" }),
        adminAPI.getDeliverySupportTickets({ page: 1, limit: 50 }),
        adminAPI.getExpiredFssaiNotifications(),
        adminAPI.getPendingHandovers(),
        adminAPI.getWithdrawals({ status: "pending", page: 1, limit: 50 }),
        adminAPI.getDeliveryWithdrawals({ status: "pending", page: 1, limit: 50 }),
        // Fetch ALL delivery partners (high limit) to catch emergency offline requests
        adminAPI.getDeliveryPartners({ limit: 500, page: 1 }),
      ]);

      const safeGet = (idx) => {
        const r = results[idx];
        if (r.status === "rejected") {
          console.warn(`[AdminNotif] API call ${idx} failed:`, r.reason?.response?.data || r.reason?.message || r.reason);
          return { data: { data: [] } };
        }
        return r.value;
      };

      const [
        restaurantsRes,
        deliveryJoinRes,
        foodApprovalRes,
        supportRes,
        deliverySupportRes,
        fssaiExpiredRes,
        handoverRes,
        withdrawalRes,
        deliveryWithdrawalRes,
        deliveryPartnersRes,
      ] = results.map((_, i) => safeGet(i));

      const handoverRows = mapPendingHandovers(handoverRes);
      const emergencyRows = mapEmergencyOfflineRequests(deliveryPartnersRes);

      console.debug("[AdminNotif] handoverRows:", handoverRows.length, "emergencyRows:", emergencyRows.length);

      const fetchedPending = [
        ...handoverRows,
        ...emergencyRows,
        ...mapPendingRestaurants(restaurantsRes),
        ...mapDeliveryJoinRequests(deliveryJoinRes),
        ...mapFoodApprovals(foodApprovalRes),
        ...mapUserRestaurantSupport(supportRes),
        ...mapDeliverySupport(deliverySupportRes),
        ...mapWithdrawalRequests(withdrawalRes),
        ...mapDeliveryWithdrawals(deliveryWithdrawalRes),
        ...mapExpiredFssai(fssaiExpiredRes),
      ];

      // Live pending DB tasks from backend are always active while pending in DB.
      // Realtime transient notifications respect dismissed IDs.
      const aggregated = uniqueById([
        ...fetchedPending,
        ...storedRealtime.filter((item) => item?.id && !dismissed.has(item.id)),
      ])
        .sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt));

      setItems(aggregated);
    } catch (err) {
      console.warn("[AdminNotif] loadNotifications unexpected error:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (options?.autoload === false) return;
    loadNotifications();
  }, [loadNotifications, options?.autoload]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = () => {
      loadNotifications();
    };
    window.addEventListener(UPDATE_EVENT, handler);
    return () => window.removeEventListener(UPDATE_EVENT, handler);
  }, [loadNotifications]);

  // Real-time socket updates for Admin Notifications
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const backendUrl = resolveSocketOrigin(API_BASE_URL);
      const token = localStorage.getItem("admin_accessToken") || localStorage.getItem("accessToken");

      const socket = io(backendUrl, {
        transports: ["websocket", "polling"],
        auth: { token: token || "" },
        query: token ? { token } : undefined,
      });

      socket.on("connect", () => {
        socket.emit("join-admin-orders");
        socket.emit("join-admin");
      });

      const handleRegistrationAlert = (data = {}) => {
        const title = data.title || `New ${data.type || 'Account'} Registered`;
        const name = data.name || data.fullName || 'New Account';
        const phone = data.phone || data.mobile || '';

        toast.info(`🆕 ${title}: ${name}${phone ? ` (${phone})` : ''}`);

        const rawId = String(data.id || data._id || Date.now());
        const targetId = data.type === 'restaurant'
          ? `approval-restaurant-${rawId}`
          : `approval-delivery-${rawId}`;

        const item = {
          id: targetId,
          title: `🆕 ${title}`,
          message: `${name}${phone ? ` (${phone})` : ''} registered and requires review.`,
          type: "approval",
          category: data.type === 'restaurant' ? 'restaurant_approval' : 'delivery_approval',
          path: data.type === 'restaurant' ? '/admin/food/restaurants/joining-request' : '/admin/food/delivery-partners/join-request',
          createdAt: data.createdAt || new Date().toISOString(),
          timeLabel: "Just now",
          metaLabel: joinMeta(name, phone, data.type),
        };

        // Un-dismiss if previously dismissed
        saveDismissedIds(getDismissedIds().filter((id) => id !== targetId));
        // Persist real-time item
        saveStoredRealtimeNotifs([item, ...getStoredRealtimeNotifs()]);

        setItems((prev) => uniqueById([item, ...(Array.isArray(prev) ? prev : [])]));
        dispatchAdminNotificationsUpdated();
      };

      socket.on("new_registration_alert", handleRegistrationAlert);
      socket.on("new_driver_registration", handleRegistrationAlert);

      socket.on("admin_handover_request", (payload) => {
        toast.error("🚨 Order Handover Request Received!", {
          description: payload?.message || `Driver ${payload?.partnerName || 'Delivery driver'} requested emergency handover.`,
        });

        const orderDisplayId = payload?.orderId || payload?.orderMongoId || "Order";
        const orderMongoId = String(payload?.orderMongoId || payload?.orderId || "");
        const targetId = `approval-handover-${orderMongoId || Date.now()}`;

        const realTimeItem = {
          id: targetId,
          orderMongoId,
          orderId: orderDisplayId,
          title: "🚨 Order Handover Request",
          message: payload?.message || `Driver ${payload?.partnerName || 'Driver'}${payload?.partnerPhone ? ` (${payload.partnerPhone})` : ""} requested handover for Order #${orderDisplayId} (${payload?.restaurantName || 'Restaurant'}). Reason: ${payload?.reason || 'Emergency'}. Driver set Offline. Admin approval required.`,
          type: "approval",
          category: "handover_approval",
          path: `/admin/food/delivery-partners/gigs?handoverId=${orderMongoId}`,
          createdAt: new Date().toISOString(),
          timeLabel: "Just now",
          metaLabel: joinMeta(`Order #${orderDisplayId}`, payload?.partnerName, payload?.restaurantName, payload?.zoneName, payload?.reason),
          partnerName: payload?.partnerName,
          partnerPhone: payload?.partnerPhone,
          partnerVehicle: payload?.partnerVehicle,
          restaurantName: payload?.restaurantName,
          zoneName: payload?.zoneName,
          customerName: payload?.customerName,
          customerPhone: payload?.customerPhone,
          customerAddress: payload?.customerAddress,
          reason: payload?.reason || "Emergency",
          note: payload?.note || "",
          rawOrder: payload,
        };

        saveDismissedIds(getDismissedIds().filter((id) => id !== targetId));
        saveStoredRealtimeNotifs([realTimeItem, ...getStoredRealtimeNotifs()]);

        setItems((prev) => uniqueById([realTimeItem, ...(Array.isArray(prev) ? prev : [])]));
        dispatchAdminNotificationsUpdated();
      });

      socket.on("admin_notification", (payload = {}) => {
        const title = payload?.title || payload?.notification?.title || "Admin Notification";
        const body = payload?.message || payload?.body || payload?.notification?.body || payload?.data?.message || "";

        if (body) {
          toast.info(`${title}: ${body}`);
        } else {
          toast.info(title);
        }

        const rawId = String(payload?.id || payload?._id || payload?.notificationId || Date.now());
        const targetId = `admin-notif-${rawId}`;

        const realTimeItem = {
          id: targetId,
          title,
          message: body,
          type: payload?.type || "info",
          category: payload?.category || "general",
          path: payload?.path || payload?.targetUrl || payload?.link || "/admin/food",
          createdAt: payload?.createdAt || new Date().toISOString(),
          timeLabel: "Just now",
          metaLabel: joinMeta(title, body),
        };

        saveDismissedIds(getDismissedIds().filter((id) => id !== targetId));
        saveStoredRealtimeNotifs([realTimeItem, ...getStoredRealtimeNotifs()]);

        setItems((prev) => uniqueById([realTimeItem, ...(Array.isArray(prev) ? prev : [])]));
        dispatchAdminNotificationsUpdated();
        loadNotifications();
      });

      socket.on("support_ticket_created", (data = {}) => {
        const isDelivery = data?.source === "delivery" || data?.deliveryPartner;
        const title = isDelivery ? "🎫 Delivery Support Ticket Raised" : "🎫 New Support Ticket Raised";
        const body = data?.subject || data?.message || data?.issueType || "A ticket has been created.";

        toast.info(title, { description: body });

        const rawId = String(data?.id || data?._id || Date.now());
        const targetId = isDelivery ? `support-delivery-${rawId}` : `support-main-${rawId}`;

        const realTimeItem = {
          id: targetId,
          title,
          message: body,
          type: "support",
          category: isDelivery ? "delivery_support" : "support",
          path: isDelivery ? "/admin/food/delivery-support-tickets" : "/admin/food/support-tickets",
          createdAt: data?.createdAt || new Date().toISOString(),
          timeLabel: "Just now",
          metaLabel: joinMeta(data?.userName || data?.restaurantName || data?.deliveryPartnerName || "Support Ticket", data?.subject || data?.issueType),
        };

        saveDismissedIds(getDismissedIds().filter((id) => id !== targetId));
        saveStoredRealtimeNotifs([realTimeItem, ...getStoredRealtimeNotifs()]);

        setItems((prev) => uniqueById([realTimeItem, ...(Array.isArray(prev) ? prev : [])]));
        dispatchAdminNotificationsUpdated();
        loadNotifications();
      });

      socket.on("withdrawal_request_created", (data = {}) => {
        const isDelivery = data?.source === "delivery" || data?.type === "delivery" || Boolean(data?.deliveryPartner);
        const partnerName = data?.name || data?.restaurantName || data?.deliveryPartnerName || (isDelivery ? "Delivery Partner" : "Restaurant");
        const amount = data?.amount || 0;
        const title = isDelivery ? "💸 Delivery Partner Withdrawal Request" : "💸 Restaurant Withdrawal Request";
        const body = `${partnerName} requested a withdrawal of ₹${amount}.`;

        toast.info(title, { description: body });

        const rawId = String(data?.id || data?._id || Date.now());
        const targetId = isDelivery ? `withdrawal-delivery-${rawId}` : `withdrawal-restaurant-${rawId}`;

        const realTimeItem = {
          id: targetId,
          title,
          message: body,
          type: "approval",
          category: isDelivery ? "delivery_withdrawals" : "withdrawals",
          path: isDelivery ? "/admin/food/delivery-partners/withdrawals" : "/admin/food/restaurants/withdrawals",
          createdAt: data?.createdAt || new Date().toISOString(),
          timeLabel: "Just now",
          metaLabel: joinMeta(partnerName, `₹${amount}`),
        };

        saveDismissedIds(getDismissedIds().filter((id) => id !== targetId));
        saveStoredRealtimeNotifs([realTimeItem, ...getStoredRealtimeNotifs()]);

        setItems((prev) => uniqueById([realTimeItem, ...(Array.isArray(prev) ? prev : [])]));
        dispatchAdminNotificationsUpdated();
        loadNotifications();
      });

      socket.on("emergency_offline_request", (data = {}) => {
        const driverName = data?.name || data?.driverName || "Delivery Partner";
        const title = "⚠️ Emergency Offline Request";
        const body = `Driver ${driverName} requested emergency offline.`;

        toast.error(title, { description: body });

        const rawId = String(data?.id || data?._id || Date.now());
        const targetId = `emergency-offline-${rawId}`;

        const realTimeItem = {
          id: targetId,
          title,
          message: body,
          type: "approval",
          category: "handover_approval",
          path: "/admin/food/delivery-partners/gigs",
          createdAt: data?.createdAt || new Date().toISOString(),
          timeLabel: "Just now",
          metaLabel: joinMeta(driverName, "Emergency Offline"),
        };

        saveDismissedIds(getDismissedIds().filter((id) => id !== targetId));
        saveStoredRealtimeNotifs([realTimeItem, ...getStoredRealtimeNotifs()]);

        setItems((prev) => uniqueById([realTimeItem, ...(Array.isArray(prev) ? prev : [])]));
        dispatchAdminNotificationsUpdated();
        loadNotifications();
      });

      socket.on("food_approval_requested", (data = {}) => {
        const itemName = data?.itemName || "Food item";
        const restaurantName = data?.restaurantName || "Restaurant";
        const title = "🍕 Food Approval Pending";
        const body = `${itemName} from ${restaurantName} is waiting for review.`;

        toast.info(title, { description: body });

        const rawId = String(data?.id || data?._id || Date.now());
        const targetId = `approval-food-${rawId}`;

        const realTimeItem = {
          id: targetId,
          title,
          message: body,
          type: "approval",
          category: "food_approval",
          path: "/admin/food/food-approval",
          createdAt: data?.createdAt || new Date().toISOString(),
          timeLabel: "Just now",
          metaLabel: joinMeta(restaurantName, itemName),
        };

        saveDismissedIds(getDismissedIds().filter((id) => id !== targetId));
        saveStoredRealtimeNotifs([realTimeItem, ...getStoredRealtimeNotifs()]);

        setItems((prev) => uniqueById([realTimeItem, ...(Array.isArray(prev) ? prev : [])]));
        dispatchAdminNotificationsUpdated();
        loadNotifications();
      });

      return () => {
        socket.off("new_registration_alert", handleRegistrationAlert);
        socket.off("new_driver_registration", handleRegistrationAlert);
        socket.off("admin_handover_request");
        socket.off("admin_notification");
        socket.off("support_ticket_created");
        socket.off("withdrawal_request_created");
        socket.off("emergency_offline_request");
        socket.off("food_approval_requested");
        socket.disconnect();
      };
    } catch (err) {
      console.warn("Failed to set up admin notification socket:", err);
    }
  }, [loadNotifications]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadNotifications();
    }, 30 * 1000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  const dismissOne = useCallback((id) => {
    if (!id) return;
    const currentDismissed = getDismissedIds();
    if (!currentDismissed.includes(id)) {
      saveDismissedIds([...currentDismissed, id]);
    }

    const currentRealtime = getStoredRealtimeNotifs().filter((item) => item.id !== id);
    saveStoredRealtimeNotifs(currentRealtime);

    setItems((prev) => (Array.isArray(prev) ? prev : []).filter((item) => item.id !== id));
    dispatchAdminNotificationsUpdated();
  }, []);

  const clearAll = useCallback(() => {
    saveStoredRealtimeNotifs([]);
    saveDismissedIds([]);
    setItems([]);
    dispatchAdminNotificationsUpdated();
  }, []);

  const purgeHandoverNotification = useCallback((orderId) => {
    if (!orderId) return;
    const strId = String(orderId).trim();
    const currentDismissed = getDismissedIds();
    const currentRealtime = getStoredRealtimeNotifs();

    const candidateIds = new Set([
      strId,
      `approval-handover-${strId}`
    ]);

    [...currentRealtime, ...(Array.isArray(items) ? items : [])].forEach((item) => {
      if (
        String(item.orderMongoId) === strId ||
        String(item.orderId) === strId ||
        item.id === strId ||
        item.id === `approval-handover-${strId}`
      ) {
        if (item.id) candidateIds.add(item.id);
        if (item.orderMongoId) candidateIds.add(`approval-handover-${item.orderMongoId}`);
        if (item.orderId) candidateIds.add(`approval-handover-${item.orderId}`);
      }
    });

    const newDismissed = [...new Set([...currentDismissed, ...candidateIds])];
    saveDismissedIds(newDismissed);

    const filteredRealtime = currentRealtime.filter((item) => {
      const mId = String(item.orderMongoId || "");
      const oId = String(item.orderId || "");
      const id = String(item.id || "");
      return !candidateIds.has(id) && mId !== strId && oId !== strId;
    });
    saveStoredRealtimeNotifs(filteredRealtime);

    setItems((prev) =>
      (Array.isArray(prev) ? prev : []).filter((item) => {
        const mId = String(item.orderMongoId || "");
        const oId = String(item.orderId || "");
        const id = String(item.id || "");
        return !candidateIds.has(id) && mId !== strId && oId !== strId;
      })
    );
    dispatchAdminNotificationsUpdated();
  }, [items]);

  const approveHandover = useCallback(
    async (orderId) => {
      if (!orderId) return false;
      try {
        const res = await adminAPI.approveHandover(orderId);
        if (res.data?.success) {
          toast.success(res.data?.message || "Handover approved! Order unassigned & driver set Offline.");
          purgeHandoverNotification(orderId);
          return true;
        } else {
          toast.error(res.data?.message || "Failed to approve handover");
        }
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to approve handover");
      }
      return false;
    },
    [purgeHandoverNotification]
  );

  const rejectHandover = useCallback(
    async (orderId, reason = "Rejected by Admin") => {
      if (!orderId) return false;
      try {
        const res = await adminAPI.rejectHandover(orderId, reason);
        if (res.data?.success) {
          toast.info(res.data?.message || "Handover request rejected.");
          purgeHandoverNotification(orderId);
          return true;
        } else {
          toast.error(res.data?.message || "Failed to reject handover");
        }
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to reject handover");
      }
      return false;
    },
    [purgeHandoverNotification]
  );

  const approveEmergencyOffline = useCallback(
    async (deliveryPartnerId) => {
      if (!deliveryPartnerId) return false;
      try {
        const res = await adminAPI.approveEmergencyOffline(deliveryPartnerId);
        if (res.data?.success) {
          toast.success(res.data?.message || "Emergency offline request approved.");
          dismissOne(`emergency-offline-${deliveryPartnerId}`);
          loadNotifications();
          return true;
        } else {
          toast.error(res.data?.message || "Failed to approve emergency offline request");
        }
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to approve emergency offline request");
      }
      return false;
    },
    [dismissOne, loadNotifications]
  );

  return useMemo(
    () => ({
      items,
      loading,
      unreadCount: items.length,
      refresh: loadNotifications,
      dismissOne,
      clearAll,
      approveHandover,
      rejectHandover,
      approveEmergencyOffline,
    }),
    [approveEmergencyOffline, approveHandover, clearAll, dismissOne, items, loadNotifications, loading, rejectHandover]
  );
}

