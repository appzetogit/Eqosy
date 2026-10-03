import express from 'express';
import { AuthError } from '../../../../core/auth/errors.js';
import * as adminController from '../controllers/admin.controller.js';
import * as foodApprovalController from '../controllers/foodApproval.controller.js';
import * as addonsApprovalController from '../controllers/addonsApproval.controller.js';
import * as businessSettingsController from '../controllers/businessSettings.controller.js';
import * as feedbackExperienceController from '../controllers/feedbackExperience.controller.js';
import * as notificationBroadcastController from '../controllers/notificationBroadcast.controller.js';
import * as diningAdminController from '../../dining/controllers/diningAdmin.controller.js';
import * as orderController from '../../orders/controllers/order.controller.js';
import { getAdminPageController, upsertAdminPageController } from '../controllers/pageContent.controller.js';
import { upload } from '../../../../middleware/upload.js';
import { invalidateCache } from '../../../../middleware/cache.js';
import { attachFoodAdminContext, requireFoodResourceAccess } from '../middlewares/foodAdmin.middleware.js';
import * as foodAdminManagementController from '../controllers/foodAdminManagement.controller.js';

const router = express.Router();

// ----- Public Business Settings (No Admin Required) -----
router.get('/business-settings/public', businessSettingsController.getBusinessSettings);

const requireAdmin = (req, _res, next) => {
    const user = req.user;
    if (!user || user.role !== 'ADMIN') {
        return next(new AuthError('Admin access required'));
    }
    return next();
};

router.use(requireAdmin);
router.use(attachFoodAdminContext);

// ----- Admin Management (Subadmins) -----
router.get('/admin-management/permissions', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.getFoodAdminPermissions);
router.get('/admin-management/assignable-zones', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.getAssignableFoodZones);
router.get('/admin-management/admins', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.getFoodAdmins);
router.get('/admin-management/admins/:id', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.getFoodAdminById);
router.post('/admin-management/admins', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.createFoodAdminAccount);
router.patch('/admin-management/admins/:id', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.updateFoodAdminAccount);
router.delete('/admin-management/admins/:id', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.deleteFoodAdminAccount);

// ----- Broadcast Notifications -----
router.post('/notifications/broadcast', notificationBroadcastController.createBroadcastNotificationController);
router.get('/notifications/broadcast', notificationBroadcastController.getBroadcastNotificationsController);
router.delete('/notifications/broadcast/:id', notificationBroadcastController.deleteBroadcastNotificationController);

// ----- Customers -----
router.get('/customers', requireFoodResourceAccess('customers', 'customers'), adminController.getCustomers);
router.get('/customers/:id', requireFoodResourceAccess('customers', 'customers'), adminController.getCustomerById);
router.patch('/customers/:id/status', requireFoodResourceAccess('customers', 'customers'), adminController.updateCustomerStatus);

// ----- Safety / Emergency Reports -----
router.get('/safety-emergency-reports', requireFoodResourceAccess('support', 'support'), adminController.getSafetyEmergencyReports);
router.put('/safety-emergency-reports/:id/status', requireFoodResourceAccess('support', 'support'), adminController.updateSafetyEmergencyStatus);
router.put('/safety-emergency-reports/:id/priority', requireFoodResourceAccess('support', 'support'), adminController.updateSafetyEmergencyPriority);
router.delete('/safety-emergency-reports/:id', requireFoodResourceAccess('support', 'support'), adminController.deleteSafetyEmergencyReport);

// ----- Support Tickets (users) -----
router.get('/support-tickets', requireFoodResourceAccess('support', 'support'), adminController.getSupportTicketsController);
router.patch('/support-tickets/:id', requireFoodResourceAccess('support', 'support'), adminController.updateSupportTicketController);
router.get('/global-search', adminController.globalSearch);
router.get('/restaurants/complaints', requireFoodResourceAccess('support', 'support'), adminController.getRestaurantComplaints);
router.patch('/restaurants/complaints/:id', requireFoodResourceAccess('support', 'support'), adminController.updateRestaurantComplaint);

