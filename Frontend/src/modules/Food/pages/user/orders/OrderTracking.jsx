import { useParams, Link, useSearchParams } from "react-router-dom"
import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { showChatNotification } from "@/shared/utils/chatNotificationSound"
import {
  ArrowLeft,
  Share2,
  RefreshCw,
  Phone,
  User,
  ChevronRight,
  MapPin,
  Home as HomeIcon,
  MessageSquare,
  X,
  Check,
  Shield,
  Receipt,
  CircleSlash,
  Loader2,
  Star,
  AlertCircle,
  Store,
  FileText,
  MessageCircle,
  Truck
} from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Card, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Textarea } from "@food/components/ui/textarea"
import { useOrders } from "@food/context/OrdersContext"
import { useProfile } from "@food/context/ProfileContext"
import { useLocation as useUserLocation } from "@food/hooks/useLocation"
import DeliveryTrackingMap from "@food/components/user/DeliveryTrackingMap"
import api, { orderAPI, restaurantAPI } from "@food/api"
import { API_BASE_URL, API_ENDPOINTS } from "@food/api/config"
import {
  resolveSharerDisplayName,
  saveSharedOrder,
} from "@food/utils/sharedOrderStorage"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { useUserNotifications, getSocket } from "@food/hooks/useUserNotifications"
import circleIcon from "@food/assets/circleicon.png"
import { RESTAURANT_PIN_SVG, CUSTOMER_PIN_SVG, RIDER_BIKE_SVG } from "@food/constants/mapIcons"

const getLocalUserToken = () =>
  localStorage.getItem('user_accessToken') ||
  localStorage.getItem('userToken') ||
  localStorage.getItem('accessToken') ||
  localStorage.getItem('token') ||
  '';

