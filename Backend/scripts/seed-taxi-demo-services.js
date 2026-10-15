// Seeds one demo record each for Bus, Outstation (intercity package) and Car Pooling, in the Indore area.
// Idempotent: running it again updates the same records instead of creating duplicates.
// Usage: node scripts/seed-taxi-demo-services.js
import dotenv from 'dotenv';
import dns from 'node:dns';
import mongoose from 'mongoose';

import { ServiceLocation } from '../src/modules/taxi/admin/models/ServiceLocation.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { SetPrice } from '../src/modules/taxi/admin/models/SetPrice.js';
import { RentalPackageType } from '../src/modules/taxi/admin/models/RentalPackageType.js';
import { BusService } from '../src/modules/taxi/admin/models/BusService.js';
import { PoolingVehicle } from '../src/modules/taxi/admin/models/PoolingVehicle.js';
import { PoolingRoute } from '../src/modules/taxi/admin/models/PoolingRoute.js';
import { createBusService } from '../src/modules/taxi/admin/services/adminService.js';

dotenv.config();

try {
  dns.setServers(String(process.env.MONGODB_DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim()).filter(Boolean));
} catch {
  /* keep system DNS */
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BUS_REG = 'MP09DEMO1001';
const POOL_VEHICLE_NUMBER = 'MP09POOL0001';
const POOL_ROUTE_CODE = 'DEMO-IND-UJN';
const OUTSTATION_DESTINATION = 'Ujjain';

const seat = (deck, row, code, variant) => ({
  kind: 'seat',
  id: `${deck}${row}${code}`,
  label: `${row}${code}`,
  variant,
  status: 'available',
});

const seaterDeck = (rows = 10) =>
  Array.from({ length: rows }, (_, index) => {
    const row = index + 1;
    return [seat('L', row, 'A', 'window'), seat('L', row, 'B', 'aisle'), { kind: 'aisle' }, seat('L', row, 'C', 'aisle'), seat('L', row, 'D', 'window')];
  });

const connect = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGODB_URI / MONGO_URI in environment.');
  const dbName = process.env.MONGODB_DB_NAME || undefined;
  await mongoose.connect(uri, dbName ? { dbName } : undefined);
};

const pickServiceLocation = async () => {
  const active = { $or: [{ active: true }, { active: 1 }, { status: 'active' }] };
  const indore = await ServiceLocation.findOne({
    ...active,
    $and: [{ $or: [{ name: /indore/i }, { service_location_name: /indore/i }] }],
  }).lean();
  if (indore) return indore;
  return (await ServiceLocation.findOne(active).lean()) || (await ServiceLocation.findOne().lean());
};

const pickCarVehicles = async () => {
  const all = await Vehicle.find({}).select('name icon_types transport_type active status').lean();
  const notCar = /bike|scoot|moto|auto|rickshaw|truck|lcv|hcv|mcv|loader|cycle|parcel|delivery/i;
  const usable = all.filter((v) => v.active !== false && v.active !== 0 && String(v.status || 'active') !== 'inactive');
  const cars = usable.filter((v) => !notCar.test(`${v.name} ${v.icon_types}`));
  return (cars.length ? cars : usable).slice(0, 2);
};

