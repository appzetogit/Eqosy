/**
 * COD handling charge: an admin-set amount added only to Cash on Delivery orders.
 * The charge itself is earned by the delivery partner who verifies the order with the customer;
 * GST (fixed 18%) is charged on top of it and stays with the platform.
 */
export const COD_CHARGE_GST_RATE = 18;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** @returns {{ enabled: boolean, amount: number, gstRate: number, gst: number, total: number }} */
export function computeCodCharge(feeSettings) {
    const cfg = feeSettings?.codCharge || {};
    const amount = cfg.isEnabled === true ? Math.max(0, round2(cfg.amount)) : 0;
    if (amount <= 0) return { enabled: false, amount: 0, gstRate: COD_CHARGE_GST_RATE, gst: 0, total: 0 };
    const gst = round2(amount * (COD_CHARGE_GST_RATE / 100));
    return { enabled: true, amount, gstRate: COD_CHARGE_GST_RATE, gst, total: round2(amount + gst) };
}
