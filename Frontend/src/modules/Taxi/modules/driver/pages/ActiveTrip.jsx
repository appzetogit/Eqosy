import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageSquare,
    Phone,
    ShieldAlert,
    Check,
    Banknote,
    QrCode,
    Scan,
    ChevronRight,
    Star,
    CheckCircle2,
    Package,
    User,
    ArrowUpRight,
    ArrowLeft,
    Clock3,
    MapPinned,
    Navigation,
    Sparkles,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { GoogleMap, MarkerF, OverlayView, OverlayViewF, PolylineF } from '@react-google-maps/api';
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { socketService } from '../../../shared/api/socket';
import { pushDriverLocationRealtime } from '../../../shared/services/rideRealtime';
import api from '../../../shared/api/axiosInstance';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';
import carIcon from '../../../assets/icons/car.png';
import { getLocalDriverToken } from '../services/registrationService';
import CancellationReceiptModal from '../../shared/components/CancellationReceiptModal';

const resolveAssetUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:image\/|blob:)/i.test(raw)) return raw;
  if (/^\/(1_Bike|2_Auto|4_Taxi|ehcv|hcv|LCV|mcv|truck|Luxury|Premium|SUV|assets)/i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${BACKEND_ORIGIN}${raw}`;
  return `${BACKEND_ORIGIN}/${raw.replace(/^\/+/, '')}`;
};

const MAP_CONTAINER_STYLE = {
    width: '100%',
    height: '100%',
};

const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const DEFAULT_DRIVER_COORDS = [75.8577, 22.7196];
const ARRIVAL_RADIUS_METERS = 100;
const MIN_ROUTE_POLYLINE_METERS = 1;
const ROUTE_DEVIATION_METERS = 100;
const ROUTE_REFRESH_INTERVAL_MS = 30000;
const ROUTE_WATCH_INTERVAL_MS = 5000;

const mapStyles = [
    { elementType: 'geometry', stylers: [{ color: '#f8fafc' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eef2f7' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e2e8f0' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbeafe' }] },
];

const toLatLng = (coordinates, fallback = DEFAULT_CENTER) => {
    const [lng, lat] = coordinates || [];

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return { lat: Number(lat), lng: Number(lng) };
    }

    return fallback;
};

const readCoordinatePair = (...sources) => {
    for (const source of sources) {
        if (Array.isArray(source) && source.length >= 2) {
            const [lng, lat] = source;
            if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
                return [Number(lng), Number(lat)];
            }
        }

        const nestedCoords = source?.coordinates;
        if (Array.isArray(nestedCoords) && nestedCoords.length >= 2) {
            const [lng, lat] = nestedCoords;
            if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
                return [Number(lng), Number(lat)];
            }
        }

        const lat = Number(source?.lat ?? source?.latitude);
        const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return [lng, lat];
        }
    }

    return null;
};

const createOffsetPosition = (position, latOffset = -0.0045, lngOffset = -0.0035) => ({
    lat: Number(position?.lat ?? DEFAULT_CENTER.lat) + latOffset,
    lng: Number(position?.lng ?? DEFAULT_CENTER.lng) + lngOffset,
});

const arePositionsNearlyEqual = (first, second, threshold = 0.0002) => (
    Math.abs(Number(first?.lat ?? 0) - Number(second?.lat ?? 0)) < threshold &&
    Math.abs(Number(first?.lng ?? 0) - Number(second?.lng ?? 0)) < threshold
);

const getAreaName = (address, fallback) => {
    const cleanAddress = String(address || '').trim();

    if (!cleanAddress) {
        return fallback;
    }

    return cleanAddress
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(', ') || fallback;
};

const formatAddressFromPoint = (point, fallback) => {
    const coordinates = readCoordinatePair(point);

    if (!coordinates) {
        return fallback;
    }

    const [lng, lat] = coordinates;
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

const normalizeTripType = (job = {}) => {
    const value = String(job.type || job.serviceType || 'ride').toLowerCase();
    if (value === 'parcel') return 'parcel';
    if (value === 'intercity') return 'intercity';
    return 'ride';
};

const getTripTitle = (type) => {
    if (type === 'parcel') return 'Delivery';
    if (type === 'intercity') return 'Intercity Ride';
    return 'Taxi Ride';
};

const cleanPhoneNumber = (phone) => String(phone || '').replace(/[^\d+]/g, '');

const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;
const hexToRgba = (hex, alpha = 1) => {
    const sanitized = String(hex || '').replace('#', '');

    if (sanitized.length !== 6) {
        return `rgba(15, 23, 42, ${alpha})`;
    }

    const red = Number.parseInt(sanitized.slice(0, 2), 16);
    const green = Number.parseInt(sanitized.slice(2, 4), 16);
    const blue = Number.parseInt(sanitized.slice(4, 6), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const getJobRideId = (job = {}) => String(job.rideId || job.id || job._id || job.requestId || '').trim();

const getActiveTripPhaseKey = (id) => (id ? `driverActiveTripPhase:${id}` : '');
const getActiveTripUiStateKey = (id) => (id ? `driverActiveTripUiState:${id}` : '');
const ACTIVE_TRIP_SESSION_KEY = 'driverActiveTripSnapshot';

const readStoredTripPhase = (id) => {
    const key = getActiveTripPhaseKey(id);
    if (!key) return '';

    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
};

const writeStoredTripPhase = (id, nextPhase) => {
    const key = getActiveTripPhaseKey(id);
    if (!key) return;

    try {
        localStorage.setItem(key, nextPhase);
    } catch {
        // Local storage can be blocked in private contexts; trip still works without it.
    }
};

const clearStoredTripPhase = (id) => {
    const key = getActiveTripPhaseKey(id);
    if (!key) return;

    try {
        localStorage.removeItem(key);
    } catch {
        // No-op.
    }
};

const readStoredTripUiState = (id) => {
    const key = getActiveTripUiStateKey(id);
    if (!key) return null;

    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeStoredTripUiState = (id, nextState) => {
    const key = getActiveTripUiStateKey(id);
    if (!key) return;

    try {
        localStorage.setItem(key, JSON.stringify(nextState));
    } catch {
        // Ignore storage failures and continue with in-memory state.
    }
};

const clearStoredTripUiState = (id) => {
    const key = getActiveTripUiStateKey(id);
    if (!key) return;

    try {
        localStorage.removeItem(key);
    } catch {
        // No-op.
    }
};

const readStoredActiveTripSnapshot = () => {
    try {
        const raw = localStorage.getItem(ACTIVE_TRIP_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeStoredActiveTripSnapshot = (snapshot) => {
    try {
        localStorage.setItem(ACTIVE_TRIP_SESSION_KEY, JSON.stringify(snapshot));
    } catch {
        // Ignore storage failures.
    }
};

const clearStoredActiveTripSnapshot = () => {
    try {
        localStorage.removeItem(ACTIVE_TRIP_SESSION_KEY);
    } catch {
        // No-op.
    }
};

const readStoredDriverCoords = () => {
    try {
        const stored = JSON.parse(localStorage.getItem('driverInfo') || '{}');
        const coordinates = stored?.location?.coordinates || stored?.coordinates;

        if (Array.isArray(coordinates) && coordinates.length === 2) {
            const [lng, lat] = coordinates;
            if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
                return [Number(lng), Number(lat)];
            }
        }
    } catch {
        // Ignore storage parsing issues and fall back to live geolocation.
    }

    return null;
};

const resolvePhaseFromJob = (job = {}) => {
    const rideId = getJobRideId(job);
    const explicitPhase = String(job.phase || '').toLowerCase();
    const storedPhase = readStoredTripPhase(rideId);
    const liveStatus = String(job.liveStatus || job.status || '').toLowerCase();

    if (liveStatus === 'cancelled' || liveStatus === 'canceled') {
        return 'cancelled';
    }

    if (['to_pickup', 'otp_verification', 'in_trip', 'payment_confirm', 'review'].includes(explicitPhase)) {
        return explicitPhase;
    }

    if (['to_pickup', 'otp_verification', 'in_trip', 'payment_confirm', 'review'].includes(storedPhase)) {
        return storedPhase;
    }

    if (liveStatus === 'arriving') return 'otp_verification';
    if (liveStatus === 'started' || liveStatus === 'ongoing') return 'in_trip';
    if (liveStatus === 'arrived') return 'payment_confirm';
    if (liveStatus === 'completed') return 'review';

    return 'to_pickup';
};
const withDriverAuthorization = (token) => (
    token
        ? {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
        : {}
);

const normalizeHeading = (value, fallback = 0) => {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return ((numeric % 360) + 360) % 360;
};

const calculateBearing = (from, to, fallback = 0) => {
    if (!from || !to || arePositionsNearlyEqual(from, to, 0.00001)) {
        return fallback;
    }

    const fromLat = Number(from.lat) * (Math.PI / 180);
    const toLat = Number(to.lat) * (Math.PI / 180);
    const deltaLng = (Number(to.lng) - Number(from.lng)) * (Math.PI / 180);
    const y = Math.sin(deltaLng) * Math.cos(toLat);
    const x = Math.cos(fromLat) * Math.sin(toLat) -
        Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);

    return normalizeHeading(Math.atan2(y, x) * (180 / Math.PI), fallback);
};

const getRouteHeading = (position, path = [], fallback = 0) => {
    const nextPoint = path.find((point) => !arePositionsNearlyEqual(position, point, 0.00001));
    return nextPoint ? calculateBearing(position, nextPoint, fallback) : fallback;
};

const getVehicleMarkerOffset = (width, height) => ({
    x: -(width / 2),
    y: -(height / 2),
});

const RotatingVehicleMarker = ({ position, iconUrl = carIcon, heading = 0, title = 'Driver' }) => (
    <OverlayViewF
        position={position}
        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        getPixelPositionOffset={getVehicleMarkerOffset}
    >
        <div title={title} className="pointer-events-none flex h-14 w-14 items-center justify-center">
            <div
                className="flex h-11 w-11 items-center justify-center transition-transform duration-500 ease-out"
                style={{ transform: `rotate(${normalizeHeading(heading)}deg)` }}
            >
                <img
                    src={iconUrl || carIcon}
                    alt={title}
                    className="h-12 w-12 object-contain drop-shadow-[0_8px_10px_rgba(15,23,42,0.35)]"
                    draggable={false}
                />
            </div>
        </div>
    </OverlayViewF>
);

const getCurrentCoords = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
        reject(new Error('Location is not available on this device.'));
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error('Please allow location permission to continue tracking.')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
});

const parseFareAmount = (value) => {
    const numeric = Number(String(value || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
};

const formatCurrencyAmount = (value) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
        return 'Rs 0';
    }

    const hasDecimals = Math.abs(numeric % 1) > 0.001;
    return `Rs ${hasDecimals ? numeric.toFixed(2) : Math.round(numeric)}`;
};

const formatDateTimeLabel = (value, fallback = '--') => {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }

    return parsed.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
};

const formatDurationLabel = (start, end = Date.now()) => {
    if (!start) {
        return '--';
    }

    const startTime = new Date(start).getTime();
    const endTime = typeof end === 'string' || end instanceof Date ? new Date(end).getTime() : Number(end);

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        return '--';
    }

    const totalMinutes = Math.max(1, Math.round((endTime - startTime) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes} min`;
};

const computeCommissionSummary = ({ fare = 0, pricingSnapshot = null, explicitCommissionAmount, explicitDriverEarnings }) => {
    const normalizedFare = Math.max(0, Number(fare || 0));
    const commissionType = Number(pricingSnapshot?.admin_commission_type_from_driver ?? 1);
    const commissionValue = Math.max(0, Number(pricingSnapshot?.admin_commission_from_driver ?? 0));
    const fallbackCommissionAmount = commissionType === 1
        ? Math.round(((normalizedFare * commissionValue) / 100) * 100) / 100
        : Math.min(normalizedFare, commissionValue);
    const normalizedExplicitCommission = Number(explicitCommissionAmount);
    const normalizedExplicitDriverEarnings = Number(explicitDriverEarnings);
    const hasSettledExplicitCommission = Number.isFinite(normalizedExplicitCommission) && (
        normalizedExplicitCommission > 0
        || normalizedFare <= 0
        || fallbackCommissionAmount <= 0
    );
    const commissionAmount = hasSettledExplicitCommission
        ? Math.max(0, normalizedExplicitCommission)
        : fallbackCommissionAmount;
    const derivedDriverEarnings = Math.max(normalizedFare - commissionAmount, 0);
    const hasSettledExplicitDriverEarnings = Number.isFinite(normalizedExplicitDriverEarnings) && (
        normalizedExplicitDriverEarnings > 0
        || normalizedFare <= 0
        || derivedDriverEarnings <= 0
    );
    const driverEarnings = hasSettledExplicitDriverEarnings
        ? Math.max(0, normalizedExplicitDriverEarnings)
        : derivedDriverEarnings;

    return {
        commissionAmount,
        driverEarnings,
        commissionType,
        commissionValue,
        commissionLabel: commissionType === 1 ? `${commissionValue}%` : formatCurrencyAmount(commissionValue),
    };
};

const getSimulationPath = ({ routePath = [], from, to }) => {
    const path = routePath.length > 1 ? routePath : [from, to].filter(Boolean);
    return path
        .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
        .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));
};

const toRadians = (value) => Number(value) * (Math.PI / 180);

