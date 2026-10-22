import mongoose from 'mongoose';
import { env } from '../../../../config/env.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { SetPrice } from '../../admin/models/SetPrice.js';
import { Driver } from '../models/Driver.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { Ride } from '../../user/models/Ride.js';
import { getWalletSettings } from '../../services/appSettingsService.js';
import { applyOwnerWalletAdjustment, resolveOwnerPayout, splitRideEarning } from '../../services/ownerPayoutService.js';

const normalizeAmount = (value, fieldName = 'amount') => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    throw new ApiError(400, `${fieldName} must be a valid number`);
  }

  return Math.round(amount * 100) / 100;
};

const normalizePaymentMethod = (value) => (
  String(value || '').trim().toLowerCase() === 'cash' ? 'cash' : 'online'
);

const normalizeCommissionType = (value) => {
  const numericValue = Number(value);
  return numericValue === 1 ? 'percentage' : 'fixed';
};

const computeCommissionAmount = ({ fare, type, value }) => {
  const safeFare = normalizeAmount(fare, 'fare');
  const safeValue = Math.max(normalizeAmount(value || 0, 'commission'), 0);

  if (normalizeCommissionType(type) === 'percentage') {
    return Math.min(Math.round((safeFare * safeValue)) / 100, safeFare);
  }

  return Math.min(safeValue, safeFare);
};

const resolveCommissionConfigForRide = async (ride, session) => {
  if (ride?.pricingSnapshot?.admin_commission_from_driver !== undefined) {
    return {
      source: ride.pricingSnapshot?.setPriceId ? 'ride_snapshot' : 'ride_snapshot_fallback',
      type: Number(ride.pricingSnapshot?.admin_commission_type_from_driver ?? 1),
      value: Number(ride.pricingSnapshot?.admin_commission_from_driver ?? 0),
    };
  }

  if (ride?.vehicleTypeId) {
    const normalizedServiceType = String(ride?.serviceType || '').trim().toLowerCase();
    const savedTransportType = String(ride.transport_type || '').trim().toLowerCase();
    const normalizedTransportType =
      normalizedServiceType === 'parcel'
        ? (savedTransportType === 'delivery' || savedTransportType === 'both' ? savedTransportType : 'delivery')
        : (savedTransportType || 'taxi');
    const filters = [
      {
        vehicle_type: ride.vehicleTypeId,
        active: 1,
        status: 'active',
        ...(ride.service_location_id ? { service_location_id: ride.service_location_id } : {}),
        transport_type: normalizedTransportType,
      },
      {
        vehicle_type: ride.vehicleTypeId,
        active: 1,
        status: 'active',
        ...(ride.service_location_id ? { service_location_id: ride.service_location_id } : {}),
        transport_type: 'both',
      },
      {
        vehicle_type: ride.vehicleTypeId,
        active: 1,
        status: 'active',
        transport_type: normalizedTransportType,
      },
      {
        vehicle_type: ride.vehicleTypeId,
        active: 1,
        status: 'active',
        transport_type: 'both',
      },
    ];

    for (const filter of filters) {
      const setPrice = await SetPrice.findOne(filter).sort({ updatedAt: -1, createdAt: -1 }).session(session).lean();
      if (setPrice) {
        return {
          source: 'set_price_lookup',
          type: Number(setPrice.admin_commission_type_from_driver ?? 1),
          value: Number(setPrice.admin_commission_from_driver ?? 0),
          setPriceId: setPrice._id,
        };
      }
    }
  }

  return {
    source: 'env_fallback',
    type: 1,
    value: Number(env.driverWallet.commissionPercent || 0),
  };
};

const toNonNegativeNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : fallback;
};

