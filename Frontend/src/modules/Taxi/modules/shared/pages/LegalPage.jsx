import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, IndianRupee, Scale, ScrollText, ShieldCheck, Loader2, Sparkles, User, Car } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '@/services/api/axios';
import { getLocalDriverToken, getAuthenticatedDriverRole } from '../../driver/services/registrationService';
import { isModuleAuthenticated } from '@/modules/Food/utils/auth';

const vehiclePricing = [
  { type: 'Bike', capacity: 'Up to 2 riders', price: 'Starts at Rs 49', cancellationCut: 'Admin cut up to Rs 10', note: 'Best for quick solo rides and short-distance travel.' },
  { type: 'Auto', capacity: 'Up to 3 riders', price: 'Starts at Rs 79', cancellationCut: 'Admin cut up to Rs 15', note: 'Suitable for city commutes and local market travel.' },
  { type: 'Taxi', capacity: 'Up to 4 riders', price: 'Starts at Rs 129', cancellationCut: 'Admin cut up to Rs 25', note: 'Standard cab option for everyday point-to-point trips.' },
  { type: 'Premium Car', capacity: 'Up to 7 riders', price: 'Starts at Rs 249', cancellationCut: 'Admin cut up to Rs 40', note: 'Extra comfort and larger seating for family or business travel.' },
  { type: 'eRickshaw', capacity: 'Up to 3 riders', price: 'Starts at Rs 69', cancellationCut: 'Admin cut up to Rs 12', note: 'May be available in selected operating zones only.' },
];

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

const legalContent = {
  terms: {
    label: 'Terms & Conditions',
    title: 'Terms & Conditions',
    icon: ScrollText,
    intro:
      'These Terms & Conditions govern the use of the Eqosy website, app, and booking services. By using the platform, you agree to follow these terms whenever you browse, register, book, cancel, or pay for a service.',
    sections: [
      {
        title: 'Use of the platform',
        body:
          'Eqosy provides technology services for ride booking, vehicle-based transport support, parcel movement, and related mobility services. Availability can vary by city, vehicle type, demand, operating hours, and serviceability.',
      },
      {
        title: 'Eligibility',
        bullets: [
          'Users should provide accurate name, phone number, and account details.',
          'You must use the platform only for lawful purposes.',
          'For rentals or regulated vehicle services, additional identity or eligibility checks may be required.',
        ],
      },
      {
        title: 'Bookings and fares',
        bullets: [
          'A booking is confirmed only after the system accepts it and a driver, partner, or service unit is assigned when required.',
          'Displayed fares can change because of distance, traffic, tolls, waiting time, service zone, taxes, or peak demand.',
          'Final payable amounts shown at checkout or after trip completion are considered binding unless there is a verified billing error.',
        ],
      },
      {
        title: 'User responsibilities',
        bullets: [
          'Do not create fake bookings or misuse payment methods.',
          'Do not damage vehicles, partner property, or equipment.',
          'Do not harass drivers, delivery partners, service staff, or support teams.',
          'Do not use the service for illegal, dangerous, or prohibited goods or activities.',
        ],
      },
      {
        title: 'Account actions',
        body:
          'Eqosy may suspend, restrict, or terminate access where there is fraud, abusive conduct, repeated policy violations, non-payment, chargeback misuse, or legal/regulatory risk.',
      },
      {
        title: 'Liability and service interruptions',
        body:
          'Eqosy works to keep the service reliable, but delays may happen because of traffic, weather, technical downtime, route closures, law-and-order issues, or third-party failures. To the extent permitted by law, Eqosy is not responsible for indirect or consequential loss arising from such interruptions.',
      },
      {
        title: 'Contact',
        body:
          'For questions about these terms, users can contact the support team through support@eqosy.in.',
      },
    ],
  },
  privacy: {
    label: 'Privacy Policy',
    title: 'Privacy Policy',
    icon: ShieldCheck,
    intro:
      'This platform is managed by Eqosy. This Privacy Policy explains what information we collect, why we collect it, how we use it, and the steps we take to protect it when you use the Eqosy website or connected services.',
    sections: [
      {
        title: 'Information we may collect',
        bullets: [
          'Name, mobile number, email address, and account profile details.',
          'Pickup and drop locations, booking history, cancellation records, and support interactions.',
          'Device, browser, IP address, app version, and diagnostic information needed for security and service quality.',
          'Location information during active rides or service requests where needed for dispatch, tracking, and safety.',
        ],
      },
      {
        title: 'How we use your information',
        bullets: [
          'To create and manage your account.',
          'To process bookings, assignments, payments, and support requests.',
          'To improve matching, service performance, fraud prevention, and safety monitoring.',
          'To send OTPs, service alerts, invoices, and important operational communication.',
        ],
      },
      {
        title: 'Sharing of information',
        body:
          'We may share limited information with drivers, delivery or service partners, payment providers, communication vendors, analytics tools, and authorities when required by law or necessary for service delivery.',
      },
      {
        title: 'Security and retention',
        body:
          'We use reasonable organizational and technical safeguards to keep personal information secure. Data is retained for service delivery, tax, accounting, or regulatory requirements.',
      },
      {
        title: 'User choices',
        body:
          'Users can update profile details in the app or reach out to support to request correction or removal where allowed by applicable law.',
      },
    ],
  },
  refund: {
    label: 'Refund Policy',
    title: 'Refund Policy',
    icon: IndianRupee,
    intro:
      'This Refund Policy explains how cancellations, adjustments, and refunds are handled across rides and services booked on Eqosy.',
    sections: [
      {
        title: 'When refunds may apply',
        bullets: [
          'Duplicate charges or billing errors confirmed by Eqosy.',
          'Service failure caused by system issues or unassigned bookings where payment was collected in advance.',
          'Eligible cancellations made before partner dispatch or within applicable grace periods.',
        ],
      },
      {
        title: 'Non-refundable scenarios',
        bullets: [
          'Completed trips where service was delivered as requested.',
          'Delays caused by external factors such as traffic, weather, or road closures beyond reasonable control.',
          'Cancellations made after partner arrival or significant transit distance.',
        ],
      },
      {
        title: 'Processing timeline',
        body:
          'Approved refunds are typically initiated within 5 to 7 business days to the original payment method, subject to bank processing cycles.',
      },
    ],
  },
  cancellation: {
    label: 'Cancellation Policy',
    title: 'Cancellation Policy',
    icon: Scale,
    intro:
      'This page summarizes how cancellations and associated fees are handled across Eqosy booking categories.',
    sections: [
      {
        title: 'General policy',
        bullets: [
          'Free cancellation is available during the initial grace period after booking.',
          'Cancellation fees may apply once a driver partner has arrived at the pickup location.',
          'Excessive cancellations may temporarily restrict account booking privileges.',
        ],
      },
    ],
  },
};

