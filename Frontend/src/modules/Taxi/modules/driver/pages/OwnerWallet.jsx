import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Banknote, Bus, Car, CheckCircle2, Clock, Landmark, Loader2, Minus, Undo2, Wallet, XCircle } from 'lucide-react';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionLabel,
  TopBar,
  formatMoney,
} from './ownerBus/ownerUi';
import { createOwnerBusPayout, createOwnerWithdrawal, getOwnerFleetWallet, markFleetDriverCashReceived } from '../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response || {};
const errorText = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

const CATEGORY_UI = {
  ride_earning: { icon: Car, tone: 'bg-emerald-50 text-emerald-600' },
  bus_earning: { icon: Bus, tone: 'bg-sky-50 text-sky-600' },
  bus_refund: { icon: Undo2, tone: 'bg-amber-50 text-amber-600' },
  commission: { icon: Minus, tone: 'bg-rose-50 text-rose-600' },
  withdrawal: { icon: Landmark, tone: 'bg-violet-50 text-violet-600' },
  withdrawal_reversal: { icon: Undo2, tone: 'bg-emerald-50 text-emerald-600' },
  adjustment: { icon: Wallet, tone: 'bg-slate-100 text-slate-600' },
};

const FILTERS = [
  ['all', 'All'],
  ['ride_earning', 'Rides'],
  ['bus_earning', 'Bus'],
  ['commission', 'Commission'],
  ['withdrawal', 'Withdrawals'],
];

const PERIODS = [
  ['today', 'Today'],
  ['week', '7 days'],
  ['month', 'This month'],
];

