import mongoose from 'mongoose';
import { Transaction } from './models/transaction.model.js';
import { FoodUserWallet } from '../../modules/food/user/models/userWallet.model.js';
import { FoodRestaurantWallet } from '../../modules/food/restaurant/models/restaurantWallet.model.js';
import { FoodDeliveryWallet } from '../../modules/food/delivery/models/deliveryWallet.model.js';
import { FoodAdminWallet } from '../../modules/food/admin/models/adminWallet.model.js';
import { logger } from '../../utils/logger.js';

/**
 * Resolve the wallet model + id-field for a given entity.
 * Returns { Model, filter } so callers can findOne/updateOne generically.
 */
function resolveWallet(entityType, entityId) {
    switch (entityType) {
        case 'user': {
            const id = new mongoose.Types.ObjectId(entityId);
            return { Model: FoodUserWallet, filter: { userId: id }, idField: 'userId' };
        }
        case 'restaurant': {
            const id = new mongoose.Types.ObjectId(entityId);
            return { Model: FoodRestaurantWallet, filter: { restaurantId: id }, idField: 'restaurantId' };
        }
        case 'deliveryBoy': {
            const id = new mongoose.Types.ObjectId(entityId);
            return { Model: FoodDeliveryWallet, filter: { deliveryPartnerId: id }, idField: 'deliveryPartnerId' };
        }
        case 'admin':
            return { Model: FoodAdminWallet, filter: { key: 'platform' }, idField: 'key' };
        default:
            throw new Error(`Unknown entityType: ${entityType}`);
    }
}

/** Fixed ObjectId for admin entity used in Transaction documents (singleton) */
const ADMIN_ENTITY_OID = new mongoose.Types.ObjectId('000000000000000000000001');

/**
 * Ensure wallet exists, creating it if needed. Returns the wallet document.
 */
export async function ensureWallet(entityType, entityId) {
    const { Model, filter, idField } = resolveWallet(entityType, entityId);
    let wallet = await Model.findOne(filter);
    if (!wallet) {
        const createPayload = { ...filter, balance: 0 };
        wallet = await Model.create(createPayload);
    }
    return wallet;
}

/**
 * Get balance for an entity wallet.
 */
export async function getBalance(entityType, entityId) {
    const wallet = await ensureWallet(entityType, entityId);
    return {
        balance: Number(wallet.balance) || 0,
        lockedAmount: Number(wallet.lockedAmount) || 0,
        availableBalance: (Number(wallet.balance) || 0) - (Number(wallet.lockedAmount) || 0)
    };
}

/**
 * CORE ATOMIC OPERATION: Record a transaction AND update wallet balance
 * in a single MongoDB transaction. This is the ONLY way to change wallet balances.
 *
 * @param {Object} payload
 * @param {string} payload.entityType - 'user' | 'restaurant' | 'deliveryBoy' | 'admin'
 * @param {string} payload.entityId - ObjectId of the entity
 * @param {string} payload.type - 'credit' | 'debit'
 * @param {number} payload.amount - positive amount
 * @param {string} payload.description - human readable
 * @param {string} [payload.category] - transaction category
 * @param {string} [payload.orderId] - linked order
 * @param {string} [payload.paymentId] - linked payment
 * @param {Object} [payload.metadata] - extra data
 * @returns {Object} { transaction, wallet }
 */
