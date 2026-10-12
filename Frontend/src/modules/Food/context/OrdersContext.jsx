import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react"

const OrdersContext = createContext(null)

const currentUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user_user") || "null")
    return String(user?._id || user?.id || user?.userId || "")
  } catch {
    return ""
  }
}

export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState(() => {
    if (typeof window === "undefined") return []
    try {
      // Orders cached for a different customer must never be reused (server answers 403 "Not your order").
      const owner = localStorage.getItem("userOrdersOwner") || ""
      const me = currentUserId()
      if (owner && me && owner !== me) {
        localStorage.removeItem("userOrders")
        localStorage.removeItem("lastPlacedOrder")
        return []
      }
      const saved = localStorage.getItem("userOrders")
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      // Only items that exist or are linked to an authenticated user
      const isAuthenticated = localStorage.getItem("user_authenticated") === "true" || !!localStorage.getItem("user_accessToken");
      if (orders.length > 0 || isAuthenticated) {
        localStorage.setItem("userOrders", JSON.stringify(orders))
        const me = currentUserId()
        if (me) localStorage.setItem("userOrdersOwner", me)
      }
    } catch {
      // ignore storage errors
    }
  }, [orders])

  const createOrder = (orderData) => {
    const newOrder = {
      id: `ORD-${Date.now()}`,
      ...orderData,
      status: "confirmed",
      createdAt: new Date().toISOString(),
      tracking: {
        confirmed: { status: true, timestamp: new Date().toISOString() },
        preparing: { status: false, timestamp: null },
        outForDelivery: { status: false, timestamp: null },
        delivered: { status: false, timestamp: null }
      }
    }
    setOrders((prevOrders) => [newOrder, ...prevOrders])
    return newOrder.id
  }

  const getOrderById = useCallback((orderId) => {
    if (!orderId) return null;
    const needle = String(orderId).trim().toLowerCase();
    return orders.find(order => {
      const candidates = [order?.id, order?._id, order?.mongoId, order?.orderId].filter(Boolean).map(s => String(s).trim().toLowerCase());
      return candidates.includes(needle);
    });
  }, [orders])

  const addOrder = useCallback((order) => {
    if (!order) return;
    setOrders((prevOrders) => {
      const needle = String(order._id || order.mongoId || order.orderId || order.id || "").trim().toLowerCase();
      if (!needle) return [order, ...prevOrders];
      const exists = prevOrders.some(o => {
        const candidates = [o?.id, o?._id, o?.mongoId, o?.orderId].filter(Boolean).map(s => String(s).trim().toLowerCase());
        return candidates.includes(needle);
      });
      if (exists) {
        return prevOrders.map(o => {
          const candidates = [o?.id, o?._id, o?.mongoId, o?.orderId].filter(Boolean).map(s => String(s).trim().toLowerCase());
          return candidates.includes(needle) ? { ...o, ...order } : o;
        });
      }
      return [order, ...prevOrders];
    });
  }, []);

  const getAllOrders = useCallback(() => {
    return [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [orders])

  const updateOrderStatus = useCallback((orderId, status) => {
    setOrders((prevOrders) => prevOrders.map(order => {
      const needle = String(orderId).trim().toLowerCase();
      const candidates = [order?.id, order?._id, order?.mongoId, order?.orderId].filter(Boolean).map(s => String(s).trim().toLowerCase());
      if (candidates.includes(needle)) {
        const updatedTracking = { ...order.tracking }
        if (status === "preparing") {
          updatedTracking.preparing = { status: true, timestamp: new Date().toISOString() }
        } else if (status === "outForDelivery") {
          updatedTracking.outForDelivery = { status: true, timestamp: new Date().toISOString() }
        } else if (status === "delivered") {
          updatedTracking.delivered = { status: true, timestamp: new Date().toISOString() }
        }
        return {
          ...order,
          status,
          tracking: updatedTracking
        }
      }
      return order
    }))
  }, [])

  const removeOrder = useCallback((orderId) => {
    if (!orderId) return;
    const needle = String(orderId).trim().toLowerCase();
    setOrders((prevOrders) => {
      const filtered = prevOrders.filter((o) => {
        const candidates = [o?.id, o?._id, o?.mongoId, o?.orderId]
          .filter(Boolean)
          .map((s) => String(s).trim().toLowerCase());
        return !candidates.includes(needle);
      });
      try {
        localStorage.setItem("userOrders", JSON.stringify(filtered));
      } catch {}
      return filtered;
    });
  }, []);

  const value = useMemo(() => ({
    orders,
    createOrder,
    addOrder,
    removeOrder,
    getOrderById,
    getAllOrders,
    updateOrderStatus
  }), [orders, addOrder, removeOrder, getOrderById, getAllOrders, updateOrderStatus])

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders() {
  const context = useContext(OrdersContext)
  if (!context) {
    throw new Error("useOrders must be used within an OrdersProvider")
  }
  return context
}
