// Dev Mode (demo / App Store review): demo data for the Indore zone, per-group switches,
// a location bypass, and the checkout payment-method toggles.
import mongoose from 'mongoose';
import { invalidateCache } from '../../../../middleware/cache.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodSettings } from '../../orders/models/order.model.js';
import { FoodZone } from '../models/zone.model.js';
import { FoodCategory, categorySectionFilter } from '../models/category.model.js';
import { FoodItem } from '../models/food.model.js';
import { FoodFeeSettings } from '../models/feeSettings.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { isRazorpayConfigured } from '../../orders/helpers/razorpay.helper.js';
import {
  INDORE,
  DISHES,
  FOOD_CATEGORIES,
  FOOD_RESTAURANTS,
  STORE_CATEGORIES,
  STORE_ITEMS,
  STORES,
  DELIVERY_PARTNERS,
} from '../data/demoSeedData.js';

const SETTINGS_KEY = 'demo_mode';

export const DEMO_GROUPS = ['foodCategories', 'foodRestaurants', 'storeCategories', 'stores', 'deliveryPartners'];
const DEFAULT_GROUPS = Object.fromEntries(DEMO_GROUPS.map((group) => [group, false]));
const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

let bypassCache = { at: 0, value: null };
export const invalidateDemoCache = () => {
  bypassCache = { at: 0, value: null };
};

const normalizeGroups = (groups = {}) => {
  const next = { ...DEFAULT_GROUPS };
  for (const key of DEMO_GROUPS) {
    if (groups && groups[key] !== undefined) next[key] = groups[key] === true;
  }
  return next;
};

export async function getDemoSettings() {
  const doc = await FoodSettings.findOne({ key: SETTINGS_KEY }).lean();
  const demo = doc?.demoMode || {};
  return {
    locationBypass: demo.locationBypass === true,
    zoneId: demo.zoneId ? String(demo.zoneId) : null,
    groups: normalizeGroups(demo.groups),
  };
}

const findIndoreZone = async () => FoodZone.findOne({ name: /indore/i }).lean();

const zoneCenter = (zone) => {
  const coords = Array.isArray(zone?.coordinates) ? zone.coordinates : [];
  const valid = coords.filter((c) => Number.isFinite(Number(c?.latitude)) && Number.isFinite(Number(c?.longitude)));
  if (valid.length === 0) return { lat: INDORE.lat, lng: INDORE.lng };
  return {
    lat: valid.reduce((sum, c) => sum + Number(c.latitude), 0) / valid.length,
    lng: valid.reduce((sum, c) => sum + Number(c.longitude), 0) / valid.length,
  };
};

/** Cheap, cached check used on hot paths (zone detect, restaurant list, order pricing). */
export async function getDemoBypass() {
  const now = Date.now();
  if (bypassCache.value && now - bypassCache.at < 10_000) return bypassCache.value;

  let value = { enabled: false, zoneId: null, zone: null, center: { lat: INDORE.lat, lng: INDORE.lng } };
  try {
    const settings = await getDemoSettings();
    if (settings.locationBypass) {
      const zone = settings.zoneId && mongoose.Types.ObjectId.isValid(settings.zoneId)
        ? await FoodZone.findById(settings.zoneId).lean()
        : await findIndoreZone();
      if (zone?._id) {
        value = { enabled: true, zoneId: String(zone._id), zone, center: zoneCenter(zone) };
      }
    }
  } catch {
    // never let Dev Mode break normal traffic
  }
  bypassCache = { at: now, value };
  return value;
}

const isPointInPolygon = (lat, lng, polygon = []) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i]?.longitude);
    const yi = Number(polygon[i]?.latitude);
    const xj = Number(polygon[j]?.longitude);
    const yj = Number(polygon[j]?.latitude);
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
};

/**
 * With the location bypass on, a delivery address outside every service zone is moved to a point
 * next to the restaurant so zone checks, distance fees and rider dispatch all work for the reviewer.
 * Real customers inside a zone are left untouched. Mutates the address objects in `dto`.
 */