const isEnabledSetting = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const resolveWalletRules = async () => {
  const walletSettings = await getWalletSettings();
  const configuredValue = Number(walletSettings.driver_wallet_minimum_amount_to_get_an_order);
  const defaultCashLimit = toNonNegativeNumber(env.driverWallet.defaultCashLimit, 500);

  // If a negative minimum balance is explicitly configured (e.g. -500), honor it directly.
  // If a positive value was entered as the cash debt limit (e.g. 100 or 500), or seeded as 100,
  // interpret it as the cash limit floor (-configuredValue) so drivers with 0 balance are never blocked.
  let minimumBalanceForOrders = -defaultCashLimit;
  if (Number.isFinite(configuredValue) && configuredValue !== 0) {
    minimumBalanceForOrders = configuredValue < 0 ? configuredValue : -configuredValue;
  }

  const effectiveCashLimit = Math.abs(minimumBalanceForOrders);

  return {
    minimumBalanceForOrders,
    cashLimit: effectiveCashLimit,
    minimumTopUpAmount: toNonNegativeNumber(walletSettings.minimum_amount_added_to_wallet, 0),
    minimumTransferAmount: toNonNegativeNumber(walletSettings.minimum_wallet_amount_for_transfer, 0),
    isWalletEnabled: isEnabledSetting(walletSettings.show_wallet_feature_for_driver, true),
    isTransferEnabled: isEnabledSetting(walletSettings.enable_wallet_transfer_driver, true),
  };
};

const getWalletSnapshot = async (driver) => {
  const rules = await resolveWalletRules();
  const balance = Number(driver?.wallet?.balance || 0);
  const driverCustomCashLimit = Number(driver?.wallet?.cashLimit || 0);
  const effectiveCashLimit = driverCustomCashLimit > 0 ? driverCustomCashLimit : rules.cashLimit;
  const effectiveMinBalance = -Math.abs(effectiveCashLimit);

  // Driver is only blocked if their balance drops below their negative cash limit (debt exceeded)
  const isBlocked = !rules.isWalletEnabled || balance < effectiveMinBalance;

  return {
    balance,
    cashLimit: effectiveCashLimit,
    minimumBalanceForOrders: effectiveMinBalance,
    availableForOrders: Math.round((balance - effectiveMinBalance) * 100) / 100,
    isBlocked,
    rules,
  };
};

export const serializeDriverWallet = async (driver) => {
  const wallet = await getWalletSnapshot(driver);

  return {
    balance: wallet.balance,
    cashLimit: wallet.cashLimit,
    minimumBalanceForOrders: wallet.minimumBalanceForOrders,
    availableForOrders: wallet.availableForOrders,
    isWalletEnabled: wallet.rules.isWalletEnabled,
    isTransferEnabled: wallet.rules.isTransferEnabled,
    minimumTopUpAmount: wallet.rules.minimumTopUpAmount,
    minimumTransferAmount: wallet.rules.minimumTransferAmount,
    isBlocked: wallet.isBlocked,
  };
};

export const ensureDriverWalletCanAcceptRide = async (driverOrId, { session } = {}) => {
  const driver =
    typeof driverOrId === 'object' && driverOrId?._id
      ? driverOrId
      : await Driver.findById(driverOrId).session(session);

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const wallet = await getWalletSnapshot(driver);
  const isBlocked = wallet.isBlocked;

  if (isBlocked) {
    await Driver.findByIdAndUpdate(driver._id, {
      'wallet.cashLimit': wallet.cashLimit,
      'wallet.isBlocked': true,
    });
    throw new ApiError(403, wallet.rules.isWalletEnabled
      ? 'Driver wallet minimum balance is not met. Please top up to accept rides.'
      : 'Driver wallet is disabled by admin.');
  }

  if (Number(driver?.wallet?.cashLimit) !== wallet.cashLimit || driver?.wallet?.isBlocked) {
    await Driver.findByIdAndUpdate(driver._id, {
      'wallet.cashLimit': wallet.cashLimit,
      'wallet.isBlocked': false,
    });
  }

  return wallet;
};

export const applyDriverWalletAdjustment = async ({
  driverId,
  amount,
  type,
  rideId = null,
  description = '',
  metadata = {},
  session = null,
}) => {
  const normalizedAmount = normalizeAmount(amount);

  if (!normalizedAmount) {
    throw new ApiError(400, 'Wallet adjustment amount cannot be zero');
  }

  const driver = await Driver.findById(driverId).session(session);

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const before = await getWalletSnapshot(driver);
  const balanceAfter = Math.round((before.balance + normalizedAmount) * 100) / 100;
  const isBlockedAfter = !before.rules.isWalletEnabled || balanceAfter < before.minimumBalanceForOrders;

  const updatedDriver = await Driver.findByIdAndUpdate(
    driverId,
    {
      $inc: { 'wallet.balance': normalizedAmount },
      $set: {
        'wallet.cashLimit': before.cashLimit,
        'wallet.isBlocked': isBlockedAfter,
      },
    },
    { returnDocument: 'after', session },
  );

  const [transaction] = await WalletTransaction.create(
    [
      {
        driverId,
        rideId,
        type,
        amount: normalizedAmount,
        balanceBefore: before.balance,
        balanceAfter,
        cashLimit: before.cashLimit,
        isBlockedAfter,
        description,
        metadata,
      },
    ],
    { session },
  );

  return {
    driver: updatedDriver,
    wallet: await serializeDriverWallet(updatedDriver),
    transaction,
  };
};

