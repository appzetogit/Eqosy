import dotenv from "dotenv";
import mongoose from "mongoose";
import { FoodPageContent } from "../src/modules/food/admin/models/pageContent.model.js";

dotenv.config();

const INITIAL_PAGES = {
  terms: {
    title: 'User Terms and Conditions',
    content: `<h2>User Terms and Conditions</h2><p>Welcome to Eqosy. By accessing or using our application, website, and services, you agree to be bound by these Terms and Conditions.</p><h3>1. Account Registration</h3><p>You must provide accurate information when registering an account. You are responsible for maintaining the confidentiality of your account credentials.</p><h3>2. Platform Services</h3><p>Eqosy provides an on-demand marketplace connecting users with restaurant vendors, delivery partners, and taxi drivers.</p><h3>3. Payments and Cancellation</h3><p>Payments made through the platform are processed securely. Cancellations and refunds are governed by our active cancellation and refund policies.</p><h3>4. User Conduct</h3><p>Users must not engage in fraudulent activities, abuse referral bonuses, or misuse system services.</p>`
  },
  'restaurant-terms': {
    title: 'Restaurant Partner Terms and Conditions',
    content: `<h2>Restaurant Partner Terms and Conditions</h2><p>These terms govern the relationship between Eqosy and merchant restaurant partners.</p><h3>1. Merchant Onboarding</h3><p>Merchants must maintain valid food safety licenses (FSSAI/Local Authority) and accurate business documentation.</p><h3>2. Order Processing</h3><p>Restaurants agree to prepare accepted orders in accordance with safety, hygiene, and timing guidelines.</p><h3>3. Commissions & Settlements</h3><p>Platform commissions will be deducted automatically based on agreed rates. Net earnings are settled to merchant accounts per the payment schedule.</p>`
  },
  'delivery-terms': {
    title: 'Delivery Partner Terms and Conditions',
    content: `<h2>Delivery Partner Terms and Conditions</h2><p>These terms apply to all registered delivery fleet partners operating on the Eqosy platform.</p><h3>1. Partner Eligibility</h3><p>Delivery partners must hold a valid driving license, active vehicle registration, and necessary insurance.</p><h3>2. Delivery Code of Conduct</h3><p>Partners are expected to handle orders safely, follow traffic guidelines, and maintain courteous behavior with customers.</p><h3>3. Payouts and Tips</h3><p>Earnings, delivery fees, and 100% of customer tips are credited to the delivery partner's wallet upon order completion.</p>`
  },
  'driver-terms': {
    title: 'Driver Partner Terms and Conditions',
    content: `<h2>Driver Partner Terms and Conditions</h2><p>These terms govern driver partners operating cab, auto, bike, and intercity transit services on the Eqosy Taxi platform.</p><h3>1. Vehicle Standards</h3><p>Drivers must maintain roadworthy, clean, and insured vehicles with valid commercial or private permits as applicable.</p><h3>2. Safety & Standards</h3><p>Drivers must strictly comply with local speed limits, navigation routes, and safety protocols.</p><h3>3. Fare Bidding & Policy</h3><p>Ride fares and bid percentages must stay within configured admin policy ranges. Tariff manipulation is prohibited.</p>`
  },
  'seller-terms': {
    title: 'Seller Partner Terms and Conditions',
    content: `<h2>Seller Partner Terms and Conditions</h2><p>Terms for store merchants, retail vendors, and quick-commerce sellers listing products on Eqosy.</p><h3>1. Inventory & Pricing</h3><p>Sellers are responsible for keeping product pricing, stock availability, and descriptions accurate and updated.</p><h3>2. Dispatch</h3><p>Orders must be packed securely and handed over to delivery partners promptly.</p>`
  },
  privacy: {
    title: 'User Privacy Policy',
    content: `<h2>User Privacy Policy</h2><p>Eqosy values your privacy. This Privacy Policy details how we collect, use, and protect your personal information.</p><h3>1. Information We Collect</h3><p>We collect your phone number, name, email address, delivery addresses, and precise GPS location when using active app features.</p><h3>2. How We Use Information</h3><p>Location data is used solely to match you with nearby drivers, calculate delivery distances, and fulfill orders.</p><h3>3. Data Security</h3><p>We implement end-to-end security protocols. We do not sell or trade your personal information to third parties.</p>`
  },
  'restaurant-privacy': {
    title: 'Restaurant Partner Privacy Policy',
    content: `<h2>Restaurant Partner Privacy Policy</h2><p>This privacy policy outlines how merchant financial details, store locations, and operational data are handled securely by Eqosy.</p>`
  },
  'delivery-privacy': {
    title: 'Delivery Partner Privacy Policy',
    content: `<h2>Delivery Partner Privacy Policy</h2><p>Outlines delivery partner background checks, live GPS tracking during shifts, and wallet transaction privacy rules.</p>`
  },
  'driver-privacy': {
    title: 'Driver Partner Privacy Policy',
    content: `<h2>Driver Partner Privacy Policy</h2><p>Outlines driver document verification, trip route tracking, and account data security standards.</p>`
  },
  'seller-privacy': {
    title: 'Seller Partner Privacy Policy',
    content: `<h2>Seller Partner Privacy Policy</h2><p>Outlines seller account confidentiality, store metrics, and product catalog data protection protocols.</p>`
  }
};

const connect = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/eqosy";
  await mongoose.connect(uri);
};

const seed = async () => {
  await connect();
  console.log("Connected to MongoDB.");

  for (const [key, data] of Object.entries(INITIAL_PAGES)) {
    const existing = await FoodPageContent.findOne({ key });
    if (!existing || !existing.legal || !existing.legal.content) {
      await FoodPageContent.findOneAndUpdate(
        { key },
        {
          $set: {
            key,
            legal: { title: data.title, content: data.content },
            updatedByRole: 'ADMIN'
          }
        },
        { upsert: true, new: true }
      );
      console.log(`Seeded legal page key: ${key}`);
    } else {
      console.log(`Legal page key '${key}' already exists in DB.`);
    }
  }

  console.log("Seeding finished successfully.");
};

seed()
  .catch((err) => {
    console.error("Error seeding legal pages:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
