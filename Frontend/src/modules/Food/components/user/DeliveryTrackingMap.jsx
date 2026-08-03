import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  GoogleMap,
  OverlayView,
  DirectionsService,
  Polyline
} from '@react-google-maps/api';
import { useAppGoogleMapsLoader } from '@/modules/Taxi/modules/admin/utils/googleMaps';
import io from 'socket.io-client';
import { API_BASE_URL, resolveSocketOrigin } from '@food/api/config';
import eqosyRestaurantPin from '@food/assets/eqosy-restaurant-pin.png';
import { subscribeOrderTracking, subscribeDeliveryLocation } from '@food/realtimeTracking';
import { collectOrderTrackingIds, joinOrderTrackingRooms } from '@food/utils/orderTrackingRooms';
import { buildVisibleRouteFromRiderPosition } from '@food/utils/liveTrackingPolyline';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Navigation, Info, Circle } from 'lucide-react';

const RIDER_BIKE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
  <circle cx="30" cy="30" r="28" fill="white" stroke="#ff8100" stroke-width="4" />
  <g transform="translate(15, 15) scale(1.2)">
    <path d="M19 7c0-1.1-.9-2-2-2h-3v2h3v2.65l-2.13 1.52c-.31.22-.5.57-.5.95V13h-4.4a2 2 0 00-1.92 1.45L6 20H2v2h4.5c1.07 0 1.97-.85 1.97-1.97V20l.4-1.2h3.13l.4 1.2c.4 1.2 1.5 2 2.77 2h.3c1.07 0 1.97-.85 1.97-1.97V20l-.4-1.2H14.1l-.33-1H18v-2h-2.17l-.67-2H18c1.1 0 2-.9 2-2V7h-1zM7 18h-.5C5.67 18 5 17.33 5 16.5S5.67 15 6.5 15H7v3zm8.5 0h-.5V15h.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" fill="#ff8100" />
  </g>
</svg>`;

const RESTAURANT_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35">
  <path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/>
  <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>
</svg>`;

const CUSTOMER_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#10B981">
  <path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/>
  <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>
