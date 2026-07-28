const mongoose = require('mongoose');

const uri = "mongodb+srv://eqousyindia_db_user:dNtr8TXRxpXcVyY@eqosycluster.8k7ehhx.mongodb.net/test?appName=EqosyCluster";

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log("Connected!");

  // Find fee settings
  const feeSettingsCol = mongoose.connection.collection('food_fee_settings');
  const feeSettings = await feeSettingsCol.find({}).toArray();
  console.log("\n--- food_fee_settings ---");
  console.log(JSON.stringify(feeSettings, null, 2));

  // Find commission rules
  const commissionRulesCol = mongoose.connection.collection('food_delivery_commission_rules');
  const rules = await commissionRulesCol.find({}).toArray();
  console.log("\n--- food_delivery_commission_rules ---");
  console.log(JSON.stringify(rules, null, 2));

  // Find zones
  const zonesCol = mongoose.connection.collection('food_zones');
  const zones = await zonesCol.find({}).toArray();
  console.log("\n--- food_zones ---");
  console.log(JSON.stringify(zones.map(z => ({ name: z.name, isActive: z.isActive, coordsCount: z.coordinates?.length })), null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
