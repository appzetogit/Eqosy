import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2, Receipt, Car, Package, Route, UtensilsCrossed, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';
import { adminAPI } from '@food/api';

const SERVICES = [
  { key: 'ride', label: 'Ride (Taxi / Bike / Auto)', hint: 'City rides booked by the user', icon: Car },
  { key: 'parcel', label: 'Parcel Delivery', hint: 'Parcel pickup & delivery booked by the user', icon: Package },
  { key: 'intercity', label: 'Intercity / Outstation', hint: 'Outstation package rides', icon: Route },
];

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const money = (value) => `₹${round2(value).toFixed(2)}`;

// Same math the backend uses: user pays base + GST, GST is shown inside the total fare on user and driver apps.
const calculate = (baseFare, enabled, rate) => {
  const base = Math.max(0, Number(baseFare) || 0);
  const safeRate = enabled ? Math.max(0, Number(rate) || 0) : 0;
  const gst = round2((base * safeRate) / 100);
  return { base, rate: safeRate, gst, total: round2(base + gst) };
};

const Toggle = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`w-14 h-7 rounded-full relative transition-all duration-300 shrink-0 ${checked ? 'bg-[#405189]' : 'bg-gray-300'}`}
  >
    <span className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all duration-300 ${checked ? 'right-1' : 'left-1'}`} />
  </button>
);

const GstSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ gstin: '', show_cgst_sgst_split: true, services: {} });
  const [sampleFare, setSampleFare] = useState('');
  const [foodGstRate, setFoodGstRate] = useState(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await api.get('/admin/general-settings/gst');
        if (active) {
          setSettings(res?.data?.settings || res?.settings || { gstin: '', show_cgst_sgst_split: true, services: {} });
        }
      } catch (err) {
        console.error('Failed to load GST settings:', err);
        toast.error('Failed to load GST settings');
      } finally {
        if (active) setLoading(false);
      }

      try {
        const feeRes = await adminAPI.getFeeSettings();
        const rate = feeRes?.data?.data?.feeSettings?.gstRate;
        if (active) setFoodGstRate(rate === undefined || rate === null || rate === '' ? null : Number(rate));
      } catch {
        if (active) setFoodGstRate(null);
      }
    };

    load();
    return () => { active = false; };
  }, []);

  const updateService = (key, patch) => {
    setSettings((current) => ({
      ...current,
      services: {
        ...current.services,
        [key]: { enabled: false, rate: 0, ...(current.services?.[key] || {}), ...patch },
      },
    }));
  };

  const handleSave = async () => {
    for (const service of SERVICES) {
      const row = settings.services?.[service.key];
      if (!row?.enabled) continue;
      const rate = Number(row.rate);
      if (row.rate === '' || !Number.isFinite(rate) || rate <= 0 || rate > 100) {
        toast.error(`${service.label}: GST rate must be between 0 and 100`);
        return;
      }
    }

    try {
      setSaving(true);
      const res = await api.patch('/admin/general-settings/gst', { settings });
      setSettings(res?.data?.settings || res?.settings || settings);
      toast.success('GST settings saved');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save GST settings');
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(
    () => SERVICES.map((service) => {
      const row = settings.services?.[service.key] || {};
      return { ...service, enabled: Boolean(row.enabled), rate: row.rate ?? '', calc: calculate(sampleFare, row.enabled, row.rate) };
    }),
    [settings.services, sampleFare],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const inputClass = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors';

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-10 font-sans">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-[15px] font-black text-gray-800 uppercase tracking-widest">GST SETTINGS</h1>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
          <span>App Settings</span>
          <ChevronRight size={12} strokeWidth={3} />
          <span className="text-gray-600">GST Settings</span>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto space-y-8 pb-32">
        <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-6 py-4 text-sm text-indigo-900">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            The GST rate set here is added on top of the fare for the matching service. The same rate and amount is shown to the user
            (fare estimate and bill) and to the driver (ride request and trip). Rides already booked keep the rate they were booked with.
            A service with GST turned off is charged no GST.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-6">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-tight">Business details</h3>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 block">Company GSTIN (printed on bills)</label>
                <input
                  type="text"
                  value={settings.gstin || ''}
                  maxLength={15}
                  onChange={(e) => setSettings((s) => ({ ...s, gstin: e.target.value.toUpperCase() }))}
                  placeholder="Enter GSTIN"
                  className={inputClass}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Show CGST / SGST split</p>
                  <p className="text-xs text-gray-400">Splits the GST amount equally into CGST and SGST on bills.</p>
                </div>
                <Toggle
                  checked={Boolean(settings.show_cgst_sgst_split)}
                  onChange={(value) => setSettings((s) => ({ ...s, show_cgst_sgst_split: value }))}
                  label="Show CGST and SGST split"
                />
              </div>
            </div>

            {rows.map((service) => {
              const Icon = service.icon;
              return (
                <div key={service.key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 text-[#405189] flex items-center justify-center">
                        <Icon size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{service.label}</p>
                        <p className="text-xs text-gray-400">{service.hint}</p>
                      </div>
                    </div>
                    <Toggle
                      checked={service.enabled}
                      onChange={(value) => updateService(service.key, { enabled: value })}
                      label={`Enable GST for ${service.label}`}
                    />
                  </div>
                  <div className={`mt-6 space-y-2 ${service.enabled ? '' : 'opacity-50'}`}>
                    <label className="text-xs font-semibold text-gray-600 block">GST rate (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      disabled={!service.enabled}
                      value={service.rate}
                      onChange={(e) => updateService(service.key, { rate: e.target.value })}
                      placeholder="Enter GST %"
                      className={inputClass}
                    />
                  </div>
                </div>
              );
            })}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <UtensilsCrossed size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">Food Orders</p>
                    <p className="text-xs text-gray-400">Managed in Delivery &amp; Platform Fee settings</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-gray-800">{foodGstRate === null ? 'Not set' : `${foodGstRate}%`}</p>
                  <Link to="/admin/food/fee-settings" className="text-xs font-semibold text-indigo-600 hover:underline">Edit food GST</Link>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-[#405189] text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#344475] transition-all flex items-center gap-2 shadow-sm disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save GST Settings'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden xl:sticky xl:top-6">
            <div className="px-8 py-5 border-b border-gray-100 bg-gray-50/30 flex items-center gap-2">
              <Receipt size={16} className="text-gray-500" />
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-tight">GST calculation preview</h3>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 block">Sample fare before GST (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={sampleFare}
                  onChange={(e) => setSampleFare(e.target.value)}
                  placeholder="Type a fare to see the calculation"
                  className={inputClass}
                />
              </div>

              {rows.map((service) => (
                <div key={service.key} className="rounded-lg border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700">{service.label}</span>
                    <span className={`text-[10px] font-black uppercase tracking-wide ${service.enabled ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {service.enabled ? `GST ${service.calc.rate}%` : 'GST off'}
                    </span>
                  </div>
                  <dl className="px-4 py-3 text-sm space-y-2">
                    <div className="flex justify-between"><dt className="text-gray-500">Fare before GST</dt><dd className="font-semibold text-gray-800">{money(service.calc.base)}</dd></div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">GST @ {service.calc.rate}% <span className="text-gray-400">({money(service.calc.base)} × {service.calc.rate}%)</span></dt>
                      <dd className="font-semibold text-gray-800">{money(service.calc.gst)}</dd>
                    </div>
                    {settings.show_cgst_sgst_split && service.calc.gst > 0 && (
                      <>
                        <div className="flex justify-between pl-4 text-xs"><dt className="text-gray-400">CGST ({round2(service.calc.rate / 2)}%)</dt><dd className="text-gray-600">{money(service.calc.gst / 2)}</dd></div>
                        <div className="flex justify-between pl-4 text-xs"><dt className="text-gray-400">SGST ({round2(service.calc.rate / 2)}%)</dt><dd className="text-gray-600">{money(service.calc.gst / 2)}</dd></div>
                      </>
                    )}
                    <div className="flex justify-between border-t border-dashed border-gray-200 pt-2">
                      <dt className="font-bold text-gray-800">User pays / driver sees</dt>
                      <dd className="font-black text-gray-900">{money(service.calc.total)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GstSettings;
