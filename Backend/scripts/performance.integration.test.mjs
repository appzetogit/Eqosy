// Integration test for the performance/penalty engine. Needs: npm i -D mongodb-memory-server
// Run: node scripts/performance.integration.test.mjs  (uses an in-memory DB, never the real one)
import { MongoMemoryServer } from 'mongodb-memory-server';
const B = new URL('../', import.meta.url).href;
const { default: mongoose } = await import(B + 'node_modules/mongoose/index.js');
const svc = await import(B + 'src/modules/food/performance/services/performance.service.js');
const { FoodOrder } = await import(B + 'src/modules/food/orders/models/order.model.js');
const M = await import(B + 'src/modules/food/performance/models/performance.models.js');

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri(), { dbName: 'perf_test' });

let fails = 0;
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); };
const throws = async (name, fn, re) => { try { await fn(); ok(name, false, 'did not throw'); } catch (e) { ok(name, re.test(e.message), e.message); } };
const oid = () => new mongoose.Types.ObjectId();
const MIN = 60000;

const R = oid(), U = oid(), P = oid();
async function mkOrder(qty, extra = {}) {
  const _id = oid();
  await FoodOrder.collection.insertOne({ _id, restaurantId: R, userId: U, items: [{ name: 'x', quantity: qty }], orderStatus: 'confirmed', createdAt: new Date(), ...extra });
  return FoodOrder.findById(_id);
}
const ledger = (q) => M.FoodPenaltyLedger.find(q).lean();

// ---- config validation
const cfg0 = await svc.getConfig({ fresh: true });
ok('default config created', cfg0.restaurantDelaySlabs.length === 4);
await throws('gap in slabs rejected', () => svc.updateConfig({ restaurantDelaySlabs: [{ fromMin: 1, toMin: 5, action: 'warning' }, { fromMin: 8, toMin: null, action: 'penalty', amount: 5 }] }), /continuous/);
await throws('closed last slab rejected', () => svc.updateConfig({ restaurantDelaySlabs: [{ fromMin: 1, toMin: 5, action: 'warning' }] }), /open-ended/);
await throws('tier gap rejected', () => svc.updateConfig({ orderTiers: [{ key: 'a', label: 'A', minItems: 1, maxItems: 5 }, { key: 'b', label: 'B', minItems: 9, maxItems: null }] }), /continuous/);

// ---- prep delay slabs (approved 20 min)
async function prepCase(readyAfterMin, qty = 2) {
  const o = await mkOrder(qty);
  await svc.onRestaurantAccept(o, { prepMinutes: 20 });
  const fresh = await FoodOrder.findById(o._id);
  const accepted = fresh.prep.acceptedAt.getTime();
  ok(`ETA = accept + 20m (${readyAfterMin})`, fresh.prep.approvedEta.getTime() - accepted === 20 * MIN);
  fresh.deliveryState = { ...(fresh.deliveryState?.toObject?.() || {}), foodReadyAt: new Date(accepted + readyAfterMin * MIN) };
  await svc.onFoodReady(fresh);
  await svc.onFoodReady(fresh); // duplicate trigger
  return { o: fresh, rows: await ledger({ orderId: o._id }) };
}
let r = await prepCase(19.9);
ok('on-time: no violation', r.rows.length === 0);
r = await prepCase(20 + 0.99);
ok('<1 min late: none', r.rows.length === 0);
r = await prepCase(20 + 3);
ok('3 min late: warning, no money', r.rows.length === 1 && r.rows[0].stage === 'warning' && r.rows[0].amount === 0 && r.rows[0].status === 'warning');
r = await prepCase(20 + 5.99);
ok('5m59s late: still warning (floor)', r.rows[0].stage === 'warning');
r = await prepCase(20 + 7);
ok('7 min: Rs10 applied, no duplicate', r.rows.length === 1 && r.rows[0].amount === 10 && r.rows[0].status === 'applied' && r.rows[0].delayMinutes === 7);
r = await prepCase(20 + 15);
ok('15 min: Rs20', r.rows[0].amount === 20);
r = await prepCase(20 + 25);
const strikes1 = await M.FoodStrike.find({ partyId: R, revoked: false }).lean();
ok('25 min: Rs30 + 1 strike', r.rows[0].amount === 30 && r.rows[0].strikeCount === 1 && strikes1.length === 1, JSON.stringify(strikes1));
ok('ledger has original/approved/actual', r.rows[0].originalEta && r.rows[0].approvedEta && r.rows[0].actualAt);