</svg>`;

const MAP_UI_OPTIONS = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  scaleControl: true,
  streetViewControl: false,
  rotateControl: false,
  fullscreenControl: false,
  gestureHandling: 'greedy',
  styles: [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ],
};

const debugLog = (...args) => console.log('[DeliveryTrackingMap]', ...args);

const MAP_RIDER_ICON = '/MapRider.png';

const RIDER_GLIDE_MS = 2500;

/** Tight frame: ~18px margin on every edge (15–20px target) */
const MAP_FIT_PADDING = { top: 18, bottom: 18, left: 18, right: 18 };

function buildOverviewBounds({ path = [], points = [] } = {}) {
  if (!window.google?.maps) return null;
  const bounds = new window.google.maps.LatLngBounds();

  (path || []).forEach((point) => {
    if (!point) return;
    const lat = typeof point.lat === 'function' ? point.lat() : point.lat;
    const lng = typeof point.lng === 'function' ? point.lng() : point.lng;
    if (Number.isFinite(lat) && Number.isFinite(lng)) bounds.extend({ lat, lng });
  });

  (points || []).forEach((point) => {
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      bounds.extend(point);
    }
  });

  return bounds.isEmpty() ? null : bounds;
}

function applyOverviewFrame(map, bounds) {
  if (!map || !bounds || !window.google?.maps) return;
  map.fitBounds(bounds, MAP_FIT_PADDING);
}

function fitMapToOverview(map, { path = [], points = [] } = {}) {
  const bounds = buildOverviewBounds({ path, points });
  if (!bounds) return;
  applyOverviewFrame(map, bounds);
}

function resolveDeliveryPartnerId(order) {
  const raw =
    order?.deliveryPartnerId
    || order?.dispatch?.deliveryPartnerId
    || order?.assignmentInfo?.deliveryPartnerId
    || order?.deliveryPartner?._id;
  if (!raw) return null;
  if (typeof raw === 'object' && raw._id) return String(raw._id);
  const normalized = String(raw).trim();
  if (!normalized || normalized === '[object Object]' || normalized.startsWith('{')) return null;
  return normalized;
}

function normalizeBackendSocketUrl() {
  return resolveSocketOrigin(API_BASE_URL);
}

function pathPointToLatLng(point) {
  if (!point) return null;
  const lat = typeof point.lat === 'function' ? point.lat() : point.lat;
  const lng = typeof point.lng === 'function' ? point.lng() : point.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function ensurePathEndsAt(path, endpoint) {
  if (!endpoint || !Number.isFinite(endpoint.lat) || !Number.isFinite(endpoint.lng)) {
    return path || [];
  }
  if (!path?.length) return [{ lat: endpoint.lat, lng: endpoint.lng }];

  const last = pathPointToLatLng(path[path.length - 1]);
  if (!last) return [...path, { lat: endpoint.lat, lng: endpoint.lng }];

  if (!window.google?.maps?.geometry?.spherical) {
    return [...path, { lat: endpoint.lat, lng: endpoint.lng }];
  }

  const gap = window.google.maps.geometry.spherical.computeDistanceBetween(
    new window.google.maps.LatLng(last.lat, last.lng),
    new window.google.maps.LatLng(endpoint.lat, endpoint.lng),
  );

  if (gap > 1) {
    return [...path, { lat: endpoint.lat, lng: endpoint.lng }];
  }

  return path;
}

function findNearestProgressOnPath(position, path) {
  if (!path?.length || !position || !window.google?.maps?.geometry?.spherical) return null;

  const pos = new window.google.maps.LatLng(position.lat, position.lng);
  const points = path.map((point) => pathPointToLatLng(point)).filter(Boolean);
  if (!points.length) return null;

  let best = {
    lat: points[0].lat,
    lng: points[0].lng,
    nextIndex: 1,
    distance: Infinity,
  };

  for (let i = 0; i < points.length; i++) {
    const pt = new window.google.maps.LatLng(points[i].lat, points[i].lng);
    const d = window.google.maps.geometry.spherical.computeDistanceBetween(pos, pt);
    if (d < best.distance) {
      best = { lat: points[i].lat, lng: points[i].lng, nextIndex: i + 1, distance: d };
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = new window.google.maps.LatLng(points[i].lat, points[i].lng);
    const b = new window.google.maps.LatLng(points[i + 1].lat, points[i + 1].lng);
    const segLen = window.google.maps.geometry.spherical.computeDistanceBetween(a, b);
    if (segLen < 1) continue;

    const steps = Math.max(4, Math.ceil(segLen / 3));
    for (let s = 0; s <= steps; s++) {
      const frac = s / steps;
      const sample = window.google.maps.geometry.spherical.interpolate(a, b, frac);
      const d = window.google.maps.geometry.spherical.computeDistanceBetween(pos, sample);
      if (d < best.distance) {
        const nextIndex = frac >= 0.995 ? Math.min(i + 2, points.length) : i + 1;
        best = {
          lat: sample.lat(),
          lng: sample.lng(),
          nextIndex,
          distance: d,
        };
      }
    }
  }

  return best;
}

const ROUTE_MAP_MATCH_MAX_METERS = 50;
const ARRIVAL_PIN_SNAP_METERS = 12;

function nearestPointOnPath(position, path, maxSnapMeters = ROUTE_MAP_MATCH_MAX_METERS) {
  const progress = findNearestProgressOnPath(position, path);
  if (!progress || progress.distance > maxSnapMeters) return null;
  return { lat: progress.lat, lng: progress.lng };
}

function normalizeOverviewPath(path) {
  return (path || []).map((point) => pathPointToLatLng(point)).filter(Boolean);
}

function buildRemainingRoutePath(fullPath, riderPosition, endpoint = null) {
  const normalized = normalizeOverviewPath(fullPath);
  if (!normalized.length) return [];

  if (!riderPosition) {
    return ensurePathEndsAt(normalized, endpoint);
  }

  if (normalized.length < 2) {
    return ensurePathEndsAt(normalized, endpoint);
  }

  const { visiblePolyline, isOffRoute } = buildVisibleRouteFromRiderPosition(normalized, riderPosition);
  // Product requirement: ONLY show driving-route polyline (no straight "displacement" connector).
  // The shared utility prepends riderPosition when off-route; drop that segment to avoid a straight line.
  let routeOnlyPolyline = visiblePolyline;
  if (isOffRoute && Array.isArray(visiblePolyline) && visiblePolyline.length > 1) {
    routeOnlyPolyline = visiblePolyline.slice(1);
  }

  return ensurePathEndsAt(routeOnlyPolyline, endpoint);
}

/** Imperatively syncs path on every rider tick — declarative Polyline alone often won't erase behind rider */
function LiveRoutePolyline({ path, options }) {
  const polylineRef = useRef(null);
  const normalizedPath = useMemo(() => normalizeOverviewPath(path), [path]);

  useEffect(() => {
    if (!polylineRef.current || normalizedPath.length < 2) return;
    polylineRef.current.setPath(normalizedPath);
  }, [normalizedPath]);

  if (normalizedPath.length < 2) return null;

  return (
    <Polyline
      onLoad={(instance) => {
        polylineRef.current = instance;
        instance.setPath(normalizedPath);
      }}
      path={normalizedPath}
      options={options}
    />
  );
}

const DeliveryTrackingMap = ({
  orderId,
  orderTrackingIds = [],
  restaurantCoords,
  customerCoords,
  userLiveCoords = null,
  order = null,
  onEtaUpdate = null
}) => {
  const mapRef = useRef(null);
  const hasInitialFrameRef = useRef(false);
  const lastOverviewFrameKeyRef = useRef('');
  const [riderLocation, setRiderLocation] = useState(null);
  const [directions, setDirections] = useState(null);
  const [pickupLegDirections, setPickupLegDirections] = useState(null);
  const [deliveryLegDirections, setDeliveryLegDirections] = useState(null);
  const [baselineDirections, setBaselineDirections] = useState(null);
  const [lastDirectionsAt, setLastDirectionsAt] = useState(0);
  const [currentEta, setCurrentEta] = useState(null);
  const [cloudPolyline, setCloudPolyline] = useState(null);
  const [smoothLocation, setSmoothLocation] = useState(null);
  const socketRef = useRef(null);
  const interpStateRef = useRef({ lastPos: null, nextPos: null, startTime: 0 });
  const smoothLocationRef = useRef(null);
  const riderLocationRef = useRef(null);
  const deliveryPartnerIdRef = useRef(null);
  const trackingIdsRef = useRef([]);

  const { isLoaded } = useAppGoogleMapsLoader();

  const applyRiderPositionUpdate = useCallback((nextPos) => {
    if (!nextPos || !Number.isFinite(nextPos.lat) || !Number.isFinite(nextPos.lng)) return;
    interpStateRef.current = {
      lastPos: smoothLocationRef.current || riderLocationRef.current || nextPos,
      nextPos,
      startTime: Date.now(),
    };
    setRiderLocation(nextPos);
  }, []);

  useEffect(() => {
    smoothLocationRef.current = smoothLocation;
  }, [smoothLocation]);

  useEffect(() => {
    riderLocationRef.current = riderLocation;
  }, [riderLocation]);

  const trackingIds = useMemo(
    () => collectOrderTrackingIds(orderId, orderTrackingIds),
    [orderId, orderTrackingIds],
  );

  const trackingIdsKey = useMemo(() => trackingIds.join('|'), [trackingIds]);

  const deliveryPartnerId = useMemo(() => resolveDeliveryPartnerId(order), [order]);

  useEffect(() => {
    trackingIdsRef.current = trackingIds;
  }, [trackingIds]);

  useEffect(() => {
    deliveryPartnerIdRef.current = deliveryPartnerId;
  }, [deliveryPartnerId]);

  const backendUrl = useMemo(() => normalizeBackendSocketUrl(), []);

  // 1. Sync rider from order API (polling / refresh includes lastRiderLocation)
  useEffect(() => {
    const loc = order?.deliveryState?.currentLocation;
    if (!loc) return;

    const lat = typeof loc.lat === 'number'
      ? loc.lat
      : (Array.isArray(loc.coordinates) ? Number(loc.coordinates[1]) : Number(loc.lat));
    const lng = typeof loc.lng === 'number'
      ? loc.lng
      : (Array.isArray(loc.coordinates) ? Number(loc.coordinates[0]) : Number(loc.lng));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const prev = riderLocationRef.current;
    if (prev && Math.abs(prev.lat - lat) < 0.00001 && Math.abs(prev.lng - lng) < 0.00001) return;

    applyRiderPositionUpdate({
      lat,
      lng,
      heading: Number(loc.bearing ?? loc.heading ?? prev?.heading ?? 0),
    });
  }, [
    order?.deliveryState?.currentLocation?.lat,
    order?.deliveryState?.currentLocation?.lng,
    order?.deliveryState?.currentLocation?.heading,
    order?.deliveryState?.currentLocation?.bearing,
    applyRiderPositionUpdate,
  ]);

  // 2. Core Data Sync (Socket + Firebase + delivery partner live node)
  useEffect(() => {
    if (!trackingIds.length) return;

    const handleTrackingPayload = (data, sourceOrderId = null) => {
      const lat = Number(data?.lat ?? data?.boy_lat);
      const lng = Number(data?.lng ?? data?.boy_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const ids = trackingIdsRef.current;
      const activeOrderId = data?.activeOrderId ? String(data.activeOrderId) : null;
      const orderKey = sourceOrderId ? String(sourceOrderId) : activeOrderId;

      if (orderKey) {
        const matchesOrder = ids.some((id) => String(id) === orderKey);
        const matchesActive = activeOrderId && ids.some((id) => String(id) === activeOrderId);
        if (!matchesOrder && !matchesActive) return;
      }

      applyRiderPositionUpdate({
        lat,
        lng,
        heading: Number(data?.heading ?? data?.bearing ?? riderLocationRef.current?.heading ?? 0),
      });

      if (data?.polyline) setCloudPolyline(data.polyline);
      if (data?.eta) {
        setCurrentEta(data.eta);
        if (onEtaUpdate) onEtaUpdate(data.eta);
      }
    };

    // A. FIREBASE — per-order tracking node (written by delivery app)
    const unsubs = trackingIds.map((id) => subscribeOrderTracking(id, (data) => {
      debugLog('Firebase order tracking update', id);
      handleTrackingPayload(data, id);
    }));

    // B. FIREBASE — delivery partner global location (fallback)
    let unsubDelivery = () => {};
    if (deliveryPartnerId) {
      unsubDelivery = subscribeDeliveryLocation(deliveryPartnerId, (data) => {
        debugLog('Firebase delivery partner location update', deliveryPartnerId);
        handleTrackingPayload(data, data?.activeOrderId || null);
      });
    }

    const joinedRooms = new Set();

    const connectTrackingSocket = () => {
      const token = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken') || '';
      if (!token) return;

      if (!socketRef.current) {
        socketRef.current = io(backendUrl, {
          path: '/socket.io/',
          transports: ['polling', 'websocket'],
          reconnection: true,
          auth: { token },
        });

        socketRef.current.on('connect', () => {
          debugLog('Socket connected, joining tracking rooms:', trackingIdsRef.current);
          joinOrderTrackingRooms(socketRef.current, null, joinedRooms, trackingIdsRef.current);
        });

        socketRef.current.on('location-update', (data) => {
          if (!data) return;
          const lat = Number(data.lat ?? data.boy_lat);
          const lng = Number(data.lng ?? data.boy_lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

          const ids = trackingIdsRef.current;
          const matchedOrder = data.orderId && ids.some((id) => String(id) === String(data.orderId));
          const matchedPartner =
            deliveryPartnerIdRef.current
            && data.deliveryPartnerId
            && String(data.deliveryPartnerId) === String(deliveryPartnerIdRef.current);

          if (!matchedOrder && !matchedPartner) return;

          applyRiderPositionUpdate({
            lat,
            lng,
            heading: Number(data.heading ?? data.bearing ?? riderLocationRef.current?.heading ?? 0),
          });
          if (data.polyline) setCloudPolyline(data.polyline);
          if (data.eta) {
            setCurrentEta(data.eta);
            if (onEtaUpdate) onEtaUpdate(data.eta);
          }
        });
      }

      if (socketRef.current.connected) {
        joinOrderTrackingRooms(socketRef.current, null, joinedRooms, trackingIdsRef.current);
      }
    };

    connectTrackingSocket();

    return () => {
      unsubs.forEach((u) => u?.());
      unsubDelivery?.();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [trackingIdsKey, backendUrl, deliveryPartnerId, applyRiderPositionUpdate, onEtaUpdate]);

  // 3. Smooth Animation Loop (60 FPS Glide)
  useEffect(() => {
    let frame;
    const update = () => {
      const { lastPos, nextPos, startTime } = interpStateRef.current;
      if (lastPos && nextPos) {
        const duration = RIDER_GLIDE_MS;
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Linear Interpolation (LERP)
        const lat = lastPos.lat + (nextPos.lat - lastPos.lat) * progress;
        const lng = lastPos.lng + (nextPos.lng - lastPos.lng) * progress;
        
        // Heading interpolation (shortest path)
        let lastHead = lastPos.heading || 0;
        let nextHead = nextPos.heading || 0;
        if (Math.abs(nextHead - lastHead) > 180) {
          if (nextHead > lastHead) lastHead += 360;
          else nextHead += 360;
        }
        const heading = lastHead + (nextHead - lastHead) * progress;

        setSmoothLocation({ lat, lng, heading: heading % 360 });
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  const tripStatus = String(order?.status || order?.orderStatus || 'pending').toLowerCase();
  const deliveryPhase = String(order?.deliveryState?.currentPhase || '').toLowerCase();
  const hasAssignedRider = Boolean(deliveryPartnerId || order?.deliveryPartner);

  // Use smooth location for sync if available with automatic fallback to restaurantCoords if rider assigned
  const displayRiderLocation = useMemo(() => {
    if (smoothLocation) return smoothLocation;
    if (riderLocation) return riderLocation;
    if (hasAssignedRider && restaurantCoords) return restaurantCoords;
    return null;
  }, [smoothLocation, riderLocation, hasAssignedRider, restaurantCoords]);

  // Delivery leg = rider left restaurant with the order (NOT while still at / heading to pickup)
  const isDeliveryLeg = useMemo(() => {
    const pickupPhases = ['en_route_to_pickup', 'at_pickup'];
    if (pickupPhases.includes(deliveryPhase)) return false;

    const deliveryPhases = ['en_route_to_delivery', 'at_drop', 'reached_drop'];
    if (deliveryPhases.includes(deliveryPhase)) return true;

    const deliveryStatuses = [
      'out_for_delivery',
      'en_route_to_delivery',
      'reached_drop',
      'at_drop',
      'at_delivery',
    ];
    if (deliveryStatuses.includes(tripStatus)) return true;

    if (tripStatus === 'picked_up') return true;

    return false;
  }, [tripStatus, deliveryPhase]);

  // Pickup leg = rider assigned and en route to / at restaurant (before delivery leg)
  const isPickupLeg = useMemo(() => {
    if (isDeliveryLeg || !hasAssignedRider) return false;
    
    const pickupPhases = ['en_route_to_pickup', 'at_pickup'];
    if (pickupPhases.includes(deliveryPhase)) return true;

    const pickupStatuses = [
      'accepted',
      'preparing',
      'ready',
      'ready_for_pickup',
      'arrived',
      'reached_pickup',
      'at_pickup',
      'picking_up',
    ];
    if (pickupStatuses.includes(tripStatus)) return true;

    return false;
  }, [isDeliveryLeg, hasAssignedRider, deliveryPhase, tripStatus]);

  // Always use order delivery address for pin + routing (never conflate with viewer GPS)
  const destinationCoords = customerCoords;

  const frameOverviewCamera = useCallback((reason = 'manual', { force = false } = {}) => {
    const mapInstance = mapRef.current;
    if (!mapInstance || !restaurantCoords || !customerCoords) return;

    const riderPos = smoothLocationRef.current || riderLocationRef.current;
    const path = !isDeliveryLeg && !isPickupLeg ? baselineDirections?.routes?.[0]?.overview_path : null;
    const frameKey = [
      reason,
      isDeliveryLeg ? 'delivery' : (isPickupLeg ? 'pickup-rider' : 'static'),
      restaurantCoords.lat,
      restaurantCoords.lng,
      destinationCoords?.lat,
      destinationCoords?.lng,
      path?.length || 0,
    ].join('|');

    if (!force && frameKey === lastOverviewFrameKeyRef.current) return;
    lastOverviewFrameKeyRef.current = frameKey;

    if (isDeliveryLeg && riderPos && destinationCoords && window.google?.maps?.geometry?.spherical) {
      const riderLatLng = new window.google.maps.LatLng(riderPos.lat, riderPos.lng);
      const customerLatLng = new window.google.maps.LatLng(destinationCoords.lat, destinationCoords.lng);
      const dist = window.google.maps.geometry.spherical.computeDistanceBetween(riderLatLng, customerLatLng);
      if (dist < 40) {
        mapInstance.setCenter(customerLatLng);
        mapInstance.setZoom(16);
        return;
      }
    }

    const points = [restaurantCoords, destinationCoords];
    if (isDeliveryLeg && riderPos) points.push(riderPos);
    if (isPickupLeg && riderPos) points.push(riderPos);

    fitMapToOverview(mapInstance, {
      path: path?.length ? path : [],
      points,
    });

    hasInitialFrameRef.current = true;
    debugLog('[Camera] Overview framed:', reason, { isDeliveryLeg, isPickupLeg, pathPoints: path?.length || 0 });
  }, [
    restaurantCoords,
    customerCoords,
    destinationCoords,
    isDeliveryLeg,
    isPickupLeg,
    baselineDirections,
  ]);

  const handleMapLoad = useCallback((mapInstance) => {
    mapRef.current = mapInstance;
    frameOverviewCamera('map-load', { force: true });
  }, [frameOverviewCamera]);

  const handleBaselineDirections = useCallback((result, status) => {
    debugLog('Baseline Directions Status:', status);

    if (status === 'OK' && result) {
      const points = result.routes[0]?.overview_path?.length || 0;
      debugLog(`Baseline directions SET with ${points} points`);
      setBaselineDirections(result);
      // Frame immediately — do not wait for a throttled effect that may lose to re-renders
      requestAnimationFrame(() => {
        if (!isDeliveryLeg && !isPickupLeg && mapRef.current) {
          fitMapToOverview(mapRef.current, {
            path: result.routes[0]?.overview_path || [],
            points: [restaurantCoords, destinationCoords],
          });
          hasInitialFrameRef.current = true;
          lastOverviewFrameKeyRef.current = `baseline|${points}`;
        }
      });
      return;
    }

    if (status !== 'OK') {
      console.error('[DeliveryTrackingMap] DirectionsService failed:', status);
    }
  }, [isDeliveryLeg, isPickupLeg, restaurantCoords, destinationCoords, customerCoords]);

  // Re-frame only when trip phase / coords / baseline change — NOT on every rider tick
  const lastCameraUpdateRef = useRef({ time: 0, leg: null });

  useEffect(() => {
    if (!mapRef.current || !restaurantCoords || !customerCoords || !isLoaded) return;

    const now = Date.now();
    const currentLeg = isDeliveryLeg ? 'delivery' : (isPickupLeg ? 'pickup' : 'static');
    const legChanged = lastCameraUpdateRef.current.leg !== currentLeg;
    const timeSinceLastUpdate = now - lastCameraUpdateRef.current.time;
    const throttleTime = isDeliveryLeg ? 4000 : 8000;

    if (!legChanged && timeSinceLastUpdate < throttleTime) return;

    lastCameraUpdateRef.current = { time: now, leg: currentLeg };
    frameOverviewCamera(currentLeg);
  }, [
    isLoaded,
    isDeliveryLeg,
    isPickupLeg,
    restaurantCoords,
    customerCoords,
    destinationCoords,
    baselineDirections,
    frameOverviewCamera,
    displayRiderLocation
  ]);

  useEffect(() => {
    if (isDeliveryLeg) {
      setDirections(null);
      setPickupLegDirections(null);
    } else if (isPickupLeg) {
      setDeliveryLegDirections(null);
      setDirections(null);
    } else {
      setDeliveryLegDirections(null);
      setPickupLegDirections(null);
    }
    setLastDirectionsAt(0);
  }, [isDeliveryLeg, isPickupLeg, restaurantCoords?.lat, restaurantCoords?.lng, destinationCoords?.lat, destinationCoords?.lng]);

  // 3. Directions Management
  const directionsCallback = useCallback((result, status) => {
    if (status === 'OK' && result) {
      if (isDeliveryLeg) {
        setDeliveryLegDirections(result);
      } else if (isPickupLeg) {
        setPickupLegDirections(result);
      } else {
        setDirections(result);
      }
      setLastDirectionsAt(Date.now());
      
      const durationText = result?.routes?.[0]?.legs?.[0]?.duration?.text;
      if (durationText) {
        setCurrentEta(durationText);
        if (onEtaUpdate) {
          onEtaUpdate(durationText);
        }
      }
    }
  }, [onEtaUpdate, isDeliveryLeg, isPickupLeg]);

  const restaurantToUserPath = useMemo(() => {
    if (!isDeliveryLeg) return null;
    return (
      baselineDirections?.routes?.[0]?.overview_path
      || deliveryLegDirections?.routes?.[0]?.overview_path
      || null
    );
  }, [isDeliveryLeg, baselineDirections, deliveryLegDirections]);

  const activeDeliveryPath = useMemo(() => {
    if (!isDeliveryLeg) return null;
    return deliveryLegDirections?.routes?.[0]?.overview_path || null;
  }, [isDeliveryLeg, deliveryLegDirections]);

  const deliveryDirectionsOptions = useMemo(() => {
    if (!isDeliveryLeg || !destinationCoords) return null;
    const routeOrigin = riderLocation || displayRiderLocation;
    if (routeOrigin) {
      return {
        origin: routeOrigin,
        destination: destinationCoords,
        travelMode: 'DRIVING',
      };
    }
    if (restaurantCoords) {
      return {
        origin: restaurantCoords,
        destination: destinationCoords,
        travelMode: 'DRIVING',
      };
    }
    return null;
  }, [
    isDeliveryLeg,
    riderLocation?.lat,
    riderLocation?.lng,
    destinationCoords?.lat,
    destinationCoords?.lng,
    restaurantCoords?.lat,
    restaurantCoords?.lng,
  ]);

  const shouldUpdateDeliveryRoute = useMemo(() => {
    if (!isDeliveryLeg) return false;
    if (!deliveryLegDirections) return true;

    const elapsed = Date.now() - lastDirectionsAt;
    if (elapsed < 15000) return false;

    if (
      displayRiderLocation
      && activeDeliveryPath?.length
      && window.google?.maps?.geometry?.spherical
      && window.google?.maps?.LatLng
    ) {
      const riderPos = new window.google.maps.LatLng(displayRiderLocation.lat, displayRiderLocation.lng);
      let minDist = Infinity;
      for (let i = 0; i < activeDeliveryPath.length; i++) {
        const d = window.google.maps.geometry.spherical.computeDistanceBetween(riderPos, activeDeliveryPath[i]);
        if (d < minDist) minDist = d;
      }
      if (minDist > 80) return true;
    }

    return elapsed >= 60000;
  }, [isDeliveryLeg, deliveryLegDirections, activeDeliveryPath, lastDirectionsAt, displayRiderLocation]);

  const cloudRemainingPath = useMemo(() => {
    if (!cloudPolyline || !displayRiderLocation || !window.google?.maps?.geometry?.encoding) return [];
    try {
      const decoded = window.google.maps.geometry.encoding.decodePath(
        typeof cloudPolyline === 'string' ? cloudPolyline : (cloudPolyline.points || '')
      );
      const endpoint = isPickupLeg ? restaurantCoords : destinationCoords;
      return buildRemainingRoutePath(decoded, displayRiderLocation, endpoint);
    } catch {
      return [];
    }
  }, [isPickupLeg, cloudPolyline, displayRiderLocation, destinationCoords, restaurantCoords]);

  // Delivery leg: rider → customer route, trimmed live as rider moves forward
  const deliveryRemainingPath = useMemo(() => {
    if (!isDeliveryLeg) return [];

    const routeSource = activeDeliveryPath || restaurantToUserPath;
    if (routeSource?.length) {
      return buildRemainingRoutePath(routeSource, displayRiderLocation, destinationCoords);
    }

    if (cloudRemainingPath.length > 1) return cloudRemainingPath;

    return [];
  }, [
    isDeliveryLeg,
    activeDeliveryPath,
    restaurantToUserPath,
    displayRiderLocation,
    cloudRemainingPath,
    destinationCoords,
  ]);

  const pickupDirectionsOptions = useMemo(() => {
    if (!isPickupLeg || !displayRiderLocation || !restaurantCoords) return null;
    return {
      origin: displayRiderLocation,
      destination: restaurantCoords,
      travelMode: 'DRIVING',
    };
  }, [
    isPickupLeg,
    displayRiderLocation?.lat,
    displayRiderLocation?.lng,
    restaurantCoords?.lat,
    restaurantCoords?.lng,
  ]);

  const shouldUpdatePickupRoute = useMemo(() => {
    if (!isPickupLeg) return false;
    if (!pickupLegDirections) return true;
    return Date.now() - lastDirectionsAt >= 15000;
  }, [isPickupLeg, pickupLegDirections, lastDirectionsAt]);

  const pickupRemainingPath = useMemo(() => {
    if (!isPickupLeg || !displayRiderLocation) return [];
    
    if (cloudRemainingPath.length > 1) return cloudRemainingPath;
    
    const fullPath = pickupLegDirections?.routes?.[0]?.overview_path;
    if (!fullPath?.length) return [];
    return buildRemainingRoutePath(fullPath, displayRiderLocation, restaurantCoords);
  }, [isPickupLeg, pickupLegDirections, displayRiderLocation, restaurantCoords, cloudRemainingPath]);

  // Rider icon: real GPS → map-match to route → pin snap only on arrival (Swiggy-style)
  const riderMarkerPosition = useMemo(() => {
    if (!displayRiderLocation) return null;

    const geometry = window.google?.maps?.geometry?.spherical;
    if (!geometry) return displayRiderLocation;

    const pinTarget = isDeliveryLeg
      ? destinationCoords
      : (isPickupLeg ? restaurantCoords : null);

    if (
      pinTarget
      && Number.isFinite(pinTarget.lat)
      && Number.isFinite(pinTarget.lng)
    ) {
      const distToPin = geometry.computeDistanceBetween(
        new window.google.maps.LatLng(displayRiderLocation.lat, displayRiderLocation.lng),
        new window.google.maps.LatLng(pinTarget.lat, pinTarget.lng),
      );

      const isAtDrop = ['at_drop', 'reached_drop'].includes(deliveryPhase)
        || ['at_drop', 'reached_drop', 'at_delivery', 'delivered'].includes(tripStatus);
      const isAtPickup = deliveryPhase === 'at_pickup';

      const shouldSnapToPin = isDeliveryLeg
        ? (tripStatus === 'delivered' || (isAtDrop && distToPin <= ARRIVAL_PIN_SNAP_METERS))
        : (isAtPickup && distToPin <= ARRIVAL_PIN_SNAP_METERS);

      if (shouldSnapToPin) {
        return {
          ...displayRiderLocation,
          lat: pinTarget.lat,
          lng: pinTarget.lng,
        };
      }
    }

    const routePath = isDeliveryLeg
      ? (
        deliveryRemainingPath.length > 1
          ? deliveryRemainingPath
          : (restaurantToUserPath?.map((point) => pathPointToLatLng(point) || point) || [])
      )
      : (
        pickupRemainingPath.length > 1
          ? pickupRemainingPath
          : (pickupLegDirections?.routes?.[0]?.overview_path?.map((point) => pathPointToLatLng(point) || point) || [])
      );

    const matched = nearestPointOnPath(displayRiderLocation, routePath);
    if (matched) {
      return {
        ...displayRiderLocation,
        lat: matched.lat,
        lng: matched.lng,
      };
    }

    return displayRiderLocation;
  }, [
    displayRiderLocation,
    isDeliveryLeg,
    isPickupLeg,
    destinationCoords,
    restaurantCoords,
    deliveryPhase,
    tripStatus,
    deliveryRemainingPath,
    restaurantToUserPath,
    pickupRemainingPath,
    pickupLegDirections,
  ]);

  // Fallback fetch for restaurant → user if baseline was not ready before pickup
  const deliveryBaselineDirectionsOptions = useMemo(() => {
    if (!isDeliveryLeg || baselineDirections || deliveryLegDirections || displayRiderLocation) return null;
    if (!restaurantCoords || !destinationCoords) return null;
    return {
      origin: restaurantCoords,
      destination: destinationCoords,
      travelMode: 'DRIVING',
    };
  }, [
    isDeliveryLeg,
    baselineDirections,
    deliveryLegDirections,
    displayRiderLocation,
    restaurantCoords?.lat,
    restaurantCoords?.lng,
    destinationCoords?.lat,
    destinationCoords?.lng,
  ]);

  const baselineDirectionsServiceOptions = useMemo(() => {
    if (!restaurantCoords || !destinationCoords) return null;
    return {
      origin: restaurantCoords,
      destination: destinationCoords,
      travelMode: 'DRIVING',
    };
  }, [
    restaurantCoords?.lat,
    restaurantCoords?.lng,
    destinationCoords?.lat,
    destinationCoords?.lng,
  ]);

  if (!isLoaded) return <div className="w-full h-full bg-gray-100 animate-pulse" />;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl shadow-inner border border-gray-100">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        onLoad={handleMapLoad}
        options={MAP_UI_OPTIONS}
      >
        {/* 1. PERSISTENT BASELINE (Full journey: Restaurant -> Customer) */}
        {!baselineDirections && baselineDirectionsServiceOptions && (
           <DirectionsService
             options={baselineDirectionsServiceOptions}
             callback={handleBaselineDirections}
           />
        )}

        {/* Immediate Fallback Polyline if Google Directions isn't ready yet */}
        {!baselineDirections && restaurantCoords && destinationCoords && (
          <Polyline
            path={[restaurantCoords, destinationCoords]}
            options={{
              strokeColor: '#EB590E',
              strokeOpacity: 0.6,
              strokeWeight: 5,
              zIndex: 4
            }}
          />
        )}

        {/* 1. PERSISTENT BASELINE (Full journey: Restaurant -> Customer) */}
        {baselineDirections?.routes?.[0]?.overview_path && !isDeliveryLeg && (
          <Polyline
            path={baselineDirections.routes[0].overview_path}
            options={{
              strokeColor: '#EB590E', 
              strokeOpacity: isPickupLeg ? 0.45 : 0.85,
              strokeWeight: isPickupLeg ? 5 : 6,
              zIndex: 5
            }}
          />
        )}

        {/* Pickup leg — rider → restaurant, erases behind rider */}
        {!cloudPolyline && pickupDirectionsOptions && shouldUpdatePickupRoute && (
          <DirectionsService
            options={pickupDirectionsOptions}
            callback={directionsCallback}
          />
        )}

        {isPickupLeg && (
          <LiveRoutePolyline
            path={pickupRemainingPath}
            options={{
              strokeColor: '#22c55e',
              strokeWeight: 6,
              strokeOpacity: 0.9,
              geodesic: true,
              zIndex: 10,
            }}
          />
        )}

        {/* Delivery leg — rider → customer route, erases behind rider */}
        {!cloudPolyline && deliveryDirectionsOptions && shouldUpdateDeliveryRoute && (
          <DirectionsService
            options={deliveryDirectionsOptions}
            callback={directionsCallback}
          />
        )}

        {!cloudPolyline && deliveryBaselineDirectionsOptions && (
          <DirectionsService
            options={deliveryBaselineDirectionsOptions}
            callback={directionsCallback}
          />
        )}

        {isDeliveryLeg && (
          <LiveRoutePolyline
            path={deliveryRemainingPath}
            options={{
              strokeColor: '#EB590E',
              strokeWeight: 6,
              strokeOpacity: 0.9,
              geodesic: true,
              zIndex: 10,
            }}
          />
        )}

        {/* RESTAURANT PIN */}
        <OverlayView
          position={restaurantCoords}
          mapPaneName={OverlayView.MARKER_LAYER}
        >
          <div className="relative -translate-x-1/2 -translate-y-full pointer-events-none select-none">
            {!isDeliveryLeg && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <motion.div 
                  animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-16 h-16 rounded-full border-4 border-orange-500/50"
                />
              </div>
            )}
            <img
              src={eqosyRestaurantPin}
              alt="Restaurant"
              className="relative w-12 h-12 object-contain drop-shadow-xl"
              onError={(e) => {
                e.target.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(RESTAURANT_PIN_SVG)}`;
              }}
            />
          </div>
        </OverlayView>

        {/* CUSTOMER PIN (OVERLAY VIEW FOR CUSTOM STYLE) */}
        <OverlayView
          position={destinationCoords}
          mapPaneName={OverlayView.MARKER_LAYER}
        >
          <div className="relative -translate-x-1/2 -translate-y-full mb-1 group">
             {/* Pulsing ring when delivery partner is heading to user */}
             {isDeliveryLeg && (
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                 <motion.div 
                   animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                   transition={{ duration: 2, repeat: Infinity }}
                   className="w-16 h-16 rounded-full border-4 border-green-500/50"
                 />
               </div>
             )}
             <div className="relative w-11 h-11 rounded-full p-1 bg-white shadow-xl border-2 border-green-500 overflow-hidden group-hover:scale-110 transition-transform">
                <img 
                  src={order?.customerImage || order?.userId?.profileImage || order?.userId?.avatar || `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CUSTOMER_PIN_SVG)}`}
                  alt="Me"
                  className="w-full h-full object-contain rounded-full bg-gray-50"
                  onError={(e) => { e.target.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CUSTOMER_PIN_SVG)}`; }}
                />
             </div>
             {/* Pin Tip */}
             <div className="absolute top-[100%] left-1/2 -translate-x-1/2 w-3 h-3 bg-green-500 clip-triangle rotate-180 -mt-1 shadow-sm" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
          </div>
        </OverlayView>

        {/* Rider icon — visible only after pickup, during delivery leg */}
        {riderMarkerPosition && (isDeliveryLeg || isPickupLeg) && (
          <OverlayView
            position={riderMarkerPosition}
            mapPaneName={OverlayView.MARKER_LAYER}
          >
            <div 
              style={{
                transform: `translate(-50%, -50%) rotate(${riderMarkerPosition.heading || 0}deg)`,
                transition: 'transform 0.5s linear',
              }}
              className="relative w-[4.5rem] h-[4.5rem]"
            >
              <img 
                src={MAP_RIDER_ICON}
                alt="Delivery partner"
                className="w-full h-full object-contain drop-shadow-2xl pointer-events-none select-none"
                onError={(e) => {
                  e.target.src = MAP_RIDER_ICON;
                }}
              />
            </div>
          </OverlayView>
        )}
      </GoogleMap>

      {/* 4. LIVE ARRIVAL BADGE (Pro Orange) */}
      <AnimatePresence>
        {riderLocation && currentEta && (!String(currentEta).toLowerCase().includes('nan')) && (
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="absolute top-4 left-4 z-[150] pointer-events-none"
          >
            <div className="bg-orange-500/95 backdrop-blur-xl rounded-2xl p-3 shadow-[0_10px_30px_rgba(249,115,22,0.4)] border border-orange-400/50 flex flex-col min-w-[90px] group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
              <div className="flex flex-col z-10">
                <span className="text-[9px] text-white/80 font-black uppercase tracking-[0.2em] mb-0.5">Arrival</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-white leading-none tracking-tighter">
                    {currentEta}
                  </span>
                  <div className="flex items-center gap-1.5 opacity-80">
                     <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                     <Navigation className="w-3 h-3 text-white rotate-45" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DeliveryTrackingMap;