export async function recordTransaction(payload) {
    const {
        entityType, entityId, type, amount,
        description = '', category = 'other',
        orderId = null, paymentId = null,
        metadata = undefined, module = 'food',
        idempotencyKey = null
    } = payload;

    if (!['credit', 'debit'].includes(type)) throw new Error('type must be credit or debit');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');

    const { Model, filter } = resolveWallet(entityType, entityId);
    const entityOid = entityType === 'admin'
        ? ADMIN_ENTITY_OID
        : new mongoose.Types.ObjectId(entityId);

    // Same key == same money movement: a retry/replay returns the original row instead of paying twice.
    if (idempotencyKey) {
        const prior = await Transaction.findOne({ idempotencyKey }).lean();
        if (prior) return { transaction: prior, wallet: { balance: prior.balanceAfter }, duplicate: true };
    }

    // The wallet row must exist before an atomic $inc (upsert is safe under concurrency).
    await Model.updateOne(filter, { $setOnInsert: { ...filter, balance: 0 } }, { upsert: true });

    const delta = type === 'credit' ? amount : -amount;
    const inc = { balance: delta };
    if (type === 'credit') {
        if (entityType === 'restaurant' || entityType === 'deliveryBoy') inc.totalEarnings = amount;
        else if (entityType === 'admin') inc.totalRevenue = amount;
    }
    // A debit only applies when enough balance is there (admin wallet may go negative).
    const guard = type === 'debit' && entityType !== 'admin'
        ? { ...filter, balance: { $gte: amount } }
        : filter;

    let session = null;
    let useTransaction = true;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
    } catch (sessionErr) {
        useTransaction = false;
        if (session) {
            try { session.endSession(); } catch (e) {}
            session = null;
        }
    }

    try {
        const sessionOption = useTransaction && session ? { session } : {};

        // 1. One atomic update: no read-modify-write, so concurrent movements can never overwrite each other.
        const updated = await Model.findOneAndUpdate(guard, { $inc: inc }, { new: true, ...sessionOption });
        if (!updated) {
            const current = await Model.findOne(filter, 'balance', sessionOption).lean();
            throw new Error(`Insufficient balance. Current: ${Number(current?.balance) || 0}, Debit: ${amount}`);
        }
        const newBalance = Math.round((Number(updated.balance) || 0) * 100) / 100;

        // 2. Ledger row in the same transaction. A duplicate idempotency key rolls the wallet change back.
        const txnPayload = {
            paymentId: paymentId ? new mongoose.Types.ObjectId(paymentId) : null,
            orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
            entityType,
            entityId: entityOid,
            type,
            amount,
            balanceAfter: newBalance,
            currency: 'INR',
            status: 'completed',
            description,
            category,
            module,
            metadata,
            ...(idempotencyKey ? { idempotencyKey } : {})
        };

        let txn;
        try {
            if (useTransaction && session) {
                [txn] = await Transaction.create([txnPayload], { session });
            } else {
                txn = await Transaction.create(txnPayload);
            }
        } catch (ledgerErr) {
            if (!useTransaction || !session) {
                // No DB transaction to roll back: undo the wallet change by hand.
                await Model.updateOne(filter, { $inc: Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, -v])) });
            }
            if (ledgerErr?.code === 11000 && idempotencyKey) {
                if (useTransaction && session) {
                    try { await session.abortTransaction(); } catch (e) {}
                }
                const prior = await Transaction.findOne({ idempotencyKey }).lean();
                return { transaction: prior, wallet: { balance: prior?.balanceAfter }, duplicate: true };
            }
            throw ledgerErr;
        }

        if (useTransaction && session) {
            await session.commitTransaction();
        }

        logger.info(`Transaction recorded: ${type} ${amount} INR for ${entityType}:${entityId} → balance ${newBalance}`);

        return {
            transaction: typeof txn?.toObject === 'function' ? txn.toObject() : txn,
            wallet: { balance: newBalance }
        };
    } catch (err) {
        if (useTransaction && session) {
            try { await session.abortTransaction(); } catch (e) {}
        }
        logger.error(`recordTransaction failed: ${err.message}`);
        throw err;
    } finally {
        if (useTransaction && session) {
            try { session.endSession(); } catch (e) {}
        }
    }
}

/**
 * List transactions for an entity with pagination.
 */
export async function getTransactionsByEntity(entityType, entityId, { page = 1, limit = 20 } = {}) {
    const skip = (Math.max(1, page) - 1) * limit;
    const entityOid = entityType === 'admin'
        ? ADMIN_ENTITY_OID
        : new mongoose.Types.ObjectId(entityId);
    const filter = {
        entityType,
        entityId: entityOid
    };

    const [docs, total] = await Promise.all([
        Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Transaction.countDocuments(filter)
    ]);

    return {
        transactions: docs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

/**
 * Get transactions for a specific order across all entities.
 */
export async function getTransactionsByOrder(orderId) {
    return Transaction.find({ orderId: new mongoose.Types.ObjectId(orderId) })
        .sort({ createdAt: -1 })
        .lean();
}
