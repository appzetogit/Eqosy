import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAPI } from "@food/api";
import { io } from "socket.io-client";
import { API_BASE_URL, resolveSocketOrigin } from "@food/api/config";
import { toast } from "sonner";

const STORAGE_KEY = "admin_notifications_dismissed_v1";
const UPDATE_EVENT = "adminNotificationsUpdated";

const safeParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getDismissedIds = () => {
  if (typeof localStorage === "undefined") return [];
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY) || "[]", []);
  return Array.isArray(parsed) ? parsed : [];
};

const saveDismissedIds = (ids) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(ids) ? ids : []));
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

const mapPendingHandovers = (response) => {
  const rawData = response?.data?.data || response?.data || response;
  const rows =
    rawData?.orders ||
    rawData?.items ||
    (Array.isArray(rawData) ? rawData : []) ||
    response?.orders ||
    [];

  const list = Array.isArray(rows) ? rows : [];

  return list.map((item) => {
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

const mapPendingRestaurants = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((item) => ({
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

const mapDeliveryJoinRequests = (response) => {
  const payload = response?.data?.data;
  const rows =
    payload?.partners ||
    payload?.data ||
    payload?.items ||
    response?.data?.partners ||
    [];

  return (Array.isArray(rows) ? rows : []).map((item) => ({
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
  const payload = response?.data?.data;
  const rows =
    payload?.requests ||
    payload?.items ||
    payload?.data ||
    response?.data?.requests ||
    [];

  return (Array.isArray(rows) ? rows : []).map((item) => ({
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
  const payload = response?.data?.data;
  const rows =
    payload?.tickets ||
    payload?.items ||
    payload?.data ||
    response?.data?.tickets ||
    [];

  return (Array.isArray(rows) ? rows : [])
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
  const payload = response?.data?.data;
  const rows =
    payload?.tickets ||
    payload?.items ||
    payload?.data ||
    response?.data?.tickets ||
    [];

  return (Array.isArray(rows) ? rows : [])
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
  const payload = response?.data?.data;
  const rows = payload?.items || payload?.data || response?.data?.items || [];

  return (Array.isArray(rows) ? rows : []).map((item) => ({
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

export default function useAdminNotifications(options = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(options?.autoload !== false));

  const loadNotifications = useCallback(async () => {
    const dismissed = new Set(getDismissedIds());
    try {
      setLoading(true);

      const [
        restaurantsRes,
        deliveryJoinRes,
        foodApprovalRes,
        supportRes,
        deliverySupportRes,
        fssaiExpiredRes,
        handoverRes,
      ] = await Promise.all([
        adminAPI.getPendingRestaurants().catch(() => ({ data: { data: [] } })),
        adminAPI.getDeliveryPartnerJoinRequests({ page: 1, limit: 50 }).catch(() => ({ data: { data: [] } })),
        adminAPI.getPendingFoodApprovals({ page: 1, limit: 50 }).catch(() => ({ data: { data: [] } })),
        adminAPI.getSupportTicketsAdmin({ page: 1, limit: 50, source: "all" }).catch(() => ({ data: { data: [] } })),
        adminAPI.getDeliverySupportTickets({ page: 1, limit: 50 }).catch(() => ({ data: { data: [] } })),
        adminAPI.getExpiredFssaiNotifications().catch(() => ({ data: { data: [] } })),
        adminAPI.getPendingHandovers().catch(() => ({ data: { data: { orders: [] } } })),
      ]);

      const restaurantRows =
        restaurantsRes?.data?.data ||
        restaurantsRes?.data?.restaurants ||
        [];

      const aggregated = uniqueById([
        ...mapPendingHandovers(handoverRes),
        ...mapPendingRestaurants(restaurantRows),
        ...mapDeliveryJoinRequests(deliveryJoinRes),
        ...mapFoodApprovals(foodApprovalRes),
        ...mapUserRestaurantSupport(supportRes),
        ...mapDeliverySupport(deliverySupportRes),
        ...mapExpiredFssai(fssaiExpiredRes),
      ])
        .filter((item) => item?.category === "handover_approval" || !dismissed.has(item.id))
        .sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt));

      setItems((prev) => {
        // Keep active real-time handover requests until approved/rejected
        const activeHandoverItems = (Array.isArray(prev) ? prev : []).filter(
          (p) => p?.category === "handover_approval"
        );
        return uniqueById([
          ...activeHandoverItems,
          ...aggregated,
        ])
          .filter((item) => item?.category === "handover_approval" || !dismissed.has(item.id))
          .sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt));
      });
    } catch {
      setItems((prev) => (Array.isArray(prev) ? prev.filter(p => p?.category === "handover_approval" || !dismissed.has(p?.id)) : []));
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

      socket.on("admin_handover_request", (payload) => {
        toast.error("🚨 Order Handover Request Received!", {
          description: payload?.message || `Driver ${payload?.partnerName || 'Delivery driver'} requested emergency handover.`,
        });

        const orderDisplayId = payload?.orderId || payload?.orderMongoId || "Order";
        const orderMongoId = String(payload?.orderMongoId || payload?.orderId || "");
        const reason = payload?.reason || "Emergency";
        const partnerName = payload?.partnerName || "Delivery Partner";
        const partnerPhone = payload?.partnerPhone || "";
        const partnerVehicle = payload?.partnerVehicle || "";
        const restaurantName = payload?.restaurantName || "Restaurant";
        const zoneName = payload?.zoneName || "Zone";
        const customerName = payload?.customerName || "Customer";
        const customerPhone = payload?.customerPhone || "";
        const customerAddress = payload?.customerAddress || "";

        const realTimeItem = {
          id: `approval-handover-${orderMongoId || Date.now()}`,
          orderMongoId,
          orderId: orderDisplayId,
          title: "🚨 Order Handover Request",
          message: payload?.message || `Driver ${partnerName}${partnerPhone ? ` (${partnerPhone})` : ""} requested handover for Order #${orderDisplayId} (${restaurantName}). Reason: ${reason}. Driver set Offline. Admin approval required.`,
          type: "approval",
          category: "handover_approval",
          path: `/admin/food/delivery-partners/gigs?handoverId=${orderMongoId}`,
          createdAt: new Date().toISOString(),
          timeLabel: "Just now",
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
          note: payload?.note || "",
          rawOrder: payload,
        };

        const targetId = `approval-handover-${orderMongoId}`;
        if (targetId) {
          saveDismissedIds(getDismissedIds().filter((id) => id !== targetId));
        }

        setItems((prev) => uniqueById([realTimeItem, ...prev]));
        dispatchAdminNotificationsUpdated();
      });

      socket.on("admin_notification", () => {
        dispatchAdminNotificationsUpdated();
      });

      return () => {
        socket.disconnect();
      };
    } catch (err) {
      console.warn("Failed to set up admin notification socket:", err);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadNotifications();
    }, 30 * 1000); // 30 seconds refresh loop
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  const dismissOne = useCallback((id) => {
    if (!id) return;
    const dismissed = [...new Set([...getDismissedIds(), id])];
    saveDismissedIds(dismissed);
    setItems((prev) => prev.filter((item) => item.id !== id));
    dispatchAdminNotificationsUpdated();
  }, []);

  const clearAll = useCallback(() => {
    const ids = items.map((item) => item.id).filter(Boolean);
    saveDismissedIds([...new Set([...getDismissedIds(), ...ids])]);
    setItems([]);
    dispatchAdminNotificationsUpdated();
  }, [items]);

  const approveHandover = useCallback(
    async (orderId) => {
      if (!orderId) return false;
      try {
        const res = await adminAPI.approveHandover(orderId);
        if (res.data?.success) {
          toast.success(res.data?.message || "Handover approved! Order unassigned & driver set Offline.");
          setItems((prev) => {
            const target = (Array.isArray(prev) ? prev : []).find(i => i.orderMongoId === String(orderId) || i.orderId === String(orderId));
            if (target?.id) {
              saveDismissedIds([...new Set([...getDismissedIds(), target.id])]);
            }
            return (Array.isArray(prev) ? prev : []).filter(i => i.orderMongoId !== String(orderId) && i.orderId !== String(orderId));
          });
          dispatchAdminNotificationsUpdated();
          return true;
        } else {
          toast.error(res.data?.message || "Failed to approve handover");
        }
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to approve handover");
      }
      return false;
    },
    []
  );

  const rejectHandover = useCallback(
    async (orderId, reason = "Rejected by Admin") => {
      if (!orderId) return false;
      try {
        const res = await adminAPI.rejectHandover(orderId, reason);
        if (res.data?.success) {
          toast.info(res.data?.message || "Handover request rejected.");
          setItems((prev) => {
            const target = (Array.isArray(prev) ? prev : []).find(i => i.orderMongoId === String(orderId) || i.orderId === String(orderId));
            if (target?.id) {
              saveDismissedIds([...new Set([...getDismissedIds(), target.id])]);
            }
            return (Array.isArray(prev) ? prev : []).filter(i => i.orderMongoId !== String(orderId) && i.orderId !== String(orderId));
          });
          dispatchAdminNotificationsUpdated();
          return true;
        } else {
          toast.error(res.data?.message || "Failed to reject handover");
        }
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to reject handover");
      }
      return false;
    },
    []
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
    }),
    [approveHandover, clearAll, dismissOne, items, loadNotifications, loading, rejectHandover]
  );
}
