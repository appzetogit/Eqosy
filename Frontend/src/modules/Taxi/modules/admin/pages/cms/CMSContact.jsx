import React, { useState, useEffect } from 'react';
import { 
  PhoneCall, 
  Mail, 
  MapPin, 
  Clock, 
  Save, 
  Loader2, 
  Share2, 
  Globe, 
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../../../../shared/context/SettingsContext';

const CMSContact = () => {
  const { settings, updateSettings } = useSettings();
  const [saving, setSaving] = useState(false);

  const [contactData, setContactData] = useState({
    supportEmail: 'support@eqosy.com',
    supportPhone: '+91 98765 43210',
    tollFreeNumber: '1800 123 4567',
    whatsappHelpdesk: '+91 98765 43210',
    officeAddress: 'Eqosy Headquarters, Level 4, Tech Park, MG Road, Bengaluru, India 560001',
    workingHours: 'Monday - Sunday: 24/7 round-the-clock support',
    socials: {
      facebook: 'https://facebook.com/eqosy',
      twitter: 'https://twitter.com/eqosy',
      instagram: 'https://instagram.com/eqosy',
      linkedin: 'https://linkedin.com/company/eqosy',
      youtube: 'https://youtube.com/c/eqosy'
    },
    inquiryTopics: [
      'Ride Booking & Tariff Query',
      'Driver Registration & Documents',
      'Wallet & Refund Issues',
      'Franchise & Corporate Partnership'
    ]
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cms_contact_settings');
      if (saved) {
        setContactData(prev => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch (_) {}
  }, []);

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem('cms_contact_settings', JSON.stringify(contactData));
      if (updateSettings) {
        updateSettings({
          ...settings,
          cmsContact: contactData
        });
      }
      setTimeout(() => {
        setSaving(false);
        toast.success('Contact page CMS settings saved!');
      }, 500);
    } catch (err) {
      setSaving(false);
      toast.error('Failed to save contact settings');
    }
  };

  const handleSocialChange = (platform, val) => {
    setContactData({
      ...contactData,
      socials: {
        ...contactData.socials,
        [platform]: val
      }
    });
  };

  const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all";
  const labelClass = "block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider";
  const cardClass = "bg-white rounded-2xl border border-gray-100 p-6 shadow-sm";

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 lg:p-8 font-sans pb-24 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/60 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">
            <PhoneCall size={14} /> CMS Builder / Contact Us Page
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Contact Us Page CMS Settings</h1>
          <p className="text-xs text-gray-500 font-medium">Manage support phone numbers, email addresses, office location, working hours, and social channels.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 justify-center shrink-0"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Contact Details
        </button>
      </div>

      {/* Support Numbers & Emails */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Mail size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Direct Support Channels</h3>
            <p className="text-xs text-gray-400">Primary phone, WhatsApp, and email addresses visible to website visitors.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Customer Support Email</label>
            <input
              className={inputClass}
              value={contactData.supportEmail}
              onChange={(e) => setContactData({ ...contactData, supportEmail: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Support Phone Number</label>
            <input
              className={inputClass}
              value={contactData.supportPhone}
              onChange={(e) => setContactData({ ...contactData, supportPhone: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Toll Free Helpline</label>
            <input
              className={inputClass}
              value={contactData.tollFreeNumber}
              onChange={(e) => setContactData({ ...contactData, tollFreeNumber: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>WhatsApp Helpdesk Number</label>
            <input
              className={inputClass}
              value={contactData.whatsappHelpdesk}
              onChange={(e) => setContactData({ ...contactData, whatsappHelpdesk: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Physical Address & Hours */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <MapPin size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Headquarters & Operating Hours</h3>
            <p className="text-xs text-gray-400">Office location and support working hours.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Head Office Physical Address</label>
            <textarea
              className={`${inputClass} min-h-[80px] resize-none`}
              value={contactData.officeAddress}
              onChange={(e) => setContactData({ ...contactData, officeAddress: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Support Working Hours Description</label>
            <input
              className={inputClass}
              value={contactData.workingHours}
              onChange={(e) => setContactData({ ...contactData, workingHours: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Social Media Links */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
            <Share2 size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Social Media Links</h3>
            <p className="text-xs text-gray-400">Social platform profiles linked in landing website footer.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Facebook Page URL</label>
            <input
              className={inputClass}
              value={contactData.socials.facebook}
              onChange={(e) => handleSocialChange('facebook', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Twitter / X Profile URL</label>
            <input
              className={inputClass}
              value={contactData.socials.twitter}
              onChange={(e) => handleSocialChange('twitter', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Instagram Profile URL</label>
            <input
              className={inputClass}
              value={contactData.socials.instagram}
              onChange={(e) => handleSocialChange('instagram', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>LinkedIn Page URL</label>
            <input
              className={inputClass}
              value={contactData.socials.linkedin}
              onChange={(e) => handleSocialChange('linkedin', e.target.value)}
            />
          </div>
        </div>
      </div>

    </div>
  );
};

export default CMSContact;
