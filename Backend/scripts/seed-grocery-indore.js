// Seeds demo GROCERY data for the Indore zone: zone (if missing), 2 grocery stores
// (isRestaurant: false, so they only show in the Grocery section), grocery categories and items.
// Idempotent: safe to run again.  Usage: npm run seed:grocery-indore
import dotenv from "dotenv";
import dns from "node:dns";
import mongoose from "mongoose";

import { FoodZone } from "../src/modules/food/admin/models/zone.model.js";
import { FoodCategory } from "../src/modules/food/admin/models/category.model.js";
import { FoodItem } from "../src/modules/food/admin/models/food.model.js";
import { FoodRestaurant } from "../src/modules/food/restaurant/models/restaurant.model.js";

dotenv.config();

// Same DNS override as src/config/db.js: some local resolvers refuse the SRV lookup Atlas needs.
try {
  dns.setServers(String(process.env.MONGODB_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",").map((s) => s.trim()).filter(Boolean));
} catch {
  /* keep system DNS */
}

const INDORE = { lat: 22.7196, lng: 75.8577 };
const HALF = 0.15; // ~16 km box around the city centre

const STORES = [
  {
    restaurantName: "Eqosy Fresh Mart - Vijay Nagar",
    ownerName: "Eqosy Grocery Partner",
    ownerPhone: "9000000011",
    area: "Vijay Nagar",
    lat: 22.7533,
    lng: 75.8937,
    items: [
      ["Fruits & Vegetables", "Tomato (1 kg)", 40, "Fresh farm tomatoes"],
      ["Fruits & Vegetables", "Onion (1 kg)", 35, "Fresh red onions"],
      ["Fruits & Vegetables", "Potato (1 kg)", 30, "Fresh potatoes"],
      ["Fruits & Vegetables", "Banana (1 dozen)", 60, "Ripe bananas"],
      ["Dairy & Eggs", "Amul Taaza Milk (1 L)", 68, "Toned milk"],
      ["Dairy & Eggs", "Amul Butter (100 g)", 62, "Pasteurised butter"],
      ["Dairy & Eggs", "Paneer (200 g)", 90, "Fresh paneer"],
      ["Bakery & Snacks", "Brown Bread (400 g)", 45, "Whole wheat bread"],
      ["Bakery & Snacks", "Poha (500 g)", 48, "Indori poha"],
      ["Bakery & Snacks", "Sev (250 g)", 70, "Ratlami sev"],
    ],
  },
  {
    restaurantName: "Eqosy Daily Needs - Palasia",
    ownerName: "Eqosy Grocery Partner",
    ownerPhone: "9000000012",
    area: "Palasia",
    lat: 22.7244,
    lng: 75.8839,
    items: [
      ["Staples", "Aashirvaad Atta (5 kg)", 285, "Whole wheat flour"],
      ["Staples", "Basmati Rice (1 kg)", 120, "Long grain basmati"],
      ["Staples", "Toor Dal (1 kg)", 150, "Unpolished toor dal"],
      ["Staples", "Sugar (1 kg)", 48, "Refined sugar"],
      ["Staples", "Fortune Sunflower Oil (1 L)", 140, "Refined sunflower oil"],
      ["Beverages", "Tata Tea Gold (250 g)", 135, "Premium tea"],
      ["Beverages", "Bru Coffee (100 g)", 210, "Instant coffee"],
      ["Household", "Surf Excel (1 kg)", 130, "Detergent powder"],
      ["Household", "Dettol Handwash (200 ml)", 99, "Antibacterial handwash"],
      ["Household", "Colgate Toothpaste (200 g)", 105, "Cavity protection"],
    ],
  },
];

const connect = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGODB_URI / MONGO_URI in environment.");
  const dbName = process.env.MONGODB_DB_NAME || undefined;
  await mongoose.connect(uri, dbName ? { dbName } : undefined);
};

const ensureZone = async () => {
  let zone = await FoodZone.findOne({ name: /indore/i });
  if (zone) return zone;
  return FoodZone.create({
    name: "Indore",
    zoneName: "Indore",
    serviceLocation: "Indore",
    country: "India",
    isActive: true,
    coordinates: [
      { latitude: INDORE.lat + HALF, longitude: INDORE.lng - HALF },
      { latitude: INDORE.lat + HALF, longitude: INDORE.lng + HALF },
      { latitude: INDORE.lat - HALF, longitude: INDORE.lng + HALF },
      { latitude: INDORE.lat - HALF, longitude: INDORE.lng - HALF },
    ],
  });
};

const ensureCategory = async (name, zoneId) => {
  let category = await FoodCategory.findOne({ name, zoneId, restaurantId: { $exists: false } });
  if (category && category.section !== "grocery") {
    category.section = "grocery";
    await category.save();
  }
  if (!category) {
    category = await FoodCategory.create({
      name,
      zoneId,
      foodTypeScope: "Veg",
      type: "grocery",
      section: "grocery",
      approvalStatus: "approved",
      isApproved: true,
      isActive: true,
    });
  }
  return category;
};

const ensureStore = async (store, zone) => {
  let doc = await FoodRestaurant.findOne({ ownerPhone: store.ownerPhone });
  if (!doc) doc = new FoodRestaurant({ ownerPhone: store.ownerPhone });
  doc.restaurantName = store.restaurantName;
  doc.ownerName = store.ownerName;
  doc.ownerEmail = doc.ownerEmail || `${store.ownerPhone}@eqosy.com`;
  doc.primaryContactNumber = store.ownerPhone;
  doc.area = store.area;
  doc.city = "Indore";
  doc.state = "Madhya Pradesh";
  doc.zoneId = zone._id;
  doc.location = { type: "Point", coordinates: [store.lng, store.lat] };
  doc.isRestaurant = false; // grocery store: never listed in the restaurant section
  doc.pureVegRestaurant = true;
  doc.status = "approved";
  doc.approvedAt = doc.approvedAt || new Date();
  await doc.save();
  return doc;
};

const run = async () => {
  await connect();
  const zone = await ensureZone();
  console.log("Zone:", zone.name, String(zone._id));

  for (const store of STORES) {
    const outlet = await ensureStore(store, zone);
    let created = 0;
    for (const [categoryName, name, price, description] of store.items) {
      const category = await ensureCategory(categoryName, zone._id);
      const existing = await FoodItem.findOne({ restaurantId: outlet._id, name });
      if (existing) continue;
      await FoodItem.create({
        restaurantId: outlet._id,
        categoryId: category._id,
        categoryName,
        name,
        description,
        price,
        foodType: "Veg",
        isActive: true,
        isAvailable: true,
        stockQuantity: 100,
        approvalStatus: "approved",
        approvedAt: new Date(),
      });
      created += 1;
    }
    console.log(`Store "${outlet.restaurantName}" (${outlet._id}) - ${created} new item(s)`);
  }
  console.log("Done. Grocery stores are isRestaurant:false, so they appear only in the Grocery section.");
};

run()
  .catch((err) => {
    console.error("Failed to seed grocery data:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
