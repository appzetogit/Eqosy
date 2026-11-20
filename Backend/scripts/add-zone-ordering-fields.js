/**
 * One-time migration: adds the "pause orders" fields to every existing food zone.
 * Safe to re-run: only touches zones that do not have the fields yet. Never pauses a zone.
 *
 *   node scripts/add-zone-ordering-fields.js            (dry run, prints what would change)
 *   node scripts/add-zone-ordering-fields.js --apply    (writes to the DB in MONGO_URI / MONGODB_URI)
 */
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';

const apply = process.argv.includes('--apply');

const run = async () => {
    if (!config.mongodbUri) throw new Error('MONGO_URI / MONGODB_URI is not set in .env');
    await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 30000 });
    const zones = mongoose.connection.collection('food_zones');

    const filter = { orderingPaused: { $exists: false } };
    const pending = await zones.countDocuments(filter);
    console.log(`DB: ${mongoose.connection.name} | zones missing the fields: ${pending}`);

    if (!apply) {
        console.log('Dry run only. Re-run with --apply to update.');
    } else {
        const res = await zones.updateMany(filter, {
            $set: {
                orderingPaused: false,
                orderingPausedMessage: '',
                orderingPausedAt: null,
                orderingPausedBy: null,
            },
        });
        console.log(`Updated ${res.modifiedCount} zone(s).`);
    }
    await zones.createIndex({ orderingPaused: 1 });
    await mongoose.disconnect();
};

run().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
