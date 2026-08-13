import { ApiError } from '../../../utils/ApiError.js';
import { normalizePoint } from '../../../utils/geo.js';
import { DISPATCH_TOP_DRIVERS } from '../constants/index.js';
import { Vehicle } from '../admin/models/Vehicle.js';
import { Driver } from '../driver/models/Driver.js';
import { Zone } from '../driver/models/Zone.js';
import { getDriverIdsBlockedByUpcomingScheduledRides } from './rideService.js';

const EARTH_RADIUS_METERS = 6371000;

const normalizeVehicleKey = (value = '') => String(value || '').trim().toLowerCase();

const normalizeVehicleKeys = (vehicles = []) => {
  const keys = vehicles.flatMap((vehicle) => [
    vehicle?.name,
    vehicle?.vehicle_type,
    vehicle?.icon_types,
    String(vehicle?.name || '').replace(/\s+/g, '_'),
    String(vehicle?.icon_types || '').replace(/\s+/g, '_'),
  ]);

  return [...new Set(keys.map(normalizeVehicleKey).filter(Boolean))];
};

const normalizeVehicleTypeIds = (vehicleTypeIds = [], vehicleTypeId = null) => {
  const values = Array.isArray(vehicleTypeIds) ? vehicleTypeIds : [vehicleTypeIds];

  if (vehicleTypeId) {
    values.push(vehicleTypeId);
  }

  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
};

const TWO_WHEELER_KEYS = ['bike', 'scooter', '2wheeler', '2-wheeler', '2_wheeler', 'two_wheeler', 'twowheeler'];
const TRUCK_MOVER_KEYS = ['truck', 'lcv', 'hcv', 'mcv', 'loader', 'mover', 'movers', 'packers'];

const isTwoWheelerVehicle = (name = '', type = '', icon = '') => {
  const str = `${name} ${type} ${icon}`.toLowerCase();
  return TWO_WHEELER_KEYS.some((key) => str.includes(key));
};

const isTruckOrMoverVehicle = (name = '', type = '', icon = '') => {
  const str = `${name} ${type} ${icon}`.toLowerCase();
  return TRUCK_MOVER_KEYS.some((key) => str.includes(key));
};

const buildServiceCategoryFilter = (serviceType = 'ride') => {
  const norm = String(serviceType || '').toLowerCase().trim();

  if (norm === 'outstation' || norm === 'intercity') {
    const outstationKeys = [
      'outstation', 'Outstation', 'OUTSTATION',
      'both', 'Both', 'BOTH',
      'taxi,outstation', 'outstation,taxi',
      'Taxi,Outstation', 'Outstation,Taxi',
      'Taxi, Outstation', 'Outstation, Taxi',
    ];
    return {
      $or: [
        { serviceCategories: { $in: outstationKeys } },
        { service_categories: { $in: outstationKeys } },
        { registerFor: { $in: ['outstation', 'Outstation', 'OUTSTATION', 'both', 'Both', 'BOTH'] } },
        { 'onboarding.activeServices': { $in: outstationKeys } },
        { 'onboarding.registerFor': { $in: ['outstation', 'Outstation', 'both', 'Both', 'BOTH'] } },
      ],
    };
  }

  if (norm === 'parcel' || norm === 'delivery') {
    const deliveryKeys = [
      'delivery', 'Delivery', 'DELIVERY',
      'parcel', 'Parcel', 'PARCEL',
      'both', 'Both', 'BOTH',
      'taxi,delivery', 'delivery,taxi',
      'Taxi,Delivery', 'Delivery,Taxi',
      'Taxi, Delivery', 'Delivery, Taxi',
    ];
    return {
      $or: [
        { serviceCategories: { $in: deliveryKeys } },
        { service_categories: { $in: deliveryKeys } },
        { registerFor: { $in: ['delivery', 'Delivery', 'DELIVERY', 'both', 'Both', 'BOTH'] } },
        { 'onboarding.activeServices': { $in: deliveryKeys } },
        { 'onboarding.registerFor': { $in: ['delivery', 'Delivery', 'both', 'Both', 'BOTH'] } },
      ],
    };
  }

  if (norm === 'pooling') {
    const poolingKeys = [
      'pooling', 'Pooling', 'POOLING',
      'taxi', 'Taxi', 'TAXI',
      'both', 'Both', 'BOTH',
    ];
    return {
      $or: [
        { serviceCategories: { $in: poolingKeys } },
        { service_categories: { $in: poolingKeys } },
        { registerFor: { $in: ['pooling', 'Pooling', 'POOLING', 'taxi', 'Taxi', 'both', 'Both', 'BOTH'] } },
        { 'onboarding.activeServices': { $in: poolingKeys } },
      ],
    };
  }

  // Normal city ride / taxi
  const taxiKeys = [
    'taxi', 'Taxi', 'TAXI',
    'both', 'Both', 'BOTH',
    'city', 'City', 'CITY',
    'taxi,delivery', 'delivery,taxi',
    'Taxi,Delivery', 'Delivery,Taxi',
    'Taxi, Delivery', 'Delivery, Taxi',
    'taxi,outstation', 'outstation,taxi',
  ];
  return {
    $or: [
      { serviceCategories: { $size: 0 } },
      { serviceCategories: { $exists: false } },
      { serviceCategories: { $in: taxiKeys } },
      { service_categories: { $in: taxiKeys } },
      { registerFor: { $in: ['taxi', 'Taxi', 'TAXI', 'both', 'Both', 'BOTH', 'city'] } },
      { 'onboarding.activeServices': { $in: taxiKeys } },
    ],
  };
};

