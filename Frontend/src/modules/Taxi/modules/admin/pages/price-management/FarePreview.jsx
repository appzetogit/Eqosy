import React from 'react';
import { Calculator } from 'lucide-react';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const rupee = (value) => `Rs ${(Math.round(Number(value || 0) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Same maths the rider app and the ride lifecycle use:
 * - Within base distance: base price. Beyond it: base + extra km x price/km + ride minutes x time price.
 * - Service tax % on that subtotal, then the zone's ride surge (only where surge is switched on).
 * - Waiting at pickup: billable minutes = waiting minutes - free minutes before the ride; charged per minute.
 * - Driver commission is taken from the fare (percentage or fixed, never more than the fare).
 */
export const computeFarePreview = (form, { distanceKm, rideMinutes, waitingMinutes, surgeOn }) => {
  const basePrice = num(form.base_price);
  const baseDistance = num(form.base_distance);
  const perKm = num(form.price_per_distance);
  const perMinute = num(form.time_price);
  const tax = num(form.service_tax);
  const surge = surgeOn ? num(form.ride_surge_amount) : 0;

  const withinBase = baseDistance > 0 && distanceKm <= baseDistance;
  const extraKm = withinBase ? 0 : Math.max(0, distanceKm - baseDistance);
  const distanceCharge = withinBase ? 0 : extraKm * perKm;
  const timeCharge = withinBase ? 0 : rideMinutes * perMinute;
  const subtotal = basePrice + distanceCharge + timeCharge;
  const taxAmount = (subtotal * tax) / 100;
  const rideFare = Math.max(basePrice, Math.round(subtotal + taxAmount + surge));

  const freeBefore = num(form.free_waiting_before);
  const waitingRate = num(form.waiting_charge);
  const billableWaiting = Math.max(0, Math.ceil(waitingMinutes) - freeBefore);
  const waitingCharge = Math.round(billableWaiting * waitingRate * 100) / 100;
  const total = rideFare + waitingCharge;

  const commissionValue = num(form.admin_commission_from_driver);
  const commissionIsPercent = String(form.admin_commission_type_from_driver) !== '2';
  const commission = Math.min(commissionIsPercent ? (total * commissionValue) / 100 : commissionValue, total);

  return {
    basePrice, withinBase, extraKm, distanceCharge, timeCharge, subtotal, taxAmount, surge,
    rideFare, freeBefore, billableWaiting, waitingRate, waitingCharge, total,
    commission, driverEarning: total - commission,
  };
};

const Field = ({ label, value, onChange, suffix }) => (
  <label className="block">
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
    <span className="flex items-center rounded-lg border border-slate-200 bg-white px-3">
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent py-2 text-sm font-semibold text-slate-900 outline-none"
      />
      <span className="text-[11px] font-bold text-slate-400">{suffix}</span>
    </span>
  </label>
);

const Row = ({ label, hint, value, strong, muted }) => (
  <div className={`flex items-start justify-between gap-4 py-1.5 text-sm ${muted ? 'text-slate-400' : 'text-slate-700'}`}>
    <span>
      <span className={strong ? 'font-bold text-slate-900' : ''}>{label}</span>
      {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
    </span>
    <span className={`shrink-0 ${strong ? 'text-base font-bold text-slate-900' : 'font-semibold'}`}>{value}</span>
  </div>
);

const FarePreview = ({ formData }) => {
  const [distance, setDistance] = React.useState('12');
  const [rideMinutes, setRideMinutes] = React.useState('25');
  const [waiting, setWaiting] = React.useState('6');
  const [surgeOn, setSurgeOn] = React.useState(false);

  const result = computeFarePreview(formData, {
    distanceKm: num(distance),
    rideMinutes: num(rideMinutes),
    waitingMinutes: num(waiting),
    surgeOn,
  });

  const quickDistances = [2, 5, 10, 20, 40];
  const quick = quickDistances.map((km) => ({
    km,
    fare: computeFarePreview(formData, { distanceKm: km, rideMinutes: km * 2.2, waitingMinutes: 0, surgeOn }).rideFare,
  }));

  return (
    <div className="md:col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Calculator size={18} className="text-indigo-600" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Live fare example</h3>
        <span className="text-[11px] font-medium text-slate-500">Updates as you type the prices above</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Trip distance" value={distance} onChange={setDistance} suffix="km" />
        <Field label="Trip duration" value={rideMinutes} onChange={setRideMinutes} suffix="min" />
        <Field label="Waited at pickup" value={waiting} onChange={setWaiting} suffix="min" />
        <label className="flex items-end gap-2 pb-2.5 text-[12px] font-semibold text-slate-700">
          <input type="checkbox" checked={surgeOn} onChange={(e) => setSurgeOn(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Surge active in zone
        </label>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
          <Row label="Base price" hint={result.withinBase ? 'Trip is inside the base distance, so only this is charged' : undefined} value={rupee(result.basePrice)} />
          <Row label="Extra distance" hint={`${result.extraKm.toFixed(1)} km x ${rupee(formData.price_per_distance || 0)}`} value={rupee(result.distanceCharge)} muted={result.distanceCharge === 0} />
          <Row label="Time charge" hint={`${num(rideMinutes)} min x ${rupee(formData.time_price || 0)}`} value={rupee(result.timeCharge)} muted={result.timeCharge === 0} />
          <Row label="Service tax" hint={`${num(formData.service_tax)}% of ${rupee(result.subtotal)}`} value={rupee(result.taxAmount)} muted={result.taxAmount === 0} />
          <Row label="Ride surge" hint={surgeOn ? undefined : 'Only where the zone has surge switched on'} value={rupee(result.surge)} muted={result.surge === 0} />
          <div className="my-1 border-t border-dashed border-slate-200" />
          <Row label="Ride fare" value={rupee(result.rideFare)} strong />
          <Row
            label="Waiting charge"
            hint={`${num(waiting)} min waited - ${result.freeBefore} free = ${result.billableWaiting} billable x ${rupee(result.waitingRate)}`}
            value={rupee(result.waitingCharge)}
            muted={result.waitingCharge === 0}
          />
          <div className="my-1 border-t border-dashed border-slate-200" />
          <Row label="Rider pays" value={rupee(result.total)} strong />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
            <Row
              label="Admin commission from driver"
              hint={String(formData.admin_commission_type_from_driver) === '2' ? 'Fixed amount' : `${num(formData.admin_commission_from_driver)}% of the total`}
              value={rupee(result.commission)}
            />
            <Row label="Driver earns" value={rupee(result.driverEarning)} strong />
          </div>

          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Ride fare by distance</p>
            <div className="grid grid-cols-5 gap-2 text-center">
              {quick.map((item) => (
                <div key={item.km} className="rounded-lg bg-slate-50 px-1 py-2">
                  <p className="text-[11px] font-bold text-slate-500">{item.km} km</p>
                  <p className="text-sm font-bold text-slate-900">{rupee(item.fare)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-1 text-[11px] text-slate-500">
        <li>Waiting is counted at pickup only (from the driver arriving until the trip starts).</li>
        <li>"Free waiting after ride start" is saved with the price but is not billed by the app yet.</li>
        <li>"Commission from customer" is not added to the rider's fare.</li>
      </ul>
    </div>
  );
};

export default FarePreview;