export const topUpDriverWallet = async ({ driverId, amount, metadata = {} }) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const walletSettings = await getWalletSettings();
    if (!isEnabledSetting(walletSettings.show_wallet_feature_for_driver, true)) {
      throw new ApiError(403, 'Driver wallet is disabled by admin');
    }

    const minimumTopUpAmount = toNonNegativeNumber(walletSettings.minimum_amount_added_to_wallet, 0);
    const normalizedTopUpAmount = Math.abs(normalizeAmount(amount));

    if (minimumTopUpAmount > 0 && normalizedTopUpAmount < minimumTopUpAmount) {
      throw new ApiError(400, `amount must be at least ${minimumTopUpAmount}`);
    }

    const result = await applyDriverWalletAdjustment({
      driverId,
      amount: normalizedTopUpAmount,
      type: 'top_up',
      description: 'Driver wallet top-up',
      metadata: {
        ...metadata,
        minimumTopUpAmount,
      },
      session,
    });

    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Settles one completed ride of a fleet driver (a driver that belongs to an owner).
 * Online: owner wallet +ownerShare, driver wallet +driverShare.
 * Cash:   owner wallet -(commission + carried cancellation fee); driver keeps driverShare and owes the owner
 *         the rest of the cash (tracked in driver.fleetCashDue until the owner marks it received).
 */
const settleFleetRide = async ({
  ride,
  ownerId,
  fare,
  baseRideFare,
  previousCancellationFee,
  commissionAmount,
  paymentMethod,
  commissionConfig,
  session,
}) => {
  const payout = await resolveOwnerPayout(ownerId);
  const net = Math.max(baseRideFare - commissionAmount, 0);
  const { ownerShare, driverShare } = splitRideEarning({ net, ownerSharePercent: payout.ownerSharePercent });
  const metadata = {
    fare,
    baseRideFare,
    previousCancellationFee,
    commissionAmount,
    net,
    ownerShare,
    driverShare,
    paymentMethod,
    payoutModel: payout.model,
    ownerSharePercent: payout.ownerSharePercent,
    commissionSource: commissionConfig.source,
  };

  // Drivers' own earnings figure reflects only what the driver keeps.
  ride.driverEarnings = driverShare;
  ride.ownerEarnings = ownerShare;
  await ride.save({ session });

  let driverResult = null;
  if (paymentMethod === 'cash') {
    const ownerDebit = Math.round((commissionAmount + previousCancellationFee) * 100) / 100;
    if (ownerDebit > 0) {
      await applyOwnerWalletAdjustment({
        ownerId,
        amount: -ownerDebit,
        category: 'commission',
        title: `Admin commission · cash ride`,
        rideId: ride._id,
        driverId: ride.driverId,
        metadata,
        session,
      });
    }
    const cashOwedToOwner = Math.max(0, Math.round((fare - driverShare) * 100) / 100);
    if (cashOwedToOwner > 0) {
      await Driver.updateOne({ _id: ride.driverId }, { $inc: { fleetCashDue: cashOwedToOwner } }, { session });
    }
  } else {
    if (ownerShare > 0) {
      await applyOwnerWalletAdjustment({
        ownerId,
        amount: ownerShare,
        category: 'ride_earning',
        title: `Ride earning · online ride`,
        rideId: ride._id,
        driverId: ride.driverId,
        metadata,
        session,
      });
    }
    if (driverShare > 0) {
      driverResult = await applyDriverWalletAdjustment({
        driverId: ride.driverId,
        rideId: ride._id,
        amount: driverShare,
        type: 'ride_earning',
        description: `Driver share (${100 - payout.ownerSharePercent}%) for online ride`,
        metadata,
        session,
      });
    }
  }

  return driverResult || { fleet: true, ownerShare, driverShare };
};

