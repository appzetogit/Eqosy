import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Bus, Car, Info, Loader2, Save, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminPageHeader from '../../components/ui/AdminPageHeader';
import { adminCardClass, adminInputClass, adminLabelClass } from '../../components/ui/adminUi';
import { adminService } from '../../services/adminService';

const inr = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const unwrap = (response) => response?.data?.data || response?.data || response || {};

/** Same maths as the backend ownerPayoutService, used for the live examples. */
export const computePayoutExample = ({ fare, commissionPercent, model, ownerSharePercent, busTicket, busCommissionPercent }) => {
  const safeFare = Math.max(0, Number(fare) || 0);
  const commission = Math.round((safeFare * Math.min(100, Math.max(0, Number(commissionPercent) || 0))) / 100);
  const net = Math.max(0, safeFare - commission);
  const share = model === 'salary' ? 100 : Math.min(100, Math.max(0, Number(ownerSharePercent) || 0));
  const ownerShare = Math.round((net * share) / 100);
  const driverShare = net - ownerShare;
  const ticket = Math.max(0, Number(busTicket) || 0);
  const busCommission = Math.round((ticket * Math.min(100, Math.max(0, Number(busCommissionPercent) || 0))) / 100);
  return {
    fare: safeFare,
    commission,
    net,
    share,
    ownerShare,
    driverShare,
    cashOwedToOwner: safeFare - driverShare,
    busCommission,
    busOwner: ticket - busCommission,
    ticket,
  };
};

const Row = ({ label, value, tone = 'text-gray-900', strong = false }) => (
  <div className="flex items-center justify-between py-1.5 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className={`${strong ? 'font-bold' : 'font-semibold'} ${tone}`}>{value}</span>
  </div>
);