const buildDriverMatchFilters = ({ zoneId, vehicleTypeId, vehicleTypeIds, vehicleTypeKeys, allowedVehicles = [], serviceType = 'ride' }) => {
  const normalizedVehicleTypeIds = normalizeVehicleTypeIds(vehicleTypeIds, vehicleTypeId);
  const normalizedVehicleTypeKeys = Array.isArray(vehicleTypeKeys)
    ? [...new Set(vehicleTypeKeys.map(normalizeVehicleKey).filter(Boolean))]
    : [];
  const vehicleTypeClauses = [
    ...(normalizedVehicleTypeIds.length ? [{ vehicleTypeId: { $in: normalizedVehicleTypeIds } }] : []),
    ...(normalizedVehicleTypeKeys.length
      ? [
          { vehicleType: { $in: normalizedVehicleTypeKeys } },
          { vehicleIconType: { $in: normalizedVehicleTypeKeys } },
        ]
      : []),
  ];
  const vehicleTypeFilter =
    vehicleTypeClauses.length > 1
      ? { $or: vehicleTypeClauses }
      : vehicleTypeClauses[0] || {};

  const isRideTwoWheeler = allowedVehicles.some((v) => isTwoWheelerVehicle(v.name, v.vehicle_type, v.icon_types));
  const isRideTruckOrMover = allowedVehicles.some((v) => isTruckOrMoverVehicle(v.name, v.vehicle_type, v.icon_types));

  let categoryExclusionFilter = {};
  if (isRideTwoWheeler) {
    categoryExclusionFilter = {
      vehicleType: { $nin: TRUCK_MOVER_KEYS },
      vehicleIconType: { $nin: TRUCK_MOVER_KEYS },
    };
  } else if (isRideTruckOrMover) {
    categoryExclusionFilter = {
      vehicleType: { $nin: TWO_WHEELER_KEYS },
      vehicleIconType: { $nin: TWO_WHEELER_KEYS },
    };
  }

  const serviceCategoryFilter = buildServiceCategoryFilter(serviceType);

  const conditions = [
    { isOnline: true },
    { isOnRide: false },
    { 'wallet.isBlocked': { $ne: true } },
  ];

  if (zoneId) {
    conditions.push({ zoneId });
  }

  if (vehicleTypeFilter && Object.keys(vehicleTypeFilter).length > 0) {
    conditions.push(vehicleTypeFilter);
  }

  if (categoryExclusionFilter && Object.keys(categoryExclusionFilter).length > 0) {
    conditions.push(categoryExclusionFilter);
  }

  if (serviceCategoryFilter && Object.keys(serviceCategoryFilter).length > 0) {
    conditions.push(serviceCategoryFilter);
  }

  return { $and: conditions };
};