// ----- Restaurants -----
router.get('/restaurants', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.getRestaurants);
router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/reports/restaurants', requireFoodResourceAccess('reports', 'reports'), adminController.getRestaurantReport);
router.get('/reports/transactions', requireFoodResourceAccess('reports', 'reports'), adminController.getTransactionReport);
router.get('/reports/tax', requireFoodResourceAccess('reports', 'reports'), adminController.getTaxReport);
router.get('/reports/tax/:id', requireFoodResourceAccess('reports', 'reports'), adminController.getTaxReportDetail);
router.get('/restaurants/pending', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.getPendingRestaurants);
router.get('/restaurants/reviews', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.getRestaurantReviews);
router.get('/restaurants/:id', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.getRestaurantById);
router.get('/restaurants/:id/analytics', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.getRestaurantAnalytics);
router.get('/restaurants/:id/menu', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.getRestaurantMenuById);
router.post('/restaurants', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.createRestaurant);
router.patch('/restaurants/:id', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.updateRestaurantById);
router.patch('/restaurants/:id/status', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.updateRestaurantStatus);
router.patch('/restaurants/:id/location', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.updateRestaurantLocation);
router.patch('/restaurants/:id/zone-featured-rank', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.updateRestaurantZoneFeaturedRank);
router.patch('/restaurants/:id/menu', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.updateRestaurantMenuById);
router.patch('/restaurants/:id/approve', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.approveRestaurant);
router.patch('/restaurants/:id/reject', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.rejectRestaurant);

// ----- Restaurant Commission -----
router.get('/restaurant-commissions/bootstrap', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.getRestaurantCommissionBootstrap);
router.get('/restaurant-commissions', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.getRestaurantCommissions);
router.post('/restaurant-commissions', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.createRestaurantCommission);
router.get('/restaurant-commissions/:id', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.getRestaurantCommissionById);
router.patch('/restaurant-commissions/:id', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.updateRestaurantCommission);
router.delete('/restaurant-commissions/:id', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.deleteRestaurantCommission);
router.patch('/restaurant-commissions/:id/toggle', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.toggleRestaurantCommissionStatus);

// ----- Categories -----
router.get('/categories', requireFoodResourceAccess('categories', 'categories'), adminController.getCategories);
router.post('/categories', requireFoodResourceAccess('categories', 'categories'), adminController.createCategory);
router.patch('/categories/:id', requireFoodResourceAccess('categories', 'categories'), adminController.updateCategory);
router.delete('/categories/:id', requireFoodResourceAccess('categories', 'categories'), adminController.deleteCategory);
router.patch('/categories/:id/toggle', requireFoodResourceAccess('categories', 'categories'), adminController.toggleCategoryStatus);
router.patch('/categories/:id/approve', requireFoodResourceAccess('categories', 'categories'), adminController.approveCategory);
router.patch('/categories/:id/reject', requireFoodResourceAccess('categories', 'categories'), adminController.rejectCategory);
router.patch('/categories/:id/make-global', requireFoodResourceAccess('categories', 'categories'), adminController.makeCategoryGlobal);

// ----- Restaurant Add-ons Approval -----
router.get('/addons', requireFoodResourceAccess('foods', 'foods'), addonsApprovalController.getRestaurantAddons);
router.patch('/addons/:id', requireFoodResourceAccess('foods', 'foods'), addonsApprovalController.updateRestaurantAddon);
router.patch('/addons/:id/approve', requireFoodResourceAccess('foods', 'foods'), addonsApprovalController.approveRestaurantAddon);
router.patch('/addons/:id/reject', requireFoodResourceAccess('foods', 'foods'), addonsApprovalController.rejectRestaurantAddon);

// ----- Foods -----
router.get('/foods', requireFoodResourceAccess('foods', 'foods'), adminController.getFoods);
router.post('/foods', requireFoodResourceAccess('foods', 'foods'), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, adminController.createFood);
router.patch('/foods/:id', requireFoodResourceAccess('foods', 'foods'), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, adminController.updateFood);
router.delete('/foods/:id', requireFoodResourceAccess('foods', 'foods'), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, adminController.deleteFood);
// Food approval queue (pending items created by restaurants)
router.get('/foods/pending-approvals', requireFoodResourceAccess('foods', 'foods'), foodApprovalController.getPendingFoodApprovals);
router.patch('/foods/:id/approve', requireFoodResourceAccess('foods', 'foods'), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, foodApprovalController.approveFoodItemController);
router.patch('/foods/:id/reject', requireFoodResourceAccess('foods', 'foods'), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, foodApprovalController.rejectFoodItemController);
router.post('/foods/bulk-approve', requireFoodResourceAccess('foods', 'foods'), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, adminController.bulkApproveFoodItems);


// ----- Offers & Coupons -----
router.get('/offers', requireFoodResourceAccess('promotions', 'promotions'), adminController.getAllOffers);
router.post('/offers', requireFoodResourceAccess('promotions', 'promotions'), adminController.createAdminOffer);
router.patch('/offers/:id/cart-visibility', requireFoodResourceAccess('promotions', 'promotions'), adminController.updateAdminOfferCartVisibility);
router.delete('/offers/:id', requireFoodResourceAccess('promotions', 'promotions'), adminController.deleteAdminOffer);

