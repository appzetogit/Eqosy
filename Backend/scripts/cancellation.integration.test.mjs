// Integration test for the stage-based cancellation + Food Rescue engine.
// Needs: npm i -D mongodb-memory-server   Run: node scripts/cancellation.integration.test.mjs
// Uses an in-memory replica set and dummy Razorpay keys. It never touches a real database or gateway.
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'dummy_secret';
import crypto from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const B = new URL('../', import.meta.url).href;
const { default: mongoose } = await import(B + 'node_modules/mongoose/index.js');
const svc = await import(B + 'src/modules/food/cancellation/services/cancellation.service.js');
const M = await import(B + 'src/modules/food/cancellation/models/cancellation.models.js');
const { FoodOrder } = await import(B + 'src/modules/food/orders/models/order.model.js');
const { FoodUserPenalty } = await import(B + 'src/modules/food/orders/models/userPenalty.model.js');
const { Transaction } = await import(B + 'src/core/payments/models/transaction.model.js');

const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(rs.getUri(), { dbName: 'cancel_test' });

let fails = 0;
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); };
const throws = async (name, fn, re) => { try { await fn(); ok(name, false, 'did not throw'); } catch (e) { ok(name, re.test(e.message), e.message); } };
const oid = () => new mongoose.Types.ObjectId();
const MIN = 60000;
const walletCredits = async (id, category) => (await Transaction.find({ entityId: id, category, type: 'credit' }).lean()).reduce((s, t) => s + t.amount, 0);

const R = oid(); // restaurant
const P = oid(); // rider
let U = oid(); // customer

async function mkOrder(status, extra = {}) {
  const _id = oid();
  await FoodOrder.collection.insertOne({
    _id, userId: U, restaurantId: R, orderStatus: status,
    items: [{ itemId: 'i1', name: 'Biryani', price: 200, quantity: 1 }],
    deliveryAddress: { street: 's', city: 'c', state: 'st', location: { type: 'Point', coordinates: [75.85, 22.72] } },
    pricing: { subtotal: 200, platformFee: 5, deliveryFee: 30, total: 235 },
    payment: { method: 'cash', status: 'cod_pending', amountDue: 235 },
    dispatch: { status: 'accepted', deliveryPartnerId: P },
    cancelTracking: { trackedKm: 2.5 }, createdAt: new Date(), ...extra,
  });
  return _id;
}

// ---- config validation
const cfg0 = await svc.getConfig({ fresh: true });
ok('default config', cfg0.stage2.foodPenaltyPercent === 20 && cfg0.stage3.foodPenaltyPercent === 50 && cfg0.rescue.radiusKm === 3 && cfg0.rescue.windowMinutes === 15);
await throws('status in two stages rejected', () => svc.updateConfig({ stage2Statuses: ['picked_up'] }), /both Stage 2 and Stage 3/);
await throws('bad percent rejected', () => svc.updateConfig({ stage2: { foodPenaltyPercent: 150 } }), /between/);
await throws('empty message rejected', () => svc.updateConfig({ messages: { s1_customer: '  ' } }), /cannot be empty/);

// ---- stage detection
const o1 = await FoodOrder.findById(await mkOrder('created'));
ok('created = stage 1', (await svc.evaluateForOrder(o1)).stage === 1);
ok('preparing = stage 2', (await svc.evaluateForOrder(await FoodOrder.findById(await mkOrder('preparing')))).stage === 2);
ok('picked_up = stage 3', (await svc.evaluateForOrder(await FoodOrder.findById(await mkOrder('picked_up')))).stage === 3);
const online = await FoodOrder.findById(await mkOrder('preparing', { payment: { method: 'razorpay', status: 'paid' } }));
ok('online-paid order is covered (charge is cut from the refund)', (await svc.evaluateForOrder(online)).applies === true && (await svc.evaluateForOrder(online)).stage === 2);

// ---- stage 1: free
const s1 = await FoodOrder.findById(await mkOrder('created'));
ok('stage 1 recorded, no charge', (await svc.recordFreeCancellation(s1, U, { reasonCode: 'changed_mind' })) === true && (await M.FoodCancellationCase.findOne({ orderId: s1._id })).breakdown.total === 0);
ok('stage 1 leaves no penalty / COD stays on', (await svc.isCodBlocked(U)).blocked === false);