export async function applyDemoLocationBypass(dto = {}, restaurant = null) {
  const bypass = await getDemoBypass();
  if (!bypass.enabled) return false;

  const addresses = [dto.address, dto.deliveryAddress].filter((a) => a && typeof a === 'object');
  const current = addresses.map((a) => a?.location?.coordinates).find((c) => Array.isArray(c) && c.length === 2);

  if (current) {
    const [lng, lat] = current.map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const zones = await FoodZone.find({ isActive: true }).select('coordinates').lean();
      if (zones.some((zone) => isPointInPolygon(lat, lng, zone.coordinates))) return false;
    }
  }

  const base = Array.isArray(restaurant?.location?.coordinates) && restaurant.location.coordinates.length === 2
    ? restaurant.location.coordinates.map(Number)
    : [bypass.center.lng, bypass.center.lat];
  const target = [base[0] + 0.006, base[1] + 0.006];

  if (addresses.length === 0) {
    dto.address = {};
    addresses.push(dto.address);
  }
  for (const address of addresses) {
    address.location = { type: 'Point', coordinates: target };
  }
  if (!dto.address && dto.deliveryAddress) dto.address = dto.deliveryAddress;
  if (!dto.deliveryAddress && dto.address) dto.deliveryAddress = dto.address;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Group switches                                                             */
/* -------------------------------------------------------------------------- */

const clearPublicCaches = async () => {
  await Promise.allSettled([
    invalidateCache('categories:*'),
    invalidateCache('restaurants:*'),
    invalidateCache('restaurant_menu:*'),
    invalidateCache('restaurant_detail:*'),
  ]);
};

export async function applyGroup(group, enabled) {
  const on = enabled === true;

  if (group === 'foodCategories' || group === 'storeCategories') {
    const section = group === 'foodCategories' ? 'food' : 'grocery';
    const result = await FoodCategory.updateMany(
      { isDemo: true, $and: [categorySectionFilter(section)] },
      { $set: { isActive: on } },
    );
    return result.modifiedCount;
  }

  if (group === 'foodRestaurants' || group === 'stores') {
    const isRestaurant = group === 'foodRestaurants';
    const outletFilter = { isDemo: true, isRestaurant: isRestaurant ? { $ne: false } : false };
    const ids = await FoodRestaurant.distinct('_id', outletFilter);
    const outlets = await FoodRestaurant.updateMany(outletFilter, {
      $set: on
        ? { status: 'approved', approvedAt: new Date(), isAcceptingOrders: true }
        : { status: 'pending' },
    });
    if (ids.length) {
      await FoodItem.updateMany(
        { isDemo: true, restaurantId: { $in: ids } },
        { $set: { isActive: on, isAvailable: on, approvalStatus: 'approved' } },
      );
    }
    return outlets.modifiedCount;
  }

  if (group === 'deliveryPartners') {
    const result = await FoodDeliveryPartner.updateMany(
      { isDemo: true },
      on
        ? { $set: { status: 'approved', approvedAt: new Date(), availabilityStatus: 'online', lastLocationAt: new Date() } }
        : { $set: { status: 'rejected', availabilityStatus: 'offline', rejectionReason: 'Demo mode off' } },
    );
    return result.modifiedCount;
  }

  throw new ValidationError(`Unknown demo group: ${group}`);
}

export async function updateDemoSettings(body = {}, adminId = null) {
  const current = await getDemoSettings();
  const next = { ...current, groups: { ...current.groups } };

  if (body.locationBypass !== undefined) next.locationBypass = body.locationBypass === true;
  if (body.groups && typeof body.groups === 'object') {
    for (const group of DEMO_GROUPS) {
      if (body.groups[group] !== undefined) next.groups[group] = body.groups[group] === true;
    }
  }

  if (next.locationBypass && !next.zoneId) {
    const zone = await findIndoreZone();
    if (!zone) {
      throw new ValidationError('Indore zone not found. Click "Load Indore demo data" first.');
    }
    next.zoneId = String(zone._id);
  }

  await FoodSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: {
        'demoMode.locationBypass': next.locationBypass,
        'demoMode.groups': next.groups,
        ...(next.zoneId ? { 'demoMode.zoneId': new mongoose.Types.ObjectId(next.zoneId) } : {}),
        ...(adminId && mongoose.Types.ObjectId.isValid(String(adminId))
          ? { updatedBy: { role: 'ADMIN', adminId: new mongoose.Types.ObjectId(String(adminId)), at: new Date() } }
          : {}),
      },
    },
    { upsert: true },
  );

  // Only touch the groups whose value actually changed.
  for (const group of DEMO_GROUPS) {
    if (body.groups && body.groups[group] !== undefined && current.groups[group] !== next.groups[group]) {
      await applyGroup(group, next.groups[group]);
    }
  }

  invalidateDemoCache();
  await clearPublicCaches();
  return getDemoStatus();
}

