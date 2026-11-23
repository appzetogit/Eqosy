// Seeds sample Dewas restaurants + menus (go live immediately, tagged *@dewas-seed.eqosy.com so they can be removed).
// Usage: node scripts/seed-dewas-demo.js           (add / update)
//        node scripts/seed-dewas-demo.js --remove  (delete everything this script created)
import mongoose from 'mongoose';
import dns from 'node:dns';
import { config } from '../src/config/env.js';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { FoodCategory, categorySectionFilter } from '../src/modules/food/admin/models/category.model.js';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { DISHES } from '../src/modules/food/admin/data/demoSeedData.js';

const BASE = process.env.SEED_IMAGE_BASE || 'https://eqosy.com';
const EMAIL_DOMAIN = '@dewas-seed.eqosy.com';
const DEWAS = { lat: 22.9676, lng: 76.0534, halfSpan: 0.08 };
const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const img = (p) => `${BASE}${p}`;

const RESTAURANTS = [
  { name: 'Tower Chowk Biryani Centre', phone: '9000030001', area: 'Tower Chowk', lat: 22.9662, lng: 76.0531, cuisines: ['Biryani', 'Mughlai'], veg: false, rating: 4.5, eta: '25-30 mins', image: '/food/chicken_biryani_sp_1.png', covers: ['/food/mutton_biryani_royal.png'], dishes: ['chickenBiryani', 'specialBiryani', 'muttonBiryani', 'chicken65', 'kulcha'] },
  { name: 'AB Road Tandoor House', phone: '9000030002', area: 'AB Road', lat: 22.9721, lng: 76.0612, cuisines: ['North Indian', 'Tandoor'], veg: false, rating: 4.3, eta: '30-35 mins', image: '/food/paneer_tikka_masala.png', covers: ['/food/masala_kulcha.png'], dishes: ['paneerTikka', 'chilliChicken', 'chicken65', 'kulcha', 'chickenBiryani'] },
  { name: 'Vikas Nagar Wok Express', phone: '9000030003', area: 'Vikas Nagar', lat: 22.9598, lng: 76.0487, cuisines: ['Chinese', 'Asian'], veg: false, rating: 4.2, eta: '20-25 mins', image: '/food/chicken_fried_rice.png', covers: ['/food/mushroom_manchurian.png'], dishes: ['friedRice', 'manchurian', 'chilliChicken', 'chicken65'] },
  { name: 'Shree Pure Veg Bhojanalaya', phone: '9000030004', area: 'Sayaji Gate', lat: 22.9703, lng: 76.0449, cuisines: ['Veg Meals', 'North Indian'], veg: true, rating: 4.6, eta: '25-30 mins', image: '/food/veg_biryani_aromatic.png', covers: ['/food/paneer_tikka_masala.png'], dishes: ['vegBiryani', 'paneerTikka', 'kulcha', 'manchurian'] },
  { name: 'Coastal Catch Dewas', phone: '9000030005', area: 'Bhopal Chauraha', lat: 22.9644, lng: 76.0668, cuisines: ['Seafood', 'Biryani'], veg: false, rating: 4.1, eta: '35-40 mins', image: '/food/fish_curry_kerala.png', covers: ['/food/prawns_biryani_spicy.png'], dishes: ['fishCurry', 'prawnsBiryani', 'chickenBiryani', 'kulcha'] },
];

