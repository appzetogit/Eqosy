import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { Owner } from '../admin/models/Owner.js';
import { OwnerWalletTransaction } from '../admin/models/OwnerWalletTransaction.js';
import { BusService } from '../admin/models/BusService.js';
import { BusBooking } from '../user/models/BusBooking.js';
import { TripInstance } from '../user/models/TripInstance.js';
import { WithdrawalRequest } from '../admin/models/WithdrawalRequest.js';

/*
 * Owner payouts
 * -------------
 * Ride (fleet driver = driver with owner_id):
 *   net = ride fare - admin commission
 *   salary model     -> owner gets 100% of net, driver gets 0 (owner pays the driver a salary outside the app)
 *   commission model -> owner gets ownerSharePercent% of net, driver gets the rest
 *   Online ride: platform holds the money -> owner wallet +ownerShare, driver wallet +driverShare.
 *   Cash ride:   driver holds the cash    -> owner wallet -commission (owner pays the platform),
 *                driver keeps driverShare, and owes the owner (cash - driverShare) = "cash with driver".
 * Bus ticket (bus with ownerId, paid online):
 *   owner earns ticket - bus admin commission - refunds, but only once the trip is over and only through a manual
 *   payout request that the admin pays out (never credited to the wallet automatically).
 */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const clampPercent = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
};

const payoutSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    model: { type: String, enum: ['salary', 'commission'], default: 'salary' },
    ownerSharePercent: { type: Number, min: 0, max: 100, default: 70 },
  },
  { timestamps: true, collection: 'taxi_owner_payout_settings' },
);

export const OwnerPayoutSetting =
  mongoose.models.TaxiOwnerPayoutSetting || mongoose.model('TaxiOwnerPayoutSetting', payoutSettingSchema);

const serializeSettings = (doc) => ({
  model: doc?.model === 'commission' ? 'commission' : 'salary',
  ownerSharePercent: clampPercent(doc?.ownerSharePercent, 70),
  updatedAt: doc?.updatedAt || null,
});

export const getOwnerPayoutSettings = async () => {
  const doc = await OwnerPayoutSetting.findOne({ key: 'global' }).lean();
  return serializeSettings(doc);
};

