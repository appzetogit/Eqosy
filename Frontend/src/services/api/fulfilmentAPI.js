/**
 * Smart partial order fulfilment & item replacement API.
 * Every call returns the axios response; payload is at res.data.data.
 */
import apiClient from "./axios.js";

const user = { contextModule: "user" };
const restaurant = { contextModule: "restaurant" };
const admin = { contextModule: "admin" };

/** Customer app */
export const fulfilmentAPI = {
  config: () => apiClient.get("/food/orders/fulfilment/config", user),
  getPreference: () => apiClient.get("/food/orders/fulfilment/preference", user),
  setPreference: (unavailableItemPreference) =>
    apiClient.put("/food/orders/fulfilment/preference", { unavailableItemPreference }, user),
  /** Unavailable items, available items, same-store replacement candidates, bill, countdown. */
  getDecision: (orderId) => apiClient.get(`/food/orders/${orderId}/fulfilment`, user),
  /** body: { lines: [{ lineKey, action: 'replace'|'remove', replacement?: { itemId, variantId?, quantity? } }] } */
  preview: (orderId, body) => apiClient.post(`/food/orders/${orderId}/fulfilment/preview`, body, user),
  /** body: { action: 'apply'|'cancel', lines, expectedTotal } */
  decide: (orderId, body) => apiClient.post(`/food/orders/${orderId}/fulfilment/decision`, body, user),
  verifyPayment: (orderId, body) => apiClient.post(`/food/orders/${orderId}/fulfilment/verify-payment`, body, user),
};

/** Store (restaurant / grocery) app */
export const restaurantFulfilmentAPI = {
  /** body: { items: [{ lineKey, reason? }], suggestions?: [{ lineKey, itemId, variantId? }] } */
  reportUnavailable: (orderId, body) =>
    apiClient.post(`/food/restaurant/orders/${String(orderId)}/unavailable-items`, body, restaurant),
  alternatives: (orderId) => apiClient.get(`/food/restaurant/orders/${String(orderId)}/alternatives`, restaurant),
};

/** Admin panel */
export const adminFulfilmentAPI = {
  getSettings: () => apiClient.get("/food/admin/partial-fulfilment/settings", admin),
  updateSettings: (body) => apiClient.put("/food/admin/partial-fulfilment/settings", body, admin),
  summary: () => apiClient.get("/food/admin/partial-fulfilment/summary", admin),
  orders: (params = {}) => apiClient.get("/food/admin/partial-fulfilment/orders", { params, ...admin }),
  order: (orderId) => apiClient.get(`/food/admin/partial-fulfilment/orders/${orderId}`, admin),
  extend: (orderId, minutes) => apiClient.post(`/food/admin/partial-fulfilment/orders/${orderId}/extend`, { minutes }, admin),
  retryRefund: (orderId, key) => apiClient.post(`/food/admin/partial-fulfilment/orders/${orderId}/retry-refund`, { key }, admin),
};