const run = async () => {
  try { dns.setServers((config.mongodbDnsServers || '8.8.8.8,1.1.1.1').split(',').map((x) => x.trim()).filter(Boolean)); dns.setDefaultResultOrder('ipv4first'); } catch {}
  await mongoose.connect(config.mongodbUri, { dbName: config.mongodbDbName || undefined, serverSelectionTimeoutMS: 20000 });
  console.log('Connected to DB:', mongoose.connection.name);

  if (process.argv.includes('--remove')) {
    const ids = await FoodRestaurant.distinct('_id', { ownerEmail: { $regex: '@dewas-seed\\.eqosy\\.com$' } });
    const items = await FoodItem.deleteMany({ restaurantId: { $in: ids } });
    const rests = await FoodRestaurant.deleteMany({ _id: { $in: ids } });
    console.log(`Removed ${rests.deletedCount} restaurants, ${items.deletedCount} items`);
    return;
  }

  let zone = await FoodZone.findOne({ name: /dewas/i });
  if (zone) {
    console.log(`Using existing zone: ${zone.name} (${zone._id}, active=${zone.isActive})`);
  } else {
    const { lat, lng, halfSpan } = DEWAS;
    zone = await FoodZone.create({
      name: 'Dewas', zoneName: 'Dewas', serviceLocation: 'Dewas', country: 'India', isActive: true,
      coordinates: [
        { latitude: lat + halfSpan, longitude: lng - halfSpan },
        { latitude: lat + halfSpan, longitude: lng + halfSpan },
        { latitude: lat - halfSpan, longitude: lng + halfSpan },
        { latitude: lat - halfSpan, longitude: lng - halfSpan },
      ],
    });
    console.log(`Created zone Dewas (${zone._id})`);
  }

  const categoryCache = new Map();
  const getCategory = async (name) => {
    if (categoryCache.has(name)) return categoryCache.get(name);
    let cat = await FoodCategory.findOne({ name, restaurantId: { $exists: false }, $and: [categorySectionFilter('food')] });
    if (!cat) {
      const dish = Object.values(DISHES).find((d) => d.category === name);
      cat = await FoodCategory.create({
        name, section: 'food', type: '', zoneId: zone._id, foodTypeScope: 'Both',
        approvalStatus: 'approved', isApproved: true, isActive: true, image: dish ? img(dish.image) : '',
      });
    }
    categoryCache.set(name, cat);
    return cat;
  };

  let items = 0;
  for (const spec of RESTAURANTS) {
    let r = await FoodRestaurant.findOne({ ownerPhone: spec.phone });
    if (!r) r = new FoodRestaurant({ ownerPhone: spec.phone });
    Object.assign(r, {
      restaurantName: spec.name, ownerName: 'Dewas Demo Owner', ownerEmail: `${spec.phone}${EMAIL_DOMAIN}`,
      primaryContactNumber: spec.phone, area: spec.area, city: 'Dewas', state: 'Madhya Pradesh', pincode: '455001',
      addressLine1: `${spec.area}, Dewas`, zoneId: zone._id, isRestaurant: true, isDemo: false,
      pureVegRestaurant: spec.veg, cuisines: spec.cuisines, openingTime: '00:00', closingTime: '23:59', openDays: ALL_DAYS,
      isAcceptingOrders: true, status: 'approved', approvedAt: r.approvedAt || new Date(),
      profileImage: img(spec.image), coverImages: spec.covers.map(img), estimatedDeliveryTime: spec.eta,
      rating: spec.rating, totalRatings: r.totalRatings || 80, codEnabled: false,
      location: {
        type: 'Point', coordinates: [spec.lng, spec.lat], latitude: spec.lat, longitude: spec.lng,
        formattedAddress: `${spec.area}, Dewas, Madhya Pradesh`, address: `${spec.area}, Dewas, Madhya Pradesh`,
        area: spec.area, city: 'Dewas', state: 'Madhya Pradesh', pincode: '455001',
      },
    });
    await r.save();

    for (const key of spec.dishes) {
      const d = DISHES[key];
      const cat = await getCategory(d.category);
      const filter = { restaurantId: r._id, name: d.name };
      const existing = await FoodItem.findOne(filter);
      const doc = existing || new FoodItem(filter);
      Object.assign(doc, {
        categoryId: cat._id, categoryName: cat.name, description: d.description, price: d.price, foodType: d.type,
        image: img(d.image), isActive: true, isAvailable: true, approvalStatus: 'approved', approvedAt: doc.approvedAt || new Date(),
      });
      await doc.save();
      if (!existing) items += 1;
    }
    console.log(`OK  ${spec.name}  phone ${spec.phone}`);
  }
  console.log(`Done. New items: ${items}`);
};

run().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