// ---- extension
const big = await mkOrder(20);
await svc.onRestaurantAccept(big, { prepMinutes: 20 });
const bigF = await FoodOrder.findById(big._id);
ok('20 items classified bulk', bigF.prep.tierKey === 'bulk');
await throws('extension over tier cap rejected', () => svc.requestExtension(big._id, R, { extraMinutes: 41, reason: 'x' }), /between 1 and 40/);
await throws('extension needs reason', () => svc.requestExtension(big._id, R, { extraMinutes: 10, reason: ' ' }), /reason/i);
const small = await mkOrder(2);
await svc.onRestaurantAccept(small, { prepMinutes: 20 });
await throws('normal order cannot extend', () => svc.requestExtension(small._id, R, { extraMinutes: 10, reason: 'busy' }), /not available/);
const ext = await svc.requestExtension(big._id, R, { extraMinutes: 30, reason: 'large order' });
ok('pending customer approval', ext.status === 'pending_customer');
await throws('only owner customer can respond', () => svc.respondExtension(ext._id, oid(), true), /not found/i);
await svc.respondExtension(ext._id, U, true);
const bigE = await FoodOrder.findById(big._id);
ok('approvedEta moved +30, originalEta preserved', bigE.prep.approvedEta.getTime() - bigE.prep.originalEta.getTime() === 30 * MIN && bigE.prep.extended === true);
bigE.deliveryState = { foodReadyAt: new Date(bigE.prep.acceptedAt.getTime() + 45 * MIN) };
await svc.onFoodReady(bigE);
ok('ready within extended time: no penalty', (await ledger({ orderId: big._id })).length === 0);

const big2 = await mkOrder(20);
await svc.onRestaurantAccept(big2, { prepMinutes: 20 });
const e2 = await svc.requestExtension(big2._id, R, { extraMinutes: 10, reason: 'busy' });
await svc.respondExtension(e2._id, U, false);
const b2 = await FoodOrder.findById(big2._id);
ok('rejected extension keeps original deadline', b2.prep.approvedEta.getTime() === b2.prep.originalEta.getTime());