// Fallback definitions in case imports fail at runtime or are shadowed
const DEFAULT_CUSTOMER_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#10B981"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/><circle cx="12" cy="9" r="3" fill="#FFFFFF"/></svg>`;
const SAFE_CUSTOMER_PIN = typeof CUSTOMER_PIN_SVG !== 'undefined' ? CUSTOMER_PIN_SVG : DEFAULT_CUSTOMER_PIN;
const DEFAULT_RESTAURANT_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/><circle cx="12" cy="9" r="3" fill="#FFFFFF"/></svg>`;
const SAFE_RESTAURANT_PIN = typeof RESTAURANT_PIN_SVG !== 'undefined' ? RESTAURANT_PIN_SVG : DEFAULT_RESTAURANT_PIN;

const debugLog = (...args) => console.log('[OrderTracking]', ...args)
const debugWarn = (...args) => console.warn('[OrderTracking]', ...args)
const debugError = (...args) => console.error('[OrderTracking]', ...args)

async function fetchPublicOrderDetails(shareId) {
  const base = (API_BASE_URL || '/api/v1').replace(/\/$/, '')
  const res = await fetch(`${base}/public/order-track/${encodeURIComponent(shareId)}`)
  if (!res.ok) throw new Error('Order not found')
  const json = await res.json()
  if (!json?.success || !json?.data?.order) {
    throw new Error(json?.message || 'Failed to load order')
  }
  return json.data.order
}


// Animated checkmark component
const AnimatedCheckmark = ({ delay = 0 }) => (
  <motion.svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    initial="hidden"
    animate="visible"
    className="mx-auto"
  >
    <motion.circle
      cx="40"
      cy="40"
      r="36"
      fill="none"
      stroke="#22c55e"
      strokeWidth="4"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    />
    <motion.path
      d="M24 40 L35 51 L56 30"
      fill="none"
      stroke="#22c55e"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.4, delay: delay + 0.4, ease: "easeOut" }}
    />
  </motion.svg>
)

// Error boundary to protect page from map render failures
class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.warn('[MapErrorBoundary] Caught map rendering error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative w-full h-[250px] bg-gray-100 dark:bg-zinc-800 rounded-2xl flex flex-col items-center justify-center p-4 text-center border border-gray-200 dark:border-zinc-700">
          <MapPin className="w-8 h-8 text-gray-400 mb-2" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Map preview unavailable</p>
          <p className="text-xs text-gray-400 mt-1">Live order status is tracked below</p>
        </div>
      )
    }
    return this.props.children
  }
}

// Real Delivery Map Component with User Live Location
const DeliveryMap = React.memo(({ orderId, order, isVisible, fallbackCustomerCoords = null, userLiveCoords = null, userLocationAccuracy = null, onEtaUpdate = null }) => {
  const toPointFromGeoJSON = (coords) => {
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };

  // Memoize coordinates to prevent re-calculating on every parent render
  const customerCoords = useMemo(() => {
    const coords = order?.address?.coordinates || order?.address?.location?.coordinates;
    const fromCoords = toPointFromGeoJSON(coords);
    if (fromCoords) return fromCoords;

    const lat = Number(order?.address?.latitude ?? order?.address?.location?.latitude);
    const lng = Number(order?.address?.longitude ?? order?.address?.location?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      return { lat, lng };
    }

    if (
      fallbackCustomerCoords &&
      Number.isFinite(fallbackCustomerCoords.lat) &&
      Number.isFinite(fallbackCustomerCoords.lng)
    ) {
      return fallbackCustomerCoords;
    }

    if (
      userLiveCoords &&
      Number.isFinite(userLiveCoords.lat) &&
      Number.isFinite(userLiveCoords.lng)
    ) {
      return userLiveCoords;
    }

    return null;
  }, [order?.address, fallbackCustomerCoords, userLiveCoords]);

  const restaurantCoords = useMemo(() => {
    let coords =
      order?.restaurantLocation?.coordinates ||
      order?.restaurantId?.location?.coordinates ||
      order?.restaurant?.location?.coordinates ||
      order?.restaurant?.coordinates ||
      (order?.restaurantId?.location?.latitude && order?.restaurantId?.location?.longitude
        ? [order.restaurantId.location.longitude, order.restaurantId.location.latitude]
        : null) ||
      (order?.restaurant?.location?.latitude && order?.restaurant?.location?.longitude
        ? [order.restaurant.location.longitude, order.restaurant.location.latitude]
        : null);

    const fromCoords = toPointFromGeoJSON(coords);
    if (fromCoords) return fromCoords;

    const fallbackLat = Number(
      order?.restaurantId?.location?.latitude ||
      order?.restaurant?.location?.latitude ||
      order?.restaurant?.latitude ||
      order?.restaurantLocation?.latitude
    );
    const fallbackLng = Number(
      order?.restaurantId?.location?.longitude ||
      order?.restaurant?.location?.longitude ||
      order?.restaurant?.longitude ||
      order?.restaurantLocation?.longitude
    );
    if (Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng) && (fallbackLat !== 0 || fallbackLng !== 0)) {
      return { lat: fallbackLat, lng: fallbackLng };
    }

    if (customerCoords) {
      return { lat: customerCoords.lat + 0.015, lng: customerCoords.lng + 0.015 };
    }

    return null;
  }, [order?.restaurantId, order?.restaurantLocation, order?.restaurant, customerCoords]);

  // Delivery boy data
  const deliveryBoyData = useMemo(() => order?.deliveryPartner ? {
    name: order.deliveryPartner.name || 'Delivery Partner',
    avatar: order.deliveryPartner.avatar || null
  } : null, [order?.deliveryPartner]);

  // Firebase and backend write tracking under order.orderId (string) or mongoId; subscribe to all so we receive updates
  const orderTrackingIdsList = useMemo(() => [
    order?.orderId,
    order?.mongoId,
    order?._id,
    orderId,
    order?.id
  ].filter(Boolean), [order?.orderId, order?.mongoId, order?._id, orderId, order?.id]);

  if (!isVisible || !orderId || !order || !restaurantCoords || !customerCoords) {
    return (
      <div
        className="relative min-h-[250px] bg-gradient-to-b from-gray-100 to-gray-200"
        style={{ height: '250px' }}
      />
    );
  }

  return (
    <div
      className="relative w-full min-h-[250px] overflow-visible"
      style={{ height: '250px' }}
    >
      <DeliveryTrackingMap
        orderId={orderId}
        orderTrackingIds={orderTrackingIdsList}
        restaurantCoords={restaurantCoords}
        customerCoords={customerCoords}

        userLiveCoords={userLiveCoords}
        userLocationAccuracy={userLocationAccuracy}
        deliveryBoyData={deliveryBoyData}
        order={order}
        onEtaUpdate={onEtaUpdate}
      />
    </div>
  );
});

// Section item component
const SectionItem = ({ icon: Icon, iconNode, title, subtitle, onClick, showArrow = true, rightContent }) => (
  <motion.button
    onClick={onClick}
    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left border-b border-dashed border-gray-200 last:border-0"
    whileTap={{ scale: 0.99 }}
  >
    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
      {iconNode ? (
        <div
          className="w-6 h-6 flex-shrink-0 flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:block"
        >
          {iconNode}
        </div>
      ) : (
        <Icon className="w-5 h-5 text-gray-600 flex-shrink-0" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 truncate">{title}</p>
      {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
    </div>
    {rightContent || (showArrow && <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />)}
  </motion.button>
)

const getRestaurantCoordsFromOrder = (apiOrder, fallback = null) => {
  if (
    apiOrder?.restaurantId?.location?.coordinates &&
    Array.isArray(apiOrder.restaurantId.location.coordinates) &&
    apiOrder.restaurantId.location.coordinates.length >= 2
  ) {
    return apiOrder.restaurantId.location.coordinates
  }
  if (apiOrder?.restaurantId?.location?.latitude && apiOrder?.restaurantId?.location?.longitude) {
    return [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude]
  }
  if (
    apiOrder?.restaurant?.location?.coordinates &&
    Array.isArray(apiOrder.restaurant.location.coordinates) &&
    apiOrder.restaurant.location.coordinates.length >= 2
  ) {
    return apiOrder.restaurant.location.coordinates
  }
  return fallback || null
}

const getRestaurantAddressFromOrder = (apiOrder, previousOrder = null, explicitRestaurantAddress = null) => {
  if (explicitRestaurantAddress && String(explicitRestaurantAddress).trim()) {
    return String(explicitRestaurantAddress).trim()
  }

  const location = apiOrder?.restaurantId?.location || apiOrder?.restaurant?.location || {}

  if (location?.formattedAddress && String(location.formattedAddress).trim()) {
    return String(location.formattedAddress).trim()
  }
  if (location?.address && String(location.address).trim()) {
    return String(location.address).trim()
  }
  if (location?.addressLine1 && String(location.addressLine1).trim()) {
    return String(location.addressLine1).trim()
  }

  const parts = [location?.street, location?.area, location?.city, location?.state, location?.zipCode]
    .map((value) => (value == null ? '' : String(value).trim()))
    .filter(Boolean)

  if (parts.length > 0) return parts.join(', ')

  return previousOrder?.restaurantAddress || apiOrder?.restaurantAddress || apiOrder?.restaurant?.address || 'Restaurant location'
}

const getCustomerCoordsFromApiOrder = (apiOrder, previousOrder = null) => {
  const addr = apiOrder?.address || apiOrder?.deliveryAddress || {}
  const fromLoc = addr?.location?.coordinates
  if (Array.isArray(fromLoc) && fromLoc.length >= 2) return fromLoc
  const flat = addr?.coordinates
  if (Array.isArray(flat) && flat.length >= 2) return flat
  const prev = previousOrder?.address?.coordinates || previousOrder?.address?.location?.coordinates
  if (Array.isArray(prev) && prev.length >= 2) return prev

  const lat = Number(addr?.latitude ?? addr?.location?.latitude ?? previousOrder?.address?.latitude)
  const lng = Number(addr?.longitude ?? addr?.location?.longitude ?? previousOrder?.address?.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat]

  return null
}

const transformOrderForTracking = (apiOrder, previousOrder = null, explicitRestaurantCoords = null, explicitRestaurantAddress = null) => {
  const restaurantCoords = explicitRestaurantCoords || getRestaurantCoordsFromOrder(apiOrder, previousOrder?.restaurantLocation?.coordinates)
  const restaurantAddress = getRestaurantAddressFromOrder(apiOrder, previousOrder, explicitRestaurantAddress)
  // API returns `deliveryAddress`; some paths use `address`
  const addr = apiOrder?.address || apiOrder?.deliveryAddress || {}
  const customerCoordsResolved = getCustomerCoordsFromApiOrder(apiOrder, previousOrder)

  return {
    id: apiOrder?.orderId || apiOrder?._id,
    mongoId: apiOrder?._id || null,
    orderId: apiOrder?.orderId || apiOrder?._id,
    shareTrackingId: apiOrder?.shareTrackingId || previousOrder?.shareTrackingId || null,
    restaurant: apiOrder?.restaurantName || previousOrder?.restaurant || 'Restaurant',
    restaurantPhone:
      apiOrder?.restaurantPhone ||
      apiOrder?.restaurantId?.phone ||
      apiOrder?.restaurantId?.ownerPhone ||
      apiOrder?.restaurantId?.primaryContactNumber ||
      apiOrder?.restaurant?.phone ||
      apiOrder?.restaurant?.ownerPhone ||
      previousOrder?.restaurantPhone ||
      '',
    restaurantAddress,
    restaurantId: apiOrder?.restaurantId || previousOrder?.restaurantId || null,
    userId: apiOrder?.userId || previousOrder?.userId || null,
    userName: apiOrder?.userName || apiOrder?.customerName || apiOrder?.userId?.name || apiOrder?.userId?.fullName || previousOrder?.userName || '',
    userPhone: apiOrder?.userPhone || apiOrder?.userId?.phone || previousOrder?.userPhone || '',
    address: {
      street: addr?.street || previousOrder?.address?.street || '',
      city: addr?.city || previousOrder?.address?.city || '',
      state: addr?.state || previousOrder?.address?.state || '',
      zipCode: addr?.zipCode || previousOrder?.address?.zipCode || '',
      additionalDetails: addr?.additionalDetails || previousOrder?.address?.additionalDetails || '',
      formattedAddress: addr?.formattedAddress ||
        (addr?.street && addr?.city
          ? `${addr.street}${addr.additionalDetails ? `, ${addr.additionalDetails}` : ''}, ${addr.city}${addr.state ? `, ${addr.state}` : ''}${addr.zipCode ? ` ${addr.zipCode}` : ''}`
          : previousOrder?.address?.formattedAddress || addr?.city || ''),
      coordinates: customerCoordsResolved || addr?.location?.coordinates || previousOrder?.address?.coordinates || null
    },
    restaurantLocation: {
      coordinates: restaurantCoords
    },
    items: apiOrder?.items?.map(item => ({
      name: item.name,
      variantName: item.variantName || '',
      quantity: item.quantity,
      price: item.price
    })) || previousOrder?.items || [],
    total: apiOrder?.pricing?.total || previousOrder?.total || 0,
    // Backend canonical field is orderStatus; keep legacy `status` for UI compatibility.
    status: apiOrder?.orderStatus || apiOrder?.status || previousOrder?.status || 'pending',
    deliveryPartner: apiOrder?.deliveryPartner || (apiOrder?.deliveryPartnerId ? {
      name: apiOrder.deliveryPartnerId.name || apiOrder.deliveryPartnerId.fullName || 'Delivery Partner',
      phone: apiOrder.deliveryPartnerId.phone || apiOrder.deliveryPartnerId.phoneNumber || '',
      avatar: apiOrder.deliveryPartnerId.avatar || apiOrder.deliveryPartnerId.profilePicture || null
    } : (previousOrder?.deliveryPartner || null)),
    deliveryPartnerId: apiOrder?.deliveryPartnerId?._id || apiOrder?.deliveryPartnerId || apiOrder?.dispatch?.deliveryPartnerId?._id || apiOrder?.dispatch?.deliveryPartnerId || apiOrder?.assignmentInfo?.deliveryPartnerId || null,
    dispatch: apiOrder?.dispatch || previousOrder?.dispatch || null,
    assignmentInfo: apiOrder?.assignmentInfo || previousOrder?.assignmentInfo || null,
    tracking: apiOrder?.tracking || previousOrder?.tracking || {},
    deliveryState: apiOrder?.deliveryState || previousOrder?.deliveryState || null,
    createdAt: apiOrder?.createdAt || previousOrder?.createdAt || null,
    totalAmount: apiOrder?.pricing?.total || apiOrder?.totalAmount || previousOrder?.totalAmount || 0,
    deliveryFee: apiOrder?.pricing?.deliveryFee || apiOrder?.deliveryFee || previousOrder?.deliveryFee || 0,
    gst: apiOrder?.pricing?.tax || apiOrder?.pricing?.gst || apiOrder?.gst || apiOrder?.tax || previousOrder?.gst || 0,
    packagingFee: apiOrder?.pricing?.packagingFee || apiOrder?.packagingFee || 0,
    platformFee: apiOrder?.pricing?.platformFee || apiOrder?.platformFee || 0,
    surgeAmount: apiOrder?.pricing?.surgeAmount || apiOrder?.surgeAmount || previousOrder?.surgeAmount || 0,
    surgeTitle: apiOrder?.pricing?.surgeTitle || apiOrder?.surgeTitle || previousOrder?.surgeTitle || "Surge Charge",
    deliveryPartnerTip: apiOrder?.pricing?.deliveryPartnerTip || apiOrder?.deliveryPartnerTip || apiOrder?.tip || previousOrder?.deliveryPartnerTip || 0,
    discount: apiOrder?.pricing?.discount || apiOrder?.discount || 0,
    subtotal: apiOrder?.pricing?.subtotal || apiOrder?.subtotal || 0,
    paymentMethod: apiOrder?.paymentMethod || apiOrder?.payment?.method || previousOrder?.paymentMethod || null,
    payment: apiOrder?.payment || previousOrder?.payment || null,
    // Preserve delivery OTP code received via socket event.
    // API responses intentionally strip the secret code for security,
    // so without preserving it the UI would lose the OTP on each poll refresh.
    deliveryVerification: (() => {
      const prevDV = previousOrder?.deliveryVerification || null
      const apiDV = apiOrder?.deliveryVerification || null
      const handoverOtp = apiOrder?.handoverOtp || null

      if (!prevDV && !apiDV && !handoverOtp) return null

      const prevDropOtp = prevDV?.dropOtp || null
      const apiDropOtp = apiDV?.dropOtp || null

      const merged = {
        ...(prevDV || {}),
        ...(apiDV || {})
      }

      // Prioritize: 1. Real-time handoverOtp from current API response
      // 2. Previously preserved code in local state (from socket or earlier poll)
      // 3. Nested code field in API response (if ever present)
      const finalCode = handoverOtp || prevDropOtp?.code || apiDropOtp?.code

      if (finalCode || prevDropOtp?.required || apiDropOtp?.required) {
        merged.dropOtp = {
          ...(prevDropOtp || {}),
          ...(apiDropOtp || {}),
          code: finalCode
        }
      }
      return merged
    })(),
    note: apiOrder?.note || previousOrder?.note || ''
  }
}

/**
 * Backend uses `orderStatus` (created, confirmed, preparing, ready_for_pickup, picked_up, delivered, cancelled_*).
 * This page used to read legacy `status` only — so UI never updated. Map canonical + legacy values to tracking steps.
 */
function mapBackendOrderStatusToUi(raw) {
  const s = String(raw || "").toLowerCase()
  if (!s || s === "pending" || s === "created") return "placed"
  if (s === "confirmed" || s === "accepted") return "confirmed"
  if (s === "preparing" || s === "processed") return "preparing"
  if (s === "ready" || s === "ready_for_pickup" || s === "reached_pickup" || s === "order_confirmed") return "ready"
  if (s === "picked_up" || s === "out_for_delivery" || s === "en_route_to_delivery") return "on_way"
  if (s === "reached_drop" || s === "at_drop" || s === "at_delivery") return "at_drop"
  if (s === "delivered" || s === "completed") return "delivered"
  if (s.includes("cancelled") || s === "cancelled") return "cancelled"
  return "placed"
}

function mapOrderToTrackingUiStatus(orderLike) {
  if (!orderLike) return "placed"
  const statusRaw = orderLike.status || orderLike.orderStatus
  const phase = orderLike.deliveryState?.currentPhase

  // Terminal states handled first
  if (isFoodOrderCancelledStatus(statusRaw)) return "cancelled"
  if (statusRaw === "delivered" || statusRaw === "completed") return "delivered"

  // Live Ride / Phase-based mapping (Highest priority for precision)
  const isRiderAccepted = orderLike.dispatch?.status === "accepted" || orderLike.assignmentInfo?.status === "accepted" || orderLike.deliveryPartner?.status === "accepted";

  if (phase === "reached_drop" || phase === "at_drop" || statusRaw === "at_drop") return "at_drop"
  if (phase === "en_route_to_delivery" || statusRaw === "picked_up" || statusRaw === "out_for_delivery") return "on_way"
  if (phase === "at_pickup" && orderLike.deliveryPartnerId && isRiderAccepted) return "at_pickup"
  if (phase === "en_route_to_pickup" && orderLike.deliveryPartnerId && isRiderAccepted) return "assigned"

  // Fallback to basic status mapping
  return mapBackendOrderStatusToUi(statusRaw)
}

/** Prefer live delivery phase when present (socket / polling include deliveryState). */
function isFoodOrderCancelledStatus(statusRaw) {
  const s = String(statusRaw || "").toLowerCase()
  return s === "cancelled" || s.includes("cancelled")
}

function normalizeLookupId(value) {
  if (value == null) return ""
  const raw = String(value).trim()
  if (!raw || raw === "undefined" || raw === "null") return ""
  return raw
}

function formatEtaText(estimatedTime, fallbackText) {
  if (estimatedTime == null) return fallbackText;

  let minutes = null;

  if (typeof estimatedTime === "number") {
    if (Number.isFinite(estimatedTime) && !isNaN(estimatedTime) && estimatedTime > 0) {
      minutes = Math.round(estimatedTime);
    }
  } else if (typeof estimatedTime === "string") {
    const cleaned = estimatedTime.trim();
    if (cleaned.toLowerCase().includes("nan")) {
      return fallbackText;
    }
    const match = cleaned.match(/(\d+)/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (Number.isFinite(parsed) && !isNaN(parsed) && parsed > 0) {
        minutes = parsed;
      }
    }
  }

  if (minutes !== null && minutes > 0) {
    return `Arriving in ${minutes} min${minutes === 1 ? '' : 's'}`;
  }

  return fallbackText;
}

const CANCELLATION_REASONS = [
  "I ordered by mistake",
  "I want to change my order",
  "I want to change the delivery address",
  "I want to change the payment method",
  "Restaurant is taking too long to accept my order",
  "I no longer need the order",
  "I found another restaurant/food option",
  "Ordered the wrong item",
  "I want to place a new order",
  "Price/total amount is higher than expected",
  "Delivery time is too long",
  "Other"
];

const ORDER_SUPPORT_CATEGORIES = [
  "Food item missing or damaged",
  "Delivery is delayed",
  "Wrong order delivered",
  "Quality or taste issue",
  "Payment or billing issue",
  "Other order issue",
];

export default function OrderTracking({ isSharedView = false }) {
  const companyName = useCompanyName()
  const { orderId: orderIdParam, shareId: shareIdParam } = useParams()
  const isShared = isSharedView || Boolean(shareIdParam)
  const shareId = shareIdParam || null
  const orderId = isShared ? null : orderIdParam
  const trackingKey = isShared ? shareId : orderId
  const [searchParams] = useSearchParams()
  const confirmed = !isShared && searchParams.get("confirmed") === "true"
  const sharedViewerName = searchParams.get("name")
  const { getOrderById } = useOrders()
  const { userProfile, getDefaultAddress } = useProfile()
  const { location: userLiveLocation } = useUserLocation()

  const { isConnected: isSocketConnected } = useUserNotifications()

  // State for order data (pre-hydrated from cache for instant 0ms load)
  const [order, setOrder] = useState(() => {
    if (isShared || !orderId) return null;
    try {
      const cachedStr = localStorage.getItem("lastPlacedOrder");
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        const needle = String(orderId).trim().toLowerCase();
        const candidates = [parsed?.id, parsed?._id, parsed?.mongoId, parsed?.orderId].filter(Boolean).map(s => String(s).trim().toLowerCase());
        if (candidates.includes(needle)) {
          return transformOrderForTracking(parsed);
        }
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(() => !order);
  const [error, setError] = useState(null)

  const [showConfirmation, setShowConfirmation] = useState(confirmed)
  const [orderStatus, setOrderStatus] = useState('placed')
  const [estimatedTime, setEstimatedTime] = useState(29)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [supportCategory, setSupportCategory] = useState("Food item missing or damaged")
  const [supportDescription, setSupportDescription] = useState("")
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [showPlatformFeeModal, setShowPlatformFeeModal] = useState(false)
  const [showDeliveryFeeModal, setShowDeliveryFeeModal] = useState(false)
  const [cancellationReason, setCancellationReason] = useState("")
  const [customCancellationComment, setCustomCancellationComment] = useState("")
  const [cancellationPolicyText, setCancellationPolicyText] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)

  // Real-time chat notification and unread count listener
  useEffect(() => {
    const socket = getSocket ? getSocket() : null;
    const targetId = orderId || trackingKey;
    if (!targetId) return;

    // Fetch initial chat unread count
    fetch(`${API_BASE_URL}/v1/food/orders/${targetId}/chat`, {
      headers: { Authorization: `Bearer ${getLocalUserToken()}` }
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.data?.conversation?.userUnreadCount != null) {
          setUnreadChatCount(Number(d.data.conversation.userUnreadCount || 0));
        }
      })
      .catch(() => {});

    if (!socket) return;

    const handleChatNotif = (payload) => {
      if (String(payload?.orderId || '').toLowerCase() === String(targetId).toLowerCase()) {
        if (payload?.userUnreadCount != null) {
          setUnreadChatCount(Number(payload.userUnreadCount));
        } else {
          setUnreadChatCount((prev) => prev + 1);
        }
        const notifId = payload?.id || payload?._id || payload?.message?._id || payload?.message?.id || `${payload?.senderName}:${payload?.text}`;
        showChatNotification(payload?.senderName || 'Delivery Partner', payload?.text || 'New message', notifId);
      }
    };

    const handleUnreadUpdate = (payload) => {
      if (String(payload?.orderId || '').toLowerCase() === String(targetId).toLowerCase()) {
        if (payload?.unreadCount != null) {
          setUnreadChatCount(Number(payload.unreadCount));
        }
      }
    };

    socket.on('order-chat-notification', handleChatNotif);
    socket.on('order-chat-unread-update', handleUnreadUpdate);

    return () => {
      socket.off('order-chat-notification', handleChatNotif);
      socket.off('order-chat-unread-update', handleUnreadUpdate);
    };
  }, [orderId, trackingKey]);

  // Fetch admin configured cancellation policy
  useEffect(() => {
    const fetchCancellationPolicy = async () => {
      try {
        const response = await api.get(API_ENDPOINTS.ADMIN.CANCELLATION_PUBLIC)
        const contentData = response?.data?.data?.content || response?.data?.content
        if (contentData) {
          const raw = contentData
          const cleaned = typeof document !== 'undefined'
            ? (new DOMParser().parseFromString(raw, 'text/html').body.textContent || '')
            : raw.replace(/<[^>]*>?/gm, '')
          if (cleaned.trim()) {
            setCancellationPolicyText(cleaned.trim())
          }
        }
      } catch (error) {
        // keep fallback
      }
    }
    fetchCancellationPolicy()
  }, [])
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false)
  const [deliveryInstructions, setDeliveryInstructions] = useState("")
  const [isUpdatingInstructions, setIsUpdatingInstructions] = useState(false)

  // Post-Delivery Rating State
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false)
  const [restaurantRating, setRestaurantRating] = useState(5)
  const [deliveryRating, setDeliveryRating] = useState(5)
  const [restaurantComment, setRestaurantComment] = useState("")
  const [deliveryComment, setDeliveryComment] = useState("")
  const [submittingRating, setSubmittingRating] = useState(false)

  const isAlreadyRated = Boolean(
    order?.ratings?.restaurant?.rating ||
    order?.restaurantRating ||
    order?.ratings?.deliveryPartner?.rating
  )

  const handleRatingSubmit = async () => {
    if (!order) return
    try {
      setSubmittingRating(true)
      const hasDeliveryPartner = Boolean(order?.deliveryPartnerId || order?.deliveryPartner)
      const payload = {
        restaurantRating,
        restaurantComment: restaurantComment.trim() || undefined,
        ...(hasDeliveryPartner ? {
          deliveryPartnerRating: deliveryRating,
          deliveryPartnerComment: deliveryComment.trim() || undefined,
        } : {})
      }

      const response = await orderAPI.submitOrderRatings(resolvedLookupId || orderId, payload)
      toast.success("Thank you for rating your delivery & food!")
      setIsRatingModalOpen(false)

      // Update order state locally so UI updates immediately
      setOrder(prev => prev ? {
        ...prev,
        ratings: response?.data?.data?.order?.ratings || {
          restaurant: { rating: restaurantRating, comment: restaurantComment },
          deliveryPartner: hasDeliveryPartner ? { rating: deliveryRating, comment: deliveryComment } : null
        }
      } : prev)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to submit rating. Please try again.")
    } finally {
      setSubmittingRating(false)
    }
  }

  const handleSupportSubmit = async () => {
    if (!supportCategory) return
    try {
      setIsSubmittingSupport(true)
      const mongoOrderId = order?.mongoId || order?._id
      const payload = {
        type: "order",
        issueType: supportCategory,
        description: supportDescription.trim() || supportCategory,
        ...(mongoOrderId ? { orderId: mongoOrderId } : {})
      }
      await api.post("/food/user/support/ticket", payload).catch(() => {})

      toast.success(`Support request submitted for Order #${displayOrderRef}! Our support team will assist you shortly.`)
      setShowSupportModal(false)
      setSupportDescription("")
    } catch {
      toast.success(`Support request logged for Order #${displayOrderRef}.`)
      setShowSupportModal(false)
      setSupportDescription("")
    } finally {
      setIsSubmittingSupport(false)
    }
  }
  const [resolvedLookupId, setResolvedLookupId] = useState("")
  const [timerNow, setTimerNow] = useState(Date.now())
  const handleEtaUpdate = useCallback((newEta) => {
    if (newEta == null) return;
    const str = String(newEta).trim();
    if (str.toLowerCase().includes("nan")) return;

    const match = str.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (Number.isFinite(num) && !isNaN(num) && num > 0) {
        setEstimatedTime(num);
      }
    }
  }, []);
  const lastRealtimeRefreshRef = useRef(0)
  const trackingOrderIdsRef = useRef(new Set())
  const terminalPollStopRef = useRef(false)
  const lookupIdsRef = useRef([])
  const isInitialPollRequestedRef = useRef(null)
  const lastPollExecutionRef = useRef(0) // New: Hard throttle for extreme cases

  // Delivery handover OTP received via socket event.
  // Kept separately so UI still renders even if the event arrives
  // before the order API poll populates `order` state.
  const [socketDropOtpCode, setSocketDropOtpCode] = useState(null)


  // OTP received via socket event (deliveryDropOtp)
  useEffect(() => {
    const handleDeliveryDropOtp = (event) => {
      const detail = event?.detail || {}
      const otp = detail?.otp != null ? String(detail.otp) : null
      const evtOrderId = detail?.orderId != null ? String(detail.orderId) : null
      const evtOrderMongoId =
        detail?.orderMongoId != null ? String(detail.orderMongoId) : null

      if (!otp) return

      // If the order is already loaded, match by either orderId or mongoId.
      // Otherwise, match against the current URL param.
      const currentIds = [orderId, order?.orderId, order?.mongoId, order?._id]
        .filter(Boolean)
        .map(String)

      const matches =
        (evtOrderId && currentIds.includes(evtOrderId)) ||
        (evtOrderMongoId && currentIds.includes(evtOrderMongoId))

      if (!matches) return

      // Always store so UI can render even if `order` hasn't loaded yet.
      setSocketDropOtpCode(otp)

      setOrder((prev) => {
        if (!prev) return prev
        const prevDV = prev.deliveryVerification || {}
        const prevDropOtp = prevDV.dropOtp || {}

        // Only update if code actually changed to avoid render loops
        if (prevDropOtp.code === otp) return prev;

        return {
          ...prev,
          deliveryVerification: {
            ...prevDV,
            dropOtp: {
              ...prevDropOtp,
              required: true,
              verified: false,
              code: otp
            }
          }
        }
      })
    }

    window.addEventListener('deliveryDropOtp', handleDeliveryDropOtp)
    return () => window.removeEventListener('deliveryDropOtp', handleDeliveryDropOtp)
  }, [orderId, order])

  // --------------------------------------------------------------------------
  // DATA FETCHING & POLLING STABILITY (FIXED FOR HAMMERING)
  // --------------------------------------------------------------------------

  // Socket notifications include order ids — keep a set so events match this page.
  useEffect(() => {
    const s = trackingOrderIdsRef.current
    if (orderId) s.add(String(orderId))
    if (order?.orderId) s.add(String(order.orderId))
    if (order?.mongoId) s.add(String(order.mongoId))
    if (order?.id) s.add(String(order.id))
  }, [orderId, order?.orderId, order?.mongoId, order?.id])

  useEffect(() => {
    const ids = [
      resolvedLookupId,
      orderId,
      order?.orderId,
      order?.mongoId,
      order?._id,
      order?.id,
    ]
      .map(normalizeLookupId)
      .filter(Boolean)
    lookupIdsRef.current = Array.from(new Set(ids))
  }, [orderId, resolvedLookupId, order?.orderId, order?.mongoId, order?._id, order?.id])

  // Stability Nuke: Move function bodies into a ref-protected execute flow
  const stableOpsRef = useRef({
    resolveOrderFromList: async (rawLookupId) => {
      const needle = normalizeLookupId(rawLookupId)
      if (!needle) return null
      try {
        const listResponse = await orderAPI.getOrders({ page: 1, limit: 20 })
        let orders = []
        if (listResponse?.data?.success && listResponse?.data?.data?.orders) {
          orders = listResponse.data.data.orders || []
        } else if (listResponse?.data?.orders) {
          orders = listResponse.data.orders || []
        } else if (Array.isArray(listResponse?.data?.data?.data)) {
          orders = listResponse.data.data.data || []
        } else if (Array.isArray(listResponse?.data?.data)) {
          orders = listResponse.data.data || []
        }

        const matched = (orders || []).find((o) => {
          const candidates = [o?._id, o?.id, o?.orderId, o?.mongoId].map(normalizeLookupId)
          return candidates.includes(needle)
        })
        if (matched) return matched
      } catch { }
      return null
    },
    fetchOrderDetailsWithFallback: async (options = {}) => {
      const lookupIds = lookupIdsRef.current
      if (lookupIds.length === 0) throw new Error("Order id required")
      let lastError = null
      for (const id of lookupIds) {
        try {
          // Double guard against hammer
          return await orderAPI.getOrderDetails(id, options)
        } catch (err) {
          lastError = err
          if (err?.response?.status === 400 || err?.response?.status === 404) continue
          throw err
        }
      }
      throw lastError || new Error("Failed to fetch order details")
    }
  });

  const resolveOrderFromList = useCallback((id) => stableOpsRef.current.resolveOrderFromList(id), [])
  const fetchOrderDetailsWithFallback = useCallback((opts) => stableOpsRef.current.fetchOrderDetailsWithFallback(opts), [])

  // Clear OTP when order is finalized.
  useEffect(() => {
    if (!order) return
    const status = mapOrderToTrackingUiStatus(order)
    if (status === 'delivered' || status === 'cancelled') {
      setSocketDropOtpCode(null)


      setOrder((prev) => {
        if (!prev?.deliveryVerification?.dropOtp?.code) return prev
        return {
          ...prev,
          deliveryVerification: {
            ...(prev.deliveryVerification || {}),
            dropOtp: {
              ...(prev.deliveryVerification?.dropOtp || {}),
              code: null
            }
          }
        }
      })
    }
  }, [orderStatus, order])

  const defaultAddress = getDefaultAddress()
  const fallbackCustomerCoords = useMemo(() => {
    const orderCoords = order?.address?.coordinates || order?.address?.location?.coordinates
    if (Array.isArray(orderCoords) && orderCoords.length >= 2) {
      const lng = Number(orderCoords[0])
      const lat = Number(orderCoords[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng }
      }
    }

    const defaultCoords = defaultAddress?.location?.coordinates
    if (Array.isArray(defaultCoords) && defaultCoords.length >= 2) {
      const lng = Number(defaultCoords[0])
      const lat = Number(defaultCoords[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng }
      }
    }

    const liveLat = Number(userLiveLocation?.latitude)
    const liveLng = Number(userLiveLocation?.longitude)
    if (Number.isFinite(liveLat) && Number.isFinite(liveLng)) {
      return { lat: liveLat, lng: liveLng }
    }

    return null
  }, [
    order?.address?.coordinates,
    order?.address?.location?.coordinates,
    defaultAddress?.location?.coordinates,
    userLiveLocation?.latitude,
    userLiveLocation?.longitude
  ])

  const userLiveCoords = useMemo(() => {
    const lat = Number(userLiveLocation?.latitude)
    const lng = Number(userLiveLocation?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }, [userLiveLocation?.latitude, userLiveLocation?.longitude])

  const mapOrderId = useMemo(
    () => order?.orderId || order?.mongoId || order?._id || orderId || '',
    [order?.orderId, order?.mongoId, order?._id, orderId],
  )

  const displayOrderRef = useMemo(() => {
    const id = mapOrderId || trackingKey || ''
    return id ? String(id).slice(-6).toUpperCase() : '------'
  }, [mapOrderId, trackingKey])

  const isAdminAccepted = useMemo(() => {
    const status = order?.status
    return [
      "confirmed",
      "preparing",
      "ready",
      "ready_for_pickup",
      "picked_up",
    ].includes(status)
  }, [order?.status])

  // Single source of truth: backend order.status (+ deliveryState phase for live ride)
  useEffect(() => {
    if (!order) return
    setOrderStatus(mapOrderToTrackingUiStatus(order))
  }, [
    order?.status,
    order?.deliveryState?.currentPhase,
    order?.deliveryState?.status,
  ])

  const acceptedAtMs = useMemo(() => {
    const timestamp =
      order?.tracking?.confirmed?.timestamp ||
      order?.tracking?.preparing?.timestamp ||
      order?.updatedAt ||
      order?.createdAt

    const parsed = timestamp ? new Date(timestamp).getTime() : NaN
    return Number.isFinite(parsed) ? parsed : null
  }, [order?.tracking?.confirmed?.timestamp, order?.tracking?.preparing?.timestamp, order?.updatedAt, order?.createdAt])

  const editWindowRemainingMs = useMemo(() => {
    if (!isAdminAccepted || !acceptedAtMs) return 0
    const remaining = 60000 - (timerNow - acceptedAtMs)
    return Math.max(0, remaining)
  }, [isAdminAccepted, acceptedAtMs, timerNow])

  const isEditWindowOpen = editWindowRemainingMs > 0

  const editWindowText = useMemo(() => {
    const totalSeconds = Math.ceil(editWindowRemainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }, [editWindowRemainingMs])

  const handleCallRestaurant = (e) => {
    // Prevent event bubbling if necessary
    if (e && e.stopPropagation) e.stopPropagation();

    const rawPhone =
      order?.restaurantPhone ||
      order?.restaurantId?.phone ||
      order?.restaurantId?.ownerPhone ||
      order?.restaurantId?.contact?.phone ||
      order?.restaurant?.phone ||
      order?.restaurant?.ownerPhone ||
      order?.restaurantId?.location?.phone ||
      '';

    const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '');

    if (!cleanPhone || cleanPhone.length < 5) {
      toast.error('Restaurant phone number not available');
      return;
    }

    debugLog('?? Attempting to call restaurant:', cleanPhone);

    // Most compatible way to trigger dialer on overall mobile/web environments:
    // Create a temporary hidden anchor and programmatically click it.
    try {
      const link = document.createElement('a');
      link.href = `tel:${cleanPhone}`;
      link.setAttribute('target', '_self');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      debugError('Call failed via link click:', err);
      // Last-ditch fallback
      window.location.assign(`tel:${cleanPhone}`);
    }
  };

  const handleCallRider = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();

    const rawPhone = order?.deliveryPartner?.phone || '';
    const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '');

    if (!cleanPhone || cleanPhone.length < 5) {
      toast.error('Rider phone number not available');
      return;
    }

    debugLog('?? Attempting to call rider:', cleanPhone);

    try {
      const link = document.createElement('a');
      link.href = `tel:${cleanPhone}`;
      link.setAttribute('target', '_self');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      debugError('Call failed via link click:', err);
      window.location.assign(`tel:${cleanPhone}`);
    }
  };

  const customerDeliveryOtp = useMemo(() => {
    const codeFromOrder = order?.deliveryVerification?.dropOtp?.code
    const code = codeFromOrder ?? socketDropOtpCode
    return code ? String(code) : null
  }, [order?.deliveryVerification?.dropOtp?.code, socketDropOtpCode])

  useEffect(() => {
    if (!isEditWindowOpen) return
    const interval = setInterval(() => {
      setTimerNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [isEditWindowOpen])

  // Poll for order updates (especially when delivery partner accepts)

  const pollRef = useRef(null);

  // Main fetch & polling core logic. (Isolated from socket connection stat-changes)
  useEffect(() => {
    if (!trackingKey) return;

    let isSubscribed = true;
    let requestInProgress = false;

    const poll = async (isInitial = false) => {
      if (!isSubscribed || requestInProgress) return;
      if (terminalPollStopRef.current && !isInitial) return;

      const now = Date.now();
      if (isInitial && now - lastPollExecutionRef.current < 1000) return;
      if (isInitial) lastPollExecutionRef.current = now;

      // Check context and local cache immediately to eliminate loading delay
      if (isInitial && !isShared && orderId) {
        let rawContext = getOrderById(orderId);
        if (!rawContext) {
          try {
            const cachedStr = localStorage.getItem("lastPlacedOrder");
            if (cachedStr) {
              const parsed = JSON.parse(cachedStr);
              const needle = String(orderId).trim().toLowerCase();
              const candidates = [parsed?.id, parsed?._id, parsed?.mongoId, parsed?.orderId].filter(Boolean).map(s => String(s).trim().toLowerCase());
              if (candidates.includes(needle)) rawContext = parsed;
            }
          } catch { }
        }
        if (rawContext) {
          setOrder(transformOrderForTracking(rawContext));
          setLoading(false);
        }
      }

      requestInProgress = true;
      try {
        let finalOrderData = null;

        if (isShared) {
          finalOrderData = await fetchPublicOrderDetails(shareId);
        } else {
          const response = await fetchOrderDetailsWithFallback({ force: isInitial });
          if (!isSubscribed) return;

          if (response.data?.success && response.data.data?.order) {
            finalOrderData = response.data.data.order;
          } else if (isInitial) {
            const matchedOrder = await resolveOrderFromList(orderId);
            if (matchedOrder) finalOrderData = matchedOrder;
          }
        }

        if (!isSubscribed) return;

        if (finalOrderData) {
          if (isShared) {
            const sharedName = resolveSharerDisplayName({
              urlName: sharedViewerName,
              order: finalOrderData,
            });
            saveSharedOrder(shareId, sharedName);
          }

          setOrder(prev => {
            const transformedOrder = transformOrderForTracking(finalOrderData, prev);
            const ui = mapOrderToTrackingUiStatus(transformedOrder);
            terminalPollStopRef.current = ui === 'delivered' || ui === 'cancelled';
            return transformedOrder;
          });
          setError(null);
          setLoading(false);
          return;
        }

        if (isInitial && !order) {
          setError(isShared ? 'Order not found' : 'Order not found');
          terminalPollStopRef.current = true;
        }
      } catch (err) {
        if (isInitial && !order) {
          if (!isShared) {
            try {
              const matchedOrder = await resolveOrderFromList(orderId);
              if (matchedOrder) {
                if (!isSubscribed) return;
                setOrder(prev => transformOrderForTracking(matchedOrder, prev));
                setError(null);
                setLoading(false);
                return;
              }
            } catch { }
          }
          if (!isSubscribed) return;
          setError(
            isShared
              ? err?.message || 'Failed to fetch order details'
              : err.response?.data?.message || 'Failed to fetch order details',
          );
          terminalPollStopRef.current = true;
        }
      } finally {
        requestInProgress = false;
        if (isInitial && isSubscribed) setLoading(false);
      }
    };

    pollRef.current = poll;
    terminalPollStopRef.current = false;

    if (isInitialPollRequestedRef.current !== trackingKey) {
      isInitialPollRequestedRef.current = trackingKey;
      poll(true);
    }

    return () => {
      isSubscribed = false;
    };
  }, [
    trackingKey,
    isShared,
    shareId,
    orderId,
    sharedViewerName,
    fetchOrderDetailsWithFallback,
    resolveOrderFromList,
    getOrderById,
  ]);

  // Interval Manager (dynamically adapts based on socket connection state independently)
  useEffect(() => {
    if (!trackingKey) return;

    const tick = () => {
      if (terminalPollStopRef.current) return;
      if (document.hidden) return;
      // Delegate to the latest instance of our polling function capturing current state
      if (pollRef.current) pollRef.current(false);
    };

    const pollInterval = (isSocketConnected || window.orderSocketConnected) ? 12000 : 5000;
    const interval = setInterval(tick, pollInterval);

    return () => clearInterval(interval);
  }, [trackingKey, isSocketConnected]);

  useEffect(() => {
    if (!order) return
    const ui = mapOrderToTrackingUiStatus(order)
    terminalPollStopRef.current = ui === 'delivered' || ui === 'cancelled'
  }, [order])

  // Post-checkout splash - dismiss fast as soon as order is ready or after 1.2s max
  useEffect(() => {
    if (!showConfirmation) return;
    if (order && !loading) {
      const timer = setTimeout(() => setShowConfirmation(false), 500);
      return () => clearTimeout(timer);
    }
    const timer1 = setTimeout(() => setShowConfirmation(false), 1200);
    return () => clearTimeout(timer1);
  }, [showConfirmation, order, loading]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setEstimatedTime((prev) => Math.max(0, prev - 1))
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  // Listen for order status updates from socket (e.g., "Delivery partner on the way")
  useEffect(() => {
    const handleOrderStatusNotification = (event) => {
      const payload = event?.detail || {};
      const { message, status, estimatedDeliveryTime, orderId: evtOrderId, orderMongoId } = payload;

      const evtKeys = [evtOrderId, orderMongoId, payload?._id].filter(Boolean).map(String)
      const idMatches =
        evtKeys.length === 0 ||
        evtKeys.some((k) => String(k) === String(orderId)) ||
        evtKeys.some((k) => trackingOrderIdsRef.current.has(k))

      debugLog('?? Order status notification received:', { message, status, idMatches });

      if (idMatches) {
        const next = mapOrderToTrackingUiStatus({
          status,
          orderStatus: payload.orderStatus || status,
          deliveryState: payload.deliveryState,
        });
        setOrderStatus(next);

        // Optimistically update order state from socket payload
        if (payload.note || payload.orderStatus || payload.status) {
          setOrder(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              status: payload.orderStatus || payload.status || prev.status,
              note: payload.note || prev.note
            };
          });
        }

        // Pull latest order state without refresh spam on bursty socket events.
        const now = Date.now();
        if (now - lastRealtimeRefreshRef.current > 1500 && !isRefreshing) {
          lastRealtimeRefreshRef.current = now;
          handleRefresh();
        }
      }

      // Show notification toast
      if (message) {
        toast.success(message, {
          duration: 5000,
          icon: '🛎️',
          position: 'top-center',
          id: `order-status-${evtOrderId || orderMongoId}-${status}`,
          description: estimatedDeliveryTime
            ? `Estimated delivery in ${Math.round(estimatedDeliveryTime / 60)} minutes`
            : undefined
        });

        // Optional: Vibrate device if supported
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      }
    };

    // Listen for custom event from DeliveryTrackingMap
    window.addEventListener('orderStatusNotification', handleOrderStatusNotification);

    return () => {
      window.removeEventListener('orderStatusNotification', handleOrderStatusNotification);
    };
  }, [orderId])

  const handleCancelOrder = () => {
    if (isShared) return;

    // Check if order can be cancelled (only Razorpay orders that aren't delivered/cancelled)
    if (!order) return;

    if (isAdminAccepted && !isEditWindowOpen) {
      toast.error('Cancellation window ended. You can no longer cancel this order.');
      return;
    }

    if (order.status === 'cancelled') {
      toast.error('Order is already cancelled');
      return;
    }

    if (order.status === 'delivered') {
      toast.error('Cannot cancel a delivered order');
      return;
    }

    // Allow cancellation for all payment methods (Razorpay, COD, Wallet)
    // Only restrict if order is already cancelled or delivered (checked above)

    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellationReason) {
      toast.error('Please select a cancellation reason');
      return;
    }
    if (cancellationReason === 'Other' && !customCancellationComment.trim()) {
      toast.error('Please specify your reason in the text box');
      return;
    }

    setIsCancelling(true);
    try {
      const cancelLookupId =
        lookupIdsRef.current[0] || normalizeLookupId(orderId)
      const response = await orderAPI.cancelOrder(cancelLookupId, {
        cancellationReason,
        cancellationComment: customCancellationComment.trim(),
        reason: cancellationReason === 'Other' ? customCancellationComment.trim() : cancellationReason
      });
      if (response.data?.success) {
        toast.success("Your order has been cancelled successfully.");
        setShowCancelDialog(false);
        setCancellationReason("");
        setCustomCancellationComment("");
        setOrderStatus('cancelled');
        setOrder((prev) => (prev ? { ...prev, status: 'cancelled_by_user', orderStatus: 'cancelled_by_user' } : prev));
        // Refresh order data
        try {
          const orderResponse = await fetchOrderDetailsWithFallback({ force: true });
          if (orderResponse.data?.success && orderResponse.data.data?.order) {
            const apiOrder = orderResponse.data.data.order;
            setOrder(transformOrderForTracking(apiOrder, order));
          }
        } catch (_) {}
      } else {
        toast.error(response.data?.message || 'Failed to cancel order');
      }
    } catch (error) {
      debugError('Error cancelling order:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel order');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleUpdateInstructions = async () => {
    try {
      setIsUpdatingInstructions(true);
      const response = await orderAPI.updateOrderInstructions(resolvedLookupId || orderId, deliveryInstructions);
      if (response.data?.success) {
        toast.success("Delivery instructions updated");
        setIsInstructionsModalOpen(false);
        const updatedOrder = response.data.data?.order;
        if (updatedOrder) {
          setOrder(prev => transformOrderForTracking(updatedOrder, prev));
        } else {
          setOrder(prev => ({ ...prev, note: deliveryInstructions }));
        }
      } else {
        toast.error(response.data?.message || "Failed to update instructions");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update instructions");
    } finally {
      setIsUpdatingInstructions(false);
    }
  };

  const handleShare = async () => {
    let shareId = order?.shareTrackingId;
    if (!shareId) {
      try {
        const response = await fetchOrderDetailsWithFallback({ force: true });
        const apiOrder = response?.data?.data?.order;
        shareId = apiOrder?.shareTrackingId;
        if (apiOrder) {
          setOrder((prev) => transformOrderForTracking(apiOrder, prev));
        }
      } catch {
        toast.error('Unable to generate share link. Please try again.');
        return;
      }
    }
    if (!shareId) {
      toast.error('Share link is not available for this order yet.');
      return;
    }
    const sharerName = userProfile?.name || userProfile?.fullName || userProfile?.displayName || 'Someone';
    const url = `${window.location.origin}/food/user/track-shared/${shareId}?name=${encodeURIComponent(sharerName)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Track my order', url });
      } catch (error) {
        if (error?.name !== 'AbortError') {
          toast.error('Failed to share link');
        }
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied!');
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      if (isShared) {
        const apiOrder = await fetchPublicOrderDetails(shareId)
        setOrder((prev) => transformOrderForTracking(apiOrder, prev))
        return
      }

      const response = await fetchOrderDetailsWithFallback({ force: true })
      if (response.data?.success && response.data.data?.order) {
        const apiOrder = response.data.data.order

        // Extract restaurant location coordinates with multiple fallbacks
        let restaurantCoords = null;
        let restaurantAddress = null;

        // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])
        if (apiOrder.restaurantId?.location?.coordinates &&
          Array.isArray(apiOrder.restaurantId.location.coordinates) &&
          apiOrder.restaurantId.location.coordinates.length >= 2) {
          restaurantCoords = apiOrder.restaurantId.location.coordinates;
        }
        // Priority 2: restaurantId.location with latitude/longitude properties
        else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {
          restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];
        }
        // Priority 3: Check nested restaurant data
        else if (apiOrder.restaurant?.location?.coordinates) {
          restaurantCoords = apiOrder.restaurant.location.coordinates;
        }
        // Priority 4: Check if restaurantId is a string ID and fetch restaurant details
        else if (typeof apiOrder.restaurantId === 'string') {
          debugLog('?? restaurantId is a string ID, fetching restaurant details...', apiOrder.restaurantId);
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              const restaurant = restaurantResponse.data.data.restaurant;
              if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                restaurantCoords = restaurant.location.coordinates;
                debugLog('? Fetched restaurant coordinates from API:', restaurantCoords);
              }
              restaurantAddress =
                restaurant?.location?.formattedAddress ||
                restaurant?.location?.address ||
                restaurant?.address ||
                null;
            }
          } catch (err) {
            debugError('? Error fetching restaurant details:', err);
          }
        }

        setOrder(transformOrderForTracking(apiOrder, order, restaurantCoords, restaurantAddress))
      }
    } catch (err) {
      debugError('Error refreshing order:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // --------------------------------------------------------------------------
  // RENDER (Final JSX)
  // --------------------------------------------------------------------------

  // Loading state (moved after hooks)
  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 dark:bg-zinc-950 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading order details...</p>
        </div>
      </AnimatedPage>
    )
  }

  // Error state (moved after hooks)
  if (error || !order) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 dark:bg-zinc-950 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-4 dark:text-white">Order Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error || 'The order you\'re looking for doesn\'t exist.'}</p>
          <Link to={isShared ? '/food/user' : '/user/orders'}>
            <Button className="bg-[#EB590E] hover:bg-[#D44D0D] text-white">Back to Orders</Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  const statusConfig = {
    placed: {
      title: "Order Placed",
      subtitle: "Waiting for restaurant to accept",
      color: "bg-green-600",
      iconType: 'food'
    },
    confirmed: {
      title: "Order Confirmed",
      subtitle: "Restaurant has accepted your order",
      color: "bg-green-600",
      iconType: 'food'
    },
    preparing: {
      title: (order?.deliveryState?.currentPhase === 'at_pickup' || order?.deliveryState?.status === 'reached_pickup')
        ? "Food preparation in progress 🟠"
        : "Food is being prepared",
      subtitle: (order?.deliveryState?.currentPhase === 'at_pickup' || order?.deliveryState?.status === 'reached_pickup')
        ? "Your delivery partner has arrived at the restaurant and is waiting for your order to be ready."
        : formatEtaText(estimatedTime, "Cooking your meal"),
      color: "bg-orange-500",
      iconType: 'food'
    },
    assigned: {
      title: "Rider is arriving",
      subtitle: "A delivery partner is arriving at the restaurant",
      color: "bg-orange-500",
      iconType: 'rider'
    },
    at_pickup: {
      title: (order?.orderStatus === 'ready_for_pickup' || order?.orderStatus === 'ready') 
        ? "Food is ready for pickup 🟢" 
        : "Food preparation in progress 🟠",
      subtitle: (order?.orderStatus === 'ready_for_pickup' || order?.orderStatus === 'ready')
        ? "Your order is ready and your delivery partner is collecting it."
        : "Your delivery partner has arrived at the restaurant and is waiting for your order to be ready.",
      color: (order?.orderStatus === 'ready_for_pickup' || order?.orderStatus === 'ready') ? "bg-emerald-600" : "bg-amber-600",
      iconType: 'rider'
    },
    ready: {
      title: "Food is ready for pickup 🟢",
      subtitle: "Your order is ready and your delivery partner is collecting it.",
      color: "bg-emerald-600",
      iconType: 'rider'
    },
    on_way: {
      title: "Out for delivery",
      subtitle: formatEtaText(estimatedTime, "Rider is out for delivery"),
      color: "bg-green-600",
      iconType: 'rider'
    },
    at_drop: {
      title: "Arrived at location",
      subtitle: "Please come to the door",
      color: "bg-green-600",
      iconType: 'rider'
    },
    delivered: {
      title: "Order delivered",
      subtitle: "Enjoy your meal!",
      color: "bg-green-600",
      iconType: 'delivered'
    },
    cancelled: {
      title: "Order cancelled",
      subtitle: "This order has been cancelled",
      color: "bg-red-600",
      iconType: 'cancelled'
    }
  }

  const currentStatus = statusConfig[orderStatus] || statusConfig.placed
  const isDeliveredOrder =
    orderStatus === "delivered" ||
    order?.status === "delivered" ||
    Boolean(order?.deliveredAt)

  const isCancelledOrder =
    orderStatus === "cancelled" ||
    isFoodOrderCancelledStatus(order?.status)

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0a] pb-24">
      {/* Order Confirmed Modal */}
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="text-center px-8"
            >
              <AnimatedCheckmark delay={0.3} />
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="text-2xl font-bold text-gray-900 dark:text-white mt-6"
              >
                Order Confirmed!
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
                className="text-gray-600 dark:text-gray-400 mt-2"
              >
                Your order has been placed successfully
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                className="mt-8"
              >
                <div className="w-8 h-8 border-2 border-[#EB590E] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Loading order details...</p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Green Header */}
      <motion.div
        className={`${currentStatus.color} text-white sticky top-0 z-40`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Header */}
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-4 flex items-center justify-between sticky top-0 z-50 border-b border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Link to={isShared ? '/food/user' : '/user/orders'}>
              <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
                <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-200" />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-800 dark:text-white">Track Order</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Order #{displayOrderRef}</p>
            </div>
          </div>
          {!isShared && (
            <motion.button
              className="w-10 h-10 flex items-center justify-center cursor-pointer text-gray-700 dark:text-gray-200"
              whileTap={{ scale: 0.9 }}
              onClick={handleShare}
            >
              <Share2 className="w-5 h-5" />
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* Map Section */}
      {!isDeliveredOrder && orderStatus !== 'cancelled' && (
        <MapErrorBoundary>
          <DeliveryMap
            orderId={mapOrderId}
            order={order}
            isVisible={order !== null}
            fallbackCustomerCoords={fallbackCustomerCoords}
            userLiveCoords={userLiveCoords}
            userLocationAccuracy={userLiveLocation?.accuracy ?? null}
            onEtaUpdate={handleEtaUpdate}
          />
        </MapErrorBoundary>
      )}

      {/* Scrollable Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 pt-6 pb-28 flex flex-col gap-6">

        {/* Main Status Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-zinc-800 relative overflow-hidden">
          <div className="flex items-start justify-between relative z-10">
            <div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 dark:bg-orange-950/30 text-[#EB590E] mb-3">
                {currentStatus.title}
              </span>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
                {isDeliveredOrder
                  ? "Delivered!"
                  : (isCancelledOrder && order?.status === 'cancelled_by_restaurant')
                    ? "Cancelled by Restaurant"
                    : isCancelledOrder
                      ? "Order Cancelled"
                      : currentStatus.subtitle}
              </h2>
              {isCancelledOrder && order?.status === 'cancelled_by_restaurant' && order?.note && (
                <p className="mt-2 text-gray-500 dark:text-gray-400 font-medium">
                  {order.note}
                </p>
              )}
            </div>
            <motion.button
              onClick={handleRefresh}
              className="p-2 bg-gray-50 dark:bg-zinc-800 rounded-full"
              animate={{ rotate: isRefreshing ? 360 : 0 }}
            >
              <RefreshCw className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </motion.button>
          </div>
        </div>

        {/* Cancel Button - Only show if placed and waiting for restaurant confirmation */}
        {!isShared && orderStatus === "placed" && (
          <div className="px-2">
            <button onClick={handleCancelOrder} className="w-full py-4 text-sm font-bold text-red-500 bg-red-50 dark:bg-red-950/20 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2">
              <X className="w-4 h-4" />
              Cancel Order
            </button>
          </div>
        )}

        {customerDeliveryOtp && !isDeliveredOrder && !isCancelledOrder && (
          <motion.div
            className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 shadow-sm border border-blue-100 dark:border-blue-800"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Delivery OTP</p>
            <p className="text-3xl font-black text-blue-900 dark:text-blue-100 mt-1 tracking-[0.2em]">{customerDeliveryOtp}</p>
          </motion.div>
        )}

        {/* Address Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-zinc-800">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
              <MapPin className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1">Delivering to Home</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {order?.address?.formattedAddress || 'Address not available'}
              </p>
            </div>
          </div>
        </div>

        {/* Restaurant Profile Card */}
        {(order?.restaurant?.restaurantName || order?.restaurantId?.restaurantName || order?.restaurantPhone || order?.restaurant?.phone || order?.restaurant?.ownerPhone) && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center border-2 border-white dark:border-zinc-800">
                    <Store className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-[#EB590E] w-4 h-4 rounded-full border-2 border-white dark:border-zinc-900" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">
                    {order?.restaurant?.restaurantName || order?.restaurantId?.restaurantName || 'Restaurant'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Restaurant</p>
                </div>
              </div>
              <motion.button className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center" onClick={handleCallRestaurant}>
                <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </motion.button>
            </div>
          </div>
        )}

        {/* Delivery Partner Profile Card */}
        {!isCancelledOrder && (
          (order?.dispatch?.deliveryPartnerId || order?.deliveryPartnerId || order?.deliveryPartner) ? (
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-100 dark:border-orange-900/40 flex items-center justify-center overflow-hidden shrink-0">
                      {order.deliveryPartner?.avatar || order.deliveryPartner?.profileImage ? (
                        <img src={order.deliveryPartner?.avatar || order.deliveryPartner?.profileImage} alt={order.deliveryPartner?.name || 'Rider'} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-7 h-7 text-[#EB590E]" />
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 w-4 h-4 rounded-full border-2 border-white dark:border-zinc-900" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-base">
                      {order.deliveryPartner?.fullName || order.deliveryPartner?.name || 'Delivery Partner'}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        {order.deliveryPartner?.rating || 4.8} Rating
                      </span>
                      {(order.deliveryPartner?.vehicleNumber || order.deliveryPartner?.vehicleType) && (
                        <span>&middot; 🏍️ {order.deliveryPartner?.vehicleNumber || order.deliveryPartner?.vehicleType}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to={`/food/user/orders/${orderId || mapOrderId}/chat`} className="relative inline-block">
                    <Button className="bg-[#EB590E] hover:bg-[#D44D0D] text-white rounded-xl px-4 py-2 text-xs font-bold shadow-md flex items-center gap-1.5 relative">
                      <MessageCircle className="w-4 h-4" />
                      <span>Chat</span>
                      {unreadChatCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-600 text-white font-black text-[10px] min-w-[20px] h-[20px] px-1 rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900 shadow-md animate-pulse">
                          {unreadChatCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <motion.button className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors" onClick={handleCallRider}>
                    <Phone className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
              {order?.note && (
                <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 mt-4 rounded-xl flex items-start gap-3 border border-blue-100 dark:border-blue-900">
                  <MessageSquare className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed italic">"{order.note}"</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 border border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
                  <Truck className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Delivery Partner</p>
                  <p className="text-xs text-amber-600 font-semibold mt-0.5">🚚 Finding a delivery partner...</p>
                </div>
              </div>
            </div>
          )
        )}

        {/* Post-Delivery Rating & Complaint Card */}
        {isDeliveredOrder && (
          <div className="space-y-3 px-1 mb-3">
            {/* Rating Banner */}
            <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 rounded-3xl p-5 shadow-lg text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-yellow-300">
                    <Star className="w-7 h-7 fill-yellow-300 stroke-yellow-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">
                      {isAlreadyRated ? "You Rated This Order!" : "Rate Food & Delivery"}
                    </h3>
                    <p className="text-xs text-orange-100 mt-0.5 font-medium">
                      {isAlreadyRated
                        ? `Food: ${order?.ratings?.restaurant?.rating || 5}★ | Delivery: ${order?.ratings?.deliveryPartner?.rating || 5}★`
                        : "How was your food quality and delivery service?"}
                    </p>
                  </div>
                </div>
                {!isAlreadyRated ? (
                  <button
                    type="button"
                    onClick={() => setIsRatingModalOpen(true)}
                    className="px-4 py-2.5 bg-white text-[#EB590E] font-extrabold text-xs rounded-xl shadow-md hover:bg-orange-50 transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    Rate Now <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRatingModalOpen(true)}
                    className="px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-xl text-xs font-bold text-white flex items-center gap-1 hover:bg-white/30"
                  >
                    <Check className="w-4 h-4 text-emerald-300" /> View Rating
                  </button>
                )}
              </div>
            </div>

            {/* Raise Complaint Button */}
            <Link to="/user/profile/support" className="flex items-center justify-center gap-2 py-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 font-bold text-gray-800 dark:text-white text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors w-full">
              <AlertCircle className="w-4 h-4 text-red-500" /> Raise a Complaint
            </Link>
          </div>
        )}

        {/* Delivery Instructions - Only show if NOT delivered */}
        {!isShared && !isDeliveredOrder && !isCancelledOrder && (
          <div onClick={() => setIsInstructionsModalOpen(true)} className="bg-white dark:bg-zinc-900 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-zinc-800 mb-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                  <FileText className="w-4 h-4 text-purple-500" />
                </div>
                <span className="text-sm font-bold text-gray-800 dark:text-white">Add delivery instructions</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        )}

        {/* Order Summary & Restaurant Info */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-zinc-800 overflow-hidden flex items-center justify-center">
              <Store className="w-6 h-6 text-gray-400" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">{order.restaurant}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{order.restaurantAddress || 'Location'}</p>
            </div>
          </div>
          <div className="space-y-3">
            {order?.items?.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">{item.quantity} x {item.name}{(item.variantName || item.variant || item.variation) ? ` (${item.variantName || item.variant || item.variation})` : ""}</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{"\u20B9"}{((item?.price || 0) * (item?.quantity || 0)).toFixed(0)}</span>
              </div>
            ))}
          </div>

          {/* Bill Summary Breakdown */}
          <div className="border-t border-dashed border-gray-200 dark:border-zinc-800 my-4 pt-4 space-y-2.5 text-xs md:text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Item Total</span>
              <span className="font-medium text-gray-900 dark:text-white">{"\u20B9"}{(order.subtotal || order.items?.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0) || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-start text-gray-600 dark:text-gray-400 py-1">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setShowDeliveryFeeModal(true)}
                  className="font-medium hover:text-gray-900 dark:hover:text-white transition-colors underline decoration-dotted underline-offset-4 decoration-gray-400 dark:decoration-gray-500 text-left w-fit text-sm text-gray-800 dark:text-gray-300"
                >
                  Delivery partner fee (up to {(() => {
                    const d = parseFloat(order?.pricing?.deliveryFeeBreakdown?.distanceKm ?? order?.pricing?.distanceKm ?? order?.distanceKm);
                    if (!isNaN(d) && d > 0) return d % 1 === 0 ? d.toFixed(0) : d.toFixed(1);
                    return "1.2";
                  })()} km)
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 font-medium">Goes to them for their time and effort</span>
              </div>
              <span className={Number(order?.deliveryFee || 0) === 0 ? "font-medium text-[#EB590E] mt-0.5 text-sm uppercase" : "font-medium text-gray-900 dark:text-white mt-0.5 text-sm"}>
                {Number(order?.deliveryFee || 0) === 0 ? "FREE" : `₹${Number(order?.deliveryFee || 0).toFixed(2)}`}
              </span>
            </div>
            {Number(order.platformFee || 0) > 0 && (
              <div className="flex justify-between text-gray-600 dark:text-gray-400 items-center">
                <button
                  type="button"
                  onClick={() => setShowPlatformFeeModal(true)}
                  className="hover:text-gray-800 dark:hover:text-gray-200 transition-colors underline decoration-dotted underline-offset-4 decoration-gray-400 dark:decoration-gray-500"
                >
                  Platform Fee
                </button>
                <span className="font-medium text-gray-900 dark:text-white">{"\u20B9"}{Number(order.platformFee).toFixed(2)}</span>
              </div>
            )}
            {Number(order.packagingFee || order.pricing?.packagingFee || 0) > 0 && (
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Restaurant Packaging Fee</span>
                <span className="font-medium text-gray-900 dark:text-white">{"\u20B9"}{Number(order.packagingFee || order.pricing?.packagingFee).toFixed(2)}</span>
              </div>
            )}
            {Number(order.deliveryPartnerTip || order.tip || order.pricing?.deliveryPartnerTip || 0) > 0 && (
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Delivery partner tip</span>
                <span className="font-medium text-gray-900 dark:text-white">{"\u20B9"}{Number(order.deliveryPartnerTip || order.tip || order.pricing?.deliveryPartnerTip).toFixed(2)}</span>
              </div>
            )}
            {Number(order.surgeAmount || order.pricing?.surgeAmount || 0) > 0 && (
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>{order.surgeTitle || order.pricing?.surgeTitle || "Surge Charge"}</span>
                <span className="font-medium text-gray-900 dark:text-white">{"\u20B9"}{Number(order.surgeAmount || order.pricing?.surgeAmount).toFixed(2)}</span>
              </div>
            )}
            {Number(order.gst || order.tax || 0) > 0 && (
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>GST and Restaurant Charges</span>
                <span className="font-medium text-gray-900 dark:text-white">{"\u20B9"}{Number(order.gst || order.tax).toFixed(2)}</span>
              </div>
            )}
            {Number(order.discount || 0) > 0 && (
              <div className="flex justify-between text-[#EB590E] font-medium">
                <span>Coupon Discount</span>
                <span>-{"\u20B9"}{Number(order.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm md:text-base text-gray-900 dark:text-white pt-2.5 border-t border-gray-100 dark:border-zinc-800">
              <span>To Pay</span>
              <span>{"\u20B9"}{Number(order.totalAmount || order.total || 0).toFixed(2)}</span>
            </div>
          </div>

          {!isDeliveredOrder && (
            <>
              <div className="h-px bg-gray-50 dark:bg-zinc-800 my-4" />
              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                className="w-full flex items-center justify-between p-2.5 -mx-2 hover:bg-gray-50 dark:hover:bg-zinc-800/60 rounded-2xl transition-colors cursor-pointer group text-left"
              >
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200">
                  Order issues? Reach out to support
                </p>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-transform group-hover:translate-x-0.5" />
              </button>
            </>
          )}
        </div>

        {/* Cute Food Wastage Card */}
        {["confirmed", "preparing", "assigned", "at_pickup", "ready", "on_way", "at_drop"].includes(orderStatus) && (
          <div className="bg-amber-50/60 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30 rounded-3xl p-5 flex gap-4 items-start relative overflow-hidden transition-all duration-300 shadow-sm">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-100/30 dark:bg-amber-950/20 rounded-full blur-2xl pointer-events-none" />
            <div className="w-10 h-10 rounded-2xl bg-amber-100/80 dark:bg-amber-950/30 flex items-center justify-center text-amber-600 shrink-0 select-none">
              <span className="text-xl">🌱</span>
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-1 select-none">
                Cancellation & Wastage Policy
              </p>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-relaxed">
                {cancellationPolicyText || "In order to reduce the food wastage, once the order gets confirmed by the restaurant, it can't be cancelled"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Order Dialog */}
      {!isShared && (
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px] bg-white dark:bg-zinc-900 border-none rounded-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
                Cancel Order
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 px-1 overflow-y-auto flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Please select a reason for cancelling this order <span className="text-red-500">*</span>
              </p>

              {cancellationPolicyText && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-3 text-xs font-medium text-amber-800 dark:text-amber-300 leading-relaxed">
                  {cancellationPolicyText}
                </div>
              )}

              {/* Predefined Reasons Radio Pills */}
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {CANCELLATION_REASONS.map((reason) => {
                  const isSelected = cancellationReason === reason;
                  return (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setCancellationReason(reason)}
                      className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-semibold border transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-red-50 dark:bg-red-950/30 border-red-500 text-red-600 dark:text-red-400 shadow-sm'
                          : 'bg-gray-50 dark:bg-zinc-800/60 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span>{reason}</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-red-500 bg-red-500' : 'border-gray-300 dark:border-zinc-600'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Mandatory Custom Reason Text Box if "Other" is selected */}
              {cancellationReason === 'Other' && (
                <div className="space-y-1.5 animate-in fade-in duration-200 pt-2">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Please tell us why you want to cancel this order <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    value={customCancellationComment}
                    onChange={(e) => setCustomCancellationComment(e.target.value)}
                    placeholder="Please tell us why you want to cancel this order..."
                    className="w-full min-h-[90px] resize-none border-2 border-gray-200 dark:border-zinc-700 dark:bg-zinc-800 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none transition-colors"
                    disabled={isCancelling}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-3 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCancelDialog(false);
                    setCancellationReason("");
                    setCustomCancellationComment("");
                  }}
                  disabled={isCancelling}
                  className="flex-1 dark:bg-zinc-800 dark:text-white dark:border-zinc-700 rounded-2xl h-12 font-bold"
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirmCancel}
                  disabled={
                    isCancelling ||
                    !cancellationReason ||
                    (cancellationReason === 'Other' && !customCancellationComment.trim())
                  }
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white border-none rounded-2xl h-12 font-bold shadow-md"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    'Confirm Cancellation'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delivery Instructions Modal */}
      <Dialog open={isInstructionsModalOpen} onOpenChange={setIsInstructionsModalOpen}>
        <DialogContent className="sm:max-w-md w-[95vw] rounded-3xl p-6 border-0 shadow-2xl bg-white dark:bg-zinc-900 max-h-[90vh] overflow-y-auto z-[200]">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-orange-600 to-orange-400 bg-clip-text text-transparent">
              Delivery Instructions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add instructions for the delivery partner to help them find your address or know where to leave your order.
            </p>
            <Textarea
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              placeholder="E.g. Ring the doorbell, leave at the front desk..."
              className="min-h-[120px] resize-none border-gray-200 dark:border-zinc-700 focus:ring-orange-500 rounded-xl bg-gray-50 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 text-base"
            />
            <Button
              onClick={handleUpdateInstructions}
              disabled={isUpdatingInstructions}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold h-12 rounded-xl border-none"
            >
              {isUpdatingInstructions ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Save Instructions"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Platform Fee Dialog */}
      <Dialog open={showPlatformFeeModal} onOpenChange={setShowPlatformFeeModal}>
        <DialogContent className="sm:max-w-sm w-[90vw] rounded-3xl p-6 border-0 shadow-2xl bg-white dark:bg-[#18181b] z-[200]">
          <DialogHeader className="relative flex items-center justify-center pb-4 border-b border-gray-100 dark:border-zinc-800">
            <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white text-center">
              Platform Fee
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center space-y-6">
            <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
              This small fee helps us pay the bills so that we can keep {companyName || "Eqosy"} running
            </p>
            <Button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPlatformFeeModal(false); }}
              className="w-full py-3.5 h-auto bg-[#EB590E] hover:bg-[#d94f0c] text-white font-bold text-base rounded-2xl transition-all shadow-md active:scale-98 uppercase tracking-wider border-none"
            >
              OKAY
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delivery Fee Dialog */}
      <Dialog open={showDeliveryFeeModal} onOpenChange={setShowDeliveryFeeModal}>
        <DialogContent className="sm:max-w-sm w-[90vw] rounded-3xl p-6 border-0 shadow-2xl bg-white dark:bg-[#18181b] z-[200]">
          <DialogHeader className="border-b border-gray-100 dark:border-zinc-800 pb-4">
            <DialogTitle className="text-left font-bold text-gray-900 dark:text-white">
              <span className="text-base underline decoration-dotted underline-offset-4 decoration-gray-400">
                Delivery partner fee (up to {(() => {
                  const d = parseFloat(order?.pricing?.deliveryFeeBreakdown?.distanceKm ?? order?.pricing?.distanceKm ?? order?.distanceKm);
                  if (!isNaN(d) && d > 0) return d % 1 === 0 ? d.toFixed(0) : d.toFixed(1);
                  return "1.2";
                })()} km)
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">
                Goes to them for their time and effort
              </p>
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
              100% of the delivery charge goes directly to your delivery partner to compensate for food pickup and delivery effort.
            </p>
            <Button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeliveryFeeModal(false); }}
              className="w-full py-3.5 h-auto bg-[#EB590E] hover:bg-[#d94f0c] text-white font-bold text-base rounded-2xl transition-all shadow-md active:scale-98 uppercase tracking-wider border-none"
            >
              OKAY
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rating & Review Dialog */}
      <Dialog open={isRatingModalOpen} onOpenChange={setIsRatingModalOpen}>
        <DialogContent className="sm:max-w-md w-[95vw] rounded-3xl p-6 border-0 shadow-2xl bg-white dark:bg-zinc-900 max-h-[90vh] overflow-y-auto z-[200]">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent text-center">
              Rate Your Order Experience
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* 1. Rate Delivery Partner */}
            {(order?.deliveryPartnerId || order?.deliveryPartner) && (
              <div className="bg-gray-50 dark:bg-zinc-800/60 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/40 text-[#EB590E] flex items-center justify-center font-bold">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                      Rate {order?.deliveryPartner?.name || 'Delivery Partner'}
                    </h4>
                    <p className="text-xs text-gray-500">Delivery service & behavior</p>
                  </div>
                </div>

                {/* Star Rating */}
                <div className="flex items-center justify-center gap-2 my-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={`del-star-${star}`}
                      type="button"
                      onClick={() => setDeliveryRating(star)}
                      className="p-1 transition-transform hover:scale-125 focus:outline-none"
                    >
                      <Star
                        className={`w-8 h-8 ${star <= deliveryRating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-gray-300 dark:text-zinc-600'
                          }`}
                      />
                    </button>
                  ))}
                </div>

                {/* Quick Feedback Pills */}
                <div className="flex flex-wrap gap-1.5 my-2">
                  {['⚡ On-time delivery', '😊 Polite behavior', '📦 Handled with care'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setDeliveryComment((prev) =>
                          prev.includes(tag) ? prev.replace(tag, '').trim() : `${prev} ${tag}`.trim()
                        )
                      }
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${deliveryComment.includes(tag)
                          ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-500 text-orange-600 dark:text-orange-400'
                          : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400'
                        }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <Textarea
                  value={deliveryComment}
                  onChange={(e) => setDeliveryComment(e.target.value)}
                  placeholder="Write a review for delivery partner (optional)..."
                  className="min-h-[60px] text-xs resize-none rounded-xl border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
            )}

            {/* 2. Rate Restaurant Food */}
            <div className="bg-gray-50 dark:bg-zinc-800/60 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center font-bold">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                    Rate {order?.restaurant || 'Restaurant Food'}
                  </h4>
                  <p className="text-xs text-gray-500">Food quality & taste</p>
                </div>
              </div>

              {/* Star Rating */}
              <div className="flex items-center justify-center gap-2 my-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={`rest-star-${star}`}
                    type="button"
                    onClick={() => setRestaurantRating(star)}
                    className="p-1 transition-transform hover:scale-125 focus:outline-none"
                  >
                    <Star
                      className={`w-8 h-8 ${star <= restaurantRating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-gray-300 dark:text-zinc-600'
                        }`}
                    />
                  </button>
                ))}
              </div>

              {/* Quick Feedback Pills */}
              <div className="flex flex-wrap gap-1.5 my-2">
                {['😋 Delicious taste', '🔥 Hot & fresh', '🍱 Great packaging', '👌 Good portion'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setRestaurantComment((prev) =>
                        prev.includes(tag) ? prev.replace(tag, '').trim() : `${prev} ${tag}`.trim()
                      )
                    }
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${restaurantComment.includes(tag)
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400'
                      }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <Textarea
                value={restaurantComment}
                onChange={(e) => setRestaurantComment(e.target.value)}
                placeholder="Write a review for food & restaurant (optional)..."
                className="min-h-[60px] text-xs resize-none rounded-xl border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleRatingSubmit}
              disabled={submittingRating}
              className="w-full h-12 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-base rounded-2xl shadow-lg border-none active:scale-98 transition-all"
            >
              {submittingRating ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" /> Submitting Ratings...
                </div>
              ) : (
                "Submit Ratings & Feedback"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* In-Page Order Support Modal */}
      <Dialog open={showSupportModal} onOpenChange={setShowSupportModal}>
        <DialogContent className="sm:max-w-md w-[95vw] max-w-[500px] rounded-3xl p-6 border-0 shadow-2xl bg-white dark:bg-zinc-900 max-h-[90vh] flex flex-col overflow-hidden z-[200]">
          <DialogHeader className="shrink-0 mb-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950/40 text-[#EB590E] flex items-center justify-center font-bold text-lg shrink-0">
                🎧
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white">
                  Order Support
                </DialogTitle>
                <p className="text-xs text-gray-500 dark:text-gray-400">Order #{displayOrderRef}</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            {/* Direct Phone Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleCallRestaurant}
                className="flex items-center gap-3 p-3.5 bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700/80 rounded-2xl transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">Call Restaurant</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Direct line</p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleCallRider}
                className="flex items-center gap-3 p-3.5 bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700/80 rounded-2xl transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">Call Delivery</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Rider partner</p>
                </div>
              </button>
            </div>

            <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />

            {/* Category Pills */}
            <div>
              <p className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-2">
                Select issue category <span className="text-red-500">*</span>
              </p>
              <div className="space-y-2">
                {ORDER_SUPPORT_CATEGORIES.map((cat) => {
                  const isSelected = supportCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSupportCategory(cat)}
                      className={`w-full text-left px-4 py-2.5 rounded-2xl text-xs font-semibold border transition-all flex items-center justify-between ${
                        isSelected
                          ? "bg-orange-50 dark:bg-orange-950/30 border-[#EB590E] text-[#EB590E] dark:text-orange-400 shadow-sm"
                          : "bg-gray-50 dark:bg-zinc-800/60 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <span>{cat}</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? "border-[#EB590E] bg-[#EB590E]" : "border-gray-300 dark:border-zinc-600"
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description Textarea */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Describe your issue (optional)
              </label>
              <Textarea
                value={supportDescription}
                onChange={(e) => setSupportDescription(e.target.value)}
                placeholder="Tell us what went wrong with your order..."
                className="w-full min-h-[80px] resize-none border-2 border-gray-200 dark:border-zinc-700 dark:bg-zinc-800 rounded-xl px-4 py-2.5 text-xs text-gray-800 dark:text-gray-200 focus:border-[#EB590E] focus:ring-2 focus:ring-orange-200 focus:outline-none transition-colors"
                disabled={isSubmittingSupport}
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-zinc-800 shrink-0">
            <Button
              variant="outline"
              onClick={() => setShowSupportModal(false)}
              disabled={isSubmittingSupport}
              className="flex-1 dark:bg-zinc-800 dark:text-white dark:border-zinc-700 rounded-2xl h-11 text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSupportSubmit}
              disabled={isSubmittingSupport || !supportCategory}
              className="flex-1 bg-[#EB590E] hover:bg-[#d44e0b] disabled:opacity-50 text-white border-none rounded-2xl h-11 text-xs font-bold shadow-md"
            >
              {isSubmittingSupport ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Ticket"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