const getDistanceMeters = (from, to) => {
    if (!from || !to) {
        return 0;
    }

    const fromLat = Number(from.lat);
    const fromLng = Number(from.lng);
    const toLat = Number(to.lat);
    const toLng = Number(to.lng);

    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
        return 0;
    }

    const earthRadiusMeters = 6371000;
    const deltaLat = toRadians(toLat - fromLat);
    const deltaLng = toRadians(toLng - fromLng);
    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
};

const getDestinationRouteKey = (destination) => (
    `${Number(destination?.lat ?? 0).toFixed(6)}:${Number(destination?.lng ?? 0).toFixed(6)}`
);

const getClosestPointOnSegment = (point, start, end) => {
    const startLat = Number(start?.lat);
    const startLng = Number(start?.lng);
    const endLat = Number(end?.lat);
    const endLng = Number(end?.lng);
    const pointLat = Number(point?.lat);
    const pointLng = Number(point?.lng);

    if (![startLat, startLng, endLat, endLng, pointLat, pointLng].every(Number.isFinite)) {
        return start || point;
    }

    const deltaLng = endLng - startLng;
    const deltaLat = endLat - startLat;
    const lengthSquared = (deltaLng * deltaLng) + (deltaLat * deltaLat);

    if (lengthSquared <= 0) {
        return { lat: startLat, lng: startLng };
    }

    const projection = (
        ((pointLng - startLng) * deltaLng) + ((pointLat - startLat) * deltaLat)
    ) / lengthSquared;
    const clampedProjection = Math.max(0, Math.min(1, projection));

    return {
        lat: startLat + (deltaLat * clampedProjection),
        lng: startLng + (deltaLng * clampedProjection),
    };
};

const getDistanceToPolylineMeters = (position, path = []) => {
    if (!position || path.length < 2) {
        return Number.POSITIVE_INFINITY;
    }

    return path.slice(0, -1).reduce((minDistance, start, index) => {
        const end = path[index + 1];
        const closestPoint = getClosestPointOnSegment(position, start, end);
        const segmentDistance = getDistanceMeters(position, closestPoint);
        return Math.min(minDistance, segmentDistance);
    }, Number.POSITIVE_INFINITY);
};

const mapDirectionsOverviewPath = (result) => (
    result?.routes?.[0]?.overview_path?.map((point) => ({
        lat: point.lat(),
        lng: point.lng(),
    })) || []
);

const formatDistanceLabel = (meters) => {
    const distance = Number(meters || 0);

    if (!Number.isFinite(distance) || distance <= 0) {
        return 'Nearby';
    }

    if (distance < 1000) {
        return `${Math.max(50, Math.round(distance / 10) * 10)} m away`;
    }

    return `${(distance / 1000).toFixed(distance >= 10000 ? 0 : 1)} km away`;
};

