import { connectDB } from '../src/config/db.js';
import { BusService } from '../src/modules/taxi/admin/models/BusService.js';

const check = async () => {
  await connectDB();
  
  const services = await BusService.find({}).lean();
  console.log("=== BUS SERVICES ===");
  console.log(JSON.stringify(services, null, 2));
  
  process.exit(0);
};

check().catch(err => {
  console.error(err);
  process.exit(1);
});
