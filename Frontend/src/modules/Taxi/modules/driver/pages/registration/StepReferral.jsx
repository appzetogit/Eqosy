import React, { useEffect, useState } from 'react';
import { ArrowLeft, Gift, ChevronRight, Tag, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    getStoredDriverRegistrationSession,
    normalizeDriverPortalRole,
    saveDriverReferral,
    saveDriverRegistrationSession,
} from '../../services/registrationService';

const StepReferral = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const routePrefix = location.pathname.startsWith('/taxi/owner')
        ? '/taxi/owner'
        : '/taxi/driver';
    const session = {
        ...getStoredDriverRegistrationSession(),
        ...(location.state || {}),
    };
    const [referral, setReferral] = useState(session.referralCode || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        saveDriverRegistrationSession({
            ...session,
            referralCode: referral,
        });
    }, [referral]);

    const handleNext = async (skip = false) => {
        setLoading(true);
        setError('');

        try {
            const response = await saveDriverReferral({
                registrationId: session.registrationId,
                phone: session.phone,
                referralCode: skip ? '' : referral,
            });
            const payload = response?.data?.data || response?.data || response;
            const syncedRole = normalizeDriverPortalRole(payload?.session?.role || session.role || 'driver');

            const nextState = saveDriverRegistrationSession({
                ...session,
                referralCode: skip ? '' : referral,
                role: syncedRole,
                referralSession: payload?.session || null,
            });

            navigate(`${routePrefix}/step-vehicle`, { state: nextState });
        } catch (err) {
            setError(err?.message || 'Unable to save referral code');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div 
            className="min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] px-4 sm:px-5 pb-8 pt-5 select-none flex flex-col justify-between"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
            <main className="mx-auto w-full max-w-sm flex-1 flex flex-col justify-between space-y-4">
                {/* Header Section */}
                <div className="space-y-4">
                    <header className="space-y-3">
                        <div className="flex items-center justify-between">
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => navigate(`${routePrefix}/step-personal`, { state: session })}
                                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-900 shadow-sm transition-all"
                            >
                                <ArrowLeft size={18} strokeWidth={2.5} />
                            </motion.button>
                            <div className="rounded-full bg-slate-900/5 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-600 border border-slate-900/10">
                                Step 2 of 4
                            </div>
                        </div>

                        <section className="space-y-2">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
                                    <Gift size={18} strokeWidth={2.5} />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                    Rewards Program
                                </span>
                            </div>
                            <h1 className="font-['Outfit'] text-3xl sm:text-4xl font-black leading-tight tracking-tight text-slate-900">
                                Got a <span className="text-slate-400">Code?</span>
                            </h1>
                            <p className="text-xs sm:text-sm font-bold text-slate-600 leading-relaxed max-w-[32ch]">
                                Enter a referral code to unlock exclusive joining bonuses and rewards.
                            </p>
                        </section>
                    </header>

                    {error && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 shadow-sm">
                            {error}
                        </div>
                    )}

                    {/* Form Card */}
                    <section className="space-y-3.5 rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
                        <div className="space-y-0.5 px-0.5">
                            <h2 className="text-base font-black tracking-tight text-slate-900">Referral Details</h2>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Optional Bonus</p>
                        </div>

                        <div className="space-y-3">
                            <div className="group rounded-2xl border-2 transition-all p-3.5 border-slate-100 bg-slate-50 focus-within:border-slate-900/20 focus-within:bg-white focus-within:shadow-md">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                                        <Tag size={18} strokeWidth={2.5} />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                        <label className="block text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Referral Code</label>
                                        <input
                                            value={referral}
                                            onChange={(e) => setReferral(e.target.value.toUpperCase())}
                                            placeholder="ZETO-BONUS-9080"
                                            className="w-full border-none bg-transparent p-0 text-base font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-300 tracking-wider uppercase"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-3.5 relative overflow-hidden group">
                                <div className="relative z-10 flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                                        <Sparkles size={18} strokeWidth={2.5} />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                        <span className="block text-[11px] font-black text-emerald-950 uppercase tracking-wider">Joining Reward</span>
                                        <p className="text-xs text-slate-700 font-medium leading-normal">
                                            Unlock <strong className="text-emerald-700 font-black">₹500 Bonus</strong> after completing your first 10 rides.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Solid & High Visibility Buttons Group (No Scrolling Required) */}
                <div className="pt-2 space-y-2.5">
                    {/* Solid Visible Skip Button */}
                    <button 
                        type="button"
                        onClick={() => handleNext(true)}
                        disabled={loading}
                        className="w-full py-3.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-300/80 text-slate-900 font-black text-xs uppercase tracking-[0.15em] shadow-sm active:scale-98 transition-all flex items-center justify-center gap-2"
                    >
                        <span>Skip Referral Program</span>
                    </button>

                    {/* Apply & Continue Button */}
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleNext(false)}
                        disabled={loading || !referral}
                        className={`group flex h-13 w-full items-center justify-center gap-2.5 rounded-2xl text-xs font-black tracking-widest uppercase transition-all ${
                            referral
                                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 active:bg-black'
                                : 'pointer-events-none bg-slate-200 text-slate-400 shadow-none'
                        }`}
                    >
                        {loading ? (
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <span>Apply & Continue</span>
                                <ChevronRight size={16} strokeWidth={3} className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </motion.button>
                </div>
            </main>
        </div>
    );
};

export default StepReferral;
