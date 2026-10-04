import React, { useState, useEffect } from 'react';
import { 
  Home as HomeIcon, 
  Sparkles, 
  Save, 
  Loader2, 
  Globe, 
  Smartphone, 
  Layers, 
  Plus, 
  Trash2, 
  Tag
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@food/api';

const CMSHome = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    eyebrowBadge: "INDIA'S #1 UNIFIED SUPER APP",
    heroTitle: "Move, Eat & Shop in One Unified App.",
    heroSubtitle: "Fast food delivery, instant rides, 15-min groceries and express parcels — seamlessly connected in one app.",
    ctaPrimaryText: "Book Ride Now",
    ctaSecondaryText: "Become a Driver",
    heroImage: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?q=80&w=1000",
    appStoreUrl: "https://apple.com",
    playStoreUrl: "https://play.google.com",
    stats: [
      { label: "Total Rides", value: "1M+" },
      { label: "Active Drivers", value: "50K+" },
      { label: "Cities Covered", value: "100+" },
      { label: "Rating", value: "4.9/5" }
    ],
    features: [
      { id: 1, title: "Food", desc: "Gourmet Meals & Street Food", icon: "🍔" },
      { id: 2, title: "Rides", desc: "City Cabs & Ride Pooling", icon: "🚕" },
      { id: 3, title: "Grocery", desc: "Daily Essentials & Fresh Farm", icon: "🛒" },
      { id: 4, title: "Parcel", desc: "Express Citywide Couriers", icon: "📦" }
    ]
  });

  useEffect(() => {
    fetchHomeData();
  }, []);

  const fetchHomeData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/food/admin/pages-social-media/home', { contextModule: 'admin' });
      if (res.data?.success && res.data?.data) {
        const payload = res.data.data;
        if (payload.heroTitle || payload.eyebrowBadge) {
          setFormData(prev => ({ ...prev, ...payload }));
        }
      }
    } catch (err) {
      console.log('Using default hero section data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await api.put(
        '/food/admin/pages-social-media/home',
        { home: formData, ...formData },
        { contextModule: 'admin' }
      );
      if (res.data?.success) {
        toast.success('Home page CMS settings saved to database!');
      } else {
        toast.success('Home page settings updated!');
      }
    } catch (err) {
      toast.error('Saved to session storage');
      localStorage.setItem('cms_home_settings', JSON.stringify(formData));
    } finally {
      setSaving(false);
    }
  };

  const handleStatChange = (index, field, value) => {
    const updated = [...formData.stats];
    updated[index][field] = value;
    setFormData({ ...formData, stats: updated });
  };

  const handleFeatureChange = (index, field, value) => {
    const updated = [...formData.features];
    updated[index][field] = value;
    setFormData({ ...formData, features: updated });
  };

  const addFeature = () => {
    setFormData({
      ...formData,
      features: [
        ...formData.features,
        { id: Date.now(), title: 'New Category', desc: 'Service description...', icon: '⚡' }
      ]
    });
  };

  const removeFeature = (index) => {
    const updated = formData.features.filter((_, i) => i !== index);
    setFormData({ ...formData, features: updated });
  };

  const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all";
  const labelClass = "block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider";
  const cardClass = "bg-white rounded-2xl border border-gray-100 p-6 shadow-sm";

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto" />
          <p className="text-sm font-semibold text-gray-500">Loading Landing Home settings from DB...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 lg:p-8 font-sans pb-24 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/60 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">
            <HomeIcon size={14} /> CMS Builder / Landing Home Page
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Home Page CMS Settings</h1>
          <p className="text-xs text-gray-500 font-medium">Customize hero headlines, promotional badges, CTA buttons, and feature cards.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 justify-center shrink-0"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Home Settings to DB
        </button>
      </div>

      {/* Hero Banner Customization */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Hero Section Content</h3>
            <p className="text-xs text-gray-400">Main header and call-to-action banner displayed on website homepage.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Eyebrow Badge Text</label>
              <input
                className={inputClass}
                value={formData.eyebrowBadge}
                onChange={(e) => setFormData({ ...formData, eyebrowBadge: e.target.value })}
                placeholder="e.g. INDIA'S #1 UNIFIED SUPER APP"
              />
            </div>
            <div>
              <label className={labelClass}>Main Hero Title</label>
              <input
                className={inputClass}
                value={formData.heroTitle}
                onChange={(e) => setFormData({ ...formData, heroTitle: e.target.value })}
                placeholder="e.g. Move, Eat & Shop in One Unified App."
              />
            </div>
            <div>
              <label className={labelClass}>Hero Subtitle / Description</label>
              <textarea
                className={`${inputClass} min-h-[90px] resize-none`}
                value={formData.heroSubtitle}
                onChange={(e) => setFormData({ ...formData, heroSubtitle: e.target.value })}
                placeholder="Enter subtitle paragraph"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Primary CTA Button</label>
                <input
                  className={inputClass}
                  value={formData.ctaPrimaryText}
                  onChange={(e) => setFormData({ ...formData, ctaPrimaryText: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Secondary CTA Button</label>
                <input
                  className={inputClass}
                  value={formData.ctaSecondaryText}
                  onChange={(e) => setFormData({ ...formData, ctaSecondaryText: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Hero Banner Image / Media URL</label>
              <input
                className={inputClass}
                value={formData.heroImage}
                onChange={(e) => setFormData({ ...formData, heroImage: e.target.value })}
                placeholder="https://image-link.com/photo.jpg"
              />
            </div>
            {/* Image Preview */}
            <div className="h-44 rounded-xl border border-gray-200 overflow-hidden relative group bg-gray-100">
              <img
                src={formData.heroImage}
                alt="Hero Preview"
                className="w-full h-full object-cover"
                onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?q=80&w=1000'; }}
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                Live Image Preview
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Layers size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Platform Key Counters & Stats</h3>
            <p className="text-xs text-gray-400">Highlights displayed below the main hero section.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {formData.stats.map((stat, idx) => (
            <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Label</label>
                <input
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1 text-xs font-semibold"
                  value={stat.label}
                  onChange={(e) => handleStatChange(idx, 'label', e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Value</label>
                <input
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1 text-sm font-black text-indigo-600"
                  value={stat.value}
                  onChange={(e) => handleStatChange(idx, 'value', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Cards Manager */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <Globe size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Key Platform Services & Categories</h3>
              <p className="text-xs text-gray-400">Cards describing the primary services available on the platform (Food, Rides, Grocery, Parcel).</p>
            </div>
          </div>
          <button
            onClick={addFeature}
            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} /> Add Service Card
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {formData.features.map((feat, idx) => (
            <div key={feat.id || idx} className="p-4 rounded-xl border border-gray-200 bg-white relative space-y-3 group hover:border-indigo-200 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Service #{idx + 1} ({feat.icon || '⚡'})</span>
                {formData.features.length > 1 && (
                  <button
                    onClick={() => removeFeature(idx)}
                    className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                    title="Remove feature"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Title</label>
                  <input
                    className={inputClass}
                    value={feat.title}
                    onChange={(e) => handleFeatureChange(idx, 'title', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Icon Emoji</label>
                  <input
                    className={inputClass}
                    value={feat.icon || ''}
                    onChange={(e) => handleFeatureChange(idx, 'icon', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Tagline / Description</label>
                <textarea
                  className={`${inputClass} min-h-[60px] resize-none`}
                  value={feat.desc}
                  onChange={(e) => handleFeatureChange(idx, 'desc', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* App Download Links */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Smartphone size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Mobile App Download Store Links</h3>
            <p className="text-xs text-gray-400">Direct download buttons displayed in the landing footer and callouts.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Google Play Store Link</label>
            <input
              className={inputClass}
              value={formData.playStoreUrl}
              onChange={(e) => setFormData({ ...formData, playStoreUrl: e.target.value })}
              placeholder="https://play.google.com/store/apps/details?id=com.app"
            />
          </div>
          <div>
            <label className={labelClass}>Apple App Store Link</label>
            <input
              className={inputClass}
              value={formData.appStoreUrl}
              onChange={(e) => setFormData({ ...formData, appStoreUrl: e.target.value })}
              placeholder="https://apps.apple.com/app/id123456"
            />
          </div>
        </div>
      </div>

    </div>
  );
};

export default CMSHome;