// ---- stage 2
const o2 = await mkOrder('preparing');
const pv = await svc.previewCancellation(o2, U, 'changed_mind');
ok('preview: 40 food + 25 rider (10 + 6*2.5) + 5 + 20 + 4.5 GST = 94.5', pv.stage === 2 && pv.breakdown.foodPenalty === 40 && pv.breakdown.riderCompensation === 25 && pv.breakdown.gst === 4.5 && pv.charge === 94.5, JSON.stringify(pv.breakdown));
await throws('charges must be accepted first', () => svc.cancelWithPolicy(o2, U, { reasonCode: 'changed_mind' }), /accept the charges/);
ok('nothing changed when not accepted', (await FoodOrder.findById(o2)).orderStatus === 'preparing');
const done2 = await svc.cancelWithPolicy(o2, U, { reasonCode: 'changed_mind', acknowledgePenalty: true });
ok('stage 2 cancelled with 94.5', done2.breakdown.total === 94.5);
const pen2 = await FoodUserPenalty.findOne({ orderId: o2 });
ok('penalty row created once', pen2 && pen2.amount === 94.5 && pen2.source === 'cancellation_policy' && pen2.status === 'pending');
ok('COD disabled while unpaid', (await svc.isCodBlocked(U)).blocked === true && (await svc.isCodBlocked(U)).amount === 94.5);
ok('restaurant got 15% of food (policy share)', (await walletCredits(R, 'order_payout')) === 30, String(await walletCredits(R, 'order_payout')));
ok('rider got GPS-based compensation', (await walletCredits(P, 'delivery_payout')) === 25, String(await walletCredits(P, 'delivery_payout')));
await throws('cannot cancel twice / double charge', () => svc.cancelWithPolicy(o2, U, { reasonCode: 'changed_mind', acknowledgePenalty: true }), /cannot be cancelled/);
ok('still exactly one penalty and one case', (await FoodUserPenalty.countDocuments({ orderId: o2 })) === 1 && (await M.FoodCancellationCase.countDocuments({ orderId: o2 })) === 1);
const c2 = await M.FoodCancellationCase.findOne({ orderId: o2 });
await svc.retrySettlements(c2._id);
ok('retrying settlements never pays twice', (await walletCredits(R, 'order_payout')) === 30 && (await walletCredits(P, 'delivery_payout')) === 25);
const ord2 = await FoodOrder.findById(o2);
ok('order synced: cancelled_by_user + policy fields', ord2.orderStatus === 'cancelled_by_user' && ord2.cancellationPolicy.stage === 2 && ord2.cancellationPolicy.penaltyTotal === 94.5);

// ---- fault: no charge
const U2 = oid(); U = U2;
const f1 = await mkOrder('preparing');
const fp = await svc.previewCancellation(f1, U2, 'restaurant_issue');
ok('restaurant-fault reason = no charge', fp.charge === 0 && fp.waived === true);
await svc.cancelWithPolicy(f1, U2, { reasonCode: 'restaurant_issue' });
ok('no penalty row and COD stays on for fault', (await FoodUserPenalty.countDocuments({ orderId: f1 })) === 0 && (await svc.isCodBlocked(U2)).blocked === false);
const f2 = await mkOrder('preparing', { prep: { approvedEta: new Date(Date.now() - 30 * MIN) } });
ok('restaurant late beyond grace = no charge', (await svc.previewCancellation(f2, U2, 'changed_mind')).waived === true);

