import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * @typedef {Object} Location
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} ActiveOrder
 * @property {string} orderId
 * @property {string} status
 * @property {Location} restaurantLocation
 * @property {Location} customerLocation
 * @property {number} orderAmount
 */

/**
 * Helper to derive active trip status from an order object.
 */
export function deriveTripStatusFromOrder(order) {
  if (!order) return 'IDLE';
  const backendStatus = String(order.deliveryStatus || order.orderState?.status || order.orderStatus || order.status || '').toLowerCase();
  const currentPhase = order.deliveryState?.currentPhase;
  const deliveryStatus = String(order.deliveryState?.status || '').toLowerCase();

  if (['delivered', 'completed'].includes(backendStatus) || ['delivered', 'completed'].includes(deliveryStatus)) {
    return 'COMPLETED';
  }
  if (currentPhase === 'at_drop' || ['reached_drop'].includes(backendStatus) || ['reached_drop'].includes(deliveryStatus)) {
    return 'REACHED_DROP';
  }
  if (currentPhase === 'en_route_to_delivery' || ['picked_up', 'delivering', 'out_for_delivery'].includes(backendStatus) || ['picked_up', 'delivering', 'out_for_delivery'].includes(deliveryStatus)) {
    return 'PICKED_UP';
  }
  if (currentPhase === 'at_pickup' || ['reached_pickup'].includes(backendStatus) || ['reached_pickup'].includes(deliveryStatus)) {
    return 'REACHED_PICKUP';
  }
  if (['confirmed', 'preparing', 'ready_for_pickup', 'ready', 'accepted'].includes(backendStatus)) {
    return 'PICKING_UP';
  }
  return 'PICKING_UP';
}

/**
 * useDeliveryStore - Professional Zustand store for Delivery V2
 * Handles Trip Lifecycle, Rider Status, and Admin Settings.
 */
export const useDeliveryStore = create(
  persist(
    (set, get) => ({
      // --- Rider Status ---
      isOnline: false,
      riderLocation: null, // { lat, lng }
      
      // --- Trip State ---
      activeOrder: null, // ActiveOrder | null
      tripStatus: 'IDLE', // 'IDLE' | 'PICKING_UP' | 'REACHED_PICKUP' | 'PICKED_UP' | 'DELIVERING' | 'REACHED_DROP' | 'COMPLETED'
      
      // --- Admin / Business Settings ---
      settings: {
        pickupRangeLimit: 500, // meters, fallback default
        deliveryRangeLimit: 500, // meters, fallback default
      },

      // --- Actions ---
      toggleOnline: () => set((state) => ({ isOnline: !state.isOnline })),
      
      setOnline: (online) => set({ isOnline: online }),
      
      setRiderLocation: (location) => set({ riderLocation: location }),
      
      setSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),

      setActiveOrder: (order, explicitTripStatus) => set((state) => {
        if (!order) {
          return { activeOrder: null, tripStatus: 'IDLE' };
        }
        // If explicit trip status supplied, use it; otherwise compute derived trip status from order phase/status.
        // If current state is further along (e.g. PICKED_UP), don't regress to PICKING_UP.
        const derived = deriveTripStatusFromOrder(order);
        let finalStatus = explicitTripStatus || derived;

        // Status priority map to prevent regressing tripStatus when order updates arrive
        const STATUS_RANK = {
          'IDLE': 0,
          'PICKING_UP': 1,
          'REACHED_PICKUP': 2,
          'PICKED_UP': 3,
          'REACHED_DROP': 4,
          'COMPLETED': 5
        };

        const currentRank = STATUS_RANK[state.tripStatus] || 0;
        const newRank = STATUS_RANK[finalStatus] || 0;

        if (!explicitTripStatus && currentRank > newRank && state.activeOrder) {
          finalStatus = state.tripStatus;
        }

        return {
          activeOrder: order,
          tripStatus: finalStatus
        };
      }),

      updateTripStatus: (status) => set({ tripStatus: status }),

      clearActiveOrder: () => set({ 
        activeOrder: null, 
        tripStatus: 'IDLE' 
      }),

      // --- Selectors / Computed Helper ---
      canAdvanceToPickup: () => {
        const { activeOrder, tripStatus } = get();
        return activeOrder && tripStatus === 'PICKING_UP';
      },

      canAdvanceToDeliver: () => {
        const { activeOrder, tripStatus } = get();
        return activeOrder && tripStatus === 'PICKED_UP';
      }
    }),
    {
      name: 'delivery-v2-online-pref',
      // ONLY persist the 'isOnline' state, ignoring orders/location to prevent dummy order bugs
      partialize: (state) => ({ isOnline: state.isOnline }),
    }
  )
);
