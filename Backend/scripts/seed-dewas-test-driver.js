// Seeds one online Bike driver inside the Dewas zone that accepts both ride and parcel requests.
//   node scripts/seed-dewas-test-driver.js inspect   -> read-only, lists Dewas zone / locations / bike vehicles
//   node scripts/seed-dewas-test-driver.js seed      -> upserts the test driver
import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { Zone } from '../src/modules/taxi/driver/models/Zone.js';
import { ServiceLocation } from '../src/modules/taxi/admin/models/ServiceLocation.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { hashPassword } from '../src/modules/taxi/services/passwordService.js';

const PHONE = '9000000001';
const PASSWORD = 'Test@1234';
const mode = process.argv[2] || 'inspect';
const DEWAS_CENTER = [76.0331, 22.9804];
const DEWAS_RADIUS_METERS = 10000;

const circlePolygon = ([lng, lat], radiusMeters, steps = 64) => {
  const ring = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (2 * Math.PI * i) / steps;
    ring.push([
      Number((lng + (radiusMeters * Math.cos(angle)) / (111320 * Math.cos((lat * Math.PI) / 180))).toFixed(6)),
      Number((lat + (radiusMeters * Math.sin(angle)) / 110540).toFixed(6)),
    ]);
  }
  ring.push(ring[0]);
  return ring;
};

const zoneCenter = (zone) => {
  if (zone.circle_center?.lat != null && zone.circle_center?.lng != null) {
    return [zone.circle_center.lng, zone.circle_center.lat];
  }
  const ring = zone.geometry?.coordinates?.[0] || [];
  if (ring.length < 3) return null;
  const pts = ring.slice(0, -1);
  return [
    pts.reduce((sum, p) => sum + p[0], 0) / pts.length,
    pts.reduce((sum, p) => sum + p[1], 0) / pts.length,
  ];
};

// Same DNS workaround as src/config/db.js so the Atlas SRV lookup works on this machine.
dns.setServers(String(config.mongodbDnsServers || '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim()).filter(Boolean));
await mongoose.connect(config.mongodbUri, {
  serverSelectionTimeoutMS: 15000,
  family: 4,
});

try {
  const zones = await Zone.find({ name: /dewas/i }).lean();
  const locations = await ServiceLocation.find({ $or: [{ name: /dewas/i }, { service_location_name: /dewas/i }] }).lean();
  const bikes = await Vehicle.find({ $or: [{ icon_types: { $in: ['bike', 'scooter'] } }, { name: /bike/i }] })
    .select('name transport_type icon_types status active')
    .lean();

  console.log('zones:', zones.map((z) => ({ id: String(z._id), name: z.name, loc: String(z.service_location_id || ''), active: z.active, center: zoneCenter(z) })));
  console.log('service locations:', locations.map((l) => ({ id: String(l._id), name: l.name || l.service_location_name })));
  console.log('bike vehicles:', bikes.map((v) => ({ id: String(v._id), name: v.name, transport: v.transport_type, icon: v.icon_types, status: v.status })));

  if (mode !== 'seed') process.exit(0);

  // Dewas has no zone in the DB yet: create a 10 km circle (stored as a 64-point polygon) around the dev's location.
  let zone = zones.find((z) => z.active !== false) || zones[0];
  if (!zone) {
    let location = locations[0];
    if (!location) {
      location = (await ServiceLocation.create({
        name: 'Dewas',
        service_location_name: 'Dewas',
        address: 'Dewas, Madhya Pradesh, India',
        latitude: DEWAS_CENTER[1],
        longitude: DEWAS_CENTER[0],
        location: { type: 'Point', coordinates: DEWAS_CENTER },
        status: 'active',
        active: true,
      })).toObject();
    }
    zone = (await Zone.create({
      name: 'Dewas',
      service_location_id: location._id,
      unit: 'km',
      boundary_mode: 'circle',
      circle_center: { lat: DEWAS_CENTER[1], lng: DEWAS_CENTER[0] },
      circle_radius_meters: DEWAS_RADIUS_METERS,
      active: true,
      status: 'active',
      geometry: { type: 'Polygon', coordinates: [circlePolygon(DEWAS_CENTER, DEWAS_RADIUS_METERS)] },
    })).toObject();
    console.log('created service location + zone', String(location._id), String(zone._id));
  }
  const center = zoneCenter(zone);
  if (!center) throw new Error('Could not compute a point inside the Dewas zone');

  // transport_type "both" is the only kind that survives the ride filter (blocks delivery) and the parcel filter (blocks taxi/pooling).
  const bike = bikes.find((v) => v.transport_type === 'both' && v.status === 1) ||
    bikes.find((v) => v.transport_type === 'taxi' && v.status === 1) || bikes[0];
  if (!bike) throw new Error('No bike vehicle type found');

  const doc = {
    name: 'Dewas Test Driver',
    phone: PHONE,
    email: 'dewas.test.driver@example.com',
    gender: 'male',
    password: await hashPassword(PASSWORD),
    service_location_id: zone.service_location_id || locations[0]?._id || null,
    city: 'Dewas',
    zoneId: zone._id,
    vehicleType: 'bike',
    vehicleTypeId: bike._id,
    vehicleIconType: 'bike',
    vehicleMake: 'Honda',
    vehicleModel: 'Activa',
    vehicleNumber: 'MP41AB1234',
    vehicleColor: 'Black',
    registerFor: 'taxi',
    serviceCategories: ['taxi', 'delivery'],
    servicePreference: 'both',
    rideModePreference: 'both',
    approve: true,
    status: 'approved',
    isOnline: true,
    isOnRide: false,
    deletedAt: null,
    wallet: { balance: 1000, cashLimit: 5000, isBlocked: false },
    location: { type: 'Point', coordinates: center },
    onboarding: {
      vehicle: {
        vehicleTypeId: String(bike._id),
        vehicleType: bike.name,
        registerFor: 'taxi',
        serviceCategories: ['taxi', 'delivery'],
        make: 'Honda',
        model: 'Activa',
        number: 'MP41AB1234',
        color: 'Black',
      },
    },
  };

  const saved = await Driver.findOneAndUpdate({ phone: PHONE }, { $set: doc }, { upsert: true, new: true, setDefaultsOnInsert: true });
  console.log('seeded driver', String(saved._id), { phone: PHONE, password: PASSWORD, zone: zone.name, vehicle: bike.name, transport: bike.transport_type, location: center });
} finally {
  await mongoose.disconnect();
}