const big3 = await mkOrder(40); // special bulk -> admin approval
await svc.onRestaurantAccept(big3, { prepMinutes: 20 });
const e3 = await svc.requestExtension(big3._id, R, { extraMinutes: 60, reason: 'huge' });
ok('special bulk goes to admin first', e3.status === 'pending_admin');
await svc.adminDecideExtension(e3._id, oid(), true, { skipCustomer: false });
ok('after admin approval waits for customer', (await M.FoodPrepExtension.findById(e3._id)).status === 'pending_customer');
await M.FoodPrepExtension.updateOne({ _id: e3._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
ok('stale request expires via sweep', (await svc.expireStaleExtensions()) === 1);

const late = await mkOrder(20);
await svc.onRestaurantAccept(late, { prepMinutes: 20 });
await FoodOrder.updateOne({ _id: late._id }, { $set: { 'prep.approvedEta': new Date(Date.now() - 5 * MIN) } });
await throws('cannot extend after deadline', () => svc.requestExtension(late._id, R, { extraMinutes: 10, reason: 'late' }), /already passed/);

// ---- rejections: separate restaurant to keep counts clean
const R2 = oid();
const rej = [];
for (let i = 0; i < 6; i++) {
  const o = await mkOrder(1, { restaurantId: R2 });
  rej.push(await svc.recordViolation({ partyType: 'RESTAURANT', partyId: R2, orderId: o._id, violationType: 'ORDER_REJECTION', reason: 'busy' }));
}
ok('rejection 1 warning', rej[0].stage === 'warning' && rej[0].amount === 0);
ok('rejection 2 Rs10', rej[1].amount === 10);
ok('rejection 3 Rs20', rej[2].amount === 20);
ok('rejection 4 Rs30 + strike', rej[3].amount === 30 && rej[3].strikeCount === 1);
ok('rejection 5 flags admin review', rej[4].adminReview === true);
const dup = await svc.recordViolation({ partyType: 'RESTAURANT', partyId: R2, orderId: rej[0].orderId, violationType: 'ORDER_REJECTION' });
ok('same violation not duplicated', String(dup._id) === String(rej[0]._id));
const vr = await svc.recordViolation({ partyType: 'RESTAURANT', partyId: R2, orderId: oid(), violationType: 'ORDER_REJECTION', reason: 'no stock', reasonCode: 'out_of_stock' });
ok('valid reason held for review, no strike yet', vr.status === 'pending' && vr.reviewHold === true);
ok('rejection vs post-accept cancel counted separately', (await svc.recordViolation({ partyType: 'RESTAURANT', partyId: R2, orderId: oid(), violationType: 'POST_ACCEPT_CANCELLATION', reason: 'x' })).occurrenceInMonth === 1);

// ---- appeal / dispute / settlement
const pen = rej[3];
const ap = await svc.createAppeal('RESTAURANT', R2, { ledgerId: pen._id, reason: 'power cut', evidence: ['http://x/y.jpg'] });
ok('appeal makes penalty disputed', (await M.FoodPenaltyLedger.findById(pen._id)).status === 'disputed');
await throws('cannot settle while disputed', () => svc.decideLedger(pen._id, oid(), 'settle'), /Only applied/);
await svc.decideAppeal(ap._id, oid(), false, 'no proof');
ok('rejected appeal restores applied + keeps strike', (await M.FoodPenaltyLedger.findById(pen._id)).status === 'applied' && (await M.FoodStrike.countDocuments({ ledgerId: pen._id, revoked: false })) === 1);
await svc.decideLedger(pen._id, oid(), 'settle');
ok('settle recorded', (await M.FoodPenaltyLedger.findById(pen._id)).settled === true);
const pen2 = rej[2];
const ap2 = await svc.createAppeal('RESTAURANT', R2, { ledgerId: pen2._id, reason: 'wrong' });
await svc.decideAppeal(ap2._id, oid(), true, 'ok');
ok('approved appeal reverses', (await M.FoodPenaltyLedger.findById(pen2._id)).status === 'reversed');
await svc.decideLedger(vr._id, oid(), 'approve');
ok('admin approval of held penalty applies it', (await M.FoodPenaltyLedger.findById(vr._id)).status === 'applied');

// ---- strikes ladder + suspension
const R3 = oid();
for (let i = 0; i < 3; i++) {
  const o = await mkOrder(1, { restaurantId: R3 });
  await svc.recordViolation({ partyType: 'RESTAURANT', partyId: R3, orderId: o._id, violationType: 'PREP_DELAY', delayMinutes: 30 });
}
const st3 = await M.FoodStrike.find({ partyId: R3 }).sort({ monthlyCount: 1 }).lean();
ok('3 strikes recorded; 3rd = 24h suspension', st3.length === 3 && st3[2].action === 'suspend' && Math.abs(st3[2].suspendedUntil - Date.now() - 24 * 60 * MIN) < 5000, JSON.stringify(st3.map((s) => s.action)));
ok('isSuspended true', (await svc.isSuspended('RESTAURANT', R3)).suspended === true);
await svc.assertNotSuspended('RESTAURANT', R3);
ok('enforcement off by default: no throw', true);
await svc.updateConfig({ autoEnforceSuspension: true });
await throws('enforcement on: suspended blocked', () => svc.assertNotSuspended('RESTAURANT', R3), /suspended/);
await svc.updateConfig({ autoEnforceSuspension: false });

// ---- delivery timer
const d1 = await mkOrder(1, { deliveryState: { pickedUpAt: new Date(Date.now() - 40 * MIN), reachedPickupAt: new Date(Date.now() - 90 * MIN), foodReadyAt: new Date(Date.now() - 45 * MIN) } });
const d1f = await FoodOrder.findById(d1._id);
await svc.onOrderPickedUp(d1f, P);
const d1g = await FoodOrder.findById(d1._id);
const est = d1g.deliveryEval.estimatedMinutes;
ok('ETA = pickup + estimate (restaurant wait ignored)', d1g.deliveryEval.originalEta.getTime() - d1g.deliveryEval.pickedUpAt.getTime() === est * MIN && est === 13, String(est));
d1g.deliveryState.deliveredAt = new Date(d1g.deliveryEval.originalEta.getTime() + 12 * MIN);
await svc.onOrderDelivered(d1g);
await svc.onOrderDelivered(d1g);
const dr = await ledger({ orderId: d1._id });
ok('12 min late delivery: Rs20, partner party, once', dr.length === 1 && dr[0].amount === 20 && dr[0].partyType === 'DELIVERY_PARTNER' && String(dr[0].partyId) === String(P));

const d2 = await mkOrder(1, { orderStatus: 'picked_up', deliveryState: { pickedUpAt: new Date(Date.now() - 40 * MIN) } });
await svc.onOrderPickedUp(await FoodOrder.findById(d2._id), P);
await svc.reportDeliveryDelay(d2._id, P, { minutes: 15, reasonCode: 'heavy_rain', note: 'storm' });
await throws('invalid delay reason rejected', () => svc.reportDeliveryDelay(d2._id, P, { minutes: 5, reasonCode: 'lazy' }), /valid delay reason/);
const d2d = await FoodOrder.findById(d2._id);
await svc.adminDecideDeliveryAdjustment(d2._id, oid(), { adjustmentId: d2d.deliveryEval.adjustments[0]._id, approve: true });
const d2e = await FoodOrder.findById(d2._id);
ok('approved delay moves adjusted ETA, original preserved', d2e.deliveryEval.adjustedEta.getTime() - d2e.deliveryEval.originalEta.getTime() === 15 * MIN);
d2e.deliveryState.deliveredAt = new Date(d2e.deliveryEval.originalEta.getTime() + 14 * MIN);
await svc.onOrderDelivered(d2e);
ok('delivered inside adjusted ETA: no penalty', (await ledger({ orderId: d2._id })).length === 0);

const d3 = await mkOrder(1, { orderStatus: 'picked_up', deliveryState: { pickedUpAt: new Date(Date.now() - 40 * MIN) } });
await svc.onOrderPickedUp(await FoodOrder.findById(d3._id), P);
await svc.reportDeliveryDelay(d3._id, P, { minutes: 10, reasonCode: 'traffic_jam' });
const d3f = await FoodOrder.findById(d3._id);
d3f.deliveryState.deliveredAt = new Date(d3f.deliveryEval.originalEta.getTime() + 30 * MIN);
await svc.onOrderDelivered(d3f);
const d3r = await ledger({ orderId: d3._id });
ok('penalty held when a delay report is pending', d3r.length === 1 && d3r[0].status === 'pending' && d3r[0].reviewHold === true, JSON.stringify(d3r[0]));

// late approval fully covering the delay waives the penalty
const d4 = await mkOrder(1, { orderStatus: 'picked_up', deliveryState: { pickedUpAt: new Date(Date.now() - 40 * MIN) } });
await svc.onOrderPickedUp(await FoodOrder.findById(d4._id), P);
await svc.reportDeliveryDelay(d4._id, P, { minutes: 20, reasonCode: 'road_closure' });
const d4f = await FoodOrder.findById(d4._id);
d4f.deliveryState.deliveredAt = new Date(d4f.deliveryEval.originalEta.getTime() + 15 * MIN);
await svc.onOrderDelivered(d4f);
ok('d4 penalty held first', (await ledger({ orderId: d4._id }))[0]?.status === 'pending');
await svc.adminDecideDeliveryAdjustment(d4._id, oid(), { adjustmentId: d4f.deliveryEval.adjustments[0]._id, approve: true });
ok('late approval covering delay waives penalty', (await ledger({ orderId: d4._id }))[0].status === 'waived');

// assignment rejection vs cancel after accept
const a1 = await svc.onAssignmentRejected(oid(), P, { reason: 'x' });
const a2 = await svc.onAssignmentRejected(oid(), P, { reasonCode: 'outside_service_area', reason: 'far' });
const a3 = await svc.onAssignmentRejected(oid(), P, { wasAccepted: true });
ok('assignment rejection tracked as its own type', a1.violationType === 'ASSIGNMENT_REJECTION' && a1.occurrenceInMonth === 1);
ok('valid-reason assignment rejection held, not counted', a2.reviewHold === true);
ok('cancel after accept is a separate violation', a3.violationType === 'POST_ACCEPT_CANCELLATION');

// ---- dashboards + sweep
// ---- admin order timeline: restaurant time, rider time, total
const tlId = oid();
const P2 = oid();
const base = Date.now() - 60 * MIN;
const T = (m) => new Date(base + m * MIN);
await FoodOrder.collection.insertOne({
  _id: tlId, restaurantId: R, userId: U, orderStatus: 'delivered', createdAt: T(0), items: [{ quantity: 1 }],
  prep: { acceptedAt: T(2), originalEta: T(22), approvedEta: T(22), prepMinutes: 20 },
  dispatch: { assignedAt: T(3), acceptedAt: T(4), deliveryPartnerId: P2 },
  deliveryState: { foodPrepStartedAt: T(2), foodReadyAt: T(27), reachedPickupAt: T(20), pickedUpAt: T(28), deliveredAt: T(50), riderWaitDurationMs: 8 * MIN },
  deliveryEval: { partnerId: P2, pickedUpAt: T(28), estimatedMinutes: 15, originalEta: T(43), adjustedEta: T(43) },
});
const tl = await svc.orderTimeline(String(tlId));
ok('timeline: restaurant accepted after 2, prep 25 vs 20 promised, late by 5', tl.restaurant.acceptedAfterMin === 2 && tl.restaurant.actualPrepMin === 25 && tl.restaurant.promisedPrepMin === 20 && tl.restaurant.lateByMin === 5 && tl.restaurant.status === 'late', JSON.stringify(tl.restaurant));
ok('timeline: rider travel 16, waited 8, delivery 22 vs 15 expected, late 7', tl.deliveryPartner.travelToRestaurantMin === 16 && tl.deliveryPartner.waitedAtRestaurantMin === 8 && tl.deliveryPartner.deliveryTimeMin === 22 && tl.deliveryPartner.lateByMin === 7 && tl.deliveryPartner.status === 'late', JSON.stringify(tl.deliveryPartner));
ok('timeline: total 50 min, events ordered', tl.totals.totalMin === 50 && tl.events[0].key === 'placed' && tl.events[tl.events.length - 1].key === 'delivered' && tl.events.every((e, i, a) => !i || a[i - 1].at <= e.at));

// ---- penalty preview BEFORE the action
const RP = oid();
const pv1 = await svc.previewViolation({ partyType: 'RESTAURANT', partyId: RP, violationType: 'ORDER_REJECTION', reasonCode: '' });
ok('preview: 1st rejection = warning, tells the next cost', pv1.occurrence === 1 && pv1.action === 'warning' && pv1.amount === 0 && /Rs 10/.test(pv1.message), pv1.message);
for (let i = 0; i < 3; i++) await svc.recordViolation({ partyType: 'RESTAURANT', partyId: RP, orderId: oid(), violationType: 'ORDER_REJECTION', reason: 'busy' });
const pv4 = await svc.previewViolation({ partyType: 'RESTAURANT', partyId: RP, violationType: 'ORDER_REJECTION', reasonCode: '' });
ok('preview: 4th rejection = Rs 30 + strike', pv4.occurrence === 4 && pv4.amount === 30 && pv4.strike === 1 && /strike 1/.test(pv4.message), pv4.message);
const pvv = await svc.previewViolation({ partyType: 'RESTAURANT', partyId: RP, violationType: 'ORDER_REJECTION', reasonCode: 'out_of_stock' });
ok('preview: valid reason = held for admin review', pvv.underReview === true && /checked by admin/.test(pvv.message));
const pvr = await svc.previewViolation({ partyType: 'DELIVERY_PARTNER', partyId: oid(), violationType: 'POST_ACCEPT_CANCELLATION', reasonCode: '' });
ok('preview works for rider cancel-after-accept', pvr.applies && pvr.occurrence === 1);

// ---- warning BEFORE the deadline
const pw = await mkOrder(2);
await svc.onRestaurantAccept(pw, { prepMinutes: 20 });
await FoodOrder.updateOne({ _id: pw._id }, { $set: { 'prep.approvedEta': new Date(Date.now() + 2 * MIN) } });
await svc.runPerformanceSweep();
ok('restaurant warned before the deadline (once)', (await FoodOrder.findById(pw._id)).prep.preWarned === true);
const dash = await svc.restaurantDashboard(R);
ok('restaurant dashboard fields', dash.acceptedOrders >= 5 && typeof dash.onTimePrepPercent === 'number' && dash.totalStrikes >= 1, JSON.stringify(dash).slice(0, 300));
const dd = await svc.deliveryDashboard(P);
ok('delivery dashboard fields', dd.completedDeliveries === 0 && typeof dd.onTimeDeliveryPercent === 'number');
await svc.runPerformanceSweep();
ok('sweep runs', true);
ok('overview lists', (await svc.adminRestaurantOverview()).length >= 2 && (await svc.adminDeliveryOverview()).length >= 1);
ok('audit log written', (await M.FoodPerformanceAudit.countDocuments()) > 0);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await mongoose.disconnect();
await mongod.stop();
process.exit(fails ? 1 : 0);