// ---- stage 3 + rescue
const U3 = oid(); U = U3;
const { FoodDeliveryPartner } = await import(B + 'src/modules/food/delivery/models/deliveryPartner.model.js');
await FoodDeliveryPartner.collection.insertOne({ _id: P, name: 'Rider', lastLat: 22.72, lastLng: 75.86 });
const o3 = await mkOrder('picked_up', { deliveryState: { pickedUpAt: new Date(Date.now() - 5 * MIN), foodReadyAt: new Date(Date.now() - 8 * MIN) } });
const p3 = await svc.previewCancellation(o3, U3, 'changed_mind');
ok('stage 3 preview: 100 + 30 + 5 + 20 + 4.5 = 159.5', p3.stage === 3 && p3.breakdown.foodPenalty === 100 && p3.breakdown.deliveryFee === 30 && p3.charge === 159.5 && p3.rescueWillStart, JSON.stringify(p3.breakdown));
const d3 = await svc.cancelWithPolicy(o3, U3, { reasonCode: 'changed_mind', acknowledgePenalty: true });
const lst = await M.FoodRescueListing.findOne({ originalOrderId: o3 });
ok('rescue listing: 50% price, rider GPS, 15 min', lst && lst.rescueFoodPrice === 100 && lst.originalFoodValue === 200 && lst.location.coordinates[0] === 75.86 && Math.abs(lst.expiresAt - Date.now() - 15 * MIN) < 5000);
ok('order label CANCELLED – FOOD RESCUE ACTIVATED', (await FoodOrder.findById(o3)).cancellationPolicy.statusLabel === 'CANCELLED – FOOD RESCUE ACTIVATED');
ok('rider gets the delivery charge in stage 3, restaurant not paid yet', (await walletCredits(P, 'delivery_payout')) === 80 && (await walletCredits(R, 'order_payout')) === 30, String(await walletCredits(P, 'delivery_payout')));

const near = await svc.listNearbyRescues(oid(), { lat: 22.72, lng: 75.86 });
ok('nearby customer sees it (within 3 km)', near.length === 1 && near[0].rescuePrice === 100);
ok('far customer does not (> 3 km)', (await svc.listNearbyRescues(oid(), { lat: 22.9, lng: 75.86 })).length === 0);
ok('original customer does not see own order', (await svc.listNearbyRescues(U3, { lat: 22.72, lng: 75.86 })).length === 0);

// concurrent holds: only one wins
const buyers = [oid(), oid(), oid(), oid(), oid()];
const holds = await Promise.all(buyers.map((b) => svc.acquireHold(lst._id, b, 3)));
ok('exactly one of 5 simultaneous claims gets the food', holds.filter(Boolean).length === 1, String(holds.filter(Boolean).length));
const winner = holds.findIndex(Boolean);
const loser = (winner + 1) % buyers.length;

// payment: winner pays -> CLAIMED; loser late payment -> refund path
const sign = (a, b) => crypto.createHmac('sha256', 'dummy_secret').update(`${a}|${b}`).digest('hex');
const mkHoldOrder = async (buyer, rzOrder) => {
  const _id = oid();
  await FoodOrder.collection.insertOne({
    _id, userId: buyer, restaurantId: R, orderStatus: 'pending_payment',
    items: [{ itemId: 'i1', name: 'Biryani', price: 100, quantity: 1 }],
    deliveryAddress: { street: 's', city: 'c', state: 'st', location: { type: 'Point', coordinates: [75.86, 22.73] } },
    pricing: { subtotal: 100, tax: 5, deliveryFee: 30, total: 135, restaurantCommission: 20, restaurantCommissionSource: 'custom_admin' },
    payment: { method: 'razorpay', status: 'created', amountDue: 135, razorpay: { orderId: rzOrder } },
    rescueInfo: { listingId: lst._id, originalOrderId: o3, originalFoodValue: 200, discountPercent: 50 }, riderTotalPayout: 30, createdAt: new Date(),
  });
  return _id;
};
const loserOrder = await mkHoldOrder(buyers[loser], 'order_L');
const xOrder = await mkHoldOrder(buyers[winner], 'order_X');
await throws('wrong signature rejected', () => svc.verifyRescuePayment(buyers[winner], { orderId: xOrder, razorpayOrderId: 'order_X', razorpayPaymentId: 'pay_1', razorpaySignature: 'bad' }), /verification failed/);
const winOrder = await mkHoldOrder(buyers[winner], 'order_W');
const claimed = await svc.verifyRescuePayment(buyers[winner], { orderId: winOrder, razorpayOrderId: 'order_W', razorpayPaymentId: 'pay_W', razorpaySignature: sign('order_W', 'pay_W') });
ok('winner CLAIMED, restaurant will get 80% of 100 = 80', claimed.status === 'claimed' && claimed.restaurantWillReceive === 80, JSON.stringify(claimed));
const wo = await FoodOrder.findById(winOrder);
ok('rescue order assigned to the original rider, picked up', wo.orderStatus === 'picked_up' && String(wo.dispatch.deliveryPartnerId) === String(P) && wo.payment.status === 'paid');
ok('restaurant commission = 20% of selling price (not of original)', wo.pricing.restaurantCommission === 20 && wo.pricing.subtotal === 100);
ok('listing + case marked claimed', (await M.FoodRescueListing.findById(lst._id)).status === 'claimed' && (await M.FoodCancellationCase.findOne({ orderId: o3 })).status === 'rescue_claimed');
await throws('late payer loses and is refunded, not charged twice', () => svc.verifyRescuePayment(buyers[loser], { orderId: loserOrder, razorpayOrderId: 'order_L', razorpayPaymentId: 'pay_L', razorpaySignature: sign('order_L', 'pay_L') }), /someone else claimed/);
ok('listing still belongs to the winner', String((await M.FoodRescueListing.findById(lst._id)).claimedBy) === String(buyers[winner]));
await svc.runCancellationSweep();
ok('claimed rescue is not expired by the sweeper, no compensation paid', (await M.FoodRescueListing.findById(lst._id)).status === 'claimed' && (await walletCredits(R, 'order_payout')) === 30);

