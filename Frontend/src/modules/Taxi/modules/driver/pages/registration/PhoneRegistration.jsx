import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ShieldCheck, Briefcase, UserRound, Sparkles, Building2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    clearDriverRegistrationSession,
    getStoredDriverRegistrationSession,
    saveDriverRegistrationSession,
    sendDriverLoginOtp,
    sendDriverOtp,
} from '../../services/registrationService';

import { useSettings } from '../../../../shared/context/SettingsContext';
import { RENTAL_ENABLED } from '../../../../shared/featureFlags';
import LegalSheetModal from '../../components/LegalSheetModal';
import FloatingAuthLayout, { AUTH_THEMES, AuthButton, AuthError, AuthPhoneField } from '@/shared/components/auth/FloatingAuthLayout';

const PhoneRegistration = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { settings } = useSettings();
    const storedSession = getStoredDriverRegistrationSession();
    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const sharedReferralCode = String(
        searchParams.get('ref') ||
        searchParams.get('referral') ||
        searchParams.get('code') ||
        storedSession.referralCode ||
        '',
    ).trim().toUpperCase();
    const [phone, setPhone] = useState(() => String(location.state?.phone || storedSession.phone || '').replace(/\D/g, '').slice(-10));
    const [role, setRole] = useState(() => {
        const normalizePortalRole = (value) => {
            const normalized = String(value || '').toLowerCase();
            if (normalized === 'owner') return 'owner';
            if (normalized === 'bus_driver' || normalized === 'bus-driver' || normalized === 'busdriver') return 'bus_driver';
            if (normalized === 'service_center' || normalized === 'service-center' || normalized === 'servicecenter') return 'service_center';
            if (normalized === 'service_center_staff' || normalized === 'service-center-staff' || normalized === 'servicecenterstaff') return 'service_center_staff';
            return 'driver';
        };

        if (location.pathname.startsWith('/taxi/owner')) {
            return 'owner';
        }

        const stateRole = String(location.state?.role || '').toLowerCase();
        if (stateRole) {
            const normalized = normalizePortalRole(stateRole);
            if (!RENTAL_ENABLED && (normalized === 'service_center' || normalized === 'service_center_staff')) {
                return 'driver';
            }
            return normalized;
        }

        if (sharedReferralCode && location.pathname.startsWith('/taxi/driver')) {
            return 'driver';
        }

        const savedRole = String(storedSession.role || '').toLowerCase();
        const normalizedSaved = normalizePortalRole(savedRole);
        if (!RENTAL_ENABLED && (normalizedSaved === 'service_center' || normalizedSaved === 'service_center_staff')) {
            return 'driver';
        }
        return normalizedSaved;
    });
    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
    const isLoginPage = location.pathname === `${routePrefix}/login` || location.pathname === `${routePrefix}/login/`;
    const [agreed, setAgreed] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [legalModalTab, setLegalModalTab] = useState(null);
    const phoneCardRef = useRef(null);
    const phoneInputRef = useRef(null);
    const appName = settings.general?.app_name || 'App';

    const roleOptions = [
        { id: 'driver', label: 'Driver', Icon: UserRound },
        { id: 'owner', label: 'Owner', Icon: Briefcase },
        { id: 'bus_driver', label: 'Bus', Icon: ShieldCheck },
        ...(RENTAL_ENABLED
          ? [
              { id: 'service_center', label: 'Center', Icon: Building2 },
              { id: 'service_center_staff', label: 'Staff', Icon: UserRound },
            ]
          : []),
    ];

    const modeConfig = useMemo(() => {
        const isOwner = role === 'owner';
        const isBusDriver = role === 'bus_driver';
        const isServiceCenter = role === 'service_center';
        const isServiceCenterStaff = role === 'service_center_staff';

        return {
            badge: isOwner ? 'Enterprise' : isBusDriver ? 'Transit' : isServiceCenter ? 'Operations' : isServiceCenterStaff ? 'Team' : 'Captain',
            title: isLoginPage
                ? `${isOwner ? 'Owner' : isBusDriver ? 'Bus Driver' : isServiceCenter ? 'Service Center' : isServiceCenterStaff ? 'Service Staff' : 'Driver'} Login`
                : `Join ${appName}`,
            subtitle: isLoginPage
                ? `Enter your number to access account.`
                : `Start your journey as a ${isOwner ? 'owner' : isBusDriver ? 'captain' : isServiceCenter ? 'operator' : isServiceCenterStaff ? 'staff' : 'driver'}.`,
            highlight: isOwner ? 'Manage fleet, payouts & drivers.' : isBusDriver ? 'Manage your coach, schedules and seat desk.' : isServiceCenter ? 'Manage your center profile, staff and rental vehicle catalog.' : isServiceCenterStaff ? 'Handle assigned bookings and work queues for your center.' : 'Go online, get trips & earn daily.',
            accentColor: isOwner ? '#1C2833' : isBusDriver ? '#0f3d3e' : isServiceCenter ? '#14342b' : isServiceCenterStaff ? '#1e3a5f' : '#4F46E5',
            Icon: isOwner ? Briefcase : isBusDriver ? ShieldCheck : isServiceCenter ? Building2 : isServiceCenterStaff ? ShieldCheck : UserRound,
        };
    }, [appName, isLoginPage, role]);

    useEffect(() => {
        saveDriverRegistrationSession({
            ...storedSession,
            role,
            phone,
            loginMode: isLoginPage,
            referralCode: sharedReferralCode,
        });
    }, [isLoginPage, role, phone, sharedReferralCode]);

    const handleOpenLegal = (tab) => {
        saveDriverRegistrationSession({
            ...storedSession,
            role,
            phone,
            loginMode: isLoginPage,
        });
        setLegalModalTab(tab);
    };

    const handleNavigateFullLegal = (tab) => {
        saveDriverRegistrationSession({
            ...storedSession,
            role,
            phone,
            loginMode: isLoginPage,
        });
        navigate(tab === 'terms' ? '/taxi/driver/terms' : '/taxi/driver/privacy', {
            state: { role, returnTo: location.pathname },
        });
    };

    useEffect(() => {
        const scrollPhoneIntoView = () => {
            phoneCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };

        const focusTimer = window.setTimeout(() => {
            scrollPhoneIntoView();
            phoneInputRef.current?.focus();
        }, 180);

        const viewport = window.visualViewport;
        viewport?.addEventListener('resize', scrollPhoneIntoView);

        return () => {
            window.clearTimeout(focusTimer);
            viewport?.removeEventListener('resize', scrollPhoneIntoView);
        };
    }, []);

    const handleSendOTP = async () => {
        if (loading) return;
        
        if (phone.length !== 10) {
            setError('Please enter a valid 10-digit mobile number');
            return;
        }

        if (!agreed) {
            setError('Please accept the terms before continuing');
            return;
        }

        setLoading(true);
        setError('');

        try {
            clearDriverRegistrationSession();
            const response = isLoginPage
                ? await sendDriverLoginOtp({ phone, role })
                : await sendDriverOtp({ phone, role });
            const sessionData = response?.data?.session || response?.session || {};
            const nextState = saveDriverRegistrationSession({
                phone,
                role,
                registrationId: sessionData.registrationId || '',
                debugOtp: sessionData.debugOtp || '',
                loginMode: isLoginPage,
                referralCode: sharedReferralCode,
            });

            navigate(`${routePrefix}/otp-verify`, {
                state: nextState,
            });
        } catch (err) {
            const backendMessage = String(
                err?.message ||
                err?.error ||
                err?.data?.error ||
                err?.data?.message ||
                '',
            ).trim();
            if (backendMessage) {
                setError(backendMessage);
            } else {
                setError('Unable to send OTP right now');
            }
        } finally {
            setLoading(false);
        }
    };

    const theme = AUTH_THEMES.driver;
    const logoSrc = settings.general?.logo || settings.customization?.logo || '/eqosy-logo.png';

    return (
        <>
            <FloatingAuthLayout
                theme={theme}
                logo={logoSrc}
                logoAlt={appName}
                brand={appName}
                badge={modeConfig.badge}
                BadgeIcon={modeConfig.Icon}
                title={modeConfig.title}
                subtitle={modeConfig.subtitle}
                footer={
                    <p className="text-[11px] font-medium leading-tight text-zinc-500 select-none">
                        By continuing, you agree to our{' '}
                        <button type="button" onClick={() => handleOpenLegal('terms')} className="font-black hover:underline" style={{ color: theme.accentDark }}>
                            Terms of Service
                        </button>
                        {' '}and{' '}
                        <button type="button" onClick={() => handleOpenLegal('privacy')} className="font-black hover:underline" style={{ color: theme.accentDark }}>
                            Privacy Policy
                        </button>.
                    </p>
                }
            >
                <div
                    className="flex w-full items-center gap-1.5 overflow-x-auto rounded-2xl p-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
                    style={{ background: theme.accentSoft, border: `1px solid ${theme.accent}22` }}
                >
                    {roleOptions.map((option) => {
                        const active = role === option.id;
                        return (
                            <motion.button
                                key={option.id}
                                type="button"
                                layout
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setRole(option.id)}
                                className={`flex min-w-max flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 transition-all ${active ? 'bg-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                                style={active ? { color: theme.accentDark, boxShadow: `0 6px 14px -8px ${theme.accentDark}88` } : undefined}
                            >
                                <option.Icon size={14} strokeWidth={active ? 2.5 : 2} />
                                <span className="text-[11px] font-black uppercase tracking-wide">{option.label}</span>
                            </motion.button>
                        );
                    })}
                </div>

                <div ref={phoneCardRef} style={{ scrollMarginTop: '20vh' }}>
                    <AuthPhoneField
                        theme={theme}
                        inputRef={phoneInputRef}
                        value={phone}
                        hasError={Boolean(error)}
                        pattern="[0-9]*"
                        autoFocus
                        onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setPhone(val);
                            if (error) setError('');
                        }}
                        onFocus={() => phoneCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    />
                </div>

                <AuthError message={error} />

                <div className="flex w-full flex-wrap items-center justify-center gap-2 px-2 text-center">
                    <Sparkles size={12} className="shrink-0" style={{ color: theme.accent }} />
                    <span className="text-[10px] font-bold uppercase leading-tight tracking-widest text-zinc-400">{modeConfig.highlight}</span>
                </div>

                <AuthButton
                    theme={theme}
                    onClick={handleSendOTP}
                    loading={loading}
                    disabled={!agreed || phone.length !== 10}
                >
                    <span>Send OTP Code</span>
                    <ChevronRight size={18} strokeWidth={3} />
                </AuthButton>

                <button
                    type="button"
                    onClick={() => navigate(isLoginPage ? `${routePrefix}/reg-phone` : `${routePrefix}/login`)}
                    className="w-full text-center text-[12px] font-medium text-zinc-500"
                >
                    {isLoginPage ? (
                        <>Don't have an account? <span className="font-black" style={{ color: theme.accentDark }}>Join Now</span></>
                    ) : (
                        <>Already a captain? <span className="font-black" style={{ color: theme.accentDark }}>Sign in</span></>
                    )}
                </button>
            </FloatingAuthLayout>

            <LegalSheetModal
                isOpen={!!legalModalTab}
                initialTab={legalModalTab || 'terms'}
                role={role}
                onClose={() => setLegalModalTab(null)}
                onNavigateFull={handleNavigateFullLegal}
            />
        </>
    );
};

export default PhoneRegistration;
