import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import dotenv from 'dotenv';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

dotenv.config({ path: path.join(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

const backupDir = path.join(process.cwd(), 'db_backup', `backup_${Date.now()}`);

async function backupDatabase() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB.');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log(`📦 Found ${collections.length} collections. Exporting to ${backupDir}...`);

  for (const col of collections) {
    const colName = col.name;
    const documents = await mongoose.connection.db.collection(colName).find({}).toArray();
    const filePath = path.join(backupDir, `${colName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), 'utf-8');
    console.log(`  ✓ Exported ${documents.length} docs from [${colName}] -> ${path.basename(filePath)}`);
  }

  console.log('\n🎉 Backup Completed Successfully!');
  console.log(`📁 Backup Folder Path: ${backupDir}`);
  await mongoose.disconnect();
  process.exit(0);
}

backupDatabase().catch((err) => {
  console.error('❌ Backup Failed:', err);
  process.exit(1);
});
