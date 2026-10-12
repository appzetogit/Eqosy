import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ShieldCheck, X, ExternalLink, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/services/api/axios';

const FALLBACK_DRIVER_PRIVACY = `
<h1>Taxi Driver App Privacy Policy</h1>
<p>Welcome to the <strong>Taxi Driver App Privacy Policy</strong> for Eqosy. We value your privacy and are committed to protecting your personal data.</p>
<h2>1. Information We Collect</h2>
<p>We collect information you provide directly to us, such as when you create an account, register your vehicle, submit KYC documents (driving license, vehicle registration, insurance), or interact with our app.</p>
<h2>2. Background & Real-Time Location Tracking</h2>
<p>To match nearby ride requests, calculate trip distances, determine fares accurately, and ensure passenger and captain safety, Eqosy collects and processes location data (both in foreground and in background) while your driver app status is set to online or during active trip assignments.</p>
<h2>3. How We Use Your Information</h2>
<p>We use the collected information to dispatch rides, process earnings and payouts, provide customer support, verify identity, prevent fraud, and comply with legal obligations.</p>
<h2>4. Data Sharing and Disclosure</h2>
<p>During an active ride, your name, photo, phone contact, vehicle registration number, and live trip location are shared with the assigned rider. We do not sell your personal data to any third parties.</p>
<h2>5. Data Security & Partner Rights</h2>
<p>We implement stringent technical and organizational safeguards to protect your personal data. You may review, update, or request deletion of your account details by contacting support.</p>
<p>For more details or privacy inquiries, contact us at <strong>support@eqosy.in</strong>.</p>
`;

const FALLBACK_DRIVER_TERMS = `
<h2>Driver Partner Terms and Conditions</h2>
<p>These terms govern driver partners operating cab, auto, bike, and intercity transit services on the Eqosy Taxi platform.</p>
<h3>1. Vehicle Standards</h3>
<p>Drivers must maintain roadworthy, clean, and insured vehicles with valid commercial or private permits as applicable by law.</p>
<h3>2. Safety & Standards</h3>
<p>Drivers must strictly comply with local speed limits, navigation routes, traffic guidelines, and platform safety protocols at all times.</p>
<h3>3. Fare Bidding & Payout Policy</h3>
<p>Ride fares and bid percentages must stay within configured admin policy ranges. Tariff manipulation is prohibited. Verified weekly or daily earnings are disbursed directly to your designated payout account.</p>
<h3>4. Independent Contractor Relationship</h3>
<p>Drivers are independent mobility contractors and not direct employees of Eqosy. Service access may be moderated based on driver ratings, acceptance rates, and passenger feedback.</p>
<p>For inquiries regarding partner terms, contact <strong>support@eqosy.in</strong>.</p>
`;

const FALLBACK_USER_PRIVACY = `
<h2>Privacy Policy</h2>
<p>This Privacy Policy outlines how Eqosy collects, uses, and safeguards information when you use our mobility and booking platform.</p>
<h3>1. Personal Details</h3>
<p>We collect your name, mobile phone number, email address, and payment references when you register and request trips.</p>
<h3>2. Location Data</h3>
<p>We use your current location to connect you with nearby drivers and provide live trip tracking.</p>
<p>Contact <strong>support@eqosy.in</strong> for any data privacy concerns.</p>
`;

const FALLBACK_USER_TERMS = `
<h2>Terms of Service</h2>
<p>By accessing or using the Eqosy platform, you agree to comply with our general Terms of Service.</p>
<h3>1. Booking and Services</h3>
<p>Eqosy provides technology connecting users with independent transportation service providers.</p>
<h3>2. Fares and Payments</h3>
<p>Fares are calculated based on distance, duration, and local traffic conditions. Payment is due upon booking or completion of the trip.</p>
<p>Contact <strong>support@eqosy.in</strong> for assistance.</p>
`;

const getFallbackData = (targetKey) => {
  if (targetKey === 'driver-privacy') {
    return { title: 'Taxi Driver App Privacy Policy', content: FALLBACK_DRIVER_PRIVACY };
  }
  if (targetKey === 'driver-terms') {
    return { title: 'Driver Partner Terms and Conditions', content: FALLBACK_DRIVER_TERMS };
  }
  if (targetKey === 'privacy') {
    return { title: 'Privacy Policy', content: FALLBACK_USER_PRIVACY };
  }
  return { title: 'Terms of Service', content: FALLBACK_USER_TERMS };
};