const formatTimerClock = (totalSeconds) => {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatWholeMinutes = (value) => `${Math.max(0, Math.floor(Number(value) || 0))} min`;

const computePickupWaitingCharge = ({
    arrivedAt = '',
    startedAt = '',
    freeWaitingBeforeMinutes = 0,
    waitingChargePerMinute = 0,
} = {}) => {
    if (!arrivedAt || !startedAt) {
        return {
            waitingSeconds: 0,
            chargeableMinutes: 0,
            waitingChargeTotal: 0,
        };
    }

    const arrivedTime = new Date(arrivedAt).getTime();
    const startedTime = new Date(startedAt).getTime();

    if (!Number.isFinite(arrivedTime) || !Number.isFinite(startedTime) || startedTime <= arrivedTime) {
        return {
            waitingSeconds: 0,
            chargeableMinutes: 0,
            waitingChargeTotal: 0,
        };
    }

    const waitingSeconds = Math.max(0, Math.floor((startedTime - arrivedTime) / 1000));
    const safeFreeMinutes = Math.max(0, Number(freeWaitingBeforeMinutes) || 0);
    const safeRate = Math.max(0, Number(waitingChargePerMinute) || 0);
    const chargeableMinutes = Math.max(0, Math.ceil(waitingSeconds / 60) - safeFreeMinutes);
    const waitingChargeTotal = Math.round(chargeableMinutes * safeRate * 100) / 100;

    return {
        waitingSeconds,
        chargeableMinutes,
        waitingChargeTotal,
    };
};

const buildPersistedTripState = (job = {}, overrides = {}) => {
    const mergedJob = {
        ...job,
        ...overrides,
    };
    const currentRideId = getJobRideId(mergedJob);
    const currentType = normalizeTripType(mergedJob);

    if (!currentRideId) {
        return null;
    }

    const resolvedJobFare = [
        mergedJob.fare,
        mergedJob.baseFare,
        mergedJob.baseRideFare,
        mergedJob.estimatedFare,
        mergedJob.estimatedFare?.approx,
        mergedJob.estimatedFare?.min,
        mergedJob.pricingSnapshot?.fare,
        mergedJob.parcel?.fare,
        mergedJob.request?.raw?.fare,
        mergedJob.request?.fare,
    ].reduce((acc, curr) => (acc > 0 ? acc : parseFareAmount(curr)), 0);

    return {
        type: currentType,
        rideId: currentRideId,
        phase: mergedJob.phase || '',
        otp: mergedJob.otp || '',
        arrivedAt: mergedJob.arrivedAt || '',
        startedAt: mergedJob.startedAt || '',
        fare: resolvedJobFare > 0 ? resolvedJobFare : Number(mergedJob.fare || 0),
        paymentMethod: mergedJob.paymentMethod || 'Cash',
        pricingSnapshot: mergedJob.pricingSnapshot || null,
        currentDriverCoords: mergedJob.lastDriverLocation?.coordinates || mergedJob.driverLocation?.coordinates || null,
        request: {
            type: currentType,
            title: getTripTitle(currentType),
            fare: resolvedJobFare > 0 ? `Rs ${resolvedJobFare}` : (mergedJob.fare ? `Rs ${mergedJob.fare}` : ''),
            payment: mergedJob.paymentMethod || 'Cash',
            pickup: getAreaName(mergedJob.pickupAddress, formatAddressFromPoint(mergedJob.pickupLocation, 'Pickup area')),
            drop: getAreaName(mergedJob.dropAddress, formatAddressFromPoint(mergedJob.dropLocation, 'Drop area')),
            requestId: currentRideId,
            rideId: currentRideId,
            raw: mergedJob,
        },
    };
};

const buildDriverPaymentCollection = ({ mode = '', status = '', paymentQr = null } = {}) => {
    const normalizedMode = String(mode || '').trim().toLowerCase();

    if (!normalizedMode) {
        return null;
    }

    if (normalizedMode === 'online') {
        return {
            method: 'online',
            source: 'driver_qr',
            qrId: paymentQr?.id || '',
            status: status === 'success' ? 'paid' : 'pending',
            paidAt: status === 'success' ? new Date().toISOString() : null,
        };
    }

    if (normalizedMode === 'cash') {
        return {
            method: 'cash',
            source: 'driver_cash',
            status: 'paid',
            paidAt: new Date().toISOString(),
        };
    }

    return {
        method: normalizedMode,
        status: status === 'success' ? 'paid' : 'pending',
        paidAt: status === 'success' ? new Date().toISOString() : null,
    };
};

const ActiveTrip = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const routeState = useMemo(() => location.state || {}, [location.state]);
    const storedActiveTripSnapshot = useMemo(() => readStoredActiveTripSnapshot(), []);
    const [hydratedTripState, setHydratedTripState] = useState(() => storedActiveTripSnapshot);
    const routeRideId = routeState?.rideId || routeState?.request?.rideId || '';
    const routeOtp = routeState?.request?.raw?.otp || routeState?.request?.otp || routeState?.otp || '';
    const [isHydratingTrip, setIsHydratingTrip] = useState(!routeRideId || !routeOtp);
    const [cancellationBillReceipt, setCancellationBillReceipt] = useState(null);
    const [showReceiptModal, setShowReceiptModal] = useState(false);

    const exitToDriverHome = React.useCallback((statusMessage = '') => {
        if (routeRideId) {
            clearStoredTripPhase(routeRideId);
            clearStoredTripUiState(routeRideId);
        }
        clearStoredActiveTripSnapshot();

        navigate('/taxi/driver/home', {
            replace: true,
            state: statusMessage ? { statusMessage } : undefined,
        });
    }, [navigate, routeRideId]);

    useEffect(() => {
        let active = true;
        const hasRestorableRouteState = Boolean(routeRideId && routeOtp);

        if (hasRestorableRouteState) {
            setIsHydratingTrip(false);
        }

        const hydrateTripState = async () => {
            try {
                const driverToken = getLocalDriverToken();
                const [activeDelivery, activeRide] = await Promise.allSettled([
                    api.get('/deliveries/active/me', withDriverAuthorization(driverToken)),
                    api.get('/rides/active/me', withDriverAuthorization(driverToken)),
                ]);

                if (!active) {
                    return;
                }

                const deliveryPayload =
                    activeDelivery.status === 'fulfilled' ? unwrapApiPayload(activeDelivery.value) : null;
                const ridePayload =
                    activeRide.status === 'fulfilled' ? unwrapApiPayload(activeRide.value) : null;

                const currentJob = getJobRideId(deliveryPayload)
                    ? deliveryPayload
                    : getJobRideId(ridePayload)
                        ? ridePayload
                        : null;
                const currentRideId = getJobRideId(currentJob);
                const currentStatus = String(currentJob?.liveStatus || currentJob?.status || '').toLowerCase();

                if (!currentRideId || currentStatus === 'cancelled' || currentStatus === 'canceled') {
                    exitToDriverHome('Ride was cancelled or is no longer active.');
                    return;
                }

                const restoredPhase = resolvePhaseFromJob(currentJob);
                const nextPersistedState = buildPersistedTripState(currentJob, {
                    phase: restoredPhase,
                });

                setHydratedTripState(nextPersistedState);
                writeStoredActiveTripSnapshot(nextPersistedState);
                setPhase(restoredPhase);
            } catch {
                if (active) {
                    const fallbackSnapshot = readStoredActiveTripSnapshot();
                    if (fallbackSnapshot?.rideId) {
                        setHydratedTripState(fallbackSnapshot);
                        setPhase(resolvePhaseFromJob(fallbackSnapshot?.request?.raw || fallbackSnapshot));
                    } else {
                        exitToDriverHome('Could not restore active trip.');
                    }
                }
            } finally {
                if (active) {
                    setIsHydratingTrip(false);
                }
            }
        };

        hydrateTripState();

        return () => {
            active = false;
        };
    }, [exitToDriverHome, routeOtp, routeRideId]);

    const effectiveState = hydratedTripState || routeState;

    const tripType = effectiveState?.type || 'ride';
    const isParcel = tripType === 'parcel';
    const liveRequest = effectiveState?.request || {};
    const liveRaw = liveRequest.raw || {};
    const rideId = getJobRideId(liveRequest) || getJobRideId(effectiveState);
    const [resolvedPickupCoords, setResolvedPickupCoords] = useState(null);
    const [resolvedDropCoords, setResolvedDropCoords] = useState(null);
    const rawVehicleIcon = String(
        liveRaw.vehicleIconUrl ||
        liveRequest.vehicleIconUrl ||
        effectiveState.vehicleIconUrl ||
        liveRaw.map_icon ||
        liveRaw.icon ||
        liveRaw.image ||
        effectiveState.map_icon ||
        effectiveState.icon ||
        effectiveState.image ||
        ''
    ).trim();
    const vehicleIconUrl = rawVehicleIcon ? resolveAssetUrl(rawVehicleIcon) : carIcon;

    useEffect(() => {
        if (!rideId) return;

        const socket = socketService.connect({ role: 'driver' });
        if (!socket) return;

        const onRideCancelled = (payload) => {
            if (!payload || String(payload.rideId || '') !== String(rideId)) return;
            if (payload.cancellationBill) {
                setCancellationBillReceipt(payload.cancellationBill);
                setShowReceiptModal(true);
            } else {
                exitToDriverHome('User cancelled this ride.');
            }
        };

        socketService.on('rideCancelled', onRideCancelled);
        socketService.on('rideRequestClosed', onRideCancelled);
        socketService.emit('ride:join', { rideId });

        return () => {
            socketService.off('rideCancelled', onRideCancelled);
            socketService.off('rideRequestClosed', onRideCancelled);
        };
    }, [rideId, exitToDriverHome]);

    // Live continuous GPS watcher for Active Trip (runs in background & syncs Firebase Realtime DB + Socket.IO)
    useEffect(() => {
        if (!rideId || typeof navigator === 'undefined' || !navigator.geolocation) {
            return undefined;
        }

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
                const coords = [lng, lat];

                // 1. Emit via Socket.IO
                socketService.emit('driver_location_update', {
                    rideId,
                    coordinates: coords,
                    latitude: lat,
                    longitude: lng,
                    heading: heading || 0,
                    speed: speed || 0
                });

                // 2. Emit via Firebase Realtime DB for live passenger tracking map
                pushDriverLocationRealtime(rideId, { lat, lng }, { heading, speed });
            },
            (err) => console.warn('ActiveTrip continuous background GPS watcher warning:', err),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [rideId]);

    const pickupAddressLabel = String(
        liveRaw?.pickupAddress ||
        liveRequest?.pickup ||
        effectiveState?.request?.pickup ||
        effectiveState?.pickupAddress ||
        '',
    ).trim();
    const dropAddressLabel = String(
        liveRaw?.dropAddress ||
        liveRequest?.drop ||
        effectiveState?.request?.drop ||
        effectiveState?.dropAddress ||
        '',
    ).trim();

    const pickupCoords = useMemo(
        () => readCoordinatePair(
            liveRaw?.pickup,
            liveRaw?.pickupLocation,
            liveRequest?.pickup,
            liveRequest?.pickupLocation,
            liveRequest?.raw?.pickup,
            liveRequest?.raw?.pickupLocation,
            effectiveState?.pickup,
            effectiveState?.pickupLocation,
            effectiveState?.request?.raw?.pickup,
            effectiveState?.request?.raw?.pickupLocation,
            effectiveState?.pickupCoords,
        ) || resolvedPickupCoords || DEFAULT_DRIVER_COORDS,
        [
            effectiveState?.pickup,
            effectiveState?.pickupCoords,
            effectiveState?.pickupLocation,
            effectiveState?.request?.raw?.pickup,
            effectiveState?.request?.raw?.pickupLocation,
            liveRaw?.pickup,
            liveRaw?.pickupLocation,
            liveRequest?.pickup,
            liveRequest?.pickupLocation,
            liveRequest?.raw?.pickup,
            liveRequest?.raw?.pickupLocation,
            resolvedPickupCoords,
        ],
    );
    const dropCoords = useMemo(
        () => readCoordinatePair(
            liveRaw?.drop,
            liveRaw?.dropLocation,
            liveRequest?.drop,
            liveRequest?.dropLocation,
            liveRequest?.raw?.drop,
            liveRequest?.raw?.dropLocation,
            effectiveState?.drop,
            effectiveState?.dropLocation,
            effectiveState?.request?.raw?.drop,
            effectiveState?.request?.raw?.dropLocation,
            effectiveState?.dropCoords,
        ) || resolvedDropCoords || [75.8937, 22.7533],
        [effectiveState?.drop, effectiveState?.dropCoords, effectiveState?.dropLocation, effectiveState?.request?.raw?.drop, effectiveState?.request?.raw?.dropLocation, liveRaw?.drop, liveRaw?.dropLocation, liveRequest?.drop, liveRequest?.dropLocation, liveRequest?.raw?.drop, liveRequest?.raw?.dropLocation, resolvedDropCoords],
    );
    const assignedDriverCoords = readCoordinatePair(
        liveRaw?.driverLocation,
        liveRequest?.driverLocation,
        effectiveState?.driverCoords,
        effectiveState?.currentDriverCoords,
        readStoredDriverCoords(),
    );

    const pickupPosition = useMemo(() => toLatLng(pickupCoords), [pickupCoords]);
    const dropPosition = useMemo(() => toLatLng(dropCoords), [dropCoords]);
    const initialDriverPosition = useMemo(
        () => assignedDriverCoords ? toLatLng(assignedDriverCoords, pickupPosition) : createOffsetPosition(pickupPosition),
        [assignedDriverCoords, pickupPosition],
    );

    const [phase, setPhase] = useState(() => {
        const initialState = storedActiveTripSnapshot || routeState;
        const initialJob = initialState?.request?.raw || initialState?.request || initialState || {};

        return resolvePhaseFromJob({
            ...initialJob,
            rideId: routeRideId || getJobRideId(initialState?.request || initialState),
            phase: initialState?.phase || initialJob?.phase || '',
        });
    });
    const [otp, setOtp] = useState(['', '', '', '']);
    const [otpError, setOtpError] = useState('');
    const [selectedRating, setSelectedRating] = useState(0);
    const [driverPaymentStatus, setDriverPaymentStatus] = useState('pending');
    const [selectedPaymentMode, setSelectedPaymentMode] = useState('');
    const [paymentQr, setPaymentQr] = useState(null);
    const [paymentQrError, setPaymentQrError] = useState('');
    const [isGeneratingPaymentQr, setIsGeneratingPaymentQr] = useState(false);
    const [arrivalGuardError, setArrivalGuardError] = useState('');
    const [localArrivedAt, setLocalArrivedAt] = useState('');
    const [localDestinationArrivedAt, setLocalDestinationArrivedAt] = useState('');
    const [waitingNow, setWaitingNow] = useState(Date.now());
    const [receivedTip, setReceivedTip] = useState(null);

    useEffect(() => {
        const socket = socketService.connect({ role: 'driver' });
        const onTipReceived = (data) => {
            if (data?.tipAmount) {
                setReceivedTip(data);
                toast.success(`🎉 Tip Received: Rs ${data.tipAmount} from passenger!`, { duration: 6000 });
            }
        };
        if (socket) {
            socketService.on('ride:tip:received', onTipReceived);
        }
        return () => {
            if (socket) {
                socketService.off('ride:tip:received', onTipReceived);
            }
        };
    }, []);
    const [map, setMap] = useState(null);
    const [driverPosition, setDriverPosition] = useState(initialDriverPosition);
    const [driverHeading, setDriverHeading] = useState(null);
    const [routePath, setRoutePath] = useState([]);
    const [routeError, setRouteError] = useState('');
    const [isSimulationEnabled, setIsSimulationEnabled] = useState(false);
    const [isSimulationRunning, setIsSimulationRunning] = useState(false);
    const [simulationStep, setSimulationStep] = useState(0);
    const { isLoaded, loadError } = useAppGoogleMapsLoader();
    const simulationPathRef = React.useRef([]);
    const simulationTimerRef = React.useRef(null);
    const isSimulationEnabledRef = React.useRef(false);
    const hasResolvedLivePositionRef = React.useRef(false);
    const hasHydratedUiStateRef = React.useRef(false);
    const mapFrameKeyRef = React.useRef('');
    const directionsServiceRef = React.useRef(null);
    const routeRequestVersionRef = React.useRef(0);
    const lastRouteFetchAtRef = React.useRef(0);
    const lastRouteDestinationKeyRef = React.useRef('');
    const lastRoutePhaseRef = React.useRef('');
    const routePathRef = React.useRef([]);
    const driverPositionRef = React.useRef(initialDriverPosition);
    const activeDestinationRef = React.useRef(null);
    const phaseRef = React.useRef(phase);
    const isSimulationRunningRef = React.useRef(false);
    const isRouteFetchInFlightRef = React.useRef(false);
    const simulationRouteFetchDoneRef = React.useRef(false);

    const activeDestination = useMemo(
        () => (phase === 'to_pickup' || phase === 'otp_verification' ? pickupPosition : dropPosition),
        [dropPosition, phase, pickupPosition],
    );
    const pickupDistanceMeters = useMemo(
        () => getDistanceMeters(driverPosition, pickupPosition),
        [driverPosition, pickupPosition],
    );
    const dropDistanceMeters = useMemo(
        () => getDistanceMeters(driverPosition, dropPosition),
        [driverPosition, dropPosition],
    );
    const riderDistanceLabel = useMemo(
        () => formatDistanceLabel(pickupDistanceMeters),
        [pickupDistanceMeters],
    );

    useEffect(() => {
        driverPositionRef.current = driverPosition;
    }, [driverPosition]);

    useEffect(() => {
        activeDestinationRef.current = activeDestination;
    }, [activeDestination]);

    useEffect(() => {
        phaseRef.current = phase;
    }, [phase]);

    useEffect(() => {
        routePathRef.current = routePath;
    }, [routePath]);

    useEffect(() => {
        isSimulationRunningRef.current = isSimulationRunning;
    }, [isSimulationRunning]);

    const requestRouteRecalculation = useCallback((options = {}) => {
        const { force = false, destinationChanged = false } = options;

        if (isSimulationRunningRef.current) {
            return;
        }

        const origin = driverPositionRef.current;
        const destination = activeDestinationRef.current;

        if (!origin || !destination) {
            return;
        }

        const routeDistanceMeters = getDistanceMeters(origin, destination);

        if (routeDistanceMeters < MIN_ROUTE_POLYLINE_METERS) {
            const overlapPath = [origin];
            routePathRef.current = overlapPath;
            setRoutePath(overlapPath);
            setRouteError('');
            return;
        }

        if (destinationChanged) {
            routePathRef.current = [];
            setRoutePath([]);
        }

        if (!isLoaded || !window.google?.maps?.DirectionsService) {
            return;
        }

        if (isRouteFetchInFlightRef.current && !force && !destinationChanged) {
            return;
        }

        if (!directionsServiceRef.current) {
            directionsServiceRef.current = new window.google.maps.DirectionsService();
        }

        const requestVersion = routeRequestVersionRef.current + 1;
        routeRequestVersionRef.current = requestVersion;
        isRouteFetchInFlightRef.current = true;
        lastRouteFetchAtRef.current = Date.now();
        lastRouteDestinationKeyRef.current = getDestinationRouteKey(destination);
        lastRoutePhaseRef.current = phaseRef.current;

        directionsServiceRef.current.route(
            {
                origin,
                destination,
                travelMode: window.google.maps.TravelMode.DRIVING,
                provideRouteAlternatives: false,
            },
            (result, status) => {
                isRouteFetchInFlightRef.current = false;

                if (requestVersion !== routeRequestVersionRef.current) {
                    return;
                }

                if (isSimulationRunningRef.current) {
                    return;
                }

                if (status === 'OK') {
                    const nextPath = mapDirectionsOverviewPath(result);

                    if (nextPath.length > 1) {
                        routePathRef.current = nextPath;
                        setRoutePath(nextPath);
                        setRouteError('');
                        return;
                    }
                }
            },
        );
    }, [isLoaded]);

    const shouldRecalculateRoute = useCallback(() => {
        if (isSimulationRunningRef.current) {
            return false;
        }

        const destination = activeDestinationRef.current;
        const destinationKey = getDestinationRouteKey(destination);
        const currentPhase = phaseRef.current;
        const now = Date.now();
        const routeDistanceMeters = getDistanceMeters(
            driverPositionRef.current,
            destination,
        );

        if (routeDistanceMeters < MIN_ROUTE_POLYLINE_METERS) {
            return false;
        }

        if (destinationKey !== lastRouteDestinationKeyRef.current) {
            return true;
        }

        if (currentPhase !== lastRoutePhaseRef.current) {
            return true;
        }

        if (routePathRef.current.length < 2) {
            return true;
        }

        if (now - lastRouteFetchAtRef.current >= ROUTE_REFRESH_INTERVAL_MS) {
            return true;
        }

        const deviationMeters = getDistanceToPolylineMeters(
            driverPositionRef.current,
            routePathRef.current,
        );

        return deviationMeters > ROUTE_DEVIATION_METERS;
    }, []);

    const evaluateRouteRefresh = useCallback(() => {
        if (!shouldRecalculateRoute()) {
            return;
        }

        const destinationKey = getDestinationRouteKey(activeDestinationRef.current);
        const destinationChanged = destinationKey !== lastRouteDestinationKeyRef.current;

        requestRouteRecalculation({
            force: destinationChanged,
            destinationChanged,
        });
    }, [requestRouteRecalculation, shouldRecalculateRoute]);

    useEffect(() => {
        if (isSimulationRunning) {
            return;
        }

        requestRouteRecalculation({
            force: true,
            destinationChanged: true,
        });
    }, [activeDestination, isLoaded, isSimulationRunning, phase, requestRouteRecalculation, rideId]);

    useEffect(() => {
        if (isSimulationRunning) {
            return undefined;
        }

        const intervalId = window.setInterval(() => {
            evaluateRouteRefresh();
        }, ROUTE_WATCH_INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, [evaluateRouteRefresh, isSimulationRunning]);

    useEffect(() => {
        const currentStatus = String(
            liveRaw?.liveStatus ||
            liveRaw?.status ||
            liveRequest?.liveStatus ||
            liveRequest?.status ||
            effectiveState?.liveStatus ||
            effectiveState?.status ||
            '',
        ).toLowerCase();

        if (currentStatus === 'cancelled' || currentStatus === 'canceled' || phase === 'cancelled') {
            exitToDriverHome('Ride was cancelled by the user.');
        }
    }, [effectiveState?.liveStatus, effectiveState?.status, exitToDriverHome, liveRaw?.liveStatus, liveRaw?.status, liveRequest?.liveStatus, liveRequest?.status, phase]);

    useEffect(() => {
        const currentRideId = rideId || routeRideId;

        if (!currentRideId) {
            return undefined;
        }

        const socket = socketService.connect({ role: 'driver' });
        if (socket) {
            socketService.emit('ride:join', { rideId: currentRideId });
        }

        const handleTripClosed = (payload = {}) => {
            if (String(payload.rideId || '') !== String(currentRideId)) {
                return;
            }

            if (payload.cancellationBill) {
                setCancellationBillReceipt(payload.cancellationBill);
                setShowReceiptModal(true);
            } else {
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('User cancelled this ride.');
            }
        };

        const handleRideStatusUpdated = (payload = {}) => {
            if (String(payload.rideId || '') !== String(currentRideId)) {
                return;
            }

            const nextStatus = String(payload.liveStatus || payload.status || '').toLowerCase();
            if (nextStatus === 'cancelled' || nextStatus === 'canceled') {
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('Ride was cancelled by the user.');
            }
        };

        const handleRideState = (payload) => {
            if (!payload) {
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('Ride was cancelled or is no longer active.');
                return;
            }

            if (String(payload.rideId || payload._id || '') !== String(currentRideId)) {
                return;
            }

            const nextStatus = String(payload.liveStatus || payload.status || '').toLowerCase();
            if (nextStatus === 'cancelled' || nextStatus === 'canceled') {
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('Ride was cancelled by the user.');
            }
        };

        socketService.on('rideRequestClosed', handleTripClosed);
        socketService.on('rideCancelled', handleTripClosed);
        socketService.on('ride:status:updated', handleRideStatusUpdated);
        socketService.on('ride:state', handleRideState);

        return () => {
            socketService.off('rideRequestClosed', handleTripClosed);
            socketService.off('rideCancelled', handleTripClosed);
            socketService.off('ride:status:updated', handleRideStatusUpdated);
            socketService.off('ride:state', handleRideState);
        };
    }, [exitToDriverHome, rideId, routeRideId]);

    useEffect(() => {
        if (!rideId) {
            return;
        }

        writeStoredTripPhase(rideId, phase);
    }, [phase, rideId]);

    useEffect(() => {
        if (!rideId || hasHydratedUiStateRef.current) {
            return;
        }

        const storedUiState = readStoredTripUiState(rideId);
        hasHydratedUiStateRef.current = true;

        if (!storedUiState) {
            return;
        }

        if (typeof storedUiState.selectedPaymentMode === 'string') {
            setSelectedPaymentMode(storedUiState.selectedPaymentMode);
        }

        if (typeof storedUiState.driverPaymentStatus === 'string') {
            setDriverPaymentStatus(storedUiState.driverPaymentStatus);
        }

        if (storedUiState.paymentQr && typeof storedUiState.paymentQr === 'object') {
            setPaymentQr(storedUiState.paymentQr);
        }

        if (typeof storedUiState.paymentQrError === 'string') {
            setPaymentQrError(storedUiState.paymentQrError);
        }

        if (typeof storedUiState.selectedRating === 'number') {
            setSelectedRating(storedUiState.selectedRating);
        }

        if (typeof storedUiState.localArrivedAt === 'string') {
            setLocalArrivedAt(storedUiState.localArrivedAt);
        }

        if (typeof storedUiState.localDestinationArrivedAt === 'string') {
            setLocalDestinationArrivedAt(storedUiState.localDestinationArrivedAt);
        }
    }, [rideId]);

    useEffect(() => {
        if (!rideId || !hasHydratedUiStateRef.current) {
            return;
        }

        writeStoredTripUiState(rideId, {
            selectedPaymentMode,
            driverPaymentStatus,
            paymentQr,
            paymentQrError,
            selectedRating,
            localArrivedAt,
            localDestinationArrivedAt,
        });
    }, [driverPaymentStatus, localArrivedAt, localDestinationArrivedAt, paymentQr, paymentQrError, rideId, selectedPaymentMode, selectedRating]);

    useEffect(() => {
        if (!rideId || !effectiveState) {
            return;
        }

        const rawJob = liveRaw?.rideId || liveRaw?._id || liveRaw?.id
            ? liveRaw
            : liveRequest?.rideId || liveRequest?._id || liveRequest?.id
                ? liveRequest?.raw || liveRequest
                : effectiveState?.request?.raw || effectiveState;

        const derivedLiveStatus =
            phase === 'otp_verification'
                ? 'arriving'
                : phase === 'in_trip'
                    ? 'started'
                    : phase === 'payment_confirm'
                        ? 'arrived'
                        : phase === 'review'
                            ? 'completed'
                            : rawJob?.liveStatus || rawJob?.status || 'accepted';
        const derivedStatus =
            phase === 'in_trip' || phase === 'payment_confirm'
                ? 'ongoing'
                : phase === 'review'
                    ? 'completed'
                    : rawJob?.status || derivedLiveStatus;
        const nextPersistedState = buildPersistedTripState(rawJob, {
            phase,
            liveStatus: derivedLiveStatus,
            status: derivedStatus,
            arrivedAt: localArrivedAt || rawJob?.arrivedAt || '',
            startedAt: rawJob?.startedAt || '',
        });
        if (nextPersistedState) {
            writeStoredActiveTripSnapshot(nextPersistedState);
        }
    }, [effectiveState, liveRaw, liveRequest, localArrivedAt, phase, rideId]);

    useEffect(() => {
        if (!rideId || hydratedTripState) {
            return;
        }

        const routeJob = liveRaw?.rideId || liveRaw?._id || liveRaw?.id
            ? liveRaw
            : liveRequest?.rideId || liveRequest?._id || liveRequest?.id
                ? liveRequest
                : effectiveState;

        const restoredPhase = resolvePhaseFromJob({
            ...routeJob,
            rideId,
        });

        setPhase((current) => (current === 'to_pickup' ? restoredPhase : current));
    }, [effectiveState, hydratedTripState, liveRaw, liveRequest, rideId]);

    useEffect(() => {
        setResolvedPickupCoords(null);
        setResolvedDropCoords(null);
    }, [rideId]);

    useEffect(() => {
        if (!isLoaded || !window.google?.maps?.Geocoder) {
            return;
        }

        const geocoder = new window.google.maps.Geocoder();
        let active = true;

        const resolveAddressCoords = (address, setter) => {
            const trimmedAddress = String(address || '').trim();

            if (!trimmedAddress) {
                return;
            }

            geocoder.geocode({ address: trimmedAddress }, (results, status) => {
                if (!active || status !== 'OK' || !results?.[0]?.geometry?.location) {
                    return;
                }

                const locationPoint = results[0].geometry.location;
                setter([locationPoint.lng(), locationPoint.lat()]);
            });
        };

        if (!readCoordinatePair(
            liveRaw?.pickup,
            liveRaw?.pickupLocation,
            liveRequest?.pickup,
            liveRequest?.pickupLocation,
            liveRequest?.raw?.pickup,
            liveRequest?.raw?.pickupLocation,
            effectiveState?.pickup,
            effectiveState?.pickupLocation,
            effectiveState?.request?.raw?.pickup,
            effectiveState?.request?.raw?.pickupLocation,
            effectiveState?.pickupCoords,
        ) && pickupAddressLabel) {
            resolveAddressCoords(pickupAddressLabel, setResolvedPickupCoords);
        }

        if (!readCoordinatePair(
            liveRaw?.drop,
            liveRaw?.dropLocation,
            liveRequest?.drop,
            liveRequest?.dropLocation,
            liveRequest?.raw?.drop,
            liveRequest?.raw?.dropLocation,
            effectiveState?.drop,
            effectiveState?.dropLocation,
            effectiveState?.request?.raw?.drop,
            effectiveState?.request?.raw?.dropLocation,
            effectiveState?.dropCoords,
        ) && dropAddressLabel) {
            resolveAddressCoords(dropAddressLabel, setResolvedDropCoords);
        }

        return () => {
            active = false;
        };
    }, [
        dropAddressLabel,
        effectiveState?.dropCoords,
        effectiveState?.drop,
        effectiveState?.dropLocation,
        effectiveState?.pickup,
        effectiveState?.pickupCoords,
        effectiveState?.pickupLocation,
        effectiveState?.request?.raw?.drop,
        effectiveState?.request?.raw?.dropLocation,
        effectiveState?.request?.raw?.pickup,
        effectiveState?.request?.raw?.pickupLocation,
        isLoaded,
        liveRaw?.drop,
        liveRaw?.dropLocation,
        liveRaw?.pickup,
        liveRaw?.pickupLocation,
        liveRequest?.drop,
        liveRequest?.dropLocation,
        liveRequest?.pickup,
        liveRequest?.pickupLocation,
        liveRequest?.raw?.drop,
        liveRequest?.raw?.dropLocation,
        liveRequest?.raw?.pickup,
        liveRequest?.raw?.pickupLocation,
        pickupAddressLabel,
    ]);

    const fareAmount = useMemo(() => {
        const candidates = [
            liveRaw?.fare,
            liveRaw?.baseFare,
            liveRaw?.baseRideFare,
            liveRaw?.estimatedFare,
            liveRaw?.estimatedFare?.approx,
            liveRaw?.estimatedFare?.min,
            liveRaw?.pricingSnapshot?.fare,
            liveRaw?.parcel?.fare,
            liveRequest?.fare,
            effectiveState?.fare,
            effectiveState?.baseFare,
            effectiveState?.request?.fare,
            effectiveState?.request?.raw?.fare,
            effectiveState?.estimatedFare,
        ];

        for (const candidate of candidates) {
            const num = parseFareAmount(candidate);
            if (num > 0) return num;
        }
        return parseFareAmount(liveRequest?.fare || effectiveState?.fare || 0);
    }, [effectiveState?.baseFare, effectiveState?.estimatedFare, effectiveState?.fare, effectiveState?.request?.fare, effectiveState?.request?.raw?.fare, liveRaw?.baseFare, liveRaw?.baseRideFare, liveRaw?.estimatedFare, liveRaw?.fare, liveRaw?.parcel?.fare, liveRaw?.pricingSnapshot?.fare, liveRequest?.fare]);

    const tripData = isParcel ? {
        sender: {
            name: liveRaw.parcel?.senderName || 'Sender',
            rating: '5.0',
            phone: liveRaw.parcel?.senderMobile || '',
        },
        receiver: {
            name: liveRaw.parcel?.receiverName || 'Receiver',
            phone: liveRaw.parcel?.receiverMobile || '',
        },
        pickup: getAreaName(liveRaw.pickupAddress || liveRequest?.pickup, formatAddressFromPoint(liveRaw.pickupLocation, 'Pickup area')),
        drop: getAreaName(liveRaw.dropAddress || liveRequest?.drop, formatAddressFromPoint(liveRaw.dropLocation, 'Drop area')),
        fare: `Rs ${fareAmount}`,
        payment: effectiveState?.paymentMethod || 'Online'
    } : {
        user: {
            name: liveRaw.user?.name || liveRequest?.user?.name || 'Passenger',
            rating: liveRaw.user?.rating || liveRequest?.user?.rating || '4.8',
            phone: liveRaw.user?.phone || liveRequest?.user?.phone || '',
        },
        pickup: getAreaName(liveRaw.pickupAddress || liveRequest?.pickup, formatAddressFromPoint(liveRaw.pickupLocation, 'Pickup area')),
        drop: getAreaName(liveRaw.dropAddress || liveRequest?.drop, formatAddressFromPoint(liveRaw.dropLocation, 'Drop area')),
        fare: `Rs ${fareAmount}`,
        payment: liveRequest?.payment || effectiveState?.paymentMethod || 'Online'
    };

    const displayFare = liveRequest?.fare || tripData.fare;
    const expectedOtp = String(liveRaw?.otp || liveRequest?.otp || effectiveState?.otp || '');
    const waitingPricing = liveRaw?.pricingSnapshot || liveRequest?.raw?.pricingSnapshot || effectiveState?.pricingSnapshot || {};
    const allowedPaymentModes = (() => {
        const rawItems = Array.isArray(waitingPricing?.allowed_payment_methods) ? waitingPricing.allowed_payment_methods : [];
        const normalized = [...new Set(
            rawItems
                .map((item) => String(item || '').trim().toLowerCase())
                .filter((item) => item === 'cash' || item === 'online')
        )];

        return normalized.length ? normalized : ['cash', 'online'];
    })();
    const waitingChargePerMinute = Math.max(0, Number(waitingPricing?.waiting_charge ?? 0));
    const freeWaitingBeforeMinutes = Math.max(0, Number(waitingPricing?.free_waiting_before ?? 0));
    const waitingStartedAt = localArrivedAt || liveRaw?.arrivedAt || liveRequest?.raw?.arrivedAt || effectiveState?.arrivedAt || '';
    const waitingElapsedSeconds = waitingStartedAt
        ? Math.max(0, Math.floor((waitingNow - new Date(waitingStartedAt).getTime()) / 1000))
        : 0;
    const freeWaitingRemainingSeconds = Math.max(0, freeWaitingBeforeMinutes * 60 - waitingElapsedSeconds);
    const waitingChargeableMinutes = Math.max(0, Math.ceil(waitingElapsedSeconds / 60) - freeWaitingBeforeMinutes);
    const liveWaitingChargeTotal = Math.round(waitingChargeableMinutes * waitingChargePerMinute * 100) / 100;
    const canMarkArrived = pickupDistanceMeters <= ARRIVAL_RADIUS_METERS;
    const canDeliverParcel = dropDistanceMeters <= ARRIVAL_RADIUS_METERS;
    const isWaitingForOtp = phase === 'otp_verification' && Boolean(waitingStartedAt);
    const pickupContact = isParcel ? tripData.sender : tripData.user;
    const destinationContact = isParcel ? tripData.receiver : tripData.user;
    const pickupArrivedAt = liveRaw?.arrivedAt || liveRequest?.raw?.arrivedAt || effectiveState?.arrivedAt || localArrivedAt || '';
    const tripStartedAt = liveRaw?.startedAt || liveRequest?.raw?.startedAt || effectiveState?.startedAt || '';
    const tripDestinationArrivedAt = localDestinationArrivedAt || '';
    const pickupWaitingSummary = useMemo(
        () => computePickupWaitingCharge({
            arrivedAt: pickupArrivedAt,
            startedAt: tripStartedAt,
            freeWaitingBeforeMinutes,
            waitingChargePerMinute,
        }),
        [freeWaitingBeforeMinutes, pickupArrivedAt, tripStartedAt, waitingChargePerMinute],
    );
    const previousCancellationFee = Number(liveRaw?.previousCancellationFee || effectiveState?.previousCancellationFee || 0);
    const baseRideFare = Math.max(0, Number(liveRaw?.baseRideFare || effectiveState?.baseRideFare || (fareAmount - previousCancellationFee)));
    const totalFareAmount = fareAmount + pickupWaitingSummary.waitingChargeTotal;
    const tripArrivedAt = tripDestinationArrivedAt;
    const tripDurationLabel = formatDurationLabel(tripStartedAt, tripDestinationArrivedAt || Date.now());
    const tripSummaryTitle = isParcel ? 'Delivery Summary' : 'Ride Summary';
    const tripSummarySubtitle = isParcel ? 'Review the delivery details before you close the order.' : 'Review the trip details before you close the ride.';
    const destinationRoleLabel = isParcel ? 'Receiver' : 'Rider';
    const paymentModeLabel = selectedPaymentMode
        ? (selectedPaymentMode === 'cash' ? 'Cash' : 'Online')
        : (effectiveState?.paymentMethod || liveRequest?.payment || tripData.payment || 'Pending');
    const commissionSummary = computeCommissionSummary({
        fare: baseRideFare + pickupWaitingSummary.waitingChargeTotal,
        pricingSnapshot: waitingPricing,
        explicitCommissionAmount: liveRaw?.commissionAmount ?? effectiveState?.commissionAmount,
        explicitDriverEarnings: liveRaw?.driverEarnings ?? effectiveState?.driverEarnings,
    });
    const collectibleFareLabel = formatCurrencyAmount(totalFareAmount);
    const paymentCollectionLabel = isParcel ? 'receiver' : 'rider';
    const routeStrokeColor = '#000000';
    const routeAccentSoft = hexToRgba(routeStrokeColor, 0.08);
    const routeAccentMuted = hexToRgba(routeStrokeColor, 0.18);
    const routeAccentBorder = hexToRgba(routeStrokeColor, 0.18);
    const simulationTotalSteps = Math.max(0, simulationPathRef.current.length - 1);
    const simulationProgress = simulationTotalSteps > 0
        ? Math.min(100, Math.round((simulationStep / simulationTotalSteps) * 100))
        : 0;
    const displayDriverHeading = useMemo(() => {
        if (Number.isFinite(Number(driverHeading))) {
            return normalizeHeading(driverHeading);
        }

        return getRouteHeading(
            driverPosition,
            routePath,
            calculateBearing(driverPosition, activeDestination),
        );
    }, [activeDestination, driverHeading, driverPosition, routePath]);
    const displayDriverHeadingRef = React.useRef(displayDriverHeading);

    const callContact = (phone) => {
        const cleanPhone = cleanPhoneNumber(phone);

        if (!cleanPhone) {
            window.alert('Phone number is not available for this trip yet.');
            return;
        }

        window.open(`tel:${cleanPhone}`, '_self');
    };

    const openTripChat = () => {
        navigate('/taxi/driver/chat', {
            state: {
                rideId,
                peer: {
                    name: pickupContact?.name || 'Passenger',
                    phone: pickupContact?.phone || '',
                    subtitle: `${isParcel ? 'Sender' : 'Passenger'} - Active now`,
                    role: isParcel ? 'Sender' : 'Passenger',
                },
            },
        });
    };

    const openGoogleMapsNavigation = () => {
        if (activeDestination && activeDestination.lat && activeDestination.lng) {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${activeDestination.lat},${activeDestination.lng}&travelmode=driving`;
            window.open(url, '_blank');
        } else {
            window.alert('Destination coordinates are not available.');
        }
    };

    const openSupportChat = () => {
        navigate('/taxi/driver/support/chat', {
            state: {
                rideId,
                backPath: '/taxi/driver/active-trip',
                backState: {
                    ...effectiveState,
                    rideId,
                },
            },
        });
    };

    const triggerEmergencySos = () => {
        window.open('tel:112', '_self');
    };

    const publishRideStatus = (nextStatus, paymentMode = '') => {
        if (!rideId) {
            return;
        }

        const driverPaymentCollection = nextStatus === 'completed'
            ? buildDriverPaymentCollection({
                mode: paymentMode || selectedPaymentMode,
                status: driverPaymentStatus,
                paymentQr,
            })
            : null;

        socketService.emit('ride:status:update', {
            rideId,
            status: nextStatus,
            paymentMethod: paymentMode || undefined,
            ...(driverPaymentCollection ? { driverPaymentCollection } : {}),
        });
    };

    const completeRideAndExit = async () => {
        const paymentMode = selectedPaymentMode || effectiveState?.paymentMethod || liveRequest?.payment || '';

        try {
            if (rideId) {
                const driverToken = getLocalDriverToken();
                await api.patch(
                    `/rides/${rideId}/status`,
                    {
                        status: 'completed',
                        paymentMethod: paymentMode || undefined,
                        driverPaymentCollection: buildDriverPaymentCollection({
                            mode: paymentMode,
                            status: driverPaymentStatus,
                            paymentQr,
                        }) || undefined,
                    },
                    withDriverAuthorization(driverToken),
                );
            }
        } catch {
            // Keep going with the socket publish so the trip can still complete in transient API failure cases.
        }

        publishRideStatus('completed', paymentMode);
        clearStoredTripPhase(rideId);
        clearStoredTripUiState(rideId);
        navigate('/taxi/driver/home');
    };

    const completeRideForUserSync = async (paymentMode = '') => {
        if (!rideId) {
            return;
        }

        try {
            const driverToken = getLocalDriverToken();
            await api.patch(
                `/rides/${rideId}/status`,
                {
                    status: 'completed',
                    paymentMethod: paymentMode || undefined,
                    driverPaymentCollection: buildDriverPaymentCollection({
                        mode: paymentMode,
                        status: driverPaymentStatus,
                        paymentQr,
                    }) || undefined,
                },
                withDriverAuthorization(driverToken),
            );
        } catch {
            // The socket publish below remains as a realtime fallback for the rider side.
        }

        publishRideStatus('completed', paymentMode);
    };

    useEffect(() => {
        if (!waitingStartedAt || phase !== 'otp_verification') {
            return undefined;
        }

        setWaitingNow(Date.now());
        const intervalId = window.setInterval(() => {
            setWaitingNow(Date.now());
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [phase, waitingStartedAt]);

    const publishDriverLocation = (position, heading = displayDriverHeading) => {
        if (!rideId || !position) {
            return;
        }

        socketService.emit('ride:driver-location:update', {
            rideId,
            coordinates: [position.lng, position.lat],
            heading: normalizeHeading(heading),
            simulated: isSimulationEnabledRef.current,
        });
    };

    const stopSimulationTimer = () => {
        if (simulationTimerRef.current) {
            clearInterval(simulationTimerRef.current);
            simulationTimerRef.current = null;
        }
    };

    const startSimulation = () => {
        if (!simulationRouteFetchDoneRef.current) {
            simulationRouteFetchDoneRef.current = true;
            requestRouteRecalculation({ force: true });
        }

        const nextPath = getSimulationPath({
            routePath: routePathRef.current.length > 1 ? routePathRef.current : routePath,
            from: driverPosition,
            to: activeDestination,
        });

        if (nextPath.length < 2) {
            return;
        }

        stopSimulationTimer();
        simulationPathRef.current = nextPath;
        const nextHeading = getRouteHeading(nextPath[0], nextPath.slice(1), displayDriverHeading);
        setSimulationStep(0);
        setIsSimulationEnabled(true);
        setIsSimulationRunning(true);
        setRoutePath(nextPath);
        setDriverPosition(nextPath[0]);
        setDriverHeading(nextHeading);
        publishDriverLocation(nextPath[0], nextHeading);
    };

    const pauseSimulation = () => {
        stopSimulationTimer();
        setIsSimulationRunning(false);
    };

    const resumeSimulation = () => {
        if (simulationPathRef.current.length < 2) {
            startSimulation();
            return;
        }

        setIsSimulationEnabled(true);
        setIsSimulationRunning(true);
    };

    const resetSimulation = () => {
        stopSimulationTimer();
        simulationPathRef.current = [];
        simulationRouteFetchDoneRef.current = false;
        setIsSimulationEnabled(false);
        setIsSimulationRunning(false);
        setSimulationStep(0);
        setDriverPosition(initialDriverPosition);
        driverPositionRef.current = initialDriverPosition;
        const nextHeading = calculateBearing(initialDriverPosition, activeDestination, displayDriverHeading);
        setDriverHeading(nextHeading);
        publishDriverLocation(initialDriverPosition, nextHeading);
        requestRouteRecalculation({ force: true, destinationChanged: true });
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;

            const STEP = 0.0003;

            if (e.code === 'Space') {
                e.preventDefault();
                if (isSimulationRunningRef.current) {
                    pauseSimulation();
                } else if (isSimulationEnabledRef.current) {
                    resumeSimulation();
                } else {
                    startSimulation();
                }
            } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                e.preventDefault();
                setDriverPosition((prev) => {
                    if (!prev || !activeDestination) return prev;
                    const deltaLat = activeDestination.lat - prev.lat;
                    const deltaLng = activeDestination.lng - prev.lng;
                    const dist = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng) || 1;
                    const nextPos = {
                        lat: prev.lat + (deltaLat / dist) * STEP,
                        lng: prev.lng + (deltaLng / dist) * STEP,
                    };
                    const heading = calculateBearing(prev, nextPos, displayDriverHeading);
                    setDriverHeading(heading);
                    publishDriverLocation(nextPos, heading);
                    return nextPos;
                });
            } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                e.preventDefault();
                setDriverPosition((prev) => {
                    if (!prev || !activeDestination) return prev;
                    const deltaLat = activeDestination.lat - prev.lat;
                    const deltaLng = activeDestination.lng - prev.lng;
                    const dist = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng) || 1;
                    const nextPos = {
                        lat: prev.lat - (deltaLat / dist) * STEP,
                        lng: prev.lng - (deltaLng / dist) * STEP,
                    };
                    const heading = calculateBearing(prev, nextPos, displayDriverHeading);
                    setDriverHeading(heading);
                    publishDriverLocation(nextPos, heading);
                    return nextPos;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeDestination]);

    const generatePaymentQr = async () => {
        if (!rideId || !totalFareAmount) {
            setPaymentQrError('Ride fare is missing.');
            return;
        }

        setIsGeneratingPaymentQr(true);
        setPaymentQrError('');
        setPaymentQr(null);

        try {
            const response = await api.post('/drivers/payments/qr', {
                rideId,
                amount: totalFareAmount,
            });
            const qr = response?.data?.data || response?.data || {};

            if (!qr.imageUrl) {
                throw new Error('Payment QR image was not returned.');
            }

            setPaymentQr(qr);
            setDriverPaymentStatus('qr_generated');
        } catch (error) {
            setDriverPaymentStatus('pending');
            setPaymentQrError(error?.response?.data?.message || error?.message || 'Could not generate payment QR.');
        } finally {
            setIsGeneratingPaymentQr(false);
        }
    };

    const refreshPaymentStatus = async () => {
        if (!rideId || !paymentQr?.id) {
            return;
        }

        try {
            const response = await api.get('/drivers/payments/qr/status', {
                params: { rideId },
            });
            const status = response?.data?.data || response?.data || {};

            if (status?.paid || ['paid', 'captured', 'completed'].includes(String(status?.status || '').toLowerCase())) {
                setPaymentQr((current) => ({
                    ...(current || paymentQr),
                    status: status.status,
                    paidAt: status.paidAt || Date.now(),
                }));
                setPaymentQrError('');
                setDriverPaymentStatus('success');
            }
        } catch (error) {
            const message = error?.response?.data?.message || error?.message || '';
            if (message) {
                setPaymentQrError(message);
            }
        }
    };

    const handlePaymentModeSelect = (modeId) => {
        setSelectedPaymentMode(modeId);

        if (modeId === 'online') {
            generatePaymentQr();
            return;
        }

        setPaymentQr(null);
        setPaymentQrError('');
        setDriverPaymentStatus('success');
    };

    useEffect(() => {
        if (driverPaymentStatus !== 'qr_generated' || !paymentQr?.id) {
            return undefined;
        }

        refreshPaymentStatus();
        const intervalId = window.setInterval(refreshPaymentStatus, 3000);

        return () => window.clearInterval(intervalId);
    }, [driverPaymentStatus, paymentQr?.id, rideId]);

    const startTripAfterOtp = async (enteredOtp) => {
        if (String(enteredOtp).length !== 4) {
            setOtpError('Enter the full 4 digit PIN.');
            return;
        }

        if (String(enteredOtp) !== expectedOtp) {
            setOtpError('Wrong PIN. Ask the passenger again.');
            return;
        }

        setOtpError('');
        setLocalArrivedAt('');
        setPhase('in_trip');
        const startedAtIso = new Date().toISOString();
        const rawJobForSnapshot = liveRaw?.rideId || liveRaw?._id || liveRaw?.id
            ? liveRaw
            : liveRequest?.rideId || liveRequest?._id || liveRequest?.id
                ? liveRequest?.raw || liveRequest
                : effectiveState?.request?.raw || effectiveState;
        const optimisticSnapshot = buildPersistedTripState(rawJobForSnapshot, {
            phase: 'in_trip',
            liveStatus: 'started',
            status: 'ongoing',
            startedAt: startedAtIso,
            arrivedAt: rawJobForSnapshot?.arrivedAt || localArrivedAt || '',
        });

        if (optimisticSnapshot) {
            writeStoredActiveTripSnapshot(optimisticSnapshot);
            setHydratedTripState(optimisticSnapshot);
        }

        try {
            if (rideId) {
                const driverToken = getLocalDriverToken();
                await api.patch(
                    `/rides/${rideId}/status`,
                    { status: 'started' },
                    withDriverAuthorization(driverToken),
                );
            }
        } catch {
            // Keep the optimistic local state; socket/live hydration will reconcile when available.
        }

        publishRideStatus('started');
    };

    useEffect(() => {
        isSimulationEnabledRef.current = isSimulationEnabled;
    }, [isSimulationEnabled]);

    useEffect(() => {
        displayDriverHeadingRef.current = displayDriverHeading;
    }, [displayDriverHeading]);

    useEffect(() => {
        if (!isSimulationEnabled && !hasResolvedLivePositionRef.current) {
            setDriverPosition((currentPosition) =>
                arePositionsNearlyEqual(currentPosition, initialDriverPosition) ? currentPosition : initialDriverPosition,
            );
        }
    }, [initialDriverPosition, isSimulationEnabled]);

    useEffect(() => {
        let watchId = null;
        let cancelled = false;
        const socket = socketService.connect({ role: 'driver' });

        if (socket && rideId) {
            socketService.emit('ride:join', { rideId });
        }

        getCurrentCoords()
            .then((position) => {
                if (!cancelled && !isSimulationEnabledRef.current) {
                    hasResolvedLivePositionRef.current = true;
                    setDriverPosition((previousPosition) => {
                        const nextHeading = calculateBearing(previousPosition, position, displayDriverHeadingRef.current);
                        setDriverHeading(nextHeading);
                        publishDriverLocation(position, nextHeading);
                        return position;
                    });
                    driverPositionRef.current = position;
                    evaluateRouteRefresh();
                }
            })
            .catch(() => {});

        if (!navigator.geolocation) {
            return () => {
                cancelled = true;
            };
        }

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                if (cancelled || isSimulationEnabledRef.current) {
                    return;
                }

                const nextPosition = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                };

                setDriverPosition((previousPosition) => {
                    hasResolvedLivePositionRef.current = true;
                    const nextHeading = normalizeHeading(
                        pos.coords.heading,
                        calculateBearing(previousPosition, nextPosition, displayDriverHeadingRef.current),
                    );
                    setDriverHeading(nextHeading);
                    if (rideId) {
                        socketService.emit('ride:driver-location:update', {
                            rideId,
                            coordinates: [nextPosition.lng, nextPosition.lat],
                            heading: nextHeading,
                            speed: pos.coords.speed,
                        });
                        socketService.emit('locationUpdate', {
                            coordinates: [nextPosition.lng, nextPosition.lat],
                            lat: nextPosition.lat,
                            lng: nextPosition.lng,
                            heading: nextHeading,
                        });
                        socketService.emit('driver_location_update', {
                            coordinates: [nextPosition.lng, nextPosition.lat],
                            latitude: nextPosition.lat,
                            longitude: nextPosition.lng,
                            heading: nextHeading,
                        });
                        api.patch('/drivers/location', {
                            coordinates: [nextPosition.lng, nextPosition.lat],
                            lat: nextPosition.lat,
                            lng: nextPosition.lng,
                        }).catch(() => {});
                    }
                    driverPositionRef.current = nextPosition;
                    evaluateRouteRefresh();
                    return nextPosition;
                });
            },
            () => {},
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 15000,
            },
        );

        return () => {
            cancelled = true;
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }
        };
    }, [evaluateRouteRefresh, rideId]);

    useEffect(() => {
        stopSimulationTimer();

        if (!isSimulationRunning || simulationPathRef.current.length < 2) {
            return undefined;
        }

        simulationTimerRef.current = setInterval(() => {
            setSimulationStep((currentStep) => {
                const nextStep = Math.min(currentStep + 1, simulationPathRef.current.length - 1);
                const previousPosition = simulationPathRef.current[currentStep];
                const nextPosition = simulationPathRef.current[nextStep];

                if (nextPosition) {
                    const nextHeading = calculateBearing(
                        previousPosition,
                        nextPosition,
                        getRouteHeading(nextPosition, simulationPathRef.current.slice(nextStep + 1), displayDriverHeadingRef.current),
                    );
                    setDriverPosition(nextPosition);
                    setDriverHeading(nextHeading);
                    setRoutePath(simulationPathRef.current.slice(nextStep));
                    publishDriverLocation(nextPosition, nextHeading);
                    map?.panTo(nextPosition);
                }

                if (nextStep >= simulationPathRef.current.length - 1) {
                    stopSimulationTimer();
                    setIsSimulationRunning(false);
                }

                return nextStep;
            });
        }, 750);

        return () => stopSimulationTimer();
    }, [isSimulationRunning, map, rideId]);

    useEffect(() => () => stopSimulationTimer(), []);

    useEffect(() => {
        if (!map || !window.google?.maps) {
            return;
        }

        if (isSimulationRunning) {
            map.panTo(driverPosition);
            return;
        }

        const frameKey = [
            phase,
            activeDestination?.lat?.toFixed?.(5) || activeDestination?.lat,
            activeDestination?.lng?.toFixed?.(5) || activeDestination?.lng,
            routePath.length > 1 ? 'route' : 'direct',
        ].join(':');

        if (mapFrameKeyRef.current === frameKey) {
            return;
        }

        mapFrameKeyRef.current = frameKey;

        if (arePositionsNearlyEqual(driverPosition, activeDestination)) {
            map.setCenter(driverPosition);
            map.setZoom(15);
            return;
        }

        const bounds = new window.google.maps.LatLngBounds();

        if (routePath.length > 1) {
            routePath.forEach((point) => bounds.extend(point));
            bounds.extend(driverPosition);
            bounds.extend(activeDestination);
            map.fitBounds(bounds, 72);
            return;
        }

        bounds.extend(driverPosition);
        bounds.extend(activeDestination);
        map.fitBounds(bounds, 80);
    }, [activeDestination, driverPosition, isSimulationRunning, map, routePath]);

    const handleOTPChange = (index, value) => {
        const digits = String(value || '').replace(/\D/g, '');
        const nextOtp = [...otp];

        if (!digits) {
            nextOtp[index] = '';
            setOtp(nextOtp);
            setOtpError('');
            if (index > 0) {
                const previousInput = document.getElementById(`otp-${index - 1}`);
                if (previousInput) previousInput.focus();
            }
            return;
        }

        if (digits.length >= 4) {
            const pasted = digits.slice(0, 4).split('');
            const fullPastedOtp = ['', '', '', ''];
            pasted.forEach((char, i) => { fullPastedOtp[i] = char; });
            setOtp(fullPastedOtp);
            setOtpError('');
            const lastInput = document.getElementById(`otp-3`);
            if (lastInput) lastInput.focus();
            const pastedCode = fullPastedOtp.join('');
            if (pastedCode.length === 4) {
                if (pastedCode === expectedOtp) {
                    setTimeout(() => startTripAfterOtp(pastedCode), 250);
                } else {
                    setOtpError('Incorrect PIN. Please enter the PIN shown to the passenger.');
                }
            }
            return;
        }

        const newDigit = digits.slice(-1);
        nextOtp[index] = newDigit;
        setOtp(nextOtp);
        setOtpError('');

        if (newDigit && index < 3) {
            const nextInput = document.getElementById(`otp-${index + 1}`);
            if (nextInput) {
                nextInput.focus();
            }
        }

        const enteredOtp = nextOtp.join('');

        if (enteredOtp.length === 4 && enteredOtp === expectedOtp) {
            setTimeout(() => startTripAfterOtp(enteredOtp), 250);
            return;
        }

        if (enteredOtp.length === 4) {
            setOtpError('Incorrect PIN. Please enter the PIN shown to the passenger.');
        }
    };

    const handleOTPKeyDown = (index, event) => {
        if (event.key === 'Backspace') {
            if (!otp[index] && index > 0) {
                event.preventDefault();
                const nextOtp = [...otp];
                nextOtp[index - 1] = '';
                setOtp(nextOtp);
                setOtpError('');
                const previousInput = document.getElementById(`otp-${index - 1}`);
                if (previousInput) {
                    previousInput.focus();
                }
            }
        }
    };

    const mapOptions = useMemo(() => ({
        styles: mapStyles,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        gestureHandling: 'greedy',
    }), []);

    return (
        <div className="relative mx-auto min-h-[100dvh] max-w-lg overflow-hidden bg-slate-200 font-sans select-none">
            {isHydratingTrip && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-200/90 backdrop-blur-sm">
                    <div className="rounded-[16px] bg-white/95 px-4 py-3 shadow-sm text-[12px] font-semibold text-slate-700">
                        Restoring active trip...
                    </div>
                </div>
            )}
            <div className="absolute inset-0 z-0 overflow-hidden bg-slate-200">
                {!HAS_VALID_GOOGLE_MAPS_KEY ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-200 px-6 text-center">
                        <div className="rounded-[18px] bg-white/90 px-4 py-4 shadow-sm">
                            <p className="text-[12px] font-semibold text-slate-900">Google Maps key missing</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500">Set `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`.</p>
                        </div>
                    </div>
                ) : loadError ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-200 px-6 text-center">
                        <div className="rounded-[18px] bg-white/90 px-4 py-4 shadow-sm">
                            <p className="text-[12px] font-semibold text-slate-900">Google Maps failed to load</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500">Check the browser key restrictions and reload.</p>
                        </div>
                    </div>
                ) : isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={MAP_CONTAINER_STYLE}
                        center={pickupPosition}
                        zoom={14}
                        onLoad={setMap}
                        onUnmount={() => setMap(null)}
                        options={mapOptions}
                    >
                        {routePath.length > 1 && (
                            <>
                                <PolylineF
                                    path={routePath}
                                    options={{
                                        strokeColor: '#000000',
                                        strokeOpacity: 0.16,
                                        strokeWeight: 9,
                                        zIndex: 10,
                                    }}
                                />
                                <PolylineF
                                    path={routePath}
                                    options={{
                                        strokeColor: routeStrokeColor,
                                        strokeOpacity: 0.95,
                                        strokeWeight: 5,
                                        zIndex: 20,
                                    }}
                                />
                            </>
                        )}
                        <RotatingVehicleMarker
                            position={driverPosition}
                            iconUrl={vehicleIconUrl}
                            heading={displayDriverHeading}
                            title="Driver"
                        />
                        <MarkerF
                            position={activeDestination}
                            title={phase === 'to_pickup' || phase === 'otp_verification' ? 'Pickup' : 'Drop'}
                            icon={{
                                path: window.google.maps.SymbolPath.CIRCLE,
                                fillColor: routeStrokeColor,
                                fillOpacity: 1,
                                strokeColor: '#ffffff',
                                strokeWeight: 2,
                                scale: 7,
                            }}
                        />
                    </GoogleMap>
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-200">
                        <div className="rounded-[16px] bg-white/90 px-4 py-3 shadow-sm text-[12px] font-semibold text-slate-700">
                            Loading map
                        </div>
                    </div>
                )}

                <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-white/70 via-white/25 to-transparent pointer-events-none" />

                {(receivedTip || Number(liveRaw?.feedback?.tipAmount || effectiveState?.feedback?.tipAmount || 0) > 0) && (
                    <div className="absolute top-2 left-4 right-4 z-[55] flex items-center justify-between gap-3 bg-emerald-600 text-white p-3 rounded-2xl shadow-xl border border-emerald-400 animate-bounce">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white shrink-0">
                                <Sparkles size={20} className="text-amber-300 fill-amber-300" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-100">Tip Received!</p>
                                <p className="text-[13px] font-black text-white">
                                    +Rs {receivedTip?.tipAmount || Number(liveRaw?.feedback?.tipAmount || effectiveState?.feedback?.tipAmount || 0)} from Passenger
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <button
                    onClick={() => navigate(-1)}
                    className="absolute top-8 left-4 z-50 w-10 h-10 rounded-2xl bg-white/95 border border-white/80 shadow-lg flex items-center justify-center"
                >
                    <ArrowLeft size={18} className="text-slate-900" />
                </button>

                <div className="absolute top-8 left-16 right-4 z-50 flex items-center gap-3 bg-slate-900/92 backdrop-blur-xl p-3 rounded-2xl border border-white/10 shadow-2xl">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xl"
                        style={{ backgroundColor: routeStrokeColor }}
                    >
                        {isParcel ? <Package size={20} strokeWidth={2.5} /> : <img src={carIcon} alt="Taxi" className="h-7 w-7 object-contain" />}
                    </div>
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                        <h4 className="text-[9px] font-semibold uppercase tracking-wide leading-none flex items-center gap-2" style={{ color: routeStrokeColor }}>
                            Driver Live
                            <ArrowUpRight size={12} strokeWidth={3} />
                        </h4>
                        <p className="text-[13px] font-semibold text-white leading-tight truncate uppercase">
                            {phase === 'to_pickup' || phase === 'otp_verification' ? `Near ${tripData.pickup}` : `Toward ${tripData.drop}`}
                        </p>
                    </div>
                </div>

                <div className="absolute top-28 left-4 right-4 z-40 grid grid-cols-3 gap-1.5 sm:gap-2">
                    <div className="min-w-0 rounded-2xl bg-white/92 border border-white/80 shadow-lg px-2.5 sm:px-3 py-2">
                        <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.16em] sm:tracking-[0.22em] text-slate-400">Stage</p>
                        <p className="text-[10px] sm:text-[11px] font-black text-slate-900 mt-1 truncate">
                            {phase === 'to_pickup' ? 'To Pickup' : phase === 'otp_verification' ? 'Verify OTP' : phase === 'in_trip' ? 'On Trip' : phase === 'payment_confirm' ? 'Payment' : 'Complete'}
                        </p>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-white/92 border border-white/80 shadow-lg px-2.5 sm:px-3 py-2">
                        <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.16em] sm:tracking-[0.22em] text-slate-400">ETA</p>
                        <div className="flex items-center gap-1 mt-1">
                            <Clock3 size={11} style={{ color: routeStrokeColor }} />
                            <p className="text-[10px] sm:text-[11px] font-black text-slate-900 truncate">{phase === 'to_pickup' ? '2 mins' : '12 mins'}</p>
                        </div>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-white/92 border border-white/80 shadow-lg px-2.5 sm:px-3 py-2">
                        <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.16em] sm:tracking-[0.22em] text-slate-400">Route</p>
                        <div className="flex items-center gap-1 mt-1">
                            <MapPinned size={11} className="shrink-0 text-slate-500" />
                            <p className="truncate text-[10px] sm:text-[11px] font-black text-slate-900">{phase === 'to_pickup' ? 'Pickup' : 'Drop'}</p>
                        </div>
                    </div>
                </div>

                {routeError && (
                    <div className="absolute top-44 right-4 z-40 rounded-2xl bg-white/92 shadow-lg px-3 py-2 min-w-[148px]" style={{ border: `1px solid ${routeAccentBorder}` }}>
                        <p className="text-[8px] font-semibold uppercase tracking-[0.22em]" style={{ color: routeStrokeColor }}>Route</p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-700">Using fallback path while directions load.</p>
                    </div>
                )}

                <div className="absolute top-44 left-4 z-40 w-36 sm:w-40 max-w-[calc(100vw-2rem)] rounded-xl border border-white/80 bg-white/94 px-2.5 py-2 shadow-md backdrop-blur-md">
                    <div className="mb-1 flex items-center justify-between gap-1.5">
                        <div className="min-w-0">
                            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400">Simulation</p>
                            <p className="mt-0.5 truncate text-[10px] font-black text-slate-900">
                                {isSimulationRunning ? 'Following route' : isSimulationEnabled ? 'Paused' : 'Real GPS'}
                            </p>
                        </div>
                        <span
                            className={`h-2 w-2 shrink-0 rounded-full ${isSimulationRunning ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: isSimulationEnabled ? routeStrokeColor : '#cbd5e1' }}
                        />
                    </div>
                    <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-full rounded-full transition-all"
                            style={{ backgroundColor: routeStrokeColor, width: `${isSimulationEnabled ? simulationProgress : 0}%` }}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        <button
                            type="button"
                            onClick={isSimulationRunning ? pauseSimulation : isSimulationEnabled ? resumeSimulation : startSimulation}
                            className="h-7 rounded-lg px-1 text-[8px] font-black uppercase tracking-wide text-white active:scale-95"
                            style={{ backgroundColor: routeStrokeColor }}
                        >
                            {isSimulationRunning ? 'Pause' : isSimulationEnabled ? 'Resume' : 'Start'}
                        </button>
                        <button
                            type="button"
                            onClick={resetSimulation}
                            disabled={!isSimulationEnabled}
                            className="h-7 rounded-lg border border-slate-100 bg-slate-50 px-1 text-[8px] font-black uppercase tracking-wide text-slate-500 active:scale-95 disabled:opacity-40"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-40 max-h-[50vh] overflow-y-auto">
                <AnimatePresence mode="wait">
                    {phase === 'to_pickup' && (
                        <motion.div
                            key="to_pickup"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white rounded-t-[2rem] p-3.5 pb-5 shadow-2xl border-t border-slate-100"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center">
                                        {isParcel ? <Package size={16} className="text-slate-900" /> : <User size={16} className="text-slate-400" />}
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="text-[12px] font-semibold text-slate-900 tracking-tight uppercase">
                                            {isParcel ? tripData.sender.name : tripData.user.name}
                                        </h4>
                                        <div className="flex items-center gap-1 opacity-60">
                                            <Star size={9} fill={routeStrokeColor} className="text-black" />
                                            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-wide">
                                                {isParcel ? tripData.sender.rating : tripData.user.rating} • {riderDistanceLabel}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1.5">
                                    <button onClick={openTripChat} className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600 active:scale-95 transition-transform" aria-label="Open trip chat"><MessageSquare size={15} strokeWidth={2.5} /></button>
                                    <button onClick={openGoogleMapsNavigation} className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600 active:scale-95 transition-transform" aria-label="Navigate to destination"><Navigation size={15} strokeWidth={2.5} /></button>
                                    <button onClick={() => callContact(pickupContact?.phone)} className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center active:scale-95 transition-transform" style={{ color: routeStrokeColor }} aria-label="Call contact"><Phone size={15} strokeWidth={2.5} /></button>
                                </div>
                            </div>
                            <div className="mb-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-1.5">
                                <div className="flex items-center justify-between gap-2.5">
                                    <div>
                                        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Arrival Radius</p>
                                        <p className="mt-0.5 text-[11px] font-black text-slate-900">
                                            {pickupDistanceMeters >= 1000
                                                ? `${parseFloat((pickupDistanceMeters / 1000).toFixed(2))} km away from pickup`
                                                : `${Math.round(pickupDistanceMeters)} m away from pickup`}
                                        </p>
                                    </div>
                                    <div className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${canMarkArrived ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                        {canMarkArrived ? 'Unlocked' : 'Within 100 m'}
                                    </div>
                                </div>
                            </div>
                            {arrivalGuardError && (
                                <p className="-mt-1 mb-2 text-center text-[10px] font-black text-red-500 uppercase tracking-wider">
                                    {arrivalGuardError}
                                </p>
                            )}
                            <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    if (!canMarkArrived) {
                                        setArrivalGuardError('Reach within 100 meters of pickup before marking arrived.');
                                        return;
                                    }

                                    setArrivalGuardError('');
                                    setLocalArrivedAt(new Date().toISOString());
                                    setPhase('otp_verification');
                                    publishRideStatus('arriving');
                                }}
                                className={`w-full h-11 text-white rounded-xl flex items-center justify-center gap-2 text-[13px] font-semibold uppercase tracking-wide shadow-md transition-opacity ${canMarkArrived ? '' : 'opacity-70'}`}
                                style={{ backgroundColor: routeStrokeColor, boxShadow: `0 10px 20px ${routeAccentMuted}` }}
                            >
                                {isParcel ? 'Arrived at Sender' : 'I Have Arrived'} <CheckCircle2 size={16} strokeWidth={3} />
                            </motion.button>
                        </motion.div>
                    )}

                    {phase === 'otp_verification' && (
                        <motion.div
                            key="otp_verification"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white rounded-t-[2.5rem] p-6 pb-8 shadow-2xl border-t border-slate-100"
                        >
                            <div className="text-center mb-6">
                                <h3 className="text-xl font-semibold text-slate-900 tracking-tight uppercase leading-none">Security Pin</h3>
                                <p className="text-[10px] font-bold text-slate-400 tracking-wide uppercase mt-2">
                                    Ask <span className="text-slate-900">{isParcel ? 'Sender' : 'Passenger'}</span> for Start PIN
                                </p>
                            </div>
                            {isWaitingForOtp && (
                                <div className="mb-6 rounded-[24px] border border-amber-100 bg-amber-50/70 px-4 py-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm">
                                                <Clock3 size={18} strokeWidth={2.5} />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-600">Waiting Clock</p>
                                                <p className="mt-1 text-[22px] font-black tracking-tight text-slate-900">{formatTimerClock(waitingElapsedSeconds)}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Free Left</p>
                                            <p className="mt-1 text-[13px] font-black text-slate-900">{formatTimerClock(freeWaitingRemainingSeconds)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Free Before Ride</p>
                                            <p className="mt-1 text-[13px] font-black text-slate-900">{formatWholeMinutes(freeWaitingBeforeMinutes)}</p>
                                        </div>
                                        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Waiting Charge</p>
                                            <p className="mt-1 text-[13px] font-black text-slate-900">
                                                Rs {waitingChargePerMinute}/min
                                                {waitingChargeableMinutes > 0
                                                    ? ` • ${waitingChargeableMinutes} billable • Rs ${liveWaitingChargeTotal}`
                                                    : ''}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-center gap-3 mb-8">
                                {otp.map((digit, index) => (
                                    <input
                                        key={index}
                                        id={`otp-${index}`}
                                        type="tel"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleOTPChange(index, e.target.value)}
                                        onKeyDown={(e) => handleOTPKeyDown(index, e)}
                                        className="w-12 h-16 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-3xl font-semibold text-slate-900 focus:outline-none transition-all shadow-inner"
                                        style={{ '--tw-ring-color': routeStrokeColor, borderColor: routeAccentBorder }}
                                    />
                                ))}
                            </div>
                            {otpError && (
                                <p className="-mt-5 mb-5 text-center text-[11px] font-black text-red-500 uppercase tracking-wider">
                                    {otpError}
                                </p>
                            )}
                            <button
                                onClick={() => startTripAfterOtp(otp.join(''))}
                                className="mb-3 h-13 w-full rounded-xl text-[12px] font-black uppercase tracking-widest text-white shadow-lg active:scale-95 transition-all"
                                style={{ backgroundColor: routeStrokeColor, boxShadow: `0 16px 28px ${routeAccentMuted}` }}
                            >
                                Submit PIN
                            </button>
                            <div className="flex gap-3">
                                <button onClick={() => {
                                    setLocalArrivedAt('');
                                    setArrivalGuardError('');
                                    setPhase('to_pickup');
                                    publishRideStatus('accepted');
                                }} className="flex-1 h-13 border-2 border-slate-100 text-slate-400 rounded-xl text-[12px] font-semibold uppercase tracking-wide active:scale-95 transition-all">Go Back</button>
                                <button onClick={openSupportChat} className="flex-1 h-13 rounded-xl text-[12px] font-semibold uppercase tracking-wide active:scale-95 transition-all" style={{ backgroundColor: routeAccentSoft, color: routeStrokeColor }}>Support</button>
                            </div>
                        </motion.div>
                    )}

                    {phase === 'in_trip' && (
                        <motion.div
                            key="in_trip"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white rounded-t-[2rem] p-3.5 pb-5 shadow-2xl border-t border-slate-100"
                        >
                            <div className="mb-2 rounded-xl border border-slate-100 bg-slate-50/85 px-3 py-2 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                                <div className="flex items-center justify-between gap-2.5">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-[8px] font-semibold uppercase tracking-[0.22em] leading-none mb-1" style={{ color: routeStrokeColor }}>Destination</h4>
                                        <p className="text-[13px] font-semibold text-slate-900 tracking-tight leading-4 truncate">
                                            {tripData.drop}
                                        </p>
                                    </div>
                                    <button
                                        onClick={triggerEmergencySos}
                                        className="shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center active:scale-90 transition-transform shadow-sm"
                                        style={{ backgroundColor: routeAccentSoft, color: routeStrokeColor, borderColor: routeAccentBorder }}
                                        aria-label="Call emergency SOS"
                                    >
                                        <ShieldAlert size={16} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-2 mb-2 border border-slate-100 flex items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                                        {isParcel ? <Package size={15} className="text-white" /> : <User size={15} className="text-white opacity-40" />}
                                    </div>
                                    <div className="min-w-0 space-y-0.5">
                                        <p className="text-[12px] font-semibold text-slate-900 leading-none uppercase truncate">{isParcel ? tripData.receiver.name : tripData.user.name}</p>
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-wide">{isParcel ? 'Receiver' : 'Passenger'}</p>
                                    </div>
                                </div>
                                <button onClick={() => callContact(destinationContact?.phone)} className="shrink-0 w-8 h-8 bg-white rounded-lg border border-slate-100 flex items-center justify-center" style={{ color: routeStrokeColor }} aria-label="Call destination contact"><Phone size={15} strokeWidth={2.5} /></button>
                            </div>
                            {isParcel && (
                                <div className="mb-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-1.5">
                                    <div className="flex items-center justify-between gap-2.5">
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Delivery Radius</p>
                                            <p className="mt-0.5 text-[11px] font-black text-slate-900">
                                                {Math.round(dropDistanceMeters)} m away from receiver
                                            </p>
                                        </div>
                                        <div className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${canDeliverParcel ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                            {canDeliverParcel ? 'Unlocked' : 'Within 100 m'}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {isParcel && arrivalGuardError && (
                                <p className="-mt-1 mb-2 text-center text-[10px] font-black text-red-500 uppercase tracking-wider">
                                    {arrivalGuardError}
                                </p>
                            )}
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={() => {
                                    if (isParcel && !canDeliverParcel) {
                                        setArrivalGuardError('Reach within 100 meters of receiver before delivering parcel.');
                                        return;
                                    }

                                    setArrivalGuardError('');
                                    setLocalDestinationArrivedAt(new Date().toISOString());
                                    publishRideStatus('arrived');
                                    setSelectedPaymentMode('');
                                    setPaymentQr(null);
                                    setPaymentQrError('');
                                    setDriverPaymentStatus('pending');
                                    setPhase('payment_confirm');
                                }}
                                className={`w-full h-11 text-white rounded-xl flex items-center justify-center gap-2 text-[13px] font-semibold uppercase tracking-wide shadow-md transition-opacity ${isParcel && !canDeliverParcel ? 'opacity-70' : ''}`}
                                style={{ backgroundColor: routeStrokeColor, boxShadow: `0 10px 20px ${routeAccentMuted}` }}
                            >
                                {isParcel ? 'Deliver Parcel' : 'Arrived at Destination'} <ChevronRight size={16} strokeWidth={3} />
                            </motion.button>
                        </motion.div>
                    )}

                    {phase === 'payment_confirm' && (
                        <motion.div
                            key="payment_confirm"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white rounded-t-[2.5rem] p-6 pb-8 shadow-2xl border-t border-slate-100"
                        >
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-lg transition-all duration-500 text-white" style={{ backgroundColor: driverPaymentStatus === 'success' ? routeStrokeColor : '#0f172a' }}>
                                    {driverPaymentStatus === 'success' ? <Check size={32} strokeWidth={4} /> : <QrCode size={32} strokeWidth={2} />}
                                </div>
                                <h2 className="text-2xl font-semibold text-slate-900 uppercase">
                                    {driverPaymentStatus === 'success' ? 'Payment Success!' : tripSummaryTitle}
                                </h2>
                                <p className="text-[12px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                                    {driverPaymentStatus === 'success' ? 'Ready to close this trip' : tripSummarySubtitle}
                                </p>
                            </div>
                            <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-100 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
                                <div className="border-b border-slate-100 px-5 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: routeStrokeColor }}>
                                                {tripSummaryTitle}
                                            </p>
                                            <p className="mt-2 text-[24px] font-black tracking-tight text-slate-900">{collectibleFareLabel}</p>
                                            <p className="text-[11px] font-semibold text-slate-500">
                                                {pickupWaitingSummary.waitingChargeTotal > 0
                                                    ? `Includes Rs ${pickupWaitingSummary.waitingChargeTotal} waiting charge.`
                                                    : (isParcel ? 'Parcel delivered and awaiting payment confirmation.' : 'Passenger reached destination and ready to complete.')}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl px-3 py-2 text-right" style={{ backgroundColor: routeAccentSoft }}>
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Payment</p>
                                            <p className="mt-1 text-[13px] font-black text-slate-900">{paymentModeLabel}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 px-5 py-4">
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Clock3 size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Trip Started</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">{formatDateTimeLabel(tripStartedAt)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <CheckCircle2 size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Reached At</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">{formatDateTimeLabel(tripArrivedAt)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Clock3 size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Waiting Time</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">
                                            {pickupWaitingSummary.waitingSeconds > 0
                                                ? formatTimerClock(pickupWaitingSummary.waitingSeconds)
                                                : '--'}
                                        </p>
                                        {pickupWaitingSummary.chargeableMinutes > 0 && (
                                            <p className="mt-1 text-[10px] font-semibold text-amber-600">
                                                {pickupWaitingSummary.chargeableMinutes} billable min
                                            </p>
                                        )}
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Banknote size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Your Earnings</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">{formatCurrencyAmount(commissionSummary.driverEarnings)}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 px-5 pb-4">
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <ArrowUpRight size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Trip Duration</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">{tripDurationLabel}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Banknote size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Waiting Charge</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">
                                            {pickupWaitingSummary.waitingChargeTotal > 0
                                                ? formatCurrencyAmount(pickupWaitingSummary.waitingChargeTotal)
                                                : formatCurrencyAmount(0)}
                                        </p>
                                        <p className="mt-1 text-[10px] font-semibold text-slate-400">
                                            Free {formatWholeMinutes(freeWaitingBeforeMinutes)}
                                        </p>
                                    </div>
                                </div>
                                <div className="border-t border-slate-100 px-5 py-4">
                                    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1 flex flex-col items-center">
                                                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                                                <span className="my-1 h-10 w-px border-l border-dashed border-slate-200" />
                                                <span className="h-3 w-3 rounded-full bg-rose-500" />
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-4">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Pickup</p>
                                                    <p className="mt-1 text-[13px] font-bold leading-5 text-slate-900 break-words">{tripData.pickup}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Destination</p>
                                                    <p className="mt-1 text-[13px] font-bold leading-5 text-slate-900 break-words">{tripData.drop}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                                                    {isParcel ? <Package size={18} strokeWidth={2.5} /> : <User size={18} strokeWidth={2.5} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{destinationRoleLabel}</p>
                                                    <p className="mt-1 text-[14px] font-black text-slate-900 truncate">{destinationContact?.name || '--'}</p>
                                                    <p className="text-[11px] font-semibold text-slate-500">{destinationContact?.phone || 'Phone not available'}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => callContact(destinationContact?.phone)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-700" aria-label="Call destination contact">
                                                <Phone size={16} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className={`grid gap-3 border-t border-slate-100 px-5 py-4 ${previousCancellationFee > 0 ? (pickupWaitingSummary.waitingChargeTotal > 0 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4') : (pickupWaitingSummary.waitingChargeTotal > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}`}>
                                    <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Trip Fare</p>
                                        <p className="mt-2 text-[14px] font-black text-slate-900">{formatCurrencyAmount(baseRideFare)}</p>
                                    </div>
                                    {previousCancellationFee > 0 && (
                                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-700">Prev Cancel Fee</p>
                                            <p className="mt-2 text-[14px] font-black text-amber-900">{formatCurrencyAmount(previousCancellationFee)}</p>
                                        </div>
                                    )}
                                    {pickupWaitingSummary.waitingChargeTotal > 0 && (
                                        <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Waiting</p>
                                            <p className="mt-2 text-[14px] font-black text-slate-900">{formatCurrencyAmount(pickupWaitingSummary.waitingChargeTotal)}</p>
                                        </div>
                                    )}
                                    <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Admin Cut</p>
                                        <p className="mt-2 text-[14px] font-black text-slate-900">{formatCurrencyAmount(commissionSummary.commissionAmount)}</p>
                                        <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{commissionSummary.commissionLabel}</p>
                                    </div>
                                    <div className="rounded-2xl px-4 py-3 text-center text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]" style={{ backgroundColor: routeStrokeColor }}>
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/65">Driver Gets</p>
                                        <p className="mt-2 text-[14px] font-black text-white">{formatCurrencyAmount(commissionSummary.driverEarnings)}</p>
                                    </div>
                                </div>
                            </div>
                            {driverPaymentStatus === 'pending' && (
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    {[
                                        { id: 'cash', label: 'Cash', icon: Banknote },
                                        { id: 'online', label: 'Online', icon: Scan }
                                    ].filter((mode) => allowedPaymentModes.includes(mode.id)).map((mode) => (
                                        <button
                                            key={mode.id}
                                            onClick={() => handlePaymentModeSelect(mode.id)}
                                            disabled={isGeneratingPaymentQr}
                                            className="flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all bg-slate-50/50"
                                            style={selectedPaymentMode === mode.id ? { borderColor: routeStrokeColor, backgroundColor: routeAccentSoft } : undefined}
                                        >
                                            <mode.icon size={22} className={selectedPaymentMode === mode.id ? '' : 'text-slate-400'} style={selectedPaymentMode === mode.id ? { color: routeStrokeColor } : undefined} strokeWidth={2.5} />
                                            <span className="text-[9px] font-semibold text-slate-900 uppercase tracking-wide mt-2">
                                                {mode.id === 'online' && isGeneratingPaymentQr ? 'Generating' : mode.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {paymentQrError && (
                                <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-center">
                                    <p className="text-[11px] font-bold text-red-500">{paymentQrError}</p>
                                </div>
                            )}
                            {selectedPaymentMode === 'cash' && driverPaymentStatus === 'success' && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 rounded-3xl border border-emerald-100 bg-emerald-50/80 p-5 text-center shadow-lg">
                                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg" style={{ backgroundColor: routeStrokeColor }}>
                                        <Banknote size={24} strokeWidth={2.5} />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Cash Selected</p>
                                    <p className="mt-2 text-[16px] font-black text-slate-900">Collect {collectibleFareLabel} from the {paymentCollectionLabel}</p>
                                    <p className="mt-1 text-[11px] font-bold text-slate-500">
                                        Once you have the cash in hand, tap below to close this {isParcel ? 'delivery' : 'ride'}.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            await completeRideForUserSync('cash');
                                            setPhase('review');
                                        }}
                                        className="mt-4 w-full rounded-xl py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-lg"
                                        style={{ backgroundColor: routeStrokeColor, boxShadow: `0 16px 28px ${routeAccentMuted}` }}
                                    >
                                        Cash Received
                                    </button>
                                </motion.div>
                            )}
                            {driverPaymentStatus === 'qr_generated' && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl p-5 mb-6 text-center shadow-2xl text-white" style={{ backgroundColor: routeStrokeColor }}>
                                    <div className="bg-white p-3 rounded-2xl inline-block mb-3 relative overflow-hidden">
                                        <img
                                            src={paymentQr?.imageUrl}
                                            alt={`Payment QR for ${displayFare}`}
                                            className="h-36 w-36 object-contain"
                                        />
                                        <motion.div animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="absolute left-0 w-full h-0.5 bg-slate-200" />
                                    </div>
                                    <p className="text-white font-semibold text-sm uppercase tracking-wide">Scan to pay {displayFare}</p>
                                    <p className="text-white/45 text-[10px] font-semibold mt-1 mb-4 uppercase tracking-wide">
                                        Razorpay collection QR for this ride
                                    </p>
                                    {paymentQr?.linkUrl && (
                                        <a
                                            href={paymentQr.linkUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mb-3 block text-[10px] font-semibold uppercase tracking-wide text-white/70 underline underline-offset-4"
                                        >
                                            Open payment link
                                        </a>
                                    )}
                                <button onClick={() => setDriverPaymentStatus('success')} className="w-full py-3 bg-white/10 text-white rounded-xl text-[10px] font-semibold uppercase tracking-wide border border-white/5">Confirm Received</button>
                            </motion.div>
                            )}
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                disabled={driverPaymentStatus !== 'success' || selectedPaymentMode === 'cash'}
                                onClick={async () => {
                                    const paymentMode = selectedPaymentMode || effectiveState?.paymentMethod || liveRequest?.payment || '';
                                    await completeRideForUserSync(paymentMode);
                                    setPhase('review');
                                }}
                                className={`w-full h-15 rounded-xl flex items-center justify-center gap-3 text-[14px] font-semibold uppercase tracking-wide shadow-xl transition-all ${driverPaymentStatus === 'success' && selectedPaymentMode !== 'cash' ? 'text-white' : 'bg-slate-100 text-slate-300 pointer-events-none'}`}
                                style={driverPaymentStatus === 'success' && selectedPaymentMode !== 'cash' ? { backgroundColor: routeStrokeColor, boxShadow: `0 18px 30px ${routeAccentMuted}` } : undefined}
                            >
                                {selectedPaymentMode === 'cash'
                                    ? 'Use Cash Received Button'
                                    : driverPaymentStatus === 'success'
                                        ? 'Finalize Earnings'
                                        : 'Waiting...'} <ChevronRight size={18} strokeWidth={3} />
                            </motion.button>
                        </motion.div>
                    )}

                    {phase === 'review' && (
                        <motion.div
                            key="review"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-white rounded-t-[2.5rem] p-6 pb-8 shadow-2xl border-t border-slate-50 text-center"
                        >
                            <div className="mb-8 space-y-4">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto shadow-lg" style={{ backgroundColor: routeStrokeColor }}><User size={24} className="text-white" /></div>
                                <h3 className="text-xl font-semibold text-slate-900 uppercase tracking-tight">Rate Experience</h3>
                                <div className="flex justify-center gap-2">
                                    {[1, 2, 3, 4, 5].map((score) => (
                                        <Star
                                            key={score}
                                            size={28}
                                            onClick={() => setSelectedRating(score)}
                                            className={`transition-all ${score <= selectedRating ? '' : 'text-slate-300'}`}
                                            style={score <= selectedRating ? { color: selectedRating <= 2 ? '#ef4444' : selectedRating <= 4 ? '#eab308' : '#22c55e' } : undefined}
                                            fill={score <= selectedRating ? 'currentColor' : 'transparent'}
                                            strokeWidth={2}
                                        />
                                    ))}
                                </div>
                            </div>
                            <button onClick={completeRideAndExit} className="w-full h-15 text-white rounded-xl flex items-center justify-center gap-3 text-[14px] font-semibold uppercase tracking-wide shadow-xl active:scale-95 transition-all" style={{ backgroundColor: routeStrokeColor, boxShadow: `0 18px 30px ${routeAccentMuted}` }}>Done <Check size={20} strokeWidth={4} /></button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <CancellationReceiptModal
                isOpen={showReceiptModal}
                onClose={() => {
                    setShowReceiptModal(false);
                    exitToDriverHome('Ride cancelled.');
                }}
                cancellationBill={cancellationBillReceipt}
            />
        </div>
    );
};

export default ActiveTrip;
