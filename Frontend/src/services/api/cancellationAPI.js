/**
 * Stage-based cancellation, outstanding penalty and Food Rescue API.
 * Payload is at res.data.data.
 */
import apiClient from "./axios.js";

const user = { contextModule: "user" };
const admin = { contextModule: "admin" };

export const cancellationAPI = {
  config: () => apiClient.get("/food/cancellation/config", user),
  preview: (orderId, reasonCode = "") =>
    apiClient.get(`/food/cancellation/orders/${orderId}/preview`, { params: { reasonCode }, ...user }),
  outstanding: () => apiClient.get("/food/cancellation/outstanding", user),
  history: () => apiClient.get("/food/cancellation/history", user),
  payPenalty: () => apiClient.post("/food/cancellation/penalty/pay", {}, user),
  verifyPenalty: (body) => apiClient.post("/food/cancellation/penalty/verify", body, user),
  nearbyRescues: (lat, lng) => apiClient.get("/food/cancellation/rescue/nearby", { params: { lat, lng }, ...user }),
  claimRescue: (id, body) => apiClient.post(`/food/cancellation/rescue/${id}/claim`, body, user),
  verifyRescue: (body) => apiClient.post("/food/cancellation/rescue/verify", body, user),
};

export const adminCancellationAPI = {
  getConfig: () => apiClient.get("/food/admin/cancellation/config", admin),
  updateConfig: (body) => apiClient.put("/food/admin/cancellation/config", body, admin),
  summary: () => apiClient.get("/food/admin/cancellation/summary", admin),
  cases: (params = {}) => apiClient.get("/food/admin/cancellation/cases", { params, ...admin }),
  caseDetail: (id) => apiClient.get(`/food/admin/cancellation/cases/${id}`, admin),
  retrySettlements: (id) => apiClient.post(`/food/admin/cancellation/cases/${id}/retry-settlements`, {}, admin),
  rescues: (params = {}) => apiClient.get("/food/admin/cancellation/rescues", { params, ...admin }),
  closeRescue: (id, note) => apiClient.post(`/food/admin/cancellation/rescues/${id}/close`, { note }, admin),
  penalties: (params = {}) => apiClient.get("/food/admin/cancellation/penalties", { params, ...admin }),
  decidePenalty: (id, body) => apiClient.post(`/food/admin/cancellation/penalties/${id}/decision`, body, admin),
  customer: (userId) => apiClient.get(`/food/admin/cancellation/customers/${userId}`, admin),
  audit: (params = {}) => apiClient.get("/food/admin/cancellation/audit", { params, ...admin }),
};