export default function LegalSheetModal({
  isOpen,
  initialTab = 'terms', // 'terms' | 'privacy'
  role = 'driver',
  onClose,
  onNavigateFull,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [contentData, setContentData] = useState({ title: '', content: '' });
  const navigate = useNavigate();

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchLegalContent = async () => {
      setLoading(true);
      const normalizedRole = String(role || 'driver').toLowerCase();
      let targetKey = '';

      if (activeTab === 'terms') {
        targetKey = normalizedRole === 'driver' ? 'driver-terms' : 'terms';
      } else {
        targetKey = normalizedRole === 'driver' ? 'driver-privacy' : 'privacy';
      }

      const fallback = getFallbackData(targetKey);

      try {
        const response = await apiClient.get(`/food/pages/${targetKey}`);
        if (isMounted) {
          const resData = response?.data?.data || response?.data || {};
          if (resData?.content) {
            setContentData({
              title: resData.title || fallback.title,
              content: resData.content,
            });
            return;
          }
        }
      } catch (err) {
        console.warn('apiClient failed for legal page, trying direct fetch:', err?.message);
        try {
          const rawRes = await fetch(`/api/v1/food/pages/${targetKey}`);
          if (rawRes.ok) {
            const rawJson = await rawRes.json();
            const resData = rawJson?.data || rawJson || {};
            if (isMounted && resData?.content) {
              setContentData({
                title: resData.title || fallback.title,
                content: resData.content,
              });
              return;
            }
          }
        } catch (_) {}
      }

      if (isMounted) {
        setContentData(fallback);
      }
      if (isMounted) setLoading(false);
    };

    fetchLegalContent().finally(() => {
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, role]);

  if (!isOpen) return null;

  const handleOpenFullPage = () => {
    if (onNavigateFull) {
      onNavigateFull(activeTab);
    } else {
      const isDriver = role === 'driver' || window.location.pathname.includes('/driver');
      const targetPath = isDriver
        ? (activeTab === 'terms' ? '/taxi/driver/terms' : '/taxi/driver/privacy')
        : (activeTab === 'terms' ? '/taxi/terms' : '/taxi/privacy');
      navigate(targetPath, {
        state: { role: isDriver ? 'driver' : role, returnTo: window.location.pathname },
      });
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
        {/* Backdrop click */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0"
          onClick={onClose}
        />

        {/* Sheet Card */}
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative w-full sm:max-w-lg bg-white rounded-t-[28px] sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden z-10"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-[color:var(--app-primary,#F38F24)] flex items-center justify-center border border-orange-100 shadow-sm">
                {activeTab === 'terms' ? (
                  <FileText size={18} />
                ) : (
                  <ShieldCheck size={18} />
                )}
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 leading-tight">
                  {contentData.title || (activeTab === 'terms' ? 'Terms & Conditions' : 'Privacy Policy')}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Eqosy Legal & Policies
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="px-4 pt-3 pb-2 bg-white flex gap-2 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setActiveTab('terms')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'terms'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileText size={13} />
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('privacy')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'privacy'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ShieldCheck size={13} />
              Privacy Policy
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 text-xs leading-relaxed text-slate-600">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 size={28} className="animate-spin text-[color:var(--app-primary,#F38F24)]" />
                <p className="font-bold text-xs uppercase tracking-wider">Loading policy...</p>
              </div>
            ) : contentData.content ? (
              <div
                className="prose prose-sm max-w-none prose-headings:font-black prose-headings:text-slate-900 prose-headings:mt-4 prose-headings:mb-2 prose-p:text-slate-600 prose-p:leading-relaxed prose-p:mb-3 prose-a:text-orange-600 prose-strong:text-slate-900"
                dangerouslySetInnerHTML={{ __html: contentData.content }}
              />
            ) : (
              <div className="py-16 text-center text-slate-400">
                <FileText size={36} className="mx-auto mb-2 opacity-40" />
                <p className="font-medium text-xs">No content available.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleOpenFullPage}
              className="text-xs font-bold text-slate-700 hover:text-[color:var(--app-primary,#F38F24)] flex items-center gap-1.5 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-orange-50/50"
            >
              <ExternalLink size={13} />
              Full Page View
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
            >
              I Understand & Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