export const updateOwnerPayoutSettings = async (payload = {}) => {
  const model = String(payload.model || '').toLowerCase();
  if (!['salary', 'commission'].includes(model)) {
    throw new ApiError(400, 'model must be "salary" or "commission"');
  }
  const ownerSharePercent = clampPercent(payload.ownerSharePercent, NaN);
  if (model === 'commission' && !Number.isFinite(ownerSharePercent)) {
    throw new ApiError(400, 'ownerSharePercent must be between 0 and 100');
  }
  const doc = await OwnerPayoutSetting.findOneAndUpdate(
    { key: 'global' },
    { $set: { model, ...(Number.isFinite(ownerSharePercent) ? { ownerSharePercent } : {}) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return serializeSettings(doc);
};

/** Effective payout rule for one owner (owner override, else global). */
export const resolveOwnerPayout = async (ownerOrId) => {
  const owner =
    ownerOrId && typeof ownerOrId === 'object' && ownerOrId.payout !== undefined
      ? ownerOrId
      : await Owner.findById(ownerOrId).select('payout').lean();
  const global = await getOwnerPayoutSettings();
  const ownModel = owner?.payout?.model;
  if (ownModel === 'salary' || ownModel === 'commission') {
    return {
      model: ownModel,
      ownerSharePercent: ownModel === 'salary' ? 100 : clampPercent(owner?.payout?.ownerSharePercent, global.ownerSharePercent),
      source: 'owner',
    };
  }
  return {
    model: global.model,
    ownerSharePercent: global.model === 'salary' ? 100 : global.ownerSharePercent,
    source: 'global',
  };
};

export const updateOwnerPayoutOverride = async (ownerId, payload = {}) => {
  const model = String(payload.model || 'default').toLowerCase();
  if (!['default', 'salary', 'commission'].includes(model)) {
    throw new ApiError(400, 'model must be default, salary or commission');
  }
  const ownerSharePercent = clampPercent(payload.ownerSharePercent, null);
  if (model === 'commission' && ownerSharePercent === null) {
    throw new ApiError(400, 'ownerSharePercent must be between 0 and 100');
  }
  const owner = await Owner.findByIdAndUpdate(
    ownerId,
    { $set: { 'payout.model': model, 'payout.ownerSharePercent': model === 'commission' ? ownerSharePercent : null } },
    { new: true },
  ).select('payout').lean();
  if (!owner) throw new ApiError(404, 'Owner not found');
  return { override: owner.payout, effective: await resolveOwnerPayout(owner) };
};

/** Split a ride's net earning between owner and driver. */
export const splitRideEarning = ({ net, ownerSharePercent }) => {
  const safeNet = Math.max(0, round2(net));
  const ownerShare = round2((safeNet * clampPercent(ownerSharePercent, 100)) / 100);
  return { ownerShare, driverShare: round2(safeNet - ownerShare) };
};

/** Atomically change an owner's wallet and record the transaction. Positive amount = credit. */
export const applyOwnerWalletAdjustment = async ({
  ownerId,
  amount,
  category = 'adjustment',
  title,
  rideId = null,
  busBookingId = null,
  driverId = null,
  metadata = {},
  session = null,
}) => {
  const value = round2(amount);
  if (!value) return null;

  const owner = await Owner.findByIdAndUpdate(
    ownerId,
    { $inc: { 'wallet.balance': value } },
    { new: true, session },
  ).select('wallet');
  if (!owner) throw new ApiError(404, 'Owner not found');

  const balance = round2(owner.wallet?.balance);
  const [transaction] = await OwnerWalletTransaction.create(
    [
      {
        ownerId,
        amount: Math.abs(value),
        kind: value > 0 ? 'credit' : 'debit',
        title: title || (value > 0 ? 'Credit' : 'Debit'),
        balance,
        category,
        rideId,
        busBookingId,
        driverId,
        metadata,
      },
    ],
    { session },
  );
  return { balance, transaction };
};

/* ------------------------------- Bus ------------------------------- */

const activeSeatCount = (booking) => {
  const cancelled = new Set((booking.cancelledSeats || []).map((s) => String(s?.seatId || '')));
  return (booking.seatIds || []).filter((id) => !cancelled.has(String(id))).length;
};

/**
 * Bus earnings are NOT credited to the owner wallet automatically any more. The owner requests a payout for
 * bookings whose trip has finished and the admin pays it manually (see createBusPayoutRequest).
 * Kept as a no-op so the booking / cancellation flows that call it keep working.
 */
export const syncBusBookingOwnerEarning = async () => null;

/** What the owner is owed for one booking (ticket minus platform commission minus refunds minus legacy wallet credit). */
const bookingPayable = (booking) => {
  const snapshot = booking.financialSnapshot || {};
  const totalPaid = Number(snapshot.totalPaidAmount || booking.amount || 0);
  const refunded = (booking.cancelledSeats || []).reduce((sum, seat) => sum + Number(seat?.refundAmount || 0), 0);
  const operatorEarning = Number(snapshot.operatorEarning) > 0 ? Number(snapshot.operatorEarning) : totalPaid;
  const ratio = totalPaid > 0 ? operatorEarning / totalPaid : 0;
  const alreadyInWallet = round2(snapshot.ownerCreditedAmount || 0);
  return Math.max(0, round2(Math.max(0, totalPaid - refunded) * ratio - alreadyInWallet));
};

const isBookingPaid = (booking) => {
  const status = String(booking.payment?.status || '').toLowerCase();
  return Boolean(booking.payment?.paidAt) || ['paid', 'partially_refunded', 'refunded'].includes(status);
};

/**
 * Paid, not-yet-requested bookings of the owner's buses, with the trip phase:
 * completed / ongoing (departed, not arrived) / upcoming. Completed and ongoing can be requested (ongoing ones
 * are flagged so the admin decides manually); upcoming ones are only shown.
 */
const findEligibleBusBookings = async (ownerId) => {
  const buses = await BusService.find({ ownerId }).select('_id').lean();
  if (!buses.length) return [];
  const bookings = await BusBooking.find({
    busServiceId: { $in: buses.map((b) => b._id) },
    'financialSnapshot.settlementStatus': { $in: ['pending', null] },
  });
  if (!bookings.length) return [];

  const trips = await TripInstance.find({ _id: { $in: bookings.map((b) => b.tripId).filter(Boolean) } })
    .select('status departureDateTime arrivalDateTime')
    .lean();
  const tripMap = new Map(trips.map((t) => [String(t._id), t]));
  const now = Date.now();

  return bookings
    .filter((booking) => {
      if (!isBookingPaid(booking)) return false;
      const trip = tripMap.get(String(booking.tripId));
      return Boolean(trip) && trip.status !== 'cancelled';
    })
    .map((booking) => {
      const trip = tripMap.get(String(booking.tripId));
      const phase = trip.status === 'completed' || new Date(trip.arrivalDateTime).getTime() < now
        ? 'completed'
        : trip.status === 'in_transit' || new Date(trip.departureDateTime).getTime() <= now
          ? 'ongoing'
          : 'upcoming';
      return { booking, phase, amount: bookingPayable(booking) };
    })
    .filter((row) => row.amount > 0);
};

export const getBusPayoutSummary = async (ownerId) => {
  const rows = await findEligibleBusBookings(ownerId);
  const total = (phase) => round2(rows.filter((row) => row.phase === phase).reduce((sum, row) => sum + row.amount, 0));
  const completed = total('completed');
  const ongoing = total('ongoing');
  return { available: round2(completed + ongoing), completed, ongoing, upcoming: total('upcoming') };
};

/** Owner asks the admin to pay out all finished-trip bus earnings. Admin pays manually. */
export const createBusPayoutRequest = async (ownerId, details = {}) => {
  const rows = (await findEligibleBusBookings(ownerId)).filter((row) => row.phase !== 'upcoming');
  const amount = round2(rows.reduce((sum, row) => sum + row.amount, 0));
  const ongoingAmount = round2(rows.filter((row) => row.phase === 'ongoing').reduce((sum, row) => sum + row.amount, 0));
  if (!rows.length || amount <= 0) {
    throw new ApiError(400, 'No bus earnings are available to request yet');
  }

  // Claim the bookings so a double tap can't request the same money twice.
  const ids = rows.map((row) => row.booking._id);
  const claim = await BusBooking.updateMany(
    { _id: { $in: ids }, 'financialSnapshot.settlementStatus': { $in: ['pending', null] } },
    { $set: { 'financialSnapshot.settlementStatus': 'requested' } },
  );
  if (claim.modifiedCount !== ids.length) {
    await BusBooking.updateMany(
      { _id: { $in: ids }, 'financialSnapshot.settlementStatus': 'requested' },
      { $set: { 'financialSnapshot.settlementStatus': 'pending' } },
    );
    throw new ApiError(409, 'Bus earnings changed, please try again');
  }

  try {
    return await WithdrawalRequest.create({
      transactionId: `obp_${Date.now().toString(36)}`,
      owner_id: ownerId,
      kind: 'bus',
      amount,
      ongoingAmount,
      busBookings: rows.map((row) => ({ bookingId: row.booking._id, amount: row.amount })),
      ...details,
      status: 'pending',
    });
  } catch (error) {
    await BusBooking.updateMany({ _id: { $in: ids } }, { $set: { 'financialSnapshot.settlementStatus': 'pending' } });
    throw error;
  }
};

/** Admin result for a bus payout request: paid -> bookings 'paid'; rejected -> bookings available again. */
export const finishBusPayoutRequest = async (request, paid) => {
  const ids = (request.busBookings || []).map((item) => item.bookingId);
  if (!ids.length) return;
  await BusBooking.updateMany(
    { _id: { $in: ids } },
    { $set: { 'financialSnapshot.settlementStatus': paid ? 'paid' : 'pending' } },
  );
};
