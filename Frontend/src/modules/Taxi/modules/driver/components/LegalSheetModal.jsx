import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ShieldCheck, X, ExternalLink, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../../shared/api/axiosInstance';

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
      try {
        const normalizedRole = String(role || 'driver').toLowerCase();
        let targetKey = '';

        if (activeTab === 'terms') {
          targetKey = normalizedRole === 'driver' ? 'driver-terms' : 'terms';
        } else {
          targetKey = normalizedRole === 'driver' ? 'driver-privacy' : 'privacy';
        }

        const response = await api.get(`/food/pages/${targetKey}`);
        if (isMounted) {
          const result = response?.data || response;
          setContentData({
            title:
              result?.title ||
              (activeTab === 'terms'
                ? 'Terms & Conditions'
                : 'Privacy Policy'),
            content: result?.content || '',
          });
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load legal content:', err);
          setContentData({
            title:
              activeTab === 'terms'
                ? 'Terms & Conditions'
                : 'Privacy Policy',
            content:
              '<p>Unable to load content right now. Please check full page or try again later.</p>',
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLegalContent();
    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, role]);

  if (!isOpen) return null;

  const handleOpenFullPage = () => {
    if (onNavigateFull) {
      onNavigateFull(activeTab);
    } else {
      navigate(activeTab === 'terms' ? '/terms' : '/privacy', {
        state: { role, returnTo: window.location.pathname },
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
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-[color:var(--app-primary,#F38F24)] flex items-center justify-center border border-orange-100">
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
              className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors"
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
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
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
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
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
                className="prose prose-sm max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-p:text-slate-600 prose-p:leading-relaxed prose-a:text-orange-600"
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
              className="text-xs font-bold text-slate-600 hover:text-[color:var(--app-primary,#F38F24)] flex items-center gap-1 transition-colors"
            >
              <ExternalLink size={13} />
              Full Page View
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-sm transition-all"
            >
              I Understand & Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