export const findZoneByPickup = async (pickupCoords) => {
  const coordinates = normalizePoint(pickupCoords, 'pickupCoords');

  // Zones are authoritative for dispatch, so every pickup must belong to one polygon.
  return Zone.findOne({
    geometry: {
      $geoIntersects: {
        $geometry: {
          type: 'Point',
          coordinates,
        },
      },
    },
  });
};

const toLocalMeters = (origin, target) => {
  const [originLng, originLat] = origin;
  const [targetLng, targetLat] = target;
  const originLatRadians = (originLat * Math.PI) / 180;
  const metersPerDegreeLat = (Math.PI * EARTH_RADIUS_METERS) / 180;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos(originLatRadians);

  return {
    x: (targetLng - originLng) * metersPerDegreeLng,
    y: (targetLat - originLat) * metersPerDegreeLat,
  };
};

const getDistanceToSegmentMeters = (origin, segmentStart, segmentEnd) => {
  const start = toLocalMeters(origin, segmentStart);
  const end = toLocalMeters(origin, segmentEnd);
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = (segmentX * segmentX) + (segmentY * segmentY);

  if (segmentLengthSquared <= 0) {
    return Math.hypot(start.x, start.y);
  }

  const projection = Math.max(
    0,
    Math.min(1, -((start.x * segmentX) + (start.y * segmentY)) / segmentLengthSquared),
  );
  const closestX = start.x + (projection * segmentX);
  const closestY = start.y + (projection * segmentY);

  return Math.hypot(closestX, closestY);
};

const getZoneBoundaryCapMeters = (zone, pickupCoords) => {
  const ring = Array.isArray(zone?.geometry?.coordinates?.[0]) ? zone.geometry.coordinates[0] : [];

  if (ring.length < 3) {
    return null;
  }

  let shortestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const segmentStart = normalizePoint(ring[index], `zone.geometry.coordinates[0][${index}]`);
    const segmentEnd = normalizePoint(ring[index + 1], `zone.geometry.coordinates[0][${index + 1}]`);
    const distanceMeters = getDistanceToSegmentMeters(pickupCoords, segmentStart, segmentEnd);

    if (Number.isFinite(distanceMeters) && distanceMeters < shortestDistance) {
      shortestDistance = distanceMeters;
    }
  }

  return Number.isFinite(shortestDistance) ? Math.max(0, Math.round(shortestDistance)) : null;
};

