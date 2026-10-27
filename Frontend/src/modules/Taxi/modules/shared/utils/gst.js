const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/**
 * GST breakdown for a ride payload. Uses the server-built `gst` object when present, otherwise derives it from the
 * rate snapshotted on the ride (pricingSnapshot.gst) so the amount always matches what admin had set at booking time.
 * The fare on a ride is GST-inclusive; previous cancellation dues are not taxable.
 */
export const resolveRideGst = (ride) => {
  if (!ride) return null;

  if (ride.gst && Number(ride.gst.gstAmount) > 0) {
    return ride.gst;
  }

  const snapshot = ride.pricingSnapshot?.gst;
  const rate = Number(snapshot?.rate);
  if (!snapshot?.enabled || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const rideFare = Math.max(0, Number(ride.fare || 0) - Number(ride.previousCancellationFee || 0));
  const taxableAmount = round2(rideFare / (1 + rate / 100));
  const gstAmount = round2(rideFare - taxableAmount);
  const cgstAmount = snapshot.showCgstSgstSplit ? round2(gstAmount / 2) : null;

  return {
    serviceKey: snapshot.serviceKey || 'ride',
    rate,
    gstin: snapshot.gstin || '',
    taxableAmount,
    gstAmount,
    cgstAmount,
    sgstAmount: cgstAmount === null ? null : round2(gstAmount - cgstAmount),
    totalAmount: round2(rideFare),
  };
};