const timeLabel = (value) =>
  new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const OwnerWallet = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [period, setPeriod] = useState('today');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawMode, setWithdrawMode] = useState('wallet');
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ amount: '', method: 'upi', upiId: '', accountHolderName: '', accountNumber: '', ifscCode: '' });

  const load = useCallback(async () => {
    try {
      setData(unwrap(await getOwnerFleetWallet()));
    } catch (error) {
      toast.error(errorText(error, 'Could not load your wallet'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const transactions = useMemo(() => {
    const list = data?.transactions || [];
    if (filter === 'all') return list;
    if (filter === 'withdrawal') return list.filter((t) => t.category === 'withdrawal' || t.category === 'withdrawal_reversal');
    if (filter === 'bus_earning') return list.filter((t) => t.category === 'bus_earning' || t.category === 'bus_refund');
    return list.filter((t) => t.category === filter);
  }, [data, filter]);

  const summary = data?.summary?.[period] || { rideEarnings: 0, busEarnings: 0, commissionPaid: 0, net: 0 };
  const pendingWithdrawal = (data?.withdrawals || []).filter((w) => w.status === 'pending').reduce((s, w) => s + w.amount, 0);

  const submitWithdraw = async () => {
    const isBus = withdrawMode === 'bus';
    const amount = Number(form.amount);
    if (!isBus) {
      if (!(amount > 0)) return toast.error('Enter the amount to withdraw');
      if (amount > Number(data?.balance || 0)) return toast.error('Amount is more than your wallet balance');
    }
    if (form.method === 'upi' && !form.upiId.trim()) return toast.error('Enter your UPI ID');
    if (form.method === 'bank' && (!form.accountHolderName.trim() || !form.accountNumber.trim() || !form.ifscCode.trim())) {
      return toast.error('Fill in the bank account details');
    }
    setBusy('withdraw');
    try {
      await (isBus ? createOwnerBusPayout : createOwnerWithdrawal)({
        amount,
        payment_method: form.method,
        upiId: form.upiId.trim(),
        accountHolderName: form.accountHolderName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifscCode: form.ifscCode.trim(),
      });
      toast.success('Request sent. Admin will pay you after checking.');
      setShowWithdraw(false);
      setForm((f) => ({ ...f, amount: '' }));
      await load();
    } catch (error) {
      toast.error(errorText(error, 'Could not send the request'));
    } finally {
      setBusy('');
    }
  };

  const receiveCash = async (driver) => {
    if (!window.confirm(`Mark ${formatMoney(driver.cashDue)} as received from ${driver.name}?`)) return;
    setBusy(driver.id);
    try {
      await markFleetDriverCashReceived(driver.id, {});
      toast.success('Cash marked as received');
      await load();
    } catch (error) {
      toast.error(errorText(error, 'Could not update'));
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <Screen>
        <div className="flex justify-center py-32"><Loader2 className="animate-spin text-slate-400" size={30} /></div>
      </Screen>
    );
  }

  const cashDrivers = (data?.drivers || []).filter((d) => d.cashDue > 0);

  return (
    <>
      <Screen>
        <TopBar title="Wallet" subtitle="Earnings & payouts" onBack={() => navigate('/taxi/owner/home')} />

        <section className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.25)]">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Available balance</p>
          <p className="mt-2 text-[36px] font-black leading-none tracking-tight">{formatMoney(data?.balance)}</p>
          {pendingWithdrawal > 0 ? (
            <p className="mt-2 text-[12px] font-bold text-amber-300">{formatMoney(pendingWithdrawal)} withdrawal waiting for admin</p>
          ) : null}
          <button
            type="button"
            onClick={() => { setWithdrawMode('wallet'); setShowWithdraw(true); }}
            disabled={!(Number(data?.balance) > 0)}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[14px] font-black text-slate-950 active:scale-[0.98] disabled:opacity-40"
          >
            <Landmark size={17} /> Withdraw money
          </button>
        </section>

        <Card className="mt-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">Bus earnings</p>
            <p className="text-[22px] font-black text-slate-900">{formatMoney(data?.busPayout?.available)}</p>
            <p className="text-[11px] font-bold text-slate-400">
              {formatMoney(data?.busPayout?.completed)} finished trips · {formatMoney(data?.busPayout?.ongoing)} running trips · {formatMoney(data?.busPayout?.upcoming)} upcoming
            </p>
            <p className="text-[11px] font-bold text-slate-400">Admin pays manually on request. Running trips are approved by admin.</p>
          </div>
          <button
            type="button"
            onClick={() => { setWithdrawMode('bus'); setShowWithdraw(true); }}
            disabled={!(Number(data?.busPayout?.available) > 0)}
            className="h-10 shrink-0 rounded-xl bg-slate-950 px-4 text-[12px] font-black text-white disabled:opacity-40"
          >
            Request payout
          </button>
        </Card>

        <p className="mt-3 px-1 text-[11px] font-bold text-slate-400">
          {data?.payout?.model === 'commission'
            ? `You earn ${data.payout.ownerSharePercent}% of each ride after admin commission. Your drivers get the rest.`
            : 'You earn 100% of each ride after admin commission. Pay your drivers their salary yourself.'}
        </p>

        {/* Earnings summary */}
        <SectionLabel>Earnings</SectionLabel>
        <div className="mb-3 flex gap-2">
          {PERIODS.map(([id, label]) => <Chip key={id} active={period === id} onClick={() => setPeriod(id)}>{label}</Chip>)}
        </div>
        <Card className="space-y-2.5">
          {[
            ['Ride earnings', summary.rideEarnings, 'text-slate-900'],
            ['Bus ticket earnings', summary.busEarnings, 'text-slate-900'],
            ['Admin commission paid (cash rides)', -summary.commissionPaid, 'text-rose-600'],
          ].map(([label, value, tone]) => (
            <div key={label} className="flex items-center justify-between text-[13px]">
              <span className="font-bold text-slate-500">{label}</span>
              <span className={`font-black ${tone}`}>{value < 0 ? '−' : ''}{formatMoney(Math.abs(value))}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2.5 text-[14px]">
            <span className="font-black text-slate-900">Net earning</span>
            <span className="font-black text-emerald-600">{formatMoney(summary.net)}</span>
          </div>
        </Card>

        {/* Cash with drivers */}
        <SectionLabel right={<span className="text-[12px] font-black text-amber-600">{formatMoney(data?.cashWithDrivers)}</span>}>Cash with drivers</SectionLabel>
        {cashDrivers.length === 0 ? (
          <Card className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-500" size={20} />
            <p className="text-[13px] font-bold text-slate-500">No cash pending. Drivers have handed over everything.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {cashDrivers.map((driver) => (
              <Card key={driver.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-black text-slate-900">{driver.name}</p>
                  <p className="text-[12px] font-bold text-amber-600">Has {formatMoney(driver.cashDue)} of cash</p>
                </div>
                <button
                  type="button"
                  disabled={busy === driver.id}
                  onClick={() => receiveCash(driver)}
                  className="shrink-0 rounded-2xl bg-slate-950 px-4 py-2.5 text-[12px] font-black text-white active:scale-95 disabled:opacity-50"
                >
                  {busy === driver.id ? '...' : 'Cash received'}
                </button>
              </Card>
            ))}
          </div>
        )}

        {/* Withdrawals */}
        {(data?.withdrawals || []).length > 0 ? (
          <>
            <SectionLabel>Your withdrawals</SectionLabel>
            <div className="space-y-2">
              {data.withdrawals.slice(0, 5).map((w) => (
                <Card key={w.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-black text-slate-900">{formatMoney(w.amount)}</p>
                    <p className="text-[11px] font-bold text-slate-400">{timeLabel(w.createdAt)}</p>
                  </div>
                  <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                    w.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : w.status === 'cancelled' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {w.status === 'completed' ? <CheckCircle2 size={12} /> : w.status === 'cancelled' ? <XCircle size={12} /> : <Clock size={12} />}
                    {w.status === 'completed' ? 'Paid' : w.status === 'cancelled' ? 'Rejected' : 'Pending'}
                  </span>
                </Card>
              ))}
            </div>
          </>
        ) : null}

        {/* Transactions */}
        <SectionLabel>Transactions</SectionLabel>
        <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {FILTERS.map(([id, label]) => <Chip key={id} active={filter === id} onClick={() => setFilter(id)}>{label}</Chip>)}
        </div>
        {transactions.length === 0 ? (
          <EmptyState icon={Banknote} title="No transactions yet" text="Ride and bus earnings will show up here." />
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => {
              const ui = CATEGORY_UI[t.category] || CATEGORY_UI.adjustment;
              const Icon = ui.icon;
              return (
                <Card key={t.id} className="flex items-center gap-3 p-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${ui.tone}`}><Icon size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-black text-slate-900">{t.title}</p>
                    <p className="text-[11px] font-bold text-slate-400">{t.label} · {timeLabel(t.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[14px] font-black ${t.kind === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.kind === 'credit' ? '+' : '−'}{formatMoney(t.amount)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400">Bal {formatMoney(t.balance)}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Screen>

      {showWithdraw ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={() => setShowWithdraw(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
            <h2 className="text-[20px] font-black text-slate-900">{withdrawMode === 'bus' ? 'Bus payout request' : 'Withdraw money'}</h2>
            <p className="mb-4 text-[12px] font-bold text-slate-400">
              {withdrawMode === 'bus'
                ? `Bus earnings ${formatMoney(data?.busPayout?.available)} · Admin sends the money after checking.`
                : `Balance ${formatMoney(data?.balance)} · Admin sends the money after checking.`}
            </p>
            <div className="space-y-4">
              {withdrawMode === 'bus' ? null : (
                <Field label="Amount (₹)" required>
                  <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 5000" />
                </Field>
              )}
              <div className="flex gap-2">
                <Chip active={form.method === 'upi'} onClick={() => setForm({ ...form, method: 'upi' })}>UPI</Chip>
                <Chip active={form.method === 'bank'} onClick={() => setForm({ ...form, method: 'bank' })}>Bank account</Chip>
              </div>
              {form.method === 'upi' ? (
                <Field label="UPI ID" required>
                  <Input value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="name@bank" />
                </Field>
              ) : (
                <>
                  <Field label="Account holder name" required>
                    <Input value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })} />
                  </Field>
                  <Field label="Account number" required>
                    <Input inputMode="numeric" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/[^\d]/g, '') })} />
                  </Field>
                  <Field label="IFSC code" required>
                    <Input value={form.ifscCode} onChange={(e) => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })} />
                  </Field>
                </>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <SecondaryButton onClick={() => setShowWithdraw(false)} className="h-12 w-28 shrink-0 text-[14px]">Cancel</SecondaryButton>
              <PrimaryButton onClick={submitWithdraw} disabled={busy === 'withdraw'} className="h-12 text-[14px]">
                {busy === 'withdraw' ? <Loader2 size={17} className="animate-spin" /> : 'Send request'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}

      <DriverBottomNav />
    </>
  );
};

export default OwnerWallet;