/* -------------------------------------------------------------------------- */
/* Payment methods                                                            */
/* -------------------------------------------------------------------------- */

const normalizePaymentMethods = (value = {}) => ({
  cash: value?.cash !== false,
  online: value?.online !== false,
  wallet: value?.wallet !== false,
});

export async function getPaymentMethodSettings() {
  const fee = await FoodFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).select('paymentMethods').lean();
  const configured = normalizePaymentMethods(fee?.paymentMethods);
  const razorpayReady = isRazorpayConfigured();
  return {
    configured,
    razorpayConfigured: razorpayReady,
    // What customers actually get: "online" also needs working Razorpay keys.
    effective: { cash: configured.cash, razorpay: configured.online && razorpayReady, wallet: configured.wallet },
  };
}

export async function updatePaymentMethodSettings(body = {}) {
  const current = (await getPaymentMethodSettings()).configured;
  const next = {
    cash: body.cash !== undefined ? body.cash === true : current.cash,
    online: body.online !== undefined ? body.online === true : current.online,
    wallet: body.wallet !== undefined ? body.wallet === true : current.wallet,
  };
  if (!next.cash && !next.online && !next.wallet) {
    throw new ValidationError('At least one payment method must stay enabled');
  }

  const fee = await FoodFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 });
  if (!fee) {
    throw new ValidationError('Fee settings are not configured yet. Save Delivery & Platform Fee first.');
  }
  fee.paymentMethods = next;
  await fee.save();
  return getPaymentMethodSettings();
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export async function getDemoStatus() {
  const [settings, zone, payments] = await Promise.all([
    getDemoSettings(),
    findIndoreZone(),
    getPaymentMethodSettings(),
  ]);

  const [foodCategories, foodRestaurants, storeCategories, stores, deliveryPartners, foodItems, storeItems] = await Promise.all([
    FoodCategory.countDocuments({ isDemo: true, $and: [categorySectionFilter('food')] }),
    FoodRestaurant.countDocuments({ isDemo: true, isRestaurant: { $ne: false } }),
    FoodCategory.countDocuments({ isDemo: true, $and: [categorySectionFilter('grocery')] }),
    FoodRestaurant.countDocuments({ isDemo: true, isRestaurant: false }),
    FoodDeliveryPartner.countDocuments({ isDemo: true }),
    FoodItem.countDocuments({ isDemo: true, restaurantId: { $in: await FoodRestaurant.distinct('_id', { isDemo: true, isRestaurant: { $ne: false } }) } }),
    FoodItem.countDocuments({ isDemo: true, restaurantId: { $in: await FoodRestaurant.distinct('_id', { isDemo: true, isRestaurant: false }) } }),
  ]);

  return {
    settings,
    zone: zone ? { id: String(zone._id), name: zone.name, isActive: zone.isActive !== false } : null,
    counts: { foodCategories, foodRestaurants, foodItems, storeCategories, stores, storeItems, deliveryPartners },
    seeded: foodRestaurants + stores + deliveryPartners > 0,
    payments,
  };
}

