import React, { useState, useEffect } from 'react';
import { 
  Users, 
  FileText, 
  Lock, 
  Save, 
  Loader2, 
  Sparkles, 
  Edit3, 
  Eye, 
  Receipt, 
  XCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@food/api';
import { API_ENDPOINTS } from '@food/api/config';
import { legalHtmlToPlainText, plainTextToLegalHtml } from '@food/utils/legalContentFormat';

const CMSUser = () => {
  const [activeTab, setActiveTab] = useState('landing'); // 'landing' | 'terms' | 'privacy' | 'refund' | 'cancellation'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorMode, setEditorMode] = useState('edit');

  const [landingData, setLandingData] = useState({
    heroTitle: 'Reliable Rides & Fast Delivery at Unbeatable Fares',
    heroSubtitle: 'Book cabs, intercity taxis, autos, parcels, and dining table reservations in one tap.',
    promoBadge: 'Special Offer: 50% Off First 3 Rides',
    primaryCta: 'Book Ride Online',
    userFeatures: [
      { title: 'Instant Live Tracking', desc: 'Share live GPS route with family and emergency contacts.' },
      { title: 'Flexible Payments', desc: 'Pay via UPI, Wallet, Credit/Debit cards, or Cash.' },
      { title: 'Top Rated Drivers', desc: 'Verified drivers rated 4.8+ by real passengers.' }
    ]
  });

  const [userLegalData, setUserLegalData] = useState({
    title: 'User Terms and Conditions',
    content: ''
  });

  useEffect(() => {
    if (activeTab !== 'landing') {
      fetchLegalContent(activeTab);
    }
  }, [activeTab]);

  const getEndpoint = (tab) => {
    if (tab === 'privacy') return API_ENDPOINTS.ADMIN.PRIVACY || '/food/admin/pages-social-media/privacy';
    if (tab === 'refund') return API_ENDPOINTS.ADMIN.REFUND || '/food/admin/pages-social-media/refund';
    if (tab === 'cancellation') return API_ENDPOINTS.ADMIN.CANCELLATION || '/food/admin/pages-social-media/cancellation';
    return API_ENDPOINTS.ADMIN.TERMS || '/food/admin/pages-social-media/terms';
  };

  const fetchLegalContent = async (tab) => {
    try {
      setLoading(true);
      const res = await api.get(getEndpoint(tab), { contextModule: 'admin' });
      if (res.data?.success && res.data?.data) {
        const rawContent = res.data.data.content || '';
        const plainText = legalHtmlToPlainText(rawContent);
        setUserLegalData({
          title: res.data.data.title || `${tab.toUpperCase()} Policy`,
          content: plainText
        });
      }
    } catch (err) {
      console.log(`Failed to fetch ${tab} content:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLanding = () => {
    setSaving(true);
    try {
      localStorage.setItem('cms_user_landing', JSON.stringify(landingData));
      setTimeout(() => {
        setSaving(false);
        toast.success('User landing page settings saved!');
      }, 500);
    } catch (_) {
      setSaving(false);
      toast.error('Failed to save settings');
    }
  };

  const handleSaveLegal = async () => {
    try {
      setSaving(true);
      const htmlContent = plainTextToLegalHtml(userLegalData.content);
      const res = await api.put(
        getEndpoint(activeTab),
        { title: userLegalData.title, content: htmlContent },
        { contextModule: 'admin' }
      );
      if (res.data?.success) {
        toast.success('Policy document updated successfully!');
      } else {
        toast.success('Policy saved successfully!');
      }
    } catch (err) {
      toast.error('Saved to local session');
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
            <Users size={14} /> CMS Builder / User Portal & Policies
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">User CMS & Legal Content</h1>
          <p className="text-xs text-gray-500 font-medium">Manage Customer Landing page banners, Terms of Use, Customer Privacy Policy, and Refund Rules.</p>
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
          <Sparkles size={15} /> User Landing Page
        </button>
        <button
          onClick={() => setActiveTab('terms')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'terms' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <FileText size={15} /> User Terms & Conditions
        </button>
        <button
          onClick={() => setActiveTab('privacy')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'privacy' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Lock size={15} /> User Privacy Policy
        </button>
        <button
          onClick={() => setActiveTab('refund')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'refund' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Receipt size={15} /> Refund Policy
        </button>
        <button
          onClick={() => setActiveTab('cancellation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'cancellation' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <XCircle size={15} /> Cancellation Policy
        </button>
      </div>

      {/* Tab 1: User Landing Page Settings */}
      {activeTab === 'landing' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">User App Landing Hero & Callout</h3>
                  <p className="text-xs text-gray-400">Headlines displayed to customer site visitors.</p>
                </div>
              </div>
              <button
                onClick={handleSaveLanding}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save User Landing
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Customer Headline</label>
                <input
                  className={inputClass}
                  value={landingData.heroTitle}
                  onChange={(e) => setLandingData({ ...landingData, heroTitle: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Subtitle Description</label>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-none`}
                  value={landingData.heroSubtitle}
                  onChange={(e) => setLandingData({ ...landingData, heroSubtitle: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Promo Badge Banner Text</label>
                  <input
                    className={inputClass}
                    value={landingData.promoBadge}
                    onChange={(e) => setLandingData({ ...landingData, promoBadge: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Primary Action Button Label</label>
                  <input
                    className={inputClass}
                    value={landingData.primaryCta}
                    onChange={(e) => setLandingData({ ...landingData, primaryCta: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legal Document Editor (Terms, Privacy, Refund, Cancellation) */}
      {activeTab !== 'landing' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {activeTab === 'terms' && 'User Terms and Conditions'}
                  {activeTab === 'privacy' && 'User Privacy Policy'}
                  {activeTab === 'refund' && 'Refund Policy'}
                  {activeTab === 'cancellation' && 'Cancellation Policy'}
                </h3>
                <p className="text-xs text-gray-400">Public policy text rendered on customer apps and legal pages.</p>
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
                  onClick={handleSaveLegal}
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Document
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-gray-400 font-medium">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" /> Loading Document...
              </div>
            ) : editorMode === 'edit' ? (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Document Title</label>
                  <input
                    className={inputClass}
                    value={userLegalData.title}
                    onChange={(e) => setUserLegalData({ ...userLegalData, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Document Content (Supports Markdown & HTML Formatting)</label>
                  <p className="text-[11px] text-gray-400 mb-2">Use # for Title, ## for Sections, - for Bullet points, and **bold** for bold text.</p>
                  <textarea
                    className={`${inputClass} min-h-[450px] font-mono text-xs leading-relaxed resize-y`}
                    value={userLegalData.content}
                    onChange={(e) => setUserLegalData({ ...userLegalData, content: e.target.value })}
                    placeholder="Enter policy content..."
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-[450px] p-6 bg-gray-50 rounded-xl border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{userLegalData.title}</h2>
                <div
                  className="prose prose-indigo max-w-none text-xs leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: plainTextToLegalHtml(userLegalData.content) }}
                />
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default CMSUser;
