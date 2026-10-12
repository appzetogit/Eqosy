// Seeds a few demo GROCERY banners (shown only in the Grocery section of the user app).
// Idempotent: banners are matched by publicId, so running it again does not duplicate them.
// Usage: npm run seed:grocery-banners
import dotenv from "dotenv";
import dns from "node:dns";
import mongoose from "mongoose";

import { FoodGroceryBanner } from "../src/modules/food/landing/models/groceryBanner.model.js";

dotenv.config();

// Same DNS override as src/config/db.js: some local resolvers refuse the SRV lookup Atlas needs.
try {
  dns.setServers(String(process.env.MONGODB_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",").map((s) => s.trim()).filter(Boolean));
} catch {
  /* keep system DNS */
}

const BANNERS = [
  { id: "demo_fresh", title: "Fresh fruits & vegetables", sub: "Delivered in minutes", from: "#1A9E5C", to: "#0B6B3A" },
  { id: "demo_dairy", title: "Dairy & bakery essentials", sub: "Milk, bread, eggs & more", from: "#F59E0B", to: "#B45309" },
  { id: "demo_daily", title: "Daily needs at your door", sub: "Free delivery on first order", from: "#0EA5E9", to: "#1D4ED8" },
];

// Self-contained SVG so the demo banners need no network or Cloudinary.
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svgDataUri = ({ title, sub, from, to }) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="1200" height="600" fill="url(#g)"/>
<circle cx="1050" cy="120" r="220" fill="#fff" fill-opacity="0.10"/>
<circle cx="900" cy="520" r="160" fill="#fff" fill-opacity="0.08"/>
<text x="80" y="270" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="800" fill="#fff">${esc(title)}</text>
<text x="80" y="350" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#fff" fill-opacity="0.9">${esc(sub)}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGODB_URI / MONGO_URI in environment.");
  const dbName = process.env.MONGODB_DB_NAME || undefined;
  await mongoose.connect(uri, dbName ? { dbName } : undefined);
  try {
    for (const [index, b] of BANNERS.entries()) {
      await FoodGroceryBanner.updateOne(
        { publicId: b.id },
        {
          $set: { imageUrl: svgDataUri(b), title: b.title, sortOrder: index, isActive: true },
          $setOnInsert: { publicId: b.id },
        },
        { upsert: true },
      );
    }
    console.log(`Seeded ${BANNERS.length} grocery banners.`);
  } finally {
    await mongoose.connection.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
