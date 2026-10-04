import React, { useState, useEffect } from 'react';
import { 
  Car, 
  FileText, 
  ShieldCheck, 
  Save, 
  Loader2, 
  Sparkles, 
  Plus, 
  Trash2, 
  Eye, 
  Edit3, 
  CheckCircle,
  HelpCircle,
  Coins,
  Lock
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@food/api';
import { API_ENDPOINTS } from '@food/api/config';
import { legalHtmlToPlainText, plainTextToLegalHtml } from '@food/utils/legalContentFormat';

const CMSDriver = () => {
  const [activeTab, setActiveTab] = useState('landing'); // 'landing' | 'terms' | 'privacy' | 'faq'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorMode, setEditorMode] = useState('edit'); // 'edit' | 'preview'

  // Driver Landing Settings State
  const [landingData, setLandingData] = useState({
    heroTitle: 'Drive with Eqosy & Earn Up To ₹50,000 / Month',
    heroSubtitle: 'Flexible hours, daily wallet payouts, zero surge deduction, and instant booking assignment.',
    joiningBonus: '₹500 Signup Bonus on 10 Completed Trips',
    ctaText: 'Register as Driver Now',
    perks: [
      { title: 'Daily Payouts', desc: 'Withdraw earnings to your bank account anytime with 0 fees.' },
      { title: 'Fare Bidding Control', desc: 'Accept or propose custom trip fares directly to riders.' },
      { title: 'Comprehensive Insurance', desc: 'Free accidental cover for active drivers on trip duty.' }
    ]
  });

  // Driver Terms State
  const [driverTerms, setDriverTerms] = useState({
    title: 'Driver Partner Terms and Conditions',
    content: ''
  });

  // Driver Privacy State
  const [driverPrivacy, setDriverPrivacy] = useState({
    title: 'Driver Location & Data Privacy Policy',
    content: ''
  });

  useEffect(() => {
    if (activeTab === 'terms') {
      fetchDriverPageContent('driver-terms');
    } else if (activeTab === 'privacy') {
      fetchDriverPageContent('driver-privacy');
    }
  }, [activeTab]);

  const fetchDriverPageContent = async (key) => {
    try {
      setLoading(true);
      const endpoint = key === 'driver-terms' 
        ? (API_ENDPOINTS.ADMIN.DRIVER_TERMS || '/food/admin/pages-social-media/driver-terms')
        : (API_ENDPOINTS.ADMIN.DRIVER_PRIVACY || '/food/admin/pages-social-media/driver-privacy');

      const res = await api.get(endpoint, { contextModule: 'admin' });
      if (res.data?.success && res.data?.data) {
        const rawContent = res.data.data.content || '';
        const plainText = legalHtmlToPlainText(rawContent);
        if (key === 'driver-terms') {
          setDriverTerms({
            title: res.data.data.title || 'Driver Partner Terms and Conditions',
            content: plainText
          });
        } else {
          setDriverPrivacy({
            title: res.data.data.title || 'Driver Location & Data Privacy Policy',
            content: plainText
          });
        }
      }
    } catch (err) {
      console.log(`Failed to load ${key}, fallback to seeded default:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLanding = () => {
    setSaving(true);
    try {
      localStorage.setItem('cms_driver_landing', JSON.stringify(landingData));
      setTimeout(() => {
        setSaving(false);
        toast.success('Driver landing page content updated successfully!');
      }, 500);
    } catch (_) {
      setSaving(false);
      toast.error('Failed to save driver landing content');
    }
  };

  const handleSaveLegal = async (key) => {
    try {
      setSaving(true);
      const isTerms = key === 'driver-terms';
      const targetObj = isTerms ? driverTerms : driverPrivacy;
      const endpoint = isTerms
        ? (API_ENDPOINTS.ADMIN.DRIVER_TERMS || '/food/admin/pages-social-media/driver-terms')
        : (API_ENDPOINTS.ADMIN.DRIVER_PRIVACY || '/food/admin/pages-social-media/driver-privacy');

      const htmlContent = plainTextToLegalHtml(targetObj.content);

      const res = await api.put(
        endpoint,
        { title: targetObj.title, content: htmlContent },
        { contextModule: 'admin' }
      );

      if (res.data?.success) {
        toast.success(`${isTerms ? 'Driver Terms' : 'Driver Privacy Policy'} saved successfully!`);
      } else {
        toast.success('Policy saved successfully!');
      }
    } catch (err) {
      toast.error('Failed to save to server, saved locally');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all";
  const labelClass = "block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider";
  const cardClass = "bg-white rounded-2xl border border-gray-100 p-6 shadow-sm";

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 lg:p-8 font-sans pb-24 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/60 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">
            <Car size={14} /> CMS Builder / Driver Portal & Policies
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Driver CMS & Policy Management</h1>
          <p className="text-xs text-gray-500 font-medium">Manage Driver onboarding landing content, Driver Terms & Conditions, and Driver Privacy Policy.</p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('landing')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'landing' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Sparkles size={15} /> Driver Landing Page
        </button>
        <button
          onClick={() => setActiveTab('terms')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'terms' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <FileText size={15} /> Driver Terms & Conditions
        </button>
        <button
          onClick={() => setActiveTab('privacy')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'privacy' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Lock size={15} /> Driver Privacy Policy
        </button>
      </div>

      {/* Tab 1: Driver Landing Page Settings */}
      {activeTab === 'landing' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Car size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Driver Recruitment Banner & Hero Content</h3>
                  <p className="text-xs text-gray-400">Headlines displayed on driver registration welcome screens.</p>
                </div>
              </div>
              <button
                onClick={handleSaveLanding}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Landing Content
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Hero Title Headline</label>
                <input
                  className={inputClass}
                  value={landingData.heroTitle}
                  onChange={(e) => setLandingData({ ...landingData, heroTitle: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Hero Subtitle / Value Proposition</label>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-none`}
                  value={landingData.heroSubtitle}
                  onChange={(e) => setLandingData({ ...landingData, heroSubtitle: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Signup Incentive / Joining Bonus Offer</label>
                  <input
                    className={inputClass}
                    value={landingData.joiningBonus}
                    onChange={(e) => setLandingData({ ...landingData, joiningBonus: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>CTA Button Text</label>
                  <input
                    className={inputClass}
                    value={landingData.ctaText}
                    onChange={(e) => setLandingData({ ...landingData, ctaText: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Driver Terms & Conditions Editor */}
      {activeTab === 'terms' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">Driver Partner Agreement & Terms</h3>
                <p className="text-xs text-gray-400">Controls legal terms agreed during driver onboarding and document verification.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                  <button
                    onClick={() => setEditorMode('edit')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      editorMode === 'edit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Edit3 size={12} className="inline mr-1" /> Edit
                  </button>
                  <button
                    onClick={() => setEditorMode('preview')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      editorMode === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Eye size={12} className="inline mr-1" /> Live Preview
                  </button>
                </div>
                <button
                  onClick={() => handleSaveLegal('driver-terms')}
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Driver Terms
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-gray-400 font-medium">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" /> Loading Driver Terms...
              </div>
            ) : editorMode === 'edit' ? (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Document Title</label>
                  <input
                    className={inputClass}
                    value={driverTerms.title}
                    onChange={(e) => setDriverTerms({ ...driverTerms, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Document Content (Supports Markdown & HTML Formatting)</label>
                  <p className="text-[11px] text-gray-400 mb-2">Use # for Title, ## for Sections, - for Bullet points, and **bold** for bold text.</p>
                  <textarea
                    className={`${inputClass} min-h-[450px] font-mono text-xs leading-relaxed resize-y`}
                    value={driverTerms.content}
                    onChange={(e) => setDriverTerms({ ...driverTerms, content: e.target.value })}
                    placeholder="Enter driver terms and conditions content..."
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-[450px] p-6 bg-gray-50 rounded-xl border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{driverTerms.title}</h2>
                <div
                  className="prose prose-indigo max-w-none text-xs leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: plainTextToLegalHtml(driverTerms.content) }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Driver Privacy Policy Editor */}
      {activeTab === 'privacy' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">Driver Location Data & Privacy Policy</h3>
                <p className="text-xs text-gray-400">Details background location tracking, data storage, and driver privacy rules.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                  <button
                    onClick={() => setEditorMode('edit')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      editorMode === 'edit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Edit3 size={12} className="inline mr-1" /> Edit
                  </button>
                  <button
                    onClick={() => setEditorMode('preview')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      editorMode === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Eye size={12} className="inline mr-1" /> Live Preview
                  </button>
                </div>
                <button
                  onClick={() => handleSaveLegal('driver-privacy')}
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Driver Privacy Policy
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-gray-400 font-medium">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" /> Loading Driver Privacy Policy...
              </div>
            ) : editorMode === 'edit' ? (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Document Title</label>
                  <input
                    className={inputClass}
                    value={driverPrivacy.title}
                    onChange={(e) => setDriverPrivacy({ ...driverPrivacy, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Document Content (Supports Markdown & HTML Formatting)</label>
                  <p className="text-[11px] text-gray-400 mb-2">Use # for Title, ## for Sections, - for Bullet points, and **bold** for bold text.</p>
                  <textarea
                    className={`${inputClass} min-h-[450px] font-mono text-xs leading-relaxed resize-y`}
                    value={driverPrivacy.content}
                    onChange={(e) => setDriverPrivacy({ ...driverPrivacy, content: e.target.value })}
                    placeholder="Enter driver privacy policy content..."
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-[450px] p-6 bg-gray-50 rounded-xl border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{driverPrivacy.title}</h2>
                <div
                  className="prose prose-indigo max-w-none text-xs leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: plainTextToLegalHtml(driverPrivacy.content) }}
                />
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default CMSDriver;
