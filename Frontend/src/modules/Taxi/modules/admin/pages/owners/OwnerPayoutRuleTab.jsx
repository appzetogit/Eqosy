import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminInputClass, adminLabelClass } from '../../components/ui/adminUi';
import { adminService } from '../../services/adminService';
import { ModelPicker, PayoutExamplePanel } from './OwnerPayoutSettings';

const unwrap = (response) => response?.data?.data || response?.data || response || {};

const describe = (rule) =>
  rule?.model === 'commission'
    ? `Commission split: owner ${rule.ownerSharePercent}% / driver ${100 - Number(rule.ownerSharePercent || 0)}%`
    : 'Salary model: owner gets 100% of net earning';

/** Per-owner payout override shown as a tab on the admin Owner Details page. */
const OwnerPayoutRuleTab = ({ ownerId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState('default');
  const [ownerSharePercent, setOwnerSharePercent] = useState(70);
  const [global, setGlobal] = useState(null);
  const [effective, setEffective] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = unwrap(await adminService.getOwnerPayout(ownerId));
      setModel(data.override?.model || 'default');
      setOwnerSharePercent(Number(data.override?.ownerSharePercent ?? data.global?.ownerSharePercent ?? 70));
      setGlobal(data.global || null);
      setEffective(data.effective || null);
    } catch (error) {
      toast.error(error?.message || 'Could not load payout rule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ownerId) load();
  }, [ownerId]);

  const save = async () => {
    setSaving(true);
    try {
      const data = unwrap(await adminService.updateOwnerPayout(ownerId, { model, ownerSharePercent: Number(ownerSharePercent) }));
      setEffective(data.effective || null);
      toast.success('Payout rule saved for this owner');
    } catch (error) {
      toast.error(error?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-600" size={24} /></div>;
  }

  const previewModel = model === 'default' ? global?.model || 'salary' : model;
  const previewShare = model === 'default' ? global?.ownerSharePercent ?? 70 : ownerSharePercent;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
          <span className="font-semibold">Now active:</span> {describe(effective)}
          {effective?.source === 'global' ? ' (from global settings)' : ' (set for this owner)'}
        </div>
        <ModelPicker value={model} onChange={setModel} allowDefault globalLabel={global ? describe(global) : ''} />
        {model === 'commission' ? (
          <label className="block">
            <span className={adminLabelClass}>Owner share of net earning (%)</span>
            <input className={adminInputClass} inputMode="numeric" value={ownerSharePercent} onChange={(e) => setOwnerSharePercent(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save for this owner
        </button>
      </div>
      <div className="lg:col-span-7">
        <PayoutExamplePanel model={previewModel} ownerSharePercent={previewShare} />
      </div>
    </div>
  );
};

export default OwnerPayoutRuleTab;
