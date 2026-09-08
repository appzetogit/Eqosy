import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';

/**
 * useOrderManager - Professional hook for real-world trip lifecycle actions.
 * Connects directly to the backend API services.
 */
export const useOrderManager = () => {
  const {
    activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation
  } = useDeliveryStore();

  const acceptOrder = async (order) => {
    const orderId = order?.orderId || order?._id || order?.id;
    if (!orderId) {
      toast.error('Invalid order data');
      return;
    }

    try {
      const response = await deliveryAPI.acceptOrder(orderId);

      if (response?.data?.success) {
        const fullOrder = response.data.data?.order || order;

        // Robustly determine locations from multiple possible formats (Populated API vs Socket)
        const getLoc = (ref, keysLat, keysLng) => {
          if (!ref) return null;
          // Handle nested populated objects
          if (ref.location) {
            // Handle GeoJSON format: location: { type: 'Point', coordinates: [lng, lat] }
            if (Array.isArray(ref.location.coordinates) && ref.location.coordinates.length >= 2) {
              return {
                lat: ref.location.coordinates[1], // Latitude is second in GeoJSON [lng, lat]
                lng: ref.location.coordinates[0]  // Longitude is first
              };
            }
            // Handle standard object format: location: { latitude: 12.3, longitude: 45.6 }
            return {
              lat: ref.location.latitude || ref.location.lat,
              lng: ref.location.longitude || ref.location.lng
            };
          }
          // Handle flat objects or direct lat/lng keys
          for (const k of keysLat) { if (ref[k] != null) return { lat: ref[k], lng: ref[keysLng[keysLat.indexOf(k)]] }; }
          return null;
        };

        const resLoc = getLoc(fullOrder.restaurantId, ['latitude', 'lat'], ['longitude', 'lng']) ||
          getLoc(fullOrder, ['restaurant_lat', 'restaurantLat', 'latitude'], ['restaurant_lng', 'restaurantLng', 'longitude']);

        const cusLoc = getLoc(fullOrder.deliveryAddress, ['latitude', 'lat'], ['longitude', 'lng']) ||
          getLoc(fullOrder, ['customer_lat', 'customerLat', 'latitude'], ['customer_lng', 'customerLng', 'longitude']);

        setActiveOrder({
          ...fullOrder,
          orderId: orderId,
          restaurantLocation: resLoc,
          customerLocation: cusLoc
        });

        updateTripStatus('PICKING_UP');
        // toast.success('Order Accepted! Opening Map...');
      } else {
        toast.error(response?.data?.message || 'Order already taken or unavailable');
        throw new Error('Accept failed');
      }
    } catch (error) {
      console.error('Accept Order Error:', error);
      toast.error('Network error. Please try again.');
      throw error;
    }
  };

  /**
   * Mark "Reached Pickup" (Arrival at restaurant)
   */
  const reachPickup = async () => {
    const orderId = activeOrder?.orderId || activeOrder?._id;
    try {
      const response = await deliveryAPI.confirmReachedPickup(orderId);
      if (response?.data?.success) {
        const fullOrder = response.data.data?.order || response.data?.data;
        if (fullOrder && typeof fullOrder === 'object') {
          setActiveOrder({
            ...activeOrder,
            ...fullOrder,
            deliveryState: {
              ...(activeOrder?.deliveryState || {}),
              ...(fullOrder.deliveryState || {}),
              currentPhase: 'at_pickup',
              status: 'reached_pickup'
            }
          }, 'REACHED_PICKUP');
        } else {
          updateTripStatus('REACHED_PICKUP');
        }
      } else {
        throw new Error('Confirm pickup failed');
      }
    } catch (error) {
      toast.error('Failed to update status');
      throw error;
    }
  };

  /**
   * Mark "Picked Up" (Confirm order ID & start delivery)
   */
  const pickUpOrder = async (billImageUrl) => {
    const orderId = activeOrder?.orderId || activeOrder?._id;
    try {
      const response = await deliveryAPI.confirmOrderId(
        orderId,
        activeOrder.displayOrderId || activeOrder.order_id || orderId,
        riderLocation || {},
        { billImageUrl }
      );

      if (response?.data?.success) {
        const fullOrder = response.data.data?.order || response.data?.data;
        setActiveOrder({
          ...activeOrder,
          ...(typeof fullOrder === 'object' ? fullOrder : {}),
          orderStatus: 'picked_up',
          deliveryState: {
            ...(activeOrder?.deliveryState || {}),
            ...(fullOrder?.deliveryState || {}),
            currentPhase: 'en_route_to_delivery',
            status: 'picked_up'
          }
        }, 'PICKED_UP');
        updateTripStatus('PICKED_UP');
      } else {
        throw new Error('Confirm order ID failed');
      }
    } catch (error) {
      toast.error('Error confirming pickup');
      throw error;
    }
  };

  /**
   * Mark "Reached Drop" (Arrival at customer)
   */
  const reachDrop = async () => {
    const orderId = activeOrder?.orderId || activeOrder?._id;
    try {
      const response = await deliveryAPI.confirmReachedDrop(orderId);
      if (response?.data?.success) {
        const fullOrder = response.data.data?.order || response.data?.data;
        setActiveOrder({
          ...activeOrder,
          ...(typeof fullOrder === 'object' ? fullOrder : {}),
          deliveryState: {
            ...(activeOrder?.deliveryState || {}),
            ...(fullOrder?.deliveryState || {}),
            currentPhase: 'at_drop',
            status: 'reached_drop'
          }
        }, 'REACHED_DROP');
        updateTripStatus('REACHED_DROP');
      } else {
        throw new Error('Confirm drop failed');
      }
    } catch (error) {
      toast.error('Failed to notify arrival');
      throw error;
    }
  };

  /**
   * Finalize Delivery with OTP Check
   */
  const completeDelivery = async (otp, handoverImageUrl = null) => {
    const orderId = activeOrder?.orderId || activeOrder?._id;
    try {
      const completeRes = await deliveryAPI.completeDelivery(orderId, { otp, handoverImageUrl, rating: 5 });
      if (completeRes.data?.success) {
        const finalOrder = completeRes.data?.data?.order || completeRes.data?.data || activeOrder;
        setActiveOrder(finalOrder, 'COMPLETED');
        updateTripStatus('COMPLETED');
        return completeRes.data;
      } else {
        toast.error(completeRes.data?.message || 'Failed to complete delivery on server');
        throw new Error('Complete call failed');
      }
    } catch (error) {
      toast.error('Failed to complete delivery');
      throw error;
    }
  };

  const resetTrip = () => {
    clearActiveOrder();
  };

  return {
    acceptOrder,
    reachPickup,
    pickUpOrder,
    reachDrop,
    completeDelivery,
    resetTrip,
  };
};
