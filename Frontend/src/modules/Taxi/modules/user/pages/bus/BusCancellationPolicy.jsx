import React from 'react';
import { ShieldCheck } from 'lucide-react';

const money = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

const hoursText = (hours) => {
  const value = Number(hours) || 0;
  if (value >= 48 && value % 24 === 0) return `${value / 24} days`;
  return `${value} hour${value === 1 ? '' : 's'}`;
};

const refundText = (rule) => {
  const value = Number(rule?.refundValue || 0);
  if (rule?.refundType === 'percentage') return value >= 100 ? 'Full refund' : value <= 0 ? 'No refund' : `${value}% refund`;
  if (rule?.refundType === 'fixed') return value <= 0 ? 'No refund' : `${money(value)} refund`;
  return 'No refund';
};

/** "When" part of each rule in simple words, based on the neighbouring rules (rules are applied from the largest hours down). */
export const buildCancellationLines = (rules = []) => {
  const sorted = [...(Array.isArray(rules) ? rules : [])].sort(
    (a, b) => Number(b.hoursBeforeDeparture || 0) - Number(a.hoursBeforeDeparture || 0),
  );
  return sorted.map((rule, index) => {
    const from = Number(rule.hoursBeforeDeparture || 0);
    const previous = index > 0 ? Number(sorted[index - 1].hoursBeforeDeparture || 0) : null;
    let when;
    if (previous === null) when = `Cancel ${hoursText(from)} or more before departure`;
    else if (from <= 0) when = `Cancel less than ${hoursText(previous)} before departure`;
    else when = `Cancel between ${hoursText(from)} and ${hoursText(previous)} before departure`;
    const refund = refundText(rule);
    return {
      id: rule.id || `${index}`,
      when,
      refund,
      tone: refund === 'No refund' ? 'rose' : refund === 'Full refund' ? 'emerald' : 'amber',
      notes: rule.notes || '',
    };
  });
};

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
};

/**
 * Cancellation policy for a bus. Everything shown here comes from the bus's
 * cancellationRules / cancellationPolicy set by admin (or the owner) - nothing is hard-coded.
 */
const BusCancellationPolicy = ({ bus, className = '' }) => {
  const lines = buildCancellationLines(bus?.cancellationRules);
  const text = String(bus?.cancellationPolicy || '').trim();
  if (!lines.length && !text) return null;

  return (
    <div className={`rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm ${className}`}>
      <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
        <ShieldCheck size={15} className="text-emerald-600" /> Cancellation policy
      </p>
      {text ? <p className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-600">{text}</p> : null}
      {lines.length ? (
        <div className="mt-3 space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-slate-700">{line.when}</p>
                {line.notes ? <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{line.notes}</p> : null}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${TONES[line.tone]}`}>
                {line.refund}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default BusCancellationPolicy;