// ---- rescue expiry
const o4 = await mkOrder('picked_up');
await svc.cancelWithPolicy(o4, U3, { reasonCode: 'changed_mind', acknowledgePenalty: true });
const lst4 = await M.FoodRescueListing.findOne({ originalOrderId: o4 });
await M.FoodRescueListing.updateOne({ _id: lst4._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
await svc.runCancellationSweep();
await svc.runCancellationSweep();
ok('unclaimed rescue EXPIRED', (await M.FoodRescueListing.findById(lst4._id)).status === 'expired' && (await M.FoodCancellationCase.findOne({ orderId: o4 })).status === 'rescue_expired');
ok('restaurant gets 50% of ORIGINAL food value (100), once', (await walletCredits(R, 'order_payout')) === 130, String(await walletCredits(R, 'order_payout')));
ok('order label shows expired', (await FoodOrder.findById(o4)).cancellationPolicy.statusLabel === 'CANCELLED – FOOD RESCUE EXPIRED');
ok('rider told to keep the food', (await M.FoodCancellationCase.findOne({ orderId: o4 })).notified.some((k) => k.startsWith('expired:DELIVERY_PARTNER')));
const o5 = await mkOrder('picked_up');
await svc.cancelWithPolicy(o5, U3, { reasonCode: 'changed_mind', acknowledgePenalty: true });
const lst5 = await M.FoodRescueListing.findOne({ originalOrderId: o5 });
const h = await svc.acquireHold(lst5._id, oid(), 3);
await M.FoodRescueListing.updateOne({ _id: lst5._id }, { $set: { holdUntil: new Date(Date.now() - 1000) } });
await svc.runCancellationSweep();
ok('lapsed hold returns the food to sale while the window is open', h && (await M.FoodRescueListing.findById(lst5._id)).status === 'active');

// ---- penalty payment / COD
ok('U3 outstanding: 3 cancellations unpaid', (await svc.getOutstanding(U3)).total === 159.5 * 3);
const pay = await M.FoodPenaltyPayment.create({ userId: U3, penaltyIds: (await FoodUserPenalty.find({ userId: U3 })).map((p) => p._id), amount: 159.5 * 3, razorpayOrderId: 'order_PEN' });
await throws('failed/forged payment does not re-enable COD', () => svc.verifyPenaltyPayment(U3, { razorpayOrderId: 'order_PEN', razorpayPaymentId: 'pay_PEN', razorpaySignature: 'forged' }), /verification failed/);
ok('COD still blocked after failed verification', (await svc.isCodBlocked(U3)).blocked === true);
const paid = await svc.verifyPenaltyPayment(U3, { razorpayOrderId: 'order_PEN', razorpayPaymentId: 'pay_PEN', razorpaySignature: sign('order_PEN', 'pay_PEN') });
ok('verified payment clears penalties and re-enables COD', paid.paid && (await svc.isCodBlocked(U3)).blocked === false && (await svc.getOutstanding(U3)).total === 0);
const again = await svc.verifyPenaltyPayment(U3, { razorpayOrderId: 'order_PEN', razorpayPaymentId: 'pay_PEN', razorpaySignature: sign('order_PEN', 'pay_PEN') });
ok('replayed verification is harmless', again.paid === true);
ok('admin wallet got the cancellation revenue exactly once', (await Transaction.countDocuments({ category: 'platform_fee', entityType: 'admin' })) >= 3);

// pay by placing another order
const U4 = oid();
const o6 = await mkOrder('preparing', { userId: U4 });
await svc.cancelWithPolicy(o6, U4, { reasonCode: 'changed_mind', acknowledgePenalty: true });
const pen6 = await FoodUserPenalty.findOne({ orderId: o6 });
const newOrder = oid();
await FoodUserPenalty.updateOne({ _id: pen6._id }, { $set: { status: 'applied', appliedOrderId: newOrder } });
ok('bound to an unpaid online order: COD still blocked', (await svc.isCodBlocked(U4)).blocked === true);
await svc.markPenaltiesPaidForOrder(newOrder, 'online');
ok('after that order is paid, COD is back', (await svc.isCodBlocked(U4)).blocked === false);

// admin override
const U5 = oid();
const o7 = await mkOrder('preparing', { userId: U5 });
await svc.cancelWithPolicy(o7, U5, { reasonCode: 'changed_mind', acknowledgePenalty: true });
const pen7 = await FoodUserPenalty.findOne({ orderId: o7 });
await throws('override needs a reason', () => svc.adminDecidePenalty(pen7._id, oid(), { action: 'waive' }), /reason/i);
await svc.adminDecidePenalty(pen7._id, oid(), { action: 'waive', note: 'genuine dispute' });
ok('admin waive re-enables COD and is audited', (await svc.isCodBlocked(U5)).blocked === false && (await M.FoodCancellationAudit.countDocuments({ action: 'PENALTY_WAIVE' })) === 1);

// ---- online orders: charge is cut from the payment, the rest is refunded
const UW = oid();
const { FoodUser } = await import(B + 'src/core/users/user.model.js');
await FoodUser.collection.insertOne({ _id: UW, name: 'Pay Online', phone: '9999999999', wallet: { balance: 0 } });
const onlineOrder = (status, extra = {}) => mkOrder(status, { userId: UW, payment: { method: 'wallet', status: 'paid', amountDue: 235 }, ...extra });
const w1 = await onlineOrder('preparing');
const wp = await svc.previewCancellation(w1, UW, 'changed_mind');
ok('online preview: refund_deduction, 94.5 cut, 140.5 back', wp.settlement === 'refund_deduction' && wp.deducted === 94.5 && wp.refundAmount === 140.5 && /deducts the charges/.test(wp.message), JSON.stringify(wp));
const wd = await svc.cancelWithPolicy(w1, UW, { reasonCode: 'changed_mind', acknowledgePenalty: true });
const wc = await M.FoodCancellationCase.findOne({ orderId: w1 });
ok('online cancel: refund processed for paid - charge', wd.payMode === 'refund_deduction' && wc.refund.status === 'processed' && wc.refund.amount === 140.5, JSON.stringify(wc.refund));
const wpen = await FoodUserPenalty.findOne({ orderId: w1, source: 'cancellation_policy' });
ok('deduction recorded as already paid (nothing outstanding, COD stays on)', wpen.status === 'paid' && wpen.paidVia === 'refund_deduction' && wpen.amount === 94.5 && (await svc.isCodBlocked(UW)).blocked === false);
ok('order payment shows refunded 140.5', (await FoodOrder.findById(w1)).payment.refund.amount === 140.5 && (await FoodOrder.findById(w1)).payment.status === 'refunded');
ok('restaurant + rider still paid for online cancellations', (await walletCredits(R, 'order_payout')) >= 30);
const walletTx = (await FoodUser.collection.findOne({ _id: UW }))?.wallet?.transactions || [];
await svc.processRefund(wc._id);
ok('refund can never be sent twice', ((await FoodUser.collection.findOne({ _id: UW }))?.wallet?.transactions || []).filter((t) => t.type === 'refund').length === walletTx.filter((t) => t.type === 'refund').length);

const w2 = await onlineOrder('preparing');
const wf = await svc.previewCancellation(w2, UW, 'restaurant_issue');
ok('online + restaurant fault: full refund, no charge', wf.charge === 0 && wf.refundAmount === 235);
await svc.cancelWithPolicy(w2, UW, { reasonCode: 'restaurant_issue' });
ok('full amount refunded', (await M.FoodCancellationCase.findOne({ orderId: w2 })).refund.amount === 235 && (await M.FoodCancellationCase.findOne({ orderId: w2 })).refund.status === 'processed');

await svc.adminDecidePenalty(wpen._id, oid(), { action: 'waive', note: 'goodwill' });
const wpen2 = await FoodUserPenalty.findById(wpen._id);
ok('admin waive of a deducted charge refunds the 94.5 back', wpen2.status === 'waived' && wpen2.amount === 0);
await throws('cannot waive twice (no double refund)', () => svc.adminDecidePenalty(wpen._id, oid(), { action: 'waive', note: 'again' }), /lower|already/i);

// razorpay refund failing is retried, not lost
const rz1 = await mkOrder('preparing', { userId: UW, payment: { method: 'razorpay', status: 'paid', razorpay: { paymentId: 'pay_zzz' } } });
await svc.cancelWithPolicy(rz1, UW, { reasonCode: 'changed_mind', acknowledgePenalty: true });
const rzc = await M.FoodCancellationCase.findOne({ orderId: rz1 });
ok('failed gateway refund is marked failed and queued for retry', rzc.refund.status === 'failed' && rzc.refund.attempts === 1, JSON.stringify(rzc.refund));
await svc.runCancellationSweep();
ok('sweeper retried it', (await M.FoodCancellationCase.findOne({ orderId: rz1 })).refund.attempts >= 2);

// ---- GPS odometer
const o8 = await mkOrder('preparing', { cancelTracking: { trackedKm: 0 } });
const pts = [[22.7200, 75.8500], [22.72001, 75.8500], [22.7250, 75.8500], [22.7300, 75.8500], [22.7350, 75.8500], [22.7400, 75.8500]];
for (const [la, ln] of pts) await svc.trackRiderDistance(o8, la, ln, 10);
await svc.trackRiderDistance(o8, 22.7500, 75.8500, 10);
const tk = (await FoodOrder.findById(o8)).cancelTracking.trackedKm;
ok('odometer adds real movement (~2.2 km), ignores 1 m jitter', tk > 2 && tk < 2.5, String(tk));
await svc.trackRiderDistance(o8, 25.0, 78.0, 10);
await svc.trackRiderDistance(o8, 25.0, 78.001, 10);
ok('GPS teleport is not counted', (await FoodOrder.findById(o8)).cancelTracking.trackedKm < 2.5);

// ---- prepaid, picked up: refund is held for the Food Rescue outcome (sold -> 60% charge, unsold -> full payment kept)
const refundsOf = async (id) => ((await FoodUser.collection.findOne({ _id: id }))?.wallet?.transactions || []).filter((t) => t.type === 'refund').length;
const h1 = await onlineOrder('picked_up');
const hp = await svc.previewCancellation(h1, UW, 'changed_mind');
ok('prepaid stage 3 preview: 60% of 200 + 30 + 5 + 20 + 4.5 = 179.5, refund 55.5 if rescued, held', hp.stage === 3 && hp.breakdown.foodPenalty === 120 && hp.charge === 179.5 && hp.refundAmount === 55.5 && hp.refundHeldForRescue === true && hp.refundIfNotRescued === 0, JSON.stringify(hp));
const refundsBefore = await refundsOf(UW);
await svc.cancelWithPolicy(h1, UW, { reasonCode: 'changed_mind', acknowledgePenalty: true });
const hc = await M.FoodCancellationCase.findOne({ orderId: h1 });
ok('refund is HELD (nothing refunded yet)', hc.refund.status === 'held' && hc.refund.amount === 55.5 && (await refundsOf(UW)) === refundsBefore, JSON.stringify(hc.refund));
ok('admin view: provisional, not final', svc.actualOutcome(hc.toObject(), await FoodUserPenalty.findById(hc.penaltyId).lean()).state === 'pending_rescue');
const hl = await M.FoodRescueListing.findOne({ originalOrderId: h1 });
await M.FoodRescueListing.updateOne({ _id: hl._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
await svc.runCancellationSweep();
await svc.runCancellationSweep();
const hc2 = await M.FoodCancellationCase.findOne({ orderId: h1 });
const hpen = await FoodUserPenalty.findById(hc.penaltyId);
ok('unsold rescue: whole payment kept, no refund, charged once', hc2.refund.status === 'none' && hc2.refund.amount === 0 && hc2.refund.deducted === 235 && hpen.amount === 235 && (await refundsOf(UW)) === refundsBefore, JSON.stringify(hc2.refund));
ok('admin view: actual charge is 235 (cut from payment)', svc.actualOutcome(hc2.toObject(), hpen.toObject()).amount === 235 && svc.actualOutcome(hc2.toObject(), hpen.toObject()).state === 'deducted');
const h2 = await onlineOrder('picked_up');
await svc.cancelWithPolicy(h2, UW, { reasonCode: 'changed_mind', acknowledgePenalty: true });
const hc3 = await M.FoodCancellationCase.findOne({ orderId: h2 });
await svc.finalizeHeldRefund(hc3._id, 'rescued');
await svc.finalizeHeldRefund(hc3._id, 'rescued');
const hc4 = await M.FoodCancellationCase.findOne({ orderId: h2 });
ok('sold rescue: 55.5 refunded exactly once, charge stays 179.5', hc4.refund.status === 'processed' && hc4.refund.amount === 55.5 && hc4.refund.attempts === 1 && (await FoodUserPenalty.findById(hc3.penaltyId)).amount === 179.5, JSON.stringify({ r: hc4.refund, n: (await refundsOf(UW)) - refundsBefore, pen: (await FoodUserPenalty.findById(hc3.penaltyId))?.amount }));

// ---- COD unreachable return: one policy case + ledger penalty, payouts only after the restaurant OTP
const UR = oid(); U = UR;
const ro = await mkOrder('reached_drop');
const rOrder = await FoodOrder.findById(ro);
const rec = await svc.recordReturnPenalty(rOrder, oid(), { percent: 50 });
ok('return penalty = 50% of 200 + 30 + 5 + 20 + 4.5 = 159.5', rec.amount === 159.5 && rec.breakdown.restaurantPayable === 60, JSON.stringify(rec));
const rpen = await FoodUserPenalty.findOne({ orderId: ro });
ok('shows in the ledger and blocks COD', rpen.source === 'cancellation_policy' && rpen.status === 'pending' && (await svc.isCodBlocked(UR)).blocked === true);
const restBefore = await walletCredits(R, 'order_payout');
const riderBefore = await walletCredits(P, 'delivery_payout');
await svc.settleReturnPayouts(ro);
await svc.settleReturnPayouts(ro);
ok('restaurant gets 30% (60) and rider Rs 20 return pay, once', (await walletCredits(R, 'order_payout')) === restBefore + 60 && (await walletCredits(P, 'delivery_payout')) === riderBefore + 20);

// ---- live calculator uses the same maths, with unsaved edits applied
const sim = await svc.simulateCancellation({ stage: 2, paymentMethod: 'cash', foodValue: 200, deliveryFee: 30, platformFee: 5, trackedKm: 2.5 }, null);
ok('calculator matches the real preview (94.5)', sim.breakdown.total === 94.5 && sim.scenarios[0].restaurant.amount === 30 && sim.scenarios[0].customer.codBlocked === true, JSON.stringify(sim.breakdown));
const sim2 = await svc.simulateCancellation({ stage: 2, paymentMethod: 'cash', foodValue: 200, deliveryFee: 30, platformFee: 5, trackedKm: 2.5 }, { stage2: { foodPenaltyPercent: 50, restaurantSharePercent: 10 } });
ok('calculator applies unsaved edits live (154.5, restaurant 20)', sim2.breakdown.total === 154.5 && sim2.scenarios[0].restaurant.amount === 20, JSON.stringify(sim2.breakdown));
const simP = await svc.simulateCancellation({ stage: 3, paymentMethod: 'online', foodValue: 200, deliveryFee: 30, platformFee: 5 }, null);
ok('calculator prepaid stage 3: rescued 179.5 / refund 55.5, unsold 235 / refund 0', simP.scenarios[0].customer.refund === 55.5 && simP.scenarios[1].customer.charge === 235 && simP.scenarios[1].customer.refund === 0, JSON.stringify(simP.scenarios.map((s) => s.customer)));

const sm = await svc.summary();
ok('admin summary works', Array.isArray(sm.byStage) && sm.byStage.length >= 2 && typeof sm.money.deducted === 'number');
const cl = await svc.listCases({});
ok('case list carries the actual charge state', cl.items.every((c) => c.actual && typeof c.actual.state === 'string'));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await mongoose.disconnect();
await rs.stop();
process.exit(fails ? 1 : 0);