/** Public, unauthenticated: tells the apps whether to skip location checks. */
export async function getPublicDemoInfo() {
  const bypass = await getDemoBypass();
  if (!bypass.enabled) return { locationBypass: false };
  return {
    locationBypass: true,
    zoneId: bypass.zoneId,
    zoneName: bypass.zone?.name || 'Indore',
    location: {
      latitude: bypass.center.lat,
      longitude: bypass.center.lng,
      city: 'Indore',
      state: 'Madhya Pradesh',
      address: 'Indore, Madhya Pradesh',
      formattedAddress: 'Rajwada, Indore, Madhya Pradesh 452002, India',
      area: 'Rajwada',
      pincode: '452002',
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Seeding                                                                    */
/* -------------------------------------------------------------------------- */

const absoluteUrl = (base, value) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
};

const ensureZone = async () => {
  const existing = await FoodZone.findOne({ name: /indore/i });
  if (existing) return existing;
  const { lat, lng, halfSpan } = INDORE;
  return FoodZone.create({
    name: 'Indore',
    zoneName: 'Indore',
    serviceLocation: 'Indore',
    country: 'India',
    isActive: true,
    coordinates: [
      { latitude: lat + halfSpan, longitude: lng - halfSpan },
      { latitude: lat + halfSpan, longitude: lng + halfSpan },
      { latitude: lat - halfSpan, longitude: lng + halfSpan },
      { latitude: lat - halfSpan, longitude: lng - halfSpan },
    ],
  });
};

const ensureCategory = async ({ name, image, section, zone, foodTypeScope = 'Both' }) => {
  // Reuse a real (non-demo) global category with the same name instead of creating a duplicate.
  let category = await FoodCategory.findOne({
    name,
    restaurantId: { $exists: false },
    $and: [categorySectionFilter(section)],
  });
  if (!category) {
    category = new FoodCategory({
      name,
      section,
      type: section === 'grocery' ? 'grocery' : '',
      zoneId: zone._id,
      foodTypeScope,
      approvalStatus: 'approved',
      isApproved: true,
      isActive: false,
      isDemo: true,
    });
  }
  if (!category.image && image) category.image = image;
  await category.save();
  return category;
};

const ensureOutlet = async (spec, { zone, base, isRestaurant }) => {
  const phone = spec.ownerPhone;
  let outlet = await FoodRestaurant.findOne({ ownerPhone: phone });
  if (!outlet) outlet = new FoodRestaurant({ ownerPhone: phone, status: 'pending' });

  const image = isRestaurant ? absoluteUrl(base, spec.image) : absoluteUrl(base, `/demo/stores/${spec.slug}.svg`);
  const covers = isRestaurant ? (spec.covers || []).map((c) => absoluteUrl(base, c)) : [image];

  outlet.restaurantName = spec.restaurantName;
  outlet.ownerName = 'Eqosy Demo Partner';
  outlet.ownerEmail = `${phone}@demo.eqosy.com`;
  outlet.primaryContactNumber = phone;
  outlet.area = spec.area;
  outlet.city = 'Indore';
  outlet.state = 'Madhya Pradesh';
  outlet.pincode = '452001';
  outlet.addressLine1 = `${spec.area}, Indore`;
  outlet.zoneId = zone._id;
  outlet.location = {
    type: 'Point',
    coordinates: [spec.lng, spec.lat],
    latitude: spec.lat,
    longitude: spec.lng,
    formattedAddress: `${spec.area}, Indore, Madhya Pradesh`,
    address: `${spec.area}, Indore, Madhya Pradesh`,
    area: spec.area,
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452001',
  };
  outlet.isRestaurant = isRestaurant;
  outlet.isDemo = true;
  outlet.pureVegRestaurant = isRestaurant ? spec.pureVeg === true : true;
  outlet.cuisines = isRestaurant ? spec.cuisines : ['Grocery'];
  outlet.openingTime = '00:00';
  outlet.closingTime = '23:59';
  outlet.openDays = ALL_DAYS;
  outlet.isAcceptingOrders = true;
  outlet.profileImage = image;
  outlet.coverImages = covers;
  outlet.estimatedDeliveryTime = spec.eta;
  outlet.rating = spec.rating;
  outlet.totalRatings = outlet.totalRatings || 120;
  await outlet.save();
  return outlet;
};

const upsertItem = async (outlet, category, data) => {
  const filter = { restaurantId: outlet._id, name: data.name };
  const existing = await FoodItem.findOne(filter);
  const doc = existing || new FoodItem(filter);
  doc.categoryId = category._id;
  doc.categoryName = category.name;
  doc.description = data.description;
  doc.price = data.price;
  doc.foodType = data.foodType;
  doc.image = data.image;
  doc.isDemo = true;
  doc.approvalStatus = 'approved';
  doc.approvedAt = doc.approvedAt || new Date();
  if (!existing) {
    doc.isActive = false;
    doc.isAvailable = false;
  }
  if (data.stockQuantity !== undefined) doc.stockQuantity = data.stockQuantity;
  await doc.save();
  return !existing;
};

export async function seedIndoreDemoData({ baseUrl, adminId = null } = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) {
    throw new ValidationError('A public site URL is required to build image links');
  }

  const zone = await ensureZone();
  const summary = { zone: zone.name, categories: 0, restaurants: 0, stores: 0, items: 0, riders: 0 };

  // Food: "What's on your mind" categories, restaurants and their menus.
  const foodCategories = new Map();
  for (const spec of FOOD_CATEGORIES) {
    foodCategories.set(spec.name, await ensureCategory({ name: spec.name, image: absoluteUrl(base, spec.image), section: 'food', zone }));
    summary.categories += 1;
  }
  for (const spec of FOOD_RESTAURANTS) {
    const outlet = await ensureOutlet(spec, { zone, base, isRestaurant: true });
    summary.restaurants += 1;
    for (const dishKey of spec.dishes) {
      const dish = DISHES[dishKey];
      const category = foodCategories.get(dish.category);
      if (!dish || !category) continue;
      const created = await upsertItem(outlet, category, {
        name: dish.name,
        description: dish.description,
        price: dish.price,
        foodType: dish.type,
        image: absoluteUrl(base, dish.image),
      });
      if (created) summary.items += 1;
    }
  }

  // Grocery: categories, stores and items.
  const storeCategories = new Map();
  for (const spec of STORE_CATEGORIES) {
    storeCategories.set(spec.name, await ensureCategory({
      name: spec.name,
      image: absoluteUrl(base, `/demo/grocery/cat-${spec.slug}.svg`),
      section: 'grocery',
      zone,
      foodTypeScope: 'Veg',
    }));
    summary.categories += 1;
  }
  const itemsBySlug = new Map(STORE_ITEMS.map((item) => [item.slug, item]));
  for (const spec of STORES) {
    const outlet = await ensureOutlet(spec, { zone, base, isRestaurant: false });
    summary.stores += 1;
    for (const slug of spec.items) {
      const item = itemsBySlug.get(slug);
      const category = item ? storeCategories.get(item.cat) : null;
      if (!item || !category) continue;
      const created = await upsertItem(outlet, category, {
        name: item.name,
        description: item.description,
        price: item.price,
        foodType: 'Veg',
        image: absoluteUrl(base, `/demo/grocery/${item.slug}.svg`),
        stockQuantity: 100,
      });
      if (created) summary.items += 1;
    }
  }

  // Delivery partners (offline until the group is switched on).
  for (let index = 0; index < DELIVERY_PARTNERS.length; index += 1) {
    const spec = DELIVERY_PARTNERS[index];
    let rider = await FoodDeliveryPartner.findOne({ phone: spec.phone });
    if (!rider) rider = new FoodDeliveryPartner({ phone: spec.phone, status: 'rejected', availabilityStatus: 'offline' });
    rider.name = spec.name;
    rider.countryCode = '+91';
    rider.city = 'Indore';
    rider.state = 'Madhya Pradesh';
    rider.address = 'Indore, Madhya Pradesh';
    rider.zoneId = zone._id;
    rider.zoneName = zone.name;
    rider.vehicleType = spec.vehicleType;
    rider.vehicleName = spec.vehicleName;
    if (spec.vehicleNumber) rider.vehicleNumber = spec.vehicleNumber;
    rider.profilePhoto = absoluteUrl(base, `/demo/riders/rider-${index + 1}.svg`);
    rider.lastLat = spec.lat;
    rider.lastLng = spec.lng;
    rider.lastLocation = { type: 'Point', coordinates: [spec.lng, spec.lat] };
    rider.isDemo = true;
    if (!rider.referralCode) rider.referralCode = String(rider._id);
    await rider.save();
    summary.riders += 1;
  }

  // Apply the current switches to everything that was just written.
  const settings = await getDemoSettings();
  for (const group of DEMO_GROUPS) {
    await applyGroup(group, settings.groups[group]);
  }

  if (adminId && mongoose.Types.ObjectId.isValid(String(adminId))) {
    await FoodSettings.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { $set: { 'demoMode.zoneId': zone._id, 'demoMode.groups': settings.groups, 'demoMode.locationBypass': settings.locationBypass } },
      { upsert: true },
    );
  }

  invalidateDemoCache();
  await clearPublicCaches();
  return { summary, status: await getDemoStatus() };
}