export const settleCompletedRideWallet = async ({ rideId }) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const ride = await Ride.findOneAndUpdate(
      { _id: rideId, walletSettledAt: null, driverId: { $ne: null } },
      { $set: { walletSettledAt: new Date() } },
      { returnDocument: 'after', session },
    );

    if (!ride) {
      await session.commitTransaction();
      return null;
    }

    const fare = Math.round(ride.fare || 0);
    const previousCancellationFee = Math.max(0, Math.round(ride.previousCancellationFee || 0));
    const baseRideFare = Math.max(0, Math.round(ride.baseRideFare || (fare - previousCancellationFee)));
    const surgeAmount = Math.max(0, Math.round(ride?.pricingSnapshot?.ride_surge_amount || 0));
    const commissionableFare = Math.max(0, Math.round(baseRideFare - surgeAmount));
    const commissionConfig = await resolveCommissionConfigForRide(ride, session);
    const commissionAmount = Math.round(computeCommissionAmount({
      fare: commissionableFare,
      type: commissionConfig.type,
      value: commissionConfig.value,
    }));
    const paymentMethod = normalizePaymentMethod(ride.paymentMethod);
    const driverEarnings = Math.max(Math.round(baseRideFare - commissionAmount), 0);
    const amount = paymentMethod === 'cash'
      ? -Math.round(commissionAmount + previousCancellationFee)
      : driverEarnings;
    const type = paymentMethod === 'cash' ? 'commission_deduction' : 'ride_earning';

    ride.paymentMethod = paymentMethod;
    ride.commissionAmount = commissionAmount;
    ride.driverEarnings = driverEarnings;
    ride.pricingSnapshot = {
      ...(ride.pricingSnapshot?.toObject ? ride.pricingSnapshot.toObject() : ride.pricingSnapshot || {}),
      setPriceId: ride.pricingSnapshot?.setPriceId || commissionConfig.setPriceId || null,
      admin_commission_type_from_driver: Number(commissionConfig.type ?? ride.pricingSnapshot?.admin_commission_type_from_driver ?? 1),
      admin_commission_from_driver: Number(commissionConfig.value ?? ride.pricingSnapshot?.admin_commission_from_driver ?? 0),
      resolvedAt: ride.pricingSnapshot?.resolvedAt || new Date(),
    };
    await ride.save({ session });

    // Mark previous cancellation dues as paid in next ride
    if (Array.isArray(ride.carriedCancellationRideIds) && ride.carriedCancellationRideIds.length > 0) {
      await Ride.updateMany(
        { _id: { $in: ride.carriedCancellationRideIds } },
        { $set: { 'cancellation.payment_status': 'paid_in_next_ride' } },
        { session }
      );
    }

    // Fleet driver: the ride's net earning is shared with the owner per the owner payout settings.
    const fleetDriver = await Driver.findById(ride.driverId).select('owner_id').session(session).lean();
    if (fleetDriver?.owner_id) {
      const fleetResult = await settleFleetRide({
        ride,
        ownerId: fleetDriver.owner_id,
        fare,
        baseRideFare,
        previousCancellationFee,
        commissionAmount,
        paymentMethod,
        commissionConfig,
        session,
      });
      await session.commitTransaction();
      return fleetResult ? { ...fleetResult, ride } : null;
    }

    if (!amount) {
      await session.commitTransaction();
      return null;
    }

    const result = await applyDriverWalletAdjustment({
      driverId: ride.driverId,
      rideId: ride._id,
      amount,
      type,
      description: paymentMethod === 'cash'
        ? (previousCancellationFee > 0
            ? 'Commission & collected cancellation fee deducted'
            : 'Commission deducted for cash ride')
        : 'Driver earning credited for online ride',
      metadata: {
        fare,
        baseRideFare,
        previousCancellationFee,
        surgeAmount,
        commissionableFare,
        commissionAmount,
        driverEarnings,
        paymentMethod,
        commissionSource: commissionConfig.source,
        commissionType: normalizeCommissionType(commissionConfig.type),
        commissionValue: Number(commissionConfig.value || 0),
      },
      session,
    });

    await session.commitTransaction();
    return {
      ...result,
      ride,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