const getDistanceBetweenMeters = (origin, target) => {
  const [originLng, originLat] = origin;
  const [targetLng, targetLat] = target;

  const dLat = ((targetLat - originLat) * Math.PI) / 180;
  const dLng = ((targetLng - originLng) * Math.PI) / 180;
  const lat1 = (originLat * Math.PI) / 180;
  const lat2 = (targetLat * Math.PI) / 180;

  const a =
    (Math.sin(dLat / 2) ** 2) +
    (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLng / 2) ** 2));

  return Math.round(2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const buildGeoNearFilter = (field, coordinates, maxDistance) => ({
  [field]: {
    $near: {
      $geometry: {
        type: 'Point',
        coordinates,
      },
      $maxDistance: maxDistance,
    },
  },
});

const getDispatchAnchorCoordinates = (driver = {}) => {
  const routeCoordinates = Array.isArray(driver?.routeBooking?.anchorLocation?.coordinates)
    ? driver.routeBooking.anchorLocation.coordinates
    : [];

  if (driver?.routeBooking?.enabled && routeCoordinates.length === 2) {
    return routeCoordinates;
  }

  return Array.isArray(driver?.location?.coordinates) ? driver.location.coordinates : [];
};

const sortDriversByDispatchAnchorDistance = (drivers = [], pickupCoords) =>
  [...drivers]
    .map((driver) => {
      const anchorCoordinates = getDispatchAnchorCoordinates(driver);
      return {
        driver,
        distanceMeters:
          anchorCoordinates.length === 2
            ? getDistanceBetweenMeters(pickupCoords, anchorCoordinates)
            : Number.POSITIVE_INFINITY,
      };
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .map(({ driver }) => driver);

const findDriversForZone = async ({
  zoneId,
  coordinates,
  effectiveMaxDistance,
  limit,
  normalizedVehicleTypeIds,
  vehicleTypeKeys,
  allowedVehicles = [],
  serviceType = 'ride',
}) => {
  const commonFilters = buildDriverMatchFilters({
    zoneId,
    vehicleTypeIds: normalizedVehicleTypeIds,
    vehicleTypeKeys,
    allowedVehicles,
    serviceType,
  });
  const selectedFields =
    'name phone socketId vehicleTypeId vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel rating ratingCount location zoneId isOnline isOnRide routeBooking serviceCategories registerFor';

  const [liveLocationDrivers, routeBookingDrivers] = await Promise.all([
    Driver.find({
      ...commonFilters,
      'routeBooking.enabled': { $ne: true },
      ...buildGeoNearFilter('location', coordinates, effectiveMaxDistance),
    })
      .limit(limit)
      .select(selectedFields),
    Driver.find({
      ...commonFilters,
      'routeBooking.enabled': true,
      'routeBooking.anchorLocation': { $ne: null },
      'routeBooking.anchorLocation.coordinates.1': { $exists: true },
      ...buildGeoNearFilter('routeBooking.anchorLocation', coordinates, effectiveMaxDistance),
    })
      .limit(limit)
      .select(selectedFields),
  ]);

  return sortDriversByDispatchAnchorDistance(
    [...liveLocationDrivers, ...routeBookingDrivers].filter(
      (driver, index, items) => items.findIndex((item) => String(item._id) === String(driver._id)) === index,
    ),
    coordinates,
  ).slice(0, limit);
};

export const matchDrivers = async (pickupCoords, options = {}) => {
  const coordinates = normalizePoint(pickupCoords, 'pickupCoords');
  const {
    maxDistance = 3000,
    limit = DISPATCH_TOP_DRIVERS,
    vehicleTypeId,
    vehicleTypeIds,
    serviceType = 'ride',
  } = options;
  const normalizedVehicleTypeIds = normalizeVehicleTypeIds(vehicleTypeIds, vehicleTypeId);
  const allowedVehicles = normalizedVehicleTypeIds.length
    ? await Vehicle.find({ _id: { $in: normalizedVehicleTypeIds } }).select('name vehicle_type icon_types').lean()
    : [];
  const vehicleTypeKeys = normalizeVehicleKeys(allowedVehicles);

  const zone = await findZoneByPickup(coordinates);
  const effectiveMaxDistance = Math.max(1, Math.round(maxDistance));

  let drivers = await findDriversForZone({
    zoneId: zone?._id || undefined,
    coordinates,
    effectiveMaxDistance,
    limit,
    normalizedVehicleTypeIds,
    vehicleTypeKeys,
    allowedVehicles,
    serviceType,
  });

  const blockedDriverIds = await getDriverIdsBlockedByUpcomingScheduledRides(
    drivers.map((driver) => String(driver?._id || '')),
  );
  drivers = drivers.filter((driver) => !blockedDriverIds.has(String(driver?._id || '')));

  if (drivers.length === 0 && zone?._id) {
    drivers = await findDriversForZone({
      zoneId: undefined,
      coordinates,
      effectiveMaxDistance,
      limit,
      normalizedVehicleTypeIds,
      vehicleTypeKeys,
      allowedVehicles,
      serviceType,
    });

    const fallbackBlockedDriverIds = await getDriverIdsBlockedByUpcomingScheduledRides(
      drivers.map((driver) => String(driver?._id || '')),
    );
    drivers = drivers.filter((driver) => !fallbackBlockedDriverIds.has(String(driver?._id || '')));
  }

  return {
    zone,
    drivers,
    searchRadiusMeters: effectiveMaxDistance,
  };
};
