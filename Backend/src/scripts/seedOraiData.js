import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mongoose Models
import { ServiceLocation as TaxiServiceLocation } from '../modules/taxi/admin/models/ServiceLocation.js';
import { Zone as TaxiZone } from '../modules/taxi/driver/models/Zone.js';
import { FoodZone } from '../modules/food/admin/models/zone.model.js';
import { Vehicle as TaxiVehicle } from '../modules/taxi/admin/models/Vehicle.js';
import { SetPrice as TaxiSetPrice } from '../modules/taxi/admin/models/SetPrice.js';
import { Driver } from '../modules/taxi/driver/models/Driver.js';
import { BusService } from '../modules/taxi/admin/models/BusService.js';
import { BusDriver } from '../modules/taxi/driver/models/BusDriver.js';
import { PoolingVehicle } from '../modules/taxi/admin/models/PoolingVehicle.js';
import { PoolingRoute } from '../modules/taxi/admin/models/PoolingRoute.js';

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/raydo';

async function seedOraiData() {
  console.log('🚀 Starting Data Seeding for Orai, Uttar Pradesh...');
  console.log('Connecting to MongoDB at:', mongoUri);

  try {
    let connected = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 8000,
          family: 4,
        });
        connected = true;
        break;
      } catch (err) {
        console.log(`Connection attempt ${attempt} failed: ${err.message}. Retrying...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (!connected) {
      console.log('Attempting local MongoDB fallback...');
      await mongoose.connect('mongodb://127.0.0.1:27017/raydo', {
        serverSelectionTimeoutMS: 5000,
        family: 4,
      });
    }
    console.log('✅ MongoDB connected successfully.\n');

    // ----------------------------------------------------
    // 1. Service Location - Orai, Uttar Pradesh
    // ----------------------------------------------------
    console.log('--- 1. Processing Service Location (Orai, Uttar Pradesh) ---');
    let serviceLocation = await TaxiServiceLocation.findOne({ name: /orai/i });
    if (!serviceLocation) {
      serviceLocation = await TaxiServiceLocation.create({
        name: 'Orai, Uttar Pradesh',
        country: 'India',
        currency_name: 'Indian Rupee',
        currency_code: 'INR',
        currency_symbol: 'Rs',
        status: 'active',
        active: 1,
      });
      console.log('✅ Created Service Location:', serviceLocation._id, serviceLocation.name);
    } else {
      console.log('ℹ️ Existing Service Location found:', serviceLocation._id, serviceLocation.name);
    }

    // ----------------------------------------------------
    // 2. Taxi Zone & Food Zone - Orai
    // ----------------------------------------------------
    console.log('\n--- 2. Processing Taxi Zone & Food Zone (Orai) ---');
    // Boundary around Orai city (Lat ~25.9898, Lng ~79.4503)
    const oraiPolygonCoords = [
      [
        [79.4000, 26.0400],
        [79.5200, 26.0400],
        [79.5200, 25.9200],
        [79.4000, 25.9200],
        [79.4000, 26.0400],
      ],
    ];

    let taxiZone = await TaxiZone.findOne({ name: /orai/i });
    if (!taxiZone) {
      taxiZone = await TaxiZone.create({
        name: 'Orai',
        service_location_id: serviceLocation._id,
        unit: 'km',
        active: true,
        status: 'active',
        boundary_mode: 'polygon',
        geometry: {
          type: 'Polygon',
          coordinates: oraiPolygonCoords,
        },
        maximum_distance_for_regular_rides: 60,
        maximum_distance_for_outstation_rides: 400,
      });
      console.log('✅ Created TaxiZone:', taxiZone._id, taxiZone.name);
    } else {
      taxiZone.service_location_id = serviceLocation._id;
      taxiZone.active = true;
      taxiZone.status = 'active';
      await taxiZone.save();
      console.log('ℹ️ Updated TaxiZone:', taxiZone._id, taxiZone.name);
    }

    // Food Zone
    const foodPolygonCoords = [
      { latitude: 26.0400, longitude: 79.4000 },
      { latitude: 26.0400, longitude: 79.5200 },
      { latitude: 25.9200, longitude: 79.5200 },
      { latitude: 25.9200, longitude: 79.4000 },
      { latitude: 26.0400, longitude: 79.4000 },
    ];

    let foodZone = await FoodZone.findOne({ name: /orai/i });
    if (!foodZone) {
      foodZone = await FoodZone.create({
        name: 'Orai',
        zoneName: 'Orai City Zone',
        country: 'India',
        serviceLocation: 'Orai, Uttar Pradesh',
        unit: 'kilometer',
        coordinates: foodPolygonCoords,
        isActive: true,
      });
      console.log('✅ Created FoodZone:', foodZone._id, foodZone.name);
    } else {
      console.log('ℹ️ Existing FoodZone found:', foodZone._id, foodZone.name);
    }

    // ----------------------------------------------------
    // 3. Vehicle Types (Bike, Auto, Cab, SUV)
    // ----------------------------------------------------
    console.log('\n--- 3. Processing Vehicle Types (Bike, Auto, Cab, SUV) ---');
    const vehicleConfigs = [
      {
        name: 'Bike',
        short_description: 'Fast, affordable 2-wheeler bike ride in Orai',
        description: 'Ideal for quick solo city commutes.',
        transport_type: 'taxi',
        icon_types: 'bike',
        capacity: 1,
        is_taxi: 'taxi',
      },
      {
        name: 'Auto',
        short_description: 'Affordable 3-wheeler Auto Rickshaw for local rides',
        description: 'Comfortable 3-seater auto for city travel.',
        transport_type: 'taxi',
        icon_types: 'auto',
        capacity: 3,
        is_taxi: 'taxi',
      },
      {
        name: 'Cab',
        short_description: 'Comfortable AC Sedan / Hatchback for city & outstation',
        description: 'Ideal for up to 4 passengers with AC comfort.',
        transport_type: 'taxi',
        icon_types: 'car',
        capacity: 4,
        is_taxi: 'taxi',
      },
      {
        name: 'SUV',
        short_description: 'Spacious 6-Seater SUV for group & family trips',
        description: 'Large SUV with extra luggage space and luxury seating.',
        transport_type: 'taxi',
        icon_types: 'suv',
        capacity: 6,
        is_taxi: 'taxi',
      },
    ];

    const vehicleMap = {};
    for (const vConf of vehicleConfigs) {
      let vehicle = await TaxiVehicle.findOne({ name: new RegExp(`^${vConf.name}$`, 'i') });
      if (!vehicle) {
        vehicle = await TaxiVehicle.create({
          ...vConf,
          dispatch_type: 'normal',
          status: 1,
          active: true,
        });
        console.log(`✅ Created Vehicle (${vConf.name}):`, vehicle._id);
      } else {
        console.log(`ℹ️ Existing Vehicle (${vConf.name}) found:`, vehicle._id);
      }
      vehicleMap[vConf.name.toLowerCase()] = vehicle;
    }

    // ----------------------------------------------------
    // 4. SetPrice Configuration for Orai Zone
    // ----------------------------------------------------
    console.log('\n--- 4. Processing SetPrice Configuration for Orai Zone ---');
    const priceRates = [
      { vehicleKey: 'bike', base_price: 20, base_distance: 1.5, price_per_distance: 9, time_price: 1 },
      { vehicleKey: 'auto', base_price: 30, base_distance: 1.5, price_per_distance: 12, time_price: 1 },
      { vehicleKey: 'cab', base_price: 60, base_distance: 2.0, price_per_distance: 15, time_price: 1.5 },
      { vehicleKey: 'suv', base_price: 100, base_distance: 2.0, price_per_distance: 20, time_price: 2 },
    ];

    for (const pRate of priceRates) {
      const vehObj = vehicleMap[pRate.vehicleKey];
      if (!vehObj) continue;

      let setPrice = await TaxiSetPrice.findOne({
        zone_id: taxiZone._id,
        vehicle_type: vehObj._id,
        transport_type: 'taxi',
      });

      if (!setPrice) {
        setPrice = await TaxiSetPrice.create({
          zone_id: taxiZone._id,
          service_location_id: serviceLocation._id,
          pricing_scope: 'ride',
          transport_type: 'taxi',
          vehicle_type: vehObj._id,
          base_price: pRate.base_price,
          base_distance: pRate.base_distance,
          price_per_distance: pRate.price_per_distance,
          time_price: pRate.time_price,
          waiting_charge: 2,
          ride_surge_amount: 0,
          admin_commision_type: 1,
          admin_commision: 15,
          admin_commission_type_from_driver: 1,
          admin_commission_from_driver: 15,
          service_tax: 5,
          user_cancellation_fee_type: 'fixed',
          user_cancellation_fee: 20,
          driver_cancellation_fee_type: 'fixed',
          driver_cancellation_fee: 15,
          payment_type: ['cash', 'wallet', 'online'],
          status: 'active',
          active: 1,
        });
        console.log(`✅ Created SetPrice for Orai ${pRate.vehicleKey.toUpperCase()}:`, setPrice._id);
      } else {
        setPrice.service_location_id = serviceLocation._id;
        setPrice.status = 'active';
        setPrice.active = 1;
        await setPrice.save();
        console.log(`ℹ️ Updated SetPrice for Orai ${pRate.vehicleKey.toUpperCase()}:`, setPrice._id);
      }
    }

    // ----------------------------------------------------
    // 5. Drivers Data for Orai (Bike, Auto, Cab, SUV)
    // ----------------------------------------------------
    console.log('\n--- 5. Processing Drivers Data for Orai (with photos & vehicle numbers) ---');
    const driversToSeed = [
      {
        name: 'Ram Kumar Yadav',
        phone: '9876543201',
        email: 'ram.yadav.orai@raydo.in',
        vehicleType: 'bike',
        vehicleIconType: 'bike',
        vehicleMake: 'Hero MotoCorp',
        vehicleModel: 'Hero Splendor Plus',
        vehicleNumber: 'UP 92 AB 4321',
        vehicleColor: 'Black Red',
        profile_picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
        profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
        vehicleImage: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=80',
        city: 'Orai',
        location: { type: 'Point', coordinates: [79.4512, 25.9905] }, // Near Orai Centre
      },
      {
        name: 'Shivdutt Verma',
        phone: '9876543202',
        email: 'shivdutt.verma@raydo.in',
        vehicleType: 'auto',
        vehicleIconType: 'auto',
        vehicleMake: 'Bajaj Auto',
        vehicleModel: 'Bajaj RE Compact Auto',
        vehicleNumber: 'UP 92 AT 8765',
        vehicleColor: 'Yellow Green',
        profile_picture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
        profileImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
        vehicleImage: 'https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&w=400&q=80',
        city: 'Orai',
        location: { type: 'Point', coordinates: [79.4485, 25.9875] }, // Near Railway Station Orai
      },
      {
        name: 'Virendra Singh',
        phone: '9876543203',
        email: 'virendra.singh@raydo.in',
        vehicleType: 'car',
        vehicleIconType: 'car',
        vehicleMake: 'Maruti Suzuki',
        vehicleModel: 'Swift Dzire VXI AC',
        vehicleNumber: 'UP 92 CD 5678',
        vehicleColor: 'Pearl White',
        profile_picture: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
        profileImage: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
        vehicleImage: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=400&q=80',
        city: 'Orai',
        location: { type: 'Point', coordinates: [79.4530, 25.9920] }, // Near Bus Terminal Orai
      },
      {
        name: 'Mahesh Gupta',
        phone: '9876543204',
        email: 'mahesh.gupta@raydo.in',
        vehicleType: 'suv',
        vehicleIconType: 'suv',
        vehicleMake: 'Mahindra',
        vehicleModel: 'Mahindra Scorpio Classic',
        vehicleNumber: 'UP 92 SUV 9988',
        vehicleColor: 'Silver Gray',
        profile_picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        vehicleImage: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=400&q=80',
        city: 'Orai',
        location: { type: 'Point', coordinates: [79.4460, 25.9860] }, // Collectorate Road Orai
      },
    ];

    for (const dData of driversToSeed) {
      let driver = await Driver.findOne({ phone: dData.phone });
      const vehObj = vehicleMap[dData.vehicleType.toLowerCase()] || vehicleMap['bike'];

      if (!driver) {
        driver = await Driver.create({
          ...dData,
          password: 'password123',
          vehicleTypeId: vehObj?._id || null,
          service_location_id: serviceLocation._id,
          zoneId: taxiZone._id,
          isOnline: true,
          isOnRide: false,
          approve: true,
          status: 'approved',
          rating: 4.8,
          ratingCount: 24,
          totalRatingScore: 115,
          wallet: { balance: 500, cashLimit: 1000, isBlocked: false },
        });
        console.log(`✅ Created Driver (${dData.name} - ${dData.vehicleType}):`, driver._id);
      } else {
        driver.zoneId = taxiZone._id;
        driver.service_location_id = serviceLocation._id;
        driver.vehicleTypeId = vehObj?._id || driver.vehicleTypeId;
        driver.isOnline = true;
        driver.approve = true;
        driver.status = 'approved';
        driver.location = dData.location;
        await driver.save();
        console.log(`ℹ️ Updated Driver (${dData.name} - ${dData.vehicleType}):`, driver._id);
      }
    }

    // ----------------------------------------------------
    // 6. Bus Service & Bus Captains for Orai
    // ----------------------------------------------------
    console.log('\n--- 6. Processing Bus Services & Bus Captains for Orai ---');
    
    // Create Bus Captains
    let busCaptain1 = await BusDriver.findOne({ phone: '9876543205' });
    if (!busCaptain1) {
      busCaptain1 = await BusDriver.create({
        name: 'Rakesh Tiwari',
        phone: '9876543205',
        email: 'rakesh.tiwari@raydo.in',
        operatorName: 'Bundelkhand Express Travels',
        busName: 'Orai - Kanpur Royal Express',
        serviceNumber: 'UP-92-BUS-01',
        registrationNumber: 'UP 92 B 5544',
        routeName: 'Orai to Kanpur Central',
        originCity: 'Orai',
        destinationCity: 'Kanpur',
        approve: true,
        active: true,
        status: 'approved',
      });
      console.log('✅ Created Bus Driver 1:', busCaptain1._id, busCaptain1.name);
    }

    let busCaptain2 = await BusDriver.findOne({ phone: '9876543206' });
    if (!busCaptain2) {
      busCaptain2 = await BusDriver.create({
        name: 'Satish Pal',
        phone: '9876543206',
        email: 'satish.pal@raydo.in',
        operatorName: 'Orai Intercity Lines',
        busName: 'Orai - Jhansi Superfast Express',
        serviceNumber: 'UP-92-BUS-02',
        registrationNumber: 'UP 92 B 9911',
        routeName: 'Orai to Jhansi Junction',
        originCity: 'Orai',
        destinationCity: 'Jhansi',
        approve: true,
        active: true,
        status: 'approved',
      });
      console.log('✅ Created Bus Driver 2:', busCaptain2._id, busCaptain2.name);
    }

    // Bus Service 1: Orai to Kanpur
    let busService1 = await BusService.findOne({ serviceNumber: 'UP-92-BUS-01' });
    if (!busService1) {
      busService1 = await BusService.create({
        operatorName: 'Bundelkhand Express Travels',
        busName: 'Orai - Kanpur Royal Express',
        serviceNumber: 'UP-92-BUS-01',
        driverName: 'Rakesh Tiwari',
        driverPhone: '9876543205',
        busDriverId: busCaptain1._id,
        coachType: '2x1 Luxury AC Sleeper',
        busCategory: 'Sleeper',
        registrationNumber: 'UP 92 B 5544',
        busColor: '#1e3a8a',
        seatPrice: 350,
        adminCommissionPercentage: 10,
        serviceTaxPercentage: 5,
        fareCurrency: 'INR',
        variantPricing: { seat: 300, window: 350, aisle: 320, sleeper: 450 },
        boardingPolicy: 'Arrive 15 minutes before departure. Carry valid ID proof.',
        cancellationPolicy: '80% refund if cancelled 6 hours before departure.',
        amenities: ['AC', 'Charging Point', 'Blanket', 'Reading Light', 'Water Bottle', 'Emergency Exit'],
        image: 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=800&q=80',
        coverImage: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
        route: {
          routeName: 'Orai to Kanpur Central',
          originCity: 'Orai',
          destinationCity: 'Kanpur',
          distanceKm: '115 km',
          durationHours: '2.5 hrs',
          stops: [
            { id: 'stop_1', city: 'Orai', pointName: 'Orai Bus Stand (Kalpi Road)', stopType: 'pickup', departureTime: '07:00 AM' },
            { id: 'stop_2', city: 'Kalpi', pointName: 'Kalpi Bypass Bridge', stopType: 'both', arrivalTime: '07:45 AM', departureTime: '07:50 AM' },
            { id: 'stop_3', city: 'Bhognipur', pointName: 'Bhognipur Square', stopType: 'both', arrivalTime: '08:20 AM', departureTime: '08:25 AM' },
            { id: 'stop_4', city: 'Kanpur', pointName: 'Kanpur Central Bus Stand (Jhakarkati)', stopType: 'drop', arrivalTime: '09:30 AM' },
          ],
        },
        schedules: [
          { id: 'sch_1', label: 'Daily Morning Express', departureTime: '07:00 AM', arrivalTime: '09:30 AM', activeDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], status: 'active' },
          { id: 'sch_2', label: 'Daily Evening Express', departureTime: '05:00 PM', arrivalTime: '07:30 PM', activeDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], status: 'active' },
        ],
        capacity: 32,
        rating: 4.7,
        ratingCount: 45,
        status: 'active',
      });
      console.log('✅ Created Bus Service 1 (Orai -> Kanpur):', busService1._id);

      busCaptain1.assignedBusServiceId = busService1._id;
      await busCaptain1.save();
    } else {
      console.log('ℹ️ Existing Bus Service 1 found:', busService1._id);
    }

    // Bus Service 2: Orai to Jhansi
    let busService2 = await BusService.findOne({ serviceNumber: 'UP-92-BUS-02' });
    if (!busService2) {
      busService2 = await BusService.create({
        operatorName: 'Orai Intercity Lines',
        busName: 'Orai - Jhansi Superfast Express',
        serviceNumber: 'UP-92-BUS-02',
        driverName: 'Satish Pal',
        driverPhone: '9876543206',
        busDriverId: busCaptain2._id,
        coachType: '2x2 Non-AC Deluxe Seater',
        busCategory: 'Seater',
        registrationNumber: 'UP 92 B 9911',
        busColor: '#b91c1c',
        seatPrice: 180,
        adminCommissionPercentage: 10,
        serviceTaxPercentage: 5,
        fareCurrency: 'INR',
        variantPricing: { seat: 180, window: 200, aisle: 180, sleeper: 0 },
        boardingPolicy: 'Boarding starts 10 minutes prior to departure.',
        amenities: ['Charging Point', 'Comfortable Pushback Seats', 'Luggage Space'],
        image: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
        route: {
          routeName: 'Orai to Jhansi Junction',
          originCity: 'Orai',
          destinationCity: 'Jhansi',
          distanceKm: '105 km',
          durationHours: '2.2 hrs',
          stops: [
            { id: 'stop_a', city: 'Orai', pointName: 'Orai Railway Station Road', stopType: 'pickup', departureTime: '08:00 AM' },
            { id: 'stop_b', city: 'Ait', pointName: 'Ait Highway Stand', stopType: 'both', arrivalTime: '08:40 AM', departureTime: '08:45 AM' },
            { id: 'stop_c', city: 'Moth', pointName: 'Moth Bus Stop', stopType: 'both', arrivalTime: '09:15 AM', departureTime: '09:20 AM' },
            { id: 'stop_d', city: 'Jhansi', pointName: 'Jhansi Bus Stand / Rly Station', stopType: 'drop', arrivalTime: '10:15 AM' },
          ],
        },
        schedules: [
          { id: 'sch_j1', label: 'Morning Shuttle', departureTime: '08:00 AM', arrivalTime: '10:15 AM', activeDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], status: 'active' },
        ],
        capacity: 40,
        rating: 4.5,
        ratingCount: 30,
        status: 'active',
      });
      console.log('✅ Created Bus Service 2 (Orai -> Jhansi):', busService2._id);

      busCaptain2.assignedBusServiceId = busService2._id;
      await busCaptain2.save();
    } else {
      console.log('ℹ️ Existing Bus Service 2 found:', busService2._id);
    }

    // ----------------------------------------------------
    // 7. Car Pooling Data for Orai
    // ----------------------------------------------------
    console.log('\n--- 7. Processing Car Pooling Vehicles & Routes for Orai ---');
    let poolVehicle = await PoolingVehicle.findOne({ vehicleNumber: 'UP 92 PL 7788' });
    if (!poolVehicle) {
      poolVehicle = await PoolingVehicle.create({
        name: 'Orai Ride Share Maruti Ertiga',
        vehicleModel: 'Maruti Ertiga VXI AC',
        vehicleNumber: 'UP 92 PL 7788',
        color: 'Pearl Arctic White',
        capacity: 6,
        adminCommissionPercentage: 12,
        serviceTaxPercentage: 5,
        vehicleType: 'suv',
        images: ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80'],
        status: 'active',
        poolingEnabled: true,
      });
      console.log('✅ Created Pooling Vehicle:', poolVehicle._id, poolVehicle.name);
    } else {
      console.log('ℹ️ Existing Pooling Vehicle found:', poolVehicle._id);
    }

    let poolRoute = await PoolingRoute.findOne({ routeName: 'Orai to Lucknow Daily Pool' });
    if (!poolRoute) {
      poolRoute = await PoolingRoute.create({
        routeName: 'Orai to Lucknow Daily Pool',
        routeCode: 'ORAI-LKO-POOL',
        originLabel: 'Orai Railway Station',
        destinationLabel: 'Lucknow Charbagh Railway Station',
        description: 'Comfortable daily shared AC carpooling from Orai to Lucknow via Kanpur Express Highway.',
        assignedVehicleTypeIds: [poolVehicle._id],
        farePerSeat: 450,
        maxSeatsPerBooking: 3,
        maxAdvanceBookingHours: 48,
        boardingBufferMinutes: 15,
        stops: [
          { id: 'pstop_1', name: 'Orai Railway Station Gate', address: 'Station Road, Orai', stopType: 'pickup', sequence: 1, etaMinutes: 0, latitude: 25.9875, longitude: 79.4485 },
          { id: 'pstop_2', name: 'Orai Kalpi Chauraha', address: 'Kalpi Road, Orai', stopType: 'pickup', sequence: 2, etaMinutes: 15, latitude: 25.9920, longitude: 79.4530 },
          { id: 'pstop_3', name: 'Kanpur Bypass (Rama Devi)', address: 'NH-19 Bypass, Kanpur', stopType: 'both', sequence: 3, etaMinutes: 120, latitude: 26.4499, longitude: 80.3319 },
          { id: 'pstop_4', name: 'Lucknow Charbagh Station', address: 'Charbagh, Lucknow', stopType: 'drop', sequence: 4, etaMinutes: 210, latitude: 26.8317, longitude: 80.9234 },
        ],
        schedules: [
          { id: 'psch_1', label: 'Daily Morning Share Run', departureTime: '06:30 AM', arrivalTime: '10:00 AM', activeDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], status: 'active' },
        ],
        poolingRules: {
          allowInstantBooking: true,
          allowLuggage: true,
          womenOnly: false,
          autoAssignNearestPickup: true,
          maxDetourKm: 5,
        },
        status: 'active',
        active: true,
      });
      console.log('✅ Created Pooling Route (Orai -> Lucknow):', poolRoute._id);
    } else {
      console.log('ℹ️ Existing Pooling Route found:', poolRoute._id);
    }

    console.log('\n================================================================');
    console.log('🎉 ORAI, UTTAR PRADESH DATA SEEDED SUCCESSFULLY!');
    console.log('================================================================');
    console.log('📍 Location & Zone: Orai, UP (Lat: 25.9898, Lng: 79.4503)');
    console.log('🚗 Vehicles Seeded: Bike, Auto, Cab (Sedan), SUV, Bus, Pooling');
    console.log('👥 Active Drivers: 4 City Drivers (Bike, Auto, Cab, SUV) + 2 Bus Captains');
    console.log('🚌 Bus Services: 2 Express Bus Routes (Orai -> Kanpur, Orai -> Jhansi)');
    console.log('🤝 Car Pooling: 1 Active Route (Orai -> Lucknow Daily Share)');
    console.log('================================================================\n');

  } catch (error) {
    console.error('❌ Error seeding Orai data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
}

seedOraiData();