const getDocumentType = (pathname = '') => {
  const value = pathname.toLowerCase();
  if (value.includes('privacy-policy') || value.includes('privacy')) return 'privacy';
  if (value.includes('terms-and-conditions') || value.includes('terms')) return 'terms';
  if (value.includes('refund')) return 'refund';
  if (value.includes('cancellation')) return 'cancellation';
  return 'terms';
};

const LegalPage = ({ role: propRole }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialDocType = getDocumentType(location.pathname);
  const [activeDoc, setActiveDoc] = useState(initialDocType);

  const searchRole = (searchParams.get('role') || searchParams.get('type') || searchParams.get('userType') || '').toLowerCase();
  const stateRole = String(location.state?.role || propRole || '').toLowerCase();
  const isDriverDefault =
    propRole === 'driver' ||
    stateRole === 'driver' ||
    searchRole === 'driver' ||
    location.pathname.includes('/driver') ||
    location.pathname.includes('/owner');

  const [activeAudience, setActiveAudience] = useState(isDriverDefault ? 'driver' : 'user');
  const [loading, setLoading] = useState(true);
  const [cmsContent, setCmsContent] = useState('');
  const [pageTitle, setPageTitle] = useState('');

  // Synchronize doc type with path changes
  useEffect(() => {
    setActiveDoc(getDocumentType(location.pathname));
  }, [location.pathname]);

  // Fetch dynamic CMS content whenever activeDoc or activeAudience changes
  useEffect(() => {
    let isMounted = true;
    const fetchPage = async () => {
      setLoading(true);
      let targetKey = '';

      if (activeAudience === 'driver') {
        targetKey = activeDoc === 'terms' ? 'driver-terms' : 'driver-privacy';
      } else {
        if (activeDoc === 'terms') targetKey = 'terms';
        else if (activeDoc === 'refund') targetKey = 'refund';
        else if (activeDoc === 'cancellation') targetKey = 'cancellation';
        else targetKey = 'privacy';
      }

      const fallbackTitle = activeAudience === 'driver'
        ? (activeDoc === 'terms' ? 'Driver Partner Terms and Conditions' : 'Taxi Driver App Privacy Policy')
        : legalContent[activeDoc]?.title || 'Policy & Legal';

      const fallbackHtml = activeAudience === 'driver'
        ? (activeDoc === 'terms' ? FALLBACK_DRIVER_TERMS : FALLBACK_DRIVER_PRIVACY)
        : '';

      try {
        const res = await apiClient.get(`/food/pages/${targetKey}`);
        if (isMounted) {
          const resData = res?.data?.data || res?.data || {};
          if (resData?.content) {
            setPageTitle(resData.title || fallbackTitle);
            setCmsContent(resData.content);
            return;
          }
        }
      } catch (err) {
        console.warn('apiClient fetch failed for CMS page, attempting fetch fallback:', err?.message);
        try {
          const raw = await fetch(`/api/v1/food/pages/${targetKey}`);
          if (raw.ok) {
            const rawJson = await raw.json();
            const resData = rawJson?.data || rawJson || {};
            if (isMounted && resData?.content) {
              setPageTitle(resData.title || fallbackTitle);
              setCmsContent(resData.content);
              return;
            }
          }
        } catch (_) {}
      }

      if (isMounted) {
        setPageTitle(fallbackTitle);
        setCmsContent(fallbackHtml);
      }
    };

    fetchPage().finally(() => {
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [activeDoc, activeAudience]);

  const handleBack = () => {
    const explicitReturn =
      location.state?.returnTo ||
      location.state?.from ||
      location.state?.backTo ||
      searchParams.get('returnTo') ||
      searchParams.get('from');

    if (
      explicitReturn &&
      typeof explicitReturn === 'string' &&
      explicitReturn.startsWith('/') &&
      !explicitReturn.includes('terms') &&
      !explicitReturn.includes('privacy') &&
      !explicitReturn.includes('/food/')
    ) {
      navigate(explicitReturn, { replace: true });
      return;
    }

    const referrer = typeof document !== 'undefined' ? (document.referrer || '') : '';
    const referrerIsFood = Boolean(referrer && referrer.includes('/food/'));
    const referrerIsDriver = Boolean(referrer && (referrer.includes('/taxi/driver') || referrer.includes('/taxi/owner')));

    const storedDriverToken = getLocalDriverToken();
    const storedDriverRole = String(getAuthenticatedDriverRole() || '').toLowerCase();

    const isDriverContext =
      isDriverDefault ||
      activeAudience === 'driver' ||
      referrerIsDriver ||
      Boolean(storedDriverToken);

    const hasHistory =
      typeof window !== 'undefined' &&
      window.history &&
      !referrerIsFood &&
      ((window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) ||
       (window.history.length > 1 && referrer && referrer.includes(window.location.host)));

    if (hasHistory) {
      navigate(-1);
      return;
    }

    if (isDriverContext) {
      if (storedDriverToken) {
        navigate(storedDriverRole === 'owner' ? '/taxi/owner/dashboard' : '/taxi/driver/home', { replace: true });
      } else {
        navigate('/taxi/driver/login', { replace: true });
      }
      return;
    }

    navigate('/taxi', { replace: true });
  };

  const defaultContent = legalContent[activeDoc] || legalContent.terms;
  const Icon = activeDoc === 'privacy' ? ShieldCheck : (activeDoc === 'terms' ? ScrollText : (defaultContent.icon || FileText));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Sticky Header */}
      <header className="sticky top-0 left-0 right-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Go back"
              onClick={handleBack}
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-center border border-slate-200"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--app-primary,#F38F24)]">
                EQOSY LEGAL & COMPLIANCE
              </span>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                {activeAudience === 'driver' ? 'Captain & Driver Policies' : 'Passenger & Public Policies'}
              </h2>
            </div>
          </div>

          {/* Quick tab toggle for Doc Type */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveDoc('terms')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeDoc === 'terms'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => setActiveDoc('privacy')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeDoc === 'privacy'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Privacy
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="bg-[#0F172A] text-white px-4 sm:px-6 pt-10 pb-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-5xl relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-[#F38F24] to-[#FBBF24] text-slate-950 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Icon size={24} strokeWidth={2.2} />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/10 text-orange-300 border border-white/10">
                  <Sparkles size={11} />
                  Official Policy Document
                </span>
                <p className="text-xs text-slate-400 mt-0.5">Last updated: October 2026</p>
              </div>
            </div>

            {/* Audience Toggle (Driver Captain vs User Passenger) */}
            <div className="flex items-center gap-2 bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700/80 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveAudience('driver')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeAudience === 'driver'
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Car size={13} />
                Captain / Driver
              </button>
              <button
                type="button"
                onClick={() => setActiveAudience('user')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeAudience === 'user'
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <User size={13} />
                Rider / User
              </button>
            </div>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
            {pageTitle || (activeAudience === 'driver'
              ? (activeDoc === 'terms' ? 'Driver Partner Terms and Conditions' : 'Taxi Driver App Privacy Policy')
              : defaultContent.title)}
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-3xl leading-relaxed">
            {activeAudience === 'driver'
              ? (activeDoc === 'terms'
                ? 'These contractual terms govern driver partners operating vehicle transit services on the Eqosy Captain platform.'
                : 'This Privacy Policy explains how Eqosy collects, uses, and safeguards partner personal and location data on the Captain Driver App.')
              : defaultContent.intro}
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 px-4 sm:px-6 py-8 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 sm:p-10">
            {loading ? (
              <div className="py-24 flex flex-col items-center justify-center gap-4 text-slate-400">
                <Loader2 size={36} className="animate-spin text-[color:var(--app-primary,#F38F24)]" />
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Loading document...</p>
              </div>
            ) : cmsContent ? (
              <article
                className="prose prose-slate max-w-none prose-headings:font-black prose-headings:text-slate-900 prose-h1:text-2xl sm:prose-h1:text-3xl prose-h2:text-xl sm:prose-h2:text-2xl prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-3 prose-h2:mt-8 prose-h3:text-lg prose-p:text-slate-600 prose-p:leading-relaxed prose-p:mb-4 prose-li:text-slate-600 prose-li:leading-relaxed prose-strong:text-slate-900 prose-a:text-orange-600 prose-a:underline hover:prose-a:text-orange-700"
                dangerouslySetInnerHTML={{ __html: cmsContent }}
              />
            ) : defaultContent.sections ? (
              <div className="space-y-8">
                {defaultContent.sections.map((section) => (
                  <div key={section.title} className="border-b border-slate-100 pb-6 last:border-b-0 last:pb-0">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 mb-3">
                      {section.title}
                    </h2>
                    {section.body && (
                      <p className="text-sm leading-relaxed text-slate-600 mb-3">{section.body}</p>
                    )}
                    {section.bullets && (
                      <ul className="space-y-2 text-sm leading-relaxed text-slate-600 list-disc pl-5">
                        {section.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {activeDoc === 'terms' && activeAudience === 'user' && (
                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <h3 className="text-base font-black text-slate-900 mb-4">Indicative Ride Pricing & Categories</h3>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider font-bold">
                          <tr>
                            <th className="py-3 px-4">Vehicle</th>
                            <th className="py-3 px-4">Capacity</th>
                            <th className="py-3 px-4">Starting Fare</th>
                            <th className="py-3 px-4">Admin Cut</th>
                            <th className="py-3 px-4">Best For</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-600">
                          {vehiclePricing.map((v) => (
                            <tr key={v.type} className="hover:bg-slate-50/50">
                              <td className="py-3 px-4 font-bold text-slate-900">{v.type}</td>
                              <td className="py-3 px-4">{v.capacity}</td>
                              <td className="py-3 px-4 font-bold text-slate-900">{v.price}</td>
                              <td className="py-3 px-4">{v.cancellationCut}</td>
                              <td className="py-3 px-4">{v.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400">
                <FileText size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-semibold">Policy details currently unavailable.</p>
              </div>
            )}
          </div>

          {/* Action Bar below content */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
            <div className="text-center sm:text-left">
              <h4 className="text-sm font-bold text-slate-900">Have questions about our policies?</h4>
              <p className="text-xs text-slate-500">Reach out to our compliance and support team anytime at support@eqosy.in</p>
            </div>
            <button
              type="button"
              onClick={handleBack}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} />
              Return to Previous Screen
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LegalPage;