// ----- Feedback Experience (Admin) -----
router.get('/feedback-experiences', requireFoodResourceAccess('reports', 'reports'), feedbackExperienceController.getFeedbackExperiences);
router.delete('/feedback-experiences/:id', requireFoodResourceAccess('reports', 'reports'), feedbackExperienceController.deleteFeedbackExperience);

// ----- Fee Settings -----
router.get('/fee-settings', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.getFeeSettings);
router.put('/fee-settings', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.createOrUpdateFeeSettings);

// ----- Referral Settings -----
router.get('/referral-settings', requireFoodResourceAccess('referrals', 'referrals'), adminController.getReferralSettings);
router.put('/referral-settings', requireFoodResourceAccess('referrals', 'referrals'), adminController.createOrUpdateReferralSettings);

// ----- Business Settings -----
router.get('/business-settings/public', businessSettingsController.getBusinessSettings); // Public endpoint
router.get('/business-settings', requireFoodResourceAccess('settings', 'settings'), businessSettingsController.getBusinessSettings);
router.patch('/business-settings', requireFoodResourceAccess('settings', 'settings'), upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
]), businessSettingsController.updateBusinessSettings);

// ----- Delivery Cash Limit -----
router.get('/delivery-cash-limit', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryCashLimit);
router.patch('/delivery-cash-limit', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateDeliveryCashLimit);
router.get('/restaurant-withdrawal-setting', requireFoodResourceAccess('wallet', 'wallet'), adminController.getRestaurantWithdrawalSetting);
router.patch('/restaurant-withdrawal-setting', requireFoodResourceAccess('wallet', 'wallet'), adminController.updateRestaurantWithdrawalSetting);

// ----- Delivery Emergency Help -----
router.get('/delivery-emergency-help', requireFoodResourceAccess('delivery', 'delivery'), adminController.getEmergencyHelp);
router.put('/delivery-emergency-help', requireFoodResourceAccess('delivery', 'delivery'), adminController.createOrUpdateEmergencyHelp);

