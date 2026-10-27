import React from 'react';

const money = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

/**
 * Shows the fare before GST, GST (with CGST/SGST when admin enabled the split) and the GST rate.
 * Pass the object returned by resolveRideGst(). Renders nothing when no GST applies to the ride.
 */
const GstBreakdown = ({ gst, className = '', labelClassName = '', valueClassName = '', showTaxable = true }) => {
  if (!gst || !(Number(gst.gstAmount) > 0)) {
    return null;
  }

  return (
    <div className={className}>
      {showTaxable && (
        <div className="flex items-center justify-between">
          <span className={labelClassName}>Fare before GST</span>
          <span className={valueClassName}>{money(gst.taxableAmount)}</span>
        </div>
      )}
      {gst.cgstAmount !== null && gst.cgstAmount !== undefined ? (
        <>
          <div className="flex items-center justify-between">
            <span className={labelClassName}>CGST ({Number(gst.rate) / 2}%)</span>
            <span className={valueClassName}>{money(gst.cgstAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={labelClassName}>SGST ({Number(gst.rate) / 2}%)</span>
            <span className={valueClassName}>{money(gst.sgstAmount)}</span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between">
          <span className={labelClassName}>GST ({Number(gst.rate)}%)</span>
          <span className={valueClassName}>{money(gst.gstAmount)}</span>
        </div>
      )}
      {gst.gstin ? (
        <div className="flex items-center justify-between">
          <span className={labelClassName}>GSTIN</span>
          <span className={valueClassName}>{gst.gstin}</span>
        </div>
      ) : null}
    </div>
  );
};

export default GstBreakdown;