const seedOutstation = async (serviceLocation) => {
  const vehicles = await pickCarVehicles();
  if (!vehicles.length) {
    console.log('Outstation: skipped - no vehicle types exist in the DB. Add one in Admin > Vehicle Types first.');
    return;
  }

  let packageType = await RentalPackageType.findOne({ name: /outstation/i });
  if (!packageType) {
    packageType = await RentalPackageType.create({
      transport_type: 'taxi',
      name: 'Outstation',
      short_description: 'One-way and round trips to nearby cities',
      description: 'Outstation trips from the city to nearby destinations.',
      status: 'active',
      active: true,
    });
  }

  const prices = vehicles.map((vehicle, index) => ({
    vehicle_type: vehicle._id,
    base_price: index === 0 ? 1499 : 1999,
    free_distance: 55,
    distance_price: index === 0 ? 12 : 16,
    free_time: 120,
    time_price: 2,
  }));

  const doc = await SetPrice.findOneAndUpdate(
    { pricing_scope: 'package', package_destination: OUTSTATION_DESTINATION, package_type_id: packageType._id },
    {
      $set: {
        service_location_id: serviceLocation?._id || null,
        pricing_scope: 'package',
        transport_type: 'taxi',
        package_type_id: packageType._id,
        package_destination: OUTSTATION_DESTINATION,
        package_availability: 'available',
        package_vehicle_prices: prices,
        status: 'active',
        active: 1,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log(`Outstation: "Indore -> ${OUTSTATION_DESTINATION}" package ${doc._id} with ${prices.length} vehicle price(s): ${vehicles.map((v) => v.name).join(', ')}`);
};

const seedBus = async () => {
  const existing = await BusService.findOne({ registrationNumber: BUS_REG }).select('_id busName status').lean();
  if (existing) {
    await BusService.updateOne({ _id: existing._id }, { $set: { status: 'active' } });
    console.log(`Bus: already exists (${existing._id} "${existing.busName}"), made sure it is active.`);
    return;
  }

  const lowerDeck = seaterDeck(10);
  const bus = await createBusService({
    operatorName: 'Malwa Travels',
    busName: 'Indore Bhopal Express',
    serviceNumber: 'MT-101',
    coachType: 'AC Seater',
    busCategory: 'Seater',
    registrationNumber: BUS_REG,
    busColor: '#1f2937',
    seatPrice: 450,
    variantPricing: { seat: 450, window: 480, aisle: 450, sleeper: 450 },
    fareCurrency: 'INR',
    boardingPolicy: 'Reach 15 minutes before departure.',
    cancellationPolicy: 'Cancellation allowed up to 6 hours before departure.',
    luggagePolicy: 'One cabin bag and one check-in bag per passenger.',
    amenities: ['Charging Port', 'WiFi', 'Water Bottle', 'Live Tracking'],
    blueprint: { templateKey: 'seater_2_2', lowerDeck, upperDeck: [] },
    capacity: 40,
    route: {
      routeName: 'Indore - Bhopal',
      originCity: 'Indore',
      destinationCity: 'Bhopal',
      distanceKm: 195,
      durationHours: 4,
      stops: [
        { id: 'stop-ind', city: 'Indore', pointName: 'Vijay Nagar Square', stopType: 'pickup', arrivalTime: '07:00', departureTime: '07:00' },
        { id: 'stop-dew', city: 'Dewas', pointName: 'Dewas Bus Stand', stopType: 'pickup', arrivalTime: '07:45', departureTime: '07:50' },
        { id: 'stop-bho', city: 'Bhopal', pointName: 'ISBT Bhopal', stopType: 'drop', arrivalTime: '11:00', departureTime: '11:00' },
      ],
    },
    schedules: [
      { id: 'sch-morning', label: 'Morning Express', departureTime: '07:00', arrivalTime: '11:00', activeDays: DAYS, status: 'active' },
      { id: 'sch-evening', label: 'Evening Express', departureTime: '18:00', arrivalTime: '22:00', activeDays: DAYS, status: 'active' },
    ],
    status: 'active',
  });
  console.log(`Bus: created ${bus.id || bus._id} "Indore Bhopal Express" (Indore -> Bhopal, 40 seats, active).`);
};

const seedPooling = async () => {
  const blueprint = {
    rows: 3,
    cols: 2,
    layout: [
      { r: 0, c: 0, type: 'driver' },
      { r: 0, c: 1, type: 'seat' },
      { r: 1, c: 0, type: 'seat' },
      { r: 1, c: 1, type: 'seat' },
      { r: 2, c: 0, type: 'seat' },
      { r: 2, c: 1, type: 'empty' },
    ],
  };

  const vehicle = await PoolingVehicle.findOneAndUpdate(
    { vehicleNumber: POOL_VEHICLE_NUMBER },
    {
      $set: {
        name: 'Pool Sedan',
        vehicleModel: 'Maruti Dzire',
        vehicleNumber: POOL_VEHICLE_NUMBER,
        color: 'White',
        capacity: 4,
        vehicleType: 'sedan',
        blueprint,
        status: 'active',
        poolingEnabled: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const route = await PoolingRoute.findOneAndUpdate(
    { routeCode: POOL_ROUTE_CODE },
    {
      $set: {
        routeName: 'Indore to Ujjain Pool',
        routeCode: POOL_ROUTE_CODE,
        originLabel: 'Indore',
        destinationLabel: 'Ujjain',
        description: 'Shared car ride from Indore to Ujjain. Pay only for your seat.',
        assignedVehicleTypeIds: [vehicle._id],
        pickupPoints: [
          { id: 'pp-vijay', name: 'Vijay Nagar Square', address: 'Vijay Nagar, Indore', stopType: 'pickup', sequence: 1, etaMinutes: 0, latitude: 22.7533, longitude: 75.8937 },
          { id: 'pp-rajwada', name: 'Rajwada', address: 'Rajwada, Indore', stopType: 'pickup', sequence: 2, etaMinutes: 20, latitude: 22.7183, longitude: 75.8553 },
        ],
        dropPoints: [
          { id: 'dp-mahakal', name: 'Mahakal Temple', address: 'Jaisinghpura, Ujjain', stopType: 'drop', sequence: 1, etaMinutes: 90, latitude: 23.1828, longitude: 75.7681 },
          { id: 'dp-freeganj', name: 'Freeganj', address: 'Freeganj, Ujjain', stopType: 'drop', sequence: 2, etaMinutes: 100, latitude: 23.1765, longitude: 75.7885 },
        ],
        stops: [],
        schedules: [
          { id: 'pool-morning', label: 'Morning Pool', departureTime: '08:00', arrivalTime: '09:45', activeDays: DAYS, status: 'active' },
          { id: 'pool-evening', label: 'Evening Pool', departureTime: '17:30', arrivalTime: '19:15', activeDays: DAYS, status: 'active' },
        ],
        farePerSeat: 249,
        maxSeatsPerBooking: 3,
        maxAdvanceBookingHours: 72,
        boardingBufferMinutes: 10,
        status: 'active',
        active: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log(`Pooling: vehicle ${vehicle._id} (${POOL_VEHICLE_NUMBER}) + route ${route._id} "Indore to Ujjain Pool" (Rs 249/seat, active).`);
};

const run = async () => {
  await connect();
  console.log(`Connected to DB "${mongoose.connection.name}"`);
  const serviceLocation = await pickServiceLocation();
  console.log('Service location:', serviceLocation ? (serviceLocation.service_location_name || serviceLocation.name) : 'none found');

  for (const [label, task] of [
    ['Bus', seedBus],
    ['Outstation', () => seedOutstation(serviceLocation)],
    ['Pooling', seedPooling],
  ]) {
    try {
      await task();
    } catch (error) {
      console.error(`${label}: FAILED - ${error.message}`);
      process.exitCode = 1;
    }
  }
};

run()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
    process.exit();
  });
