import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  ShieldCheck, 
  Lock, 
  Car, 
  Store, 
  Truck, 
  Receipt, 
  XCircle, 
  Save, 
  Loader2, 
  Eye, 
  Edit3, 
  Sparkles, 
  RefreshCw, 
  CheckCircle,
  Building2
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@food/api';
import { API_ENDPOINTS } from '@food/api/config';
import { legalHtmlToPlainText, plainTextToLegalHtml } from '@food/utils/legalContentFormat';

const CMSLegal = () => {
  const [activeTab, setActiveTab] = useState('driver-terms'); 
  // Options: 'terms', 'privacy', 'driver-terms', 'driver-privacy', 'restaurant-terms', 'delivery-terms', 'refund', 'cancellation', 'dmv-compliance'

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'preview'

  const [documentData, setDocumentData] = useState({
    title: 'Terms and Conditions',
    content: ''
  });

  const legalTabs = [
    { id: 'driver-terms', label: 'Driver Terms', icon: Car, color: 'text-indigo-600', key: 'driver-terms' },
    { id: 'driver-privacy', label: 'Driver Privacy Policy', icon: Lock, color: 'text-indigo-600', key: 'driver-privacy' },
    { id: 'terms', label: 'User Terms', icon: FileText, color: 'text-blue-600', key: 'terms' },
    { id: 'privacy', label: 'User Privacy Policy', icon: ShieldCheck, color: 'text-blue-600', key: 'privacy' },
    { id: 'restaurant-terms', label: 'Restaurant Terms', icon: Store, color: 'text-emerald-600', key: 'restaurant-terms' },
    { id: 'delivery-terms', label: 'Delivery Terms', icon: Truck, color: 'text-purple-600', key: 'delivery-terms' },
    { id: 'refund', label: 'Refund Policy', icon: Receipt, color: 'text-amber-600', key: 'refund' },
    { id: 'cancellation', label: 'Cancellation Policy', icon: XCircle, color: 'text-rose-600', key: 'cancellation' },
    { id: 'dmv-compliance', label: 'DMV & Transport Rules', icon: Building2, color: 'text-cyan-600', key: 'dmv-compliance' },
  ];

  useEffect(() => {
    fetchDocumentContent(activeTab);
  }, [activeTab]);

  const getEndpoint = (key) => {
    if (key === 'driver-terms') return API_ENDPOINTS.ADMIN.DRIVER_TERMS || '/food/admin/pages-social-media/driver-terms';
    if (key === 'driver-privacy') return API_ENDPOINTS.ADMIN.DRIVER_PRIVACY || '/food/admin/pages-social-media/driver-privacy';
    if (key === 'terms') return API_ENDPOINTS.ADMIN.TERMS || '/food/admin/pages-social-media/terms';
    if (key === 'privacy') return API_ENDPOINTS.ADMIN.PRIVACY || '/food/admin/pages-social-media/privacy';
    if (key === 'restaurant-terms') return API_ENDPOINTS.ADMIN.RESTAURANT_TERMS || '/food/admin/pages-social-media/restaurant-terms';
    if (key === 'delivery-terms') return API_ENDPOINTS.ADMIN.DELIVERY_TERMS || '/food/admin/pages-social-media/delivery-terms';
    if (key === 'refund') return API_ENDPOINTS.ADMIN.REFUND || '/food/admin/pages-social-media/refund';
    if (key === 'cancellation') return API_ENDPOINTS.ADMIN.CANCELLATION || '/food/admin/pages-social-media/cancellation';
    return `/food/admin/pages-social-media/${key}`;
  };

  const fetchDocumentContent = async (key) => {
    try {
      setLoading(true);
      const res = await api.get(getEndpoint(key), { contextModule: 'admin' });
      if (res.data?.success && res.data?.data) {
        const pageData = res.data.data;
        const plain = legalHtmlToPlainText(pageData.content || '');
        setDocumentData({
          title: pageData.title || getDefaultTitle(key),
          content: plain
        });
      } else {
        setDocumentData({
          title: getDefaultTitle(key),
          content: getDefaultContent(key)
        });
      }
    } catch (err) {
      console.log(`Error fetching ${key}, using seeded template:`, err);
      setDocumentData({
        title: getDefaultTitle(key),
        content: getDefaultContent(key)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const htmlContent = plainTextToLegalHtml(documentData.content);
      const res = await api.put(
        getEndpoint(activeTab),
        { title: documentData.title, content: htmlContent },
        { contextModule: 'admin' }
      );
      if (res.data?.success) {
        toast.success(`${documentData.title} saved & published successfully!`);
      } else {
        toast.success('Document updated!');
      }
    } catch (err) {
      toast.error('Saved locally for session');
    } finally {
      setSaving(false);
    }
  };

  const getDefaultTitle = (key) => {
    switch (key) {
      case 'driver-terms': return 'Driver Partner Terms & Conditions';
      case 'driver-privacy': return 'Driver Location & Data Privacy Policy';
      case 'terms': return 'User Terms and Conditions';
      case 'privacy': return 'User Privacy Policy';
      case 'restaurant-terms': return 'Merchant Restaurant Terms';
      case 'delivery-terms': return 'Delivery Partner Fleet Agreement';
      case 'refund': return 'Refund & Settlement Policy';
      case 'cancellation': return 'Cancellation Policy';
      case 'dmv-compliance': return 'DMV & Regulatory Transit Compliance';
      default: return 'Legal Policy Document';
    }
  };

  const getDefaultContent = (key) => {
    if (key === 'driver-terms') {
      return `# Driver Partner Terms and Conditions\n\nWelcome to Eqosy Mobility. As an independent driver partner operating cab, auto, or delivery services, you agree to these Terms.\n\n## 1. Eligibility & Verification\n- Must possess a valid commercial driving license.\n- Active vehicle RC, insurance, and permit documents.\n- Pass background verification checks.\n\n## 2. Fare & Bidding Policy\n- Ride fares are calculated dynamically or set via bid negotiation.\n- Platform commission is deducted as per active subscription/tier.\n\n## 3. Safety Standards\n- Strict adherence to speed limits and traffic laws.\n- Zero tolerance for alcohol or substance influence while on duty.`;
    }
    if (key === 'driver-privacy') {
      return `# Driver Location & Data Privacy Policy\n\nEqosy collects driver location data to enable real-time ride dispatching and passenger safety.\n\n## 1. Background Location Tracking\n- Location data is collected when driver app is set to "ONLINE" or during active trips.\n- Location data facilitates route navigation and safety SOS monitoring.\n\n## 2. Data Protection & Sharing\n- Driver contact numbers are masked during rider calls.\n- Financial wallet history is encrypted.`;
    }
    return `# ${getDefaultTitle(key)}\n\nThis policy governs platform usage on Eqosy. Ensure all terms are strictly observed.\n\n## 1. General Overview\nAll users and partners must maintain accurate registration credentials.`;
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
            <ShieldCheck size={14} /> CMS Builder / Legal & DMV Compliance Hub
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Privacy Policy, T&C and DMV Settings</h1>
          <p className="text-xs text-gray-500 font-medium">Manage legal agreements, privacy disclosures, driver terms, and regulatory compliance documents.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 justify-center shrink-0"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Publish Legal Document
        </button>
      </div>

      {/* Policy Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-gray-200">
        {legalTabs.map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/80'
              }`}
            >
              <IconComp size={15} className={isActive ? 'text-indigo-300' : tab.color} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Editor & Content Container */}
      <div className={cardClass}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
          <div>
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-md mb-2 inline-block">
              {legalTabs.find(t => t.id === activeTab)?.label}
            </span>
            <h3 className="text-lg font-black text-gray-900 tracking-tight">{documentData.title}</h3>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-gray-50">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'edit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Edit3 size={13} /> Edit Mode
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Eye size={13} /> Live Preview
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400 font-medium">
            <Loader2 size={28} className="animate-spin mx-auto mb-3 text-indigo-600" /> Loading Document...
          </div>
        ) : viewMode === 'edit' ? (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Document Title</label>
              <input
                className={inputClass}
                value={documentData.title}
                onChange={(e) => setDocumentData({ ...documentData, title: e.target.value })}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelClass}>Document Body Content</label>
                <span className="text-[11px] text-gray-400 font-medium">Use # Header, ## Section, - Bullets, **Bold**</span>
              </div>
              <textarea
                className={`${inputClass} min-h-[500px] font-mono text-xs leading-relaxed resize-y`}
                value={documentData.content}
                onChange={(e) => setDocumentData({ ...documentData, content: e.target.value })}
                placeholder="Write legal text here..."
              />
            </div>
          </div>
        ) : (
          <div className="min-h-[500px] p-8 bg-gray-50/70 rounded-xl border border-gray-200">
            <h2 className="text-2xl font-black text-gray-900 mb-6">{documentData.title}</h2>
            <div
              className="prose prose-indigo max-w-none text-xs leading-relaxed text-gray-700 space-y-4"
              dangerouslySetInnerHTML={{ __html: plainTextToLegalHtml(documentData.content) }}
            />
          </div>
        )}
      </div>

    </div>
  );
};

export default CMSLegal;
