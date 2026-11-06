/**
 * Performance, penalty, strike, appeal & prep-extension API.
 * Every call returns the axios response; payload is at res.data.data.
 */
import apiClient from "./axios.js";

const admin = { contextModule: "admin" };

export const adminPerformanceAPI = {
  getConfig: () => apiClient.get("/food/admin/performance/config", admin),
  updateConfig: (body) => apiClient.put("/food/admin/performance/config", body, admin),
  overview: (kind, month) =>
    apiClient.get(`/food/admin/performance/${kind === "delivery" ? "delivery-partners" : "restaurants"}`, { params: { month }, ...admin }),
  detail: (kind, id, month) =>
    apiClient.get(`/food/admin/performance/${kind === "delivery" ? "delivery-partners" : "restaurants"}/${id}`, { params: { month }, ...admin }),
  ledger: (params = {}) => apiClient.get("/food/admin/performance/ledger", { params, ...admin }),
  decideLedger: (id, action, note = "") => apiClient.post(`/food/admin/performance/ledger/${id}/decision`, { action, note }, admin),
  appeals: (params = {}) => apiClient.get("/food/admin/performance/appeals", { params, ...admin }),
  decideAppeal: (id, approve, note = "") => apiClient.post(`/food/admin/performance/appeals/${id}/decision`, { approve, note }, admin),
  extensions: (params = {}) => apiClient.get("/food/admin/performance/extensions", { params, ...admin }),
  decideExtension: (id, approve, skipCustomer = false) =>
    apiClient.post(`/food/admin/performance/extensions/${id}/decision`, { approve, skipCustomer }, admin),
  strikes: (params = {}) => apiClient.get("/food/admin/performance/strikes", { params, ...admin }),
  revokeStrike: (id, note) => apiClient.post(`/food/admin/performance/strikes/${id}/revoke`, { note }, admin),
  orderTiming: (orderId) => apiClient.get(`/food/admin/performance/orders/${orderId}/timing`, admin),
  orderTimeline: (orderId) => apiClient.get(`/food/admin/performance/orders/${orderId}/timeline`, admin),
  adjustDelivery: (orderId, body) => apiClient.post(`/food/admin/performance/orders/${orderId}/delivery-adjustment`, body, admin),
  audit: (params = {}) => apiClient.get("/food/admin/performance/audit", { params, ...admin }),
};

const make = (base, contextModule) => {
  const ctx = { contextModule };
  return {
    config: () => apiClient.get(`${base}/config`, ctx),
    dashboard: (month) => apiClient.get(`${base}/dashboard`, { params: { month }, ...ctx }),
    /** What this action would cost right now (warning / penalty / strike). Shown BEFORE the user confirms. */
    preview: (violationType, reasonCode = "") => apiClient.get(`${base}/preview`, { params: { violationType, reasonCode }, ...ctx }),
    ledger: (params = {}) => apiClient.get(`${base}/ledger`, { params, ...ctx }),
    appeals: () => apiClient.get(`${base}/appeals`, ctx),
    createAppeal: (body) => apiClient.post(`${base}/appeals`, body, ctx),
  };
};

export const restaurantPerformanceAPI = {
  ...make("/food/restaurant/performance", "restaurant"),
  extensions: (params = {}) => apiClient.get("/food/restaurant/performance/extensions", { params, contextModule: "restaurant" }),
  requestExtension: (orderId, body) =>
    apiClient.post(`/food/restaurant/performance/orders/${orderId}/extension`, body, { contextModule: "restaurant" }),
};

export const deliveryPerformanceAPI = {
  ...make("/food/delivery/performance", "delivery"),
  orderTiming: (orderId) => apiClient.get(`/food/delivery/performance/orders/${orderId}/timing`, { contextModule: "delivery" }),
  reportDelay: (orderId, body) =>
    apiClient.post(`/food/delivery/performance/orders/${orderId}/delay-report`, body, { contextModule: "delivery" }),
};

export const userPerformanceAPI = {
  pendingExtensions: () => apiClient.get("/food/orders/prep-extensions/pending", { contextModule: "user" }),
  respondExtension: (id, accept) => apiClient.post(`/food/orders/prep-extensions/${id}/respond`, { accept }, { contextModule: "user" }),
};

/** Maps the reason text shown in the apps to the admin-configured reason codes. */
export const REASON_CODES = {
  "item not available": "out_of_stock",
  "outside delivery area": "outside_service_area",
  "kitchen closing soon": "restaurant_closed",
  "technical issue": "technical_issue",
  "outside my service area": "outside_service_area",
  "unsafe conditions": "unsafe_conditions",
  "technical problem": "technical_issue",
};
export const reasonCodeFromLabel = (label) => REASON_CODES[String(label || "").trim().toLowerCase()] || "";

/** Upload one evidence image/PDF, returns its URL (uses the shared upload endpoint). */
export async function uploadEvidence(file, contextModule) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", "penalty-evidence");
  const res = await apiClient.post("/uploads/image", fd, { headers: { "Content-Type": "multipart/form-data" }, contextModule });
  const d = res?.data?.data || res?.data || {};
  return d.url || d.secure_url || d.imageUrl || d.data?.url || "";
}
