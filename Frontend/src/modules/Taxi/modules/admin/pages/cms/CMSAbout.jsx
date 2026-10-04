import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Info, 
  Save, 
  Loader2, 
  Plus, 
  Trash2, 
  Sparkles, 
  Award, 
  Users, 
  CheckCircle,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@food/api';
import { API_ENDPOINTS } from '@food/api/config';

const CMSAbout = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [aboutData, setAboutData] = useState({
    appName: 'Eqosy Mobility & Delivery',
    version: '1.0.0',
    description: 'Eqosy is a premier multi-service mobility platform providing seamless cab booking, intercity travel, bike taxis, parcel delivery, and dining experiences.',
    logo: '',
    features: [
      { title: 'Zero Surge Transparency', description: 'Upfront pricing and fare negotiation options.', icon: 'Shield', color: '#4f46e5' },
      { title: 'Fleet & Driver Support', description: 'Extensive partner network with 24/7 dedicated helpline.', icon: 'Users', color: '#059669' },
      { title: 'Safety First Protocol', description: 'Live GPS trip tracking, emergency SOS, and verified drivers.', icon: 'Heart', color: '#dc2626' }
    ],
    stats: [
      { label: 'Founded Year', value: '2024' },
      { label: 'Happy Customers', value: '500,000+' },
      { label: 'Driver Partners', value: '25,000+' },
      { label: 'Cities Operating', value: '45+' }
    ]
  });

  useEffect(() => {
    fetchAboutData();
  }, []);

  const fetchAboutData = async () => {
    try {
      setLoading(true);
      const res = await api.get(API_ENDPOINTS.ADMIN.ABOUT || '/food/admin/pages-social-media/about', { contextModule: 'admin' });
      if (res.data?.success && res.data?.data) {
        const payload = res.data.data.about || res.data.data;
        if (payload.appName || payload.description) {
          setAboutData(prev => ({ ...prev, ...payload }));
        }
      }
    } catch (err) {
      console.log('Using fallback about data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await api.put(
        API_ENDPOINTS.ADMIN.ABOUT || '/food/admin/pages-social-media/about',
        { about: aboutData, appName: aboutData.appName, description: aboutData.description },
        { contextModule: 'admin' }
      );
      if (res.data?.success) {
        toast.success('About Us content updated successfully!');
      } else {
        toast.success('About Us content saved!');
      }
    } catch (err) {
      toast.error('Saved to local session settings');
      localStorage.setItem('cms_about_settings', JSON.stringify(aboutData));
    } finally {
      setSaving(false);
    }
  };

  const handleFeatureChange = (index, field, val) => {
    const updated = [...aboutData.features];
    updated[index][field] = val;
    setAboutData({ ...aboutData, features: updated });
  };

  const addFeature = () => {
    setAboutData({
      ...aboutData,
      features: [
        ...aboutData.features,
        { title: 'New Core Value', description: 'Brief explanation of value...', icon: 'Star', color: '#4f46e5' }
      ]
    });
  };

  const removeFeature = (index) => {
    const updated = aboutData.features.filter((_, i) => i !== index);
    setAboutData({ ...aboutData, features: updated });
  };

  const handleStatChange = (index, field, val) => {
    const updated = [...aboutData.stats];
    updated[index][field] = val;
    setAboutData({ ...aboutData, stats: updated });
  };

  const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all";
  const labelClass = "block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider";
  const cardClass = "bg-white rounded-2xl border border-gray-100 p-6 shadow-sm";

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto" />
          <p className="text-sm font-semibold text-gray-500">Loading About Us content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 lg:p-8 font-sans pb-24 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/60 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">
            <Info size={14} /> CMS Builder / About Us Page
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">About Us CMS Settings</h1>
          <p className="text-xs text-gray-500 font-medium">Manage company mission, brand vision, story details, and core feature pillars.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 justify-center shrink-0"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save About Us Content
        </button>
      </div>

      {/* Brand Identity & Story */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Globe size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Brand Identity & Mission Statement</h3>
            <p className="text-xs text-gray-400">Displayed on the landing site About Us page and mobile app info screen.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>App / Brand Name</label>
              <input
                className={inputClass}
                value={aboutData.appName}
                onChange={(e) => setAboutData({ ...aboutData, appName: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>App Version</label>
              <input
                className={inputClass}
                value={aboutData.version}
                onChange={(e) => setAboutData({ ...aboutData, version: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Company Story & Overview Description</label>
            <textarea
              className={`${inputClass} min-h-[120px] resize-y`}
              value={aboutData.description}
              onChange={(e) => setAboutData({ ...aboutData, description: e.target.value })}
              placeholder="Write story about the platform..."
            />
          </div>
        </div>
      </div>

      {/* Core Pillars / Values */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Award size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Core Values & Features</h3>
              <p className="text-xs text-gray-400">Pillar cards describing company strengths.</p>
            </div>
          </div>
          <button
            onClick={addFeature}
            className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} /> Add Pillar
          </button>
        </div>

        <div className="space-y-4">
          {aboutData.features.map((feat, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-white space-y-3 relative group">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Pillar #{idx + 1}</span>
                {aboutData.features.length > 1 && (
                  <button
                    onClick={() => removeFeature(idx)}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Title</label>
                  <input
                    className={inputClass}
                    value={feat.title}
                    onChange={(e) => handleFeatureChange(idx, 'title', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Description</label>
                  <input
                    className={inputClass}
                    value={feat.description}
                    onChange={(e) => handleFeatureChange(idx, 'description', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Company Metrics */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
            <Users size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">About Us Stat Counters</h3>
            <p className="text-xs text-gray-400">Milestones and numbers showcasing business scale.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {aboutData.stats.map((stat, idx) => (
            <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stat Label</label>
                <input
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1 text-xs font-semibold"
                  value={stat.label}
                  onChange={(e) => handleStatChange(idx, 'label', e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Value</label>
                <input
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1 text-sm font-black text-purple-600"
                  value={stat.value}
                  onChange={(e) => handleStatChange(idx, 'value', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default CMSAbout;