/** Live worked example shown next to the inputs. */
export const PayoutExamplePanel = ({ model, ownerSharePercent }) => {
  const [fare, setFare] = useState(500);
  const [commissionPercent, setCommissionPercent] = useState(10);
  const [busTicket, setBusTicket] = useState(800);
  const [busCommissionPercent, setBusCommissionPercent] = useState(12);
  const ex = useMemo(
    () => computePayoutExample({ fare, commissionPercent, model, ownerSharePercent, busTicket, busCommissionPercent }),
    [fare, commissionPercent, model, ownerSharePercent, busTicket, busCommissionPercent],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Try an example</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label>
            <span className={adminLabelClass}>Ride fare (₹)</span>
            <input className={adminInputClass} inputMode="numeric" value={fare} onChange={(e) => setFare(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <label>
            <span className={adminLabelClass}>Admin commission (%)</span>
            <input className={adminInputClass} inputMode="numeric" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-indigo-700/80">
          Only for the example. The real admin commission comes from Price Management (Set Price) for each vehicle type.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900"><Car size={16} className="text-indigo-600" /> Online ride (rider paid in app)</p>
        <Row label="Fare" value={inr(ex.fare)} />
        <Row label={`Admin commission (${commissionPercent || 0}%)`} value={`− ${inr(ex.commission)}`} tone="text-red-600" />
        <Row label="Net earning" value={inr(ex.net)} />
        <div className="my-2 border-t border-dashed border-gray-200" />
        <Row label={`Owner wallet (${ex.share}%)`} value={`+ ${inr(ex.ownerShare)}`} tone="text-emerald-700" strong />
        <Row label={`Driver wallet (${100 - ex.share}%)`} value={`+ ${inr(ex.driverShare)}`} tone={ex.driverShare ? 'text-emerald-700' : 'text-gray-400'} />
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900"><Banknote size={16} className="text-amber-600" /> Cash ride (driver collected cash)</p>
        <Row label="Cash with driver" value={inr(ex.fare)} />
        <Row label="Owner wallet (pays admin commission)" value={`− ${inr(ex.commission)}`} tone="text-red-600" strong />
        <Row label="Driver keeps" value={inr(ex.driverShare)} />
        <Row label="Driver hands to owner" value={inr(ex.cashOwedToOwner)} tone="text-amber-700" strong />
        <p className="mt-1 text-[11px] text-gray-500">
          Shown to the owner as "Cash with drivers". The owner taps "Cash received" when the driver gives it.
          Owner's real gain: {inr(ex.cashOwedToOwner)} − {inr(ex.commission)} = {inr(ex.cashOwedToOwner - ex.commission)} (same as an online ride).
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900"><Bus size={16} className="text-emerald-600" /> Bus ticket (paid online)</p>
        <div className="mb-2 grid grid-cols-2 gap-3">
          <label>
            <span className={adminLabelClass}>Ticket (₹)</span>
            <input className={adminInputClass} inputMode="numeric" value={busTicket} onChange={(e) => setBusTicket(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <label>
            <span className={adminLabelClass}>Bus commission (%)</span>
            <input className={adminInputClass} inputMode="numeric" value={busCommissionPercent} onChange={(e) => setBusCommissionPercent(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        <Row label="Ticket" value={inr(ex.ticket)} />
        <Row label="Bus admin commission" value={`− ${inr(ex.busCommission)}`} tone="text-red-600" />
        <Row label="Owner wallet (as soon as paid)" value={`+ ${inr(ex.busOwner)}`} tone="text-emerald-700" strong />
        <p className="mt-1 text-[11px] text-gray-500">
          If the passenger cancels and gets a refund, the owner's share of that refund is taken back automatically.
          Bus commission is set per bus (Bus Service → commission) or in the global bus commission.
        </p>
      </div>
    </div>
  );
};

export const ModelPicker = ({ value, onChange, allowDefault = false, globalLabel = '' }) => {
  const options = [
    ...(allowDefault ? [{ id: 'default', title: 'Use global setting', text: globalLabel || 'Follow the Owner Payout Settings page.' }] : []),
    { id: 'salary', title: 'Salary model', text: 'Owner gets 100% of the net earning. Owner pays the driver a salary outside the app.' },
    { id: 'commission', title: 'Commission split', text: 'Net earning is split: owner gets X%, the driver gets the rest in their own wallet.' },
  ];
  return (
    <div className="grid gap-3">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-xl border p-4 text-left transition ${value === option.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
        >
          <p className="text-sm font-semibold text-gray-900">{option.title}</p>
          <p className="mt-1 text-xs text-gray-500">{option.text}</p>
        </button>
      ))}
    </div>
  );
};

const OwnerPayoutSettings = () => {
  const [model, setModel] = useState('salary');
  const [ownerSharePercent, setOwnerSharePercent] = useState(70);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = unwrap(await adminService.getOwnerPayoutSettings());
        setModel(data.model || 'salary');
        setOwnerSharePercent(Number(data.ownerSharePercent ?? 70));
      } catch (error) {
        toast.error(error?.message || 'Could not load payout settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    const pct = Number(ownerSharePercent);
    if (model === 'commission' && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      toast.error('Owner share must be between 0 and 100');
      return;
    }
    setSaving(true);
    try {
      await adminService.updateOwnerPayoutSettings({ model, ownerSharePercent: pct });
      toast.success('Owner payout settings saved. New rides use this rule.');
    } catch (error) {
      toast.error(error?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="p-6 lg:p-8">
        <AdminPageHeader module="Owner Management" page="Payout Settings" title="Owner Payout Settings" />

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="animate-spin text-indigo-600" size={28} /></div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-5">
              <div className={adminCardClass}>
                <h3 className="text-sm font-semibold text-gray-900">How should owners be paid?</h3>
                <p className="mb-4 mt-1 text-xs text-gray-500">Applies to every ride done by a fleet driver (a driver added by an owner). You can change it for one owner on that owner's page → Payout Rule tab.</p>
                <ModelPicker value={model} onChange={setModel} />

                {model === 'commission' ? (
                  <label className="mt-4 block">
                    <span className={adminLabelClass}>Owner share of net earning (%)</span>
                    <input
                      className={adminInputClass}
                      inputMode="numeric"
                      value={ownerSharePercent}
                      onChange={(e) => setOwnerSharePercent(e.target.value.replace(/[^\d.]/g, ''))}
                    />
                    <span className="mt-1 block text-xs text-gray-500">Driver gets {Math.max(0, 100 - (Number(ownerSharePercent) || 0))}% of the net earning.</span>
                  </label>
                ) : null}

                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save settings
                </button>
              </div>

              <div className={adminCardClass}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900"><Wallet size={16} className="text-indigo-600" /> How the money flows</h3>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-600">
                  <li><b>Ride completes</b> → admin commission is cut → the rest is split per this rule and credited instantly.</li>
                  <li><b>Cash ride</b> → owner wallet pays the commission; the cash the driver must hand over shows in the owner app under "Cash with drivers".</li>
                  <li><b>Bus ticket paid</b> → ticket minus bus commission goes to the bus owner's wallet; refunds are taken back.</li>
                  <li><b>Withdraw</b> → owner requests from the app (UPI or bank), the amount is held. Admin sends the money and clicks <b>Mark paid</b> in Owners → Withdrawal Requests. <b>Reject</b> returns it to the wallet.</li>
                  <li><b>Manual changes</b> → Owners → Wallet adjust (credit/debit) is still available.</li>
                </ol>
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  Changes apply to rides completed after you save. Past rides are not recalculated.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className={adminCardClass}>
                <h3 className="mb-4 text-sm font-semibold text-gray-900">Live example with your setting</h3>
                <PayoutExamplePanel model={model} ownerSharePercent={ownerSharePercent} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerPayoutSettings;
