import { sendResponse, sendError } from '../../../../utils/response.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';
import { getRestaurantWithdrawalSettings } from '../../admin/services/admin.service.js';
import { getRestaurantFinance } from '../services/restaurantFinance.service.js';

import { FoodRestaurant } from '../models/restaurant.model.js';
import { verifyRestaurantPayoutAccount } from '../services/restaurant.service.js';
import { isRazorpayxConfigured } from '../../../../core/payments/razorpayx.service.js';
import { assertVerifiedForPayout } from '../../../../core/payments/payoutAccount.service.js';

export const createWithdrawalRequestController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const { amount } = req.body;
        const parsedAmount = Number(amount);

        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return sendError(res, 400, 'Invalid withdrawal amount');

        const restaurant = await FoodRestaurant.findById(restaurantId)
            .select('upiId upiQrImage accountHolderName accountNumber ifscCode bankName payoutVerification')
            .lean();

        // Money only goes to the account that passed the ownership check; a bank override in the request is ignored.
        if (isRazorpayxConfigured()) {
            try {
                assertVerifiedForPayout(restaurant?.payoutVerification, {
                    accountNumber: restaurant?.accountNumber,
                    ifsc: restaurant?.ifscCode,
                    upiId: restaurant?.upiId
                });
            } catch (err) {
                return sendError(res, 400, err.message);
            }
        }

        const finance = await getRestaurantFinance(restaurantId);
        const totalEarnings = Number(finance?.currentCycle?.netAvailable ?? finance?.currentCycle?.estimatedPayout ?? 0);
        const withdrawalSettings = await getRestaurantWithdrawalSettings();
        const minimumWithdrawalAmount = Number(withdrawalSettings?.minimumWithdrawalAmount) || 0;

        if (parsedAmount < minimumWithdrawalAmount) {
            return sendError(res, 400, `Minimum withdrawal amount is Rs ${minimumWithdrawalAmount.toLocaleString('en-IN')}`);
        }

        if (parsedAmount > totalEarnings) {
            return sendError(res, 400, `Insufficient balance. Available to withdraw: Rs ${totalEarnings.toLocaleString('en-IN')}`);
        }

        const mergedBankDetails = {
            accountNumber: restaurant?.accountNumber || '',
            ifscCode: restaurant?.ifscCode || '',
            bankName: restaurant?.bankName || '',
            accountHolderName: restaurant?.accountHolderName || '',
            upiId: restaurant?.upiId || '',
            upiQrImage: restaurant?.upiQrImage || '',
            upiQrCode: restaurant?.upiQrImage || ''
        };

        const withdrawal = new FoodRestaurantWithdrawal({
            restaurantId,
            amount: parsedAmount,
            bankDetails: mergedBankDetails,
            status: 'pending'
        });

        await withdrawal.save();

        return sendResponse(res, 201, 'Withdrawal request submitted successfully', withdrawal);
    } catch (error) {
        next(error);
    }
};

/** Re-runs the ownership check on the bank/UPI details already saved on the restaurant. */
export const reverifyRestaurantBankDetailsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');
        const saved = await FoodRestaurant.findById(restaurantId).select('accountNumber upiId').lean();
        if (!saved?.accountNumber && !saved?.upiId) return sendError(res, 400, 'Please add your bank details first');

        await verifyRestaurantPayoutAccount(restaurantId);
        const v = (await FoodRestaurant.findById(restaurantId).select('payoutVerification').lean())?.payoutVerification || {};
        return sendResponse(res, 200, 'Bank verification updated', {
            verification: {
                status: v.status || 'unverified',
                registeredName: v.registeredName || '',
                maskedAccount: v.maskedAccount || '',
                failureReason: v.failureReason || ''
            }
        });
    } catch (error) {
        next(error);
    }
};

export const listMyWithdrawalsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const withdrawals = await FoodRestaurantWithdrawal.find({ restaurantId })
            .sort({ createdAt: -1 })
            .lean();

        return sendResponse(res, 200, 'Withdrawals fetched successfully', withdrawals);
    } catch (error) {
        next(error);
    }
};