// ----- Withdrawals (admin) -----
router.get('/withdrawals', requireFoodResourceAccess('wallet', 'wallet'), adminController.getWithdrawals);
router.patch('/withdrawals/:id', requireFoodResourceAccess('wallet', 'wallet'), adminController.updateWithdrawalStatus);
router.get('/delivery/withdrawals', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryWithdrawals);
router.patch('/delivery/withdrawals/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateDeliveryWithdrawalStatus);
router.get('/delivery/cash-limit-settlements', requireFoodResourceAccess('delivery', 'delivery'), adminController.getCashLimitSettlements);

// ----- Delivery partners & general -----
router.get('/delivery/join-requests', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryJoinRequests);
router.get('/delivery/wallets', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryWallets);
router.get('/delivery/bonus-transactions', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryPartnerBonusTransactions);
router.get('/delivery/earnings', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryEarnings);
router.post('/delivery/bonus', requireFoodResourceAccess('delivery', 'delivery'), adminController.addDeliveryPartnerBonus);
router.get('/delivery/commission-rules', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryCommissionRules);
router.post('/delivery/commission-rules', requireFoodResourceAccess('delivery', 'delivery'), adminController.createDeliveryCommissionRule);
router.patch('/delivery/commission-rules/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateDeliveryCommissionRule);
router.delete('/delivery/commission-rules/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.deleteDeliveryCommissionRule);
router.patch('/delivery/commission-rules/:id/status', requireFoodResourceAccess('delivery', 'delivery'), adminController.toggleDeliveryCommissionRuleStatus);
router.get('/delivery/zone-surge', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryZoneSurgeConfigs);
router.put('/delivery/zone-surge', requireFoodResourceAccess('delivery', 'delivery'), adminController.upsertDeliveryZoneSurgeConfig);
router.patch('/delivery/zone-surge/:zoneId/status', requireFoodResourceAccess('delivery', 'delivery'), adminController.toggleDeliveryZoneSurgeStatus);
router.get('/delivery/reviews', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliverymanReviews);
router.get('/contact-messages', requireFoodResourceAccess('support', 'support'), adminController.getContactMessages);
router.get('/delivery/earning-addons', requireFoodResourceAccess('delivery', 'delivery'), adminController.getEarningAddons);
router.post('/delivery/earning-addons', requireFoodResourceAccess('delivery', 'delivery'), adminController.createEarningAddon);
router.patch('/delivery/earning-addons/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateEarningAddon);
router.delete('/delivery/earning-addons/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.deleteEarningAddon);
router.patch('/delivery/earning-addons/:id/status', requireFoodResourceAccess('delivery', 'delivery'), adminController.toggleEarningAddonStatus);
router.get('/delivery/earning-addon-history', requireFoodResourceAccess('delivery', 'delivery'), adminController.getEarningAddonHistory);
router.post('/delivery/earning-addon-history/:id/credit', requireFoodResourceAccess('delivery', 'delivery'), adminController.creditEarningToWallet);
router.post('/delivery/earning-addon-history/:id/cancel', requireFoodResourceAccess('delivery', 'delivery'), adminController.cancelEarningAddonHistory);
router.post('/delivery/earning-addon-completions/check', requireFoodResourceAccess('delivery', 'delivery'), adminController.checkEarningAddonCompletions);
router.get('/delivery/support-tickets/stats', requireFoodResourceAccess('delivery', 'delivery'), adminController.getSupportTicketStats);
router.get('/delivery/support-tickets', requireFoodResourceAccess('delivery', 'delivery'), adminController.getSupportTickets);
router.patch('/delivery/support-tickets/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateSupportTicket);
router.get('/delivery/partners', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryPartners);
router.get('/delivery/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryPartnerById);
router.patch('/delivery/:id/approve', requireFoodResourceAccess('delivery', 'delivery'), adminController.approveDeliveryPartner);
router.patch('/delivery/:id/reject', requireFoodResourceAccess('delivery', 'delivery'), adminController.rejectDeliveryPartner);
router.post('/delivery/:id/approve-emergency-offline', requireFoodResourceAccess('delivery', 'delivery'), adminController.approveEmergencyOfflineController);

// ----- Zones -----
router.get('/zones', requireFoodResourceAccess('zones', 'zones'), adminController.getZones);
router.get('/zones/:id', requireFoodResourceAccess('zones', 'zones'), adminController.getZoneById);
router.post('/zones', requireFoodResourceAccess('zones', 'zones'), adminController.createZone);
router.patch('/zones/:id', requireFoodResourceAccess('zones', 'zones'), adminController.updateZone);
router.delete('/zones/:id', requireFoodResourceAccess('zones', 'zones'), adminController.deleteZone);

// ----- Dining -----
router.get('/dining/categories', requireFoodResourceAccess('dining', 'dining'), diningAdminController.getDiningCategories);
router.post('/dining/categories', requireFoodResourceAccess('dining', 'dining'), diningAdminController.createDiningCategory);
router.patch('/dining/categories/:id', requireFoodResourceAccess('dining', 'dining'), diningAdminController.updateDiningCategory);
router.delete('/dining/categories/:id', requireFoodResourceAccess('dining', 'dining'), diningAdminController.deleteDiningCategory);
router.get('/dining/restaurants', requireFoodResourceAccess('dining', 'dining'), diningAdminController.getDiningRestaurants);
router.patch('/dining/restaurants/:restaurantId', requireFoodResourceAccess('dining', 'dining'), diningAdminController.updateDiningRestaurant);

// ----- Orders -----
router.get('/orders', requireFoodResourceAccess('orders', 'orders'), orderController.listOrdersAdminController);
router.get('/orders/handover-requests/pending', orderController.listPendingHandoverRequestsAdminController);
router.get('/orders/:orderId', requireFoodResourceAccess('orders', 'orders'), orderController.getOrderByIdAdminController);
router.post('/orders/:orderId/assign', requireFoodResourceAccess('orders', 'orders'), orderController.assignDeliveryPartnerController);
router.post('/orders/:orderId/handover/approve', orderController.approveOrderHandoverAdminController);
router.post('/orders/:orderId/handover/reject', orderController.rejectOrderHandoverAdminController);
router.get('/orders/:orderId/available-partners', requireFoodResourceAccess('orders', 'orders'), orderController.listAvailableDeliveryPartnersForOrderController);
router.delete('/orders/:orderId', requireFoodResourceAccess('orders', 'orders'), orderController.deleteOrderAdminController);

// ----- CMS Pages (About + legal) -----
router.get('/pages-social-media/:key', getAdminPageController);
router.put('/pages-social-media/:key', upsertAdminPageController);

router.get('/sidebar-badges', adminController.getSidebarBadges);
router.get('/notifications/fssai-expired', adminController.getExpiredFssaiNotifications);

export default router;
