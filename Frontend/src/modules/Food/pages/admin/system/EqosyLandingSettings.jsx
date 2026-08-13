import React, { useState, useRef, useEffect } from "react";
import {
  Save,
  Loader2,
  Upload,
  X,
  Image as ImageIcon,
  Type,
  FileText,
  Shield,
  Info,
  ChevronRight,
  Eye,
  CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@food/api";

/* ─── tiny helpers ──────────────────────────────────────────────────────── */
const fileToDataUrl = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = rej;
    r.readAsDataURL(file);
  });

/* ─── sub-components ────────────────────────────────────────────────────── */
const SectionCard = ({ title, icon: Icon, iconColor = "#6366f1", children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
    {title && (
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        {Icon && (
          <span
            className="size-8 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${iconColor}18`, color: iconColor }}
          >
            <Icon size={16} />
          </span>
        )}
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

const Field = ({ label, name, value, onChange, placeholder, type = "text", rows }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
      {label}
    </label>
    {type === "textarea" ? (
      <textarea
        rows={rows || 5}
        name={name}
        value={value || ""}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition resize-none shadow-xs"
      />
    ) : (
      <input
        type={type}
        name={name}
        value={value || ""}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition shadow-xs"
      />
    )}
  </div>
);

const LogoUploadBox = ({ label, size, preview, onUpload, onClear }) => {
  const ref = useRef(null);
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {label} <span className="text-gray-300 font-normal">({size})</span>
      </label>
      <div
        onClick={() => ref.current?.click()}
        className="relative aspect-[3/1] w-full rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer flex items-center justify-center overflow-hidden group"
      >
        {preview ? (
          <img
            src={preview}
            alt={label}
            className="max-h-full max-w-full object-contain p-4"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <Upload size={24} strokeWidth={1.5} />
            <span className="text-xs font-semibold">Click to upload</span>
          </div>
        )}

        <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ref.current?.click(); }}
            className="size-8 rounded-lg bg-white shadow border border-gray-200 flex items-center justify-center text-indigo-600 hover:bg-indigo-50"
          >
            <Upload size={13} />
          </button>
          {preview && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="size-8 rounded-lg bg-white shadow border border-gray-200 flex items-center justify-center text-red-500 hover:bg-red-50"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }}
        />
      </div>
    </div>
  );
};

/* ─── MAIN PAGE ─────────────────────────────────────────────────────────── */
const SETTINGS_KEY = "eqosy_landing_page_settings";

const defaultSettings = {
  // Branding
  navbar_logo: "/eqosy-logo.png",
  footer_logo: "/eqosy-logo.png",
  hero_video: "/eqosy_promotional_video.mp4",
  app_name: "Eqosy",
  tagline: "Everything your city needs. One powerful app.",
  hero_description: "Food, rides, groceries and parcel delivery — connected in one super app.",

  // Contact / Social
  support_email: "",
  support_phone: "",
  play_store_url: "",
  app_store_url: "",
  instagram_url: "",
  twitter_url: "",

  // Legal pages (rich text / markdown)
  terms_and_conditions: "",
  privacy_policy: "",
  refund_policy: "",
  about_us: "",
  cancellation_policy: "",

  // Footer
  footer_text: "© 2025 Eqosy. All rights reserved.",
  footer_tagline: "Made with ❤️ in India",
};

export default function EqosyLandingSettings() {
  const [settings, setSettings] = useState(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("branding");

  // Load from backend (or localStorage fallback)
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get("/admin/general-settings/landing-page");
        if (res.data?.settings) {
          setSettings((prev) => ({ ...prev, ...res.data.settings }));
        }
      } catch {
        // Fallback to localStorage
        try {
          const stored = localStorage.getItem(SETTINGS_KEY);
          if (stored) setSettings((prev) => ({ ...prev, ...JSON.parse(stored) }));
        } catch {}
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (name, value) => {
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = async (name, file) => {
    const dataUrl = await fileToDataUrl(file);
    handleChange(name, dataUrl);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch("/admin/general-settings/landing-page", { settings });
      // Persist locally as fallback
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      toast.success("Landing page settings saved!");
    } catch (err) {
      // If API doesn't exist yet, just save locally
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      toast.success("Settings saved locally! (Connect API to persist server-side)");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "branding",  label: "Branding & Logo",  icon: ImageIcon },
    { id: "content",   label: "Hero Content",      icon: Type },
    { id: "contact",   label: "Contact & Social",  icon: Info },
    { id: "legal",     label: "Terms & Privacy",   icon: Shield },
    { id: "footer",    label: "Footer",            icon: FileText },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* ── Page Header ── */}
      <div className="bg-white border-b border-gray-100 px-6 lg:px-10 py-5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div>
          <h1 className="text-base font-black text-gray-800 uppercase tracking-widest">
            Landing Page Settings
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-semibold mt-0.5">
            <span>System</span>
            <ChevronRight size={11} strokeWidth={3} />
            <span className="text-gray-600">Landing Page</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow transition-all disabled:opacity-60 active:scale-95"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="flex gap-0 max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
        {/* ── Sidebar Tabs ── */}
        <nav className="w-52 shrink-0 mr-8">
          <div className="sticky top-24 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${
                    active
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── Main Content ── */}
        <div className="flex-1 min-w-0">

          {/* ── BRANDING ── */}
          {activeTab === "branding" && (
            <>
              <SectionCard title="Navbar & Footer Logos" icon={ImageIcon} iconColor="#6366f1">
                <div className="grid md:grid-cols-2 gap-6">
                  <LogoUploadBox
                    label="Navbar Logo (Light)"
                    size="200×60px recommended"
                    preview={settings.navbar_logo || "/eqosy-logo.png"}
                    onUpload={(file) => handleLogoUpload("navbar_logo", file)}
                    onClear={() => handleChange("navbar_logo", "")}
                  />
                  <LogoUploadBox
                    label="Footer Logo"
                    size="200×60px recommended"
                    preview={settings.footer_logo || "/eqosy-logo.png"}
                    onUpload={(file) => handleLogoUpload("footer_logo", file)}
                    onClear={() => handleChange("footer_logo", "")}
                  />
                </div>
              </SectionCard>

              <SectionCard title="Hero Showcase Video" icon={ImageIcon} iconColor="#10b981">
                <div className="space-y-4">
                  <Field
                    label="Hero Video URL or Path"
                    name="hero_video"
                    value={settings.hero_video || "/eqosy_promotional_video.mp4"}
                    onChange={handleChange}
                    placeholder="/eqosy_promotional_video.mp4"
                  />
                  <div className="rounded-2xl border border-gray-200 bg-gray-900 p-4 max-w-lg">
                    <p className="text-xs text-gray-400 font-bold uppercase mb-2">Live Video Preview</p>
                    <video
                      src={settings.hero_video || "/eqosy_promotional_video.mp4"}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-44 object-cover rounded-xl border border-gray-800"
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="App Identity" icon={Type} iconColor="#f59e0b">
                <div className="grid md:grid-cols-2 gap-5">
                  <Field
                    label="App Name"
                    name="app_name"
                    value={settings.app_name}
                    onChange={handleChange}
                    placeholder="Eqosy"
                  />
                  <Field
                    label="Short Tagline"
                    name="tagline"
                    value={settings.tagline}
                    onChange={handleChange}
                    placeholder="Everything your city needs. One powerful app."
                  />
                </div>
              </SectionCard>
            </>
          )}

          {/* ── HERO CONTENT ── */}
          {activeTab === "content" && (
            <>
              <SectionCard title="Hero Section Text" icon={Type} iconColor="#3b82f6">
                <div className="space-y-5">
                  <Field
                    label="Main Headline"
                    name="tagline"
                    value={settings.tagline}
                    onChange={handleChange}
                    placeholder="Everything your city needs. One powerful app."
                  />
                  <Field
                    label="Hero Description"
                    name="hero_description"
                    value={settings.hero_description}
                    onChange={handleChange}
                    placeholder="Food, rides, groceries and parcel delivery — connected in one super app."
                    type="textarea"
                    rows={3}
                  />
                </div>
              </SectionCard>
            </>
          )}

          {/* ── CONTACT & SOCIAL ── */}
          {activeTab === "contact" && (
            <>
              <SectionCard title="Support Contact" icon={Info} iconColor="#10b981">
                <div className="grid md:grid-cols-2 gap-5">
                  <Field label="Support Email" name="support_email" value={settings.support_email} onChange={handleChange} placeholder="support@eqosy.app" type="email" />
                  <Field label="Support Phone" name="support_phone" value={settings.support_phone} onChange={handleChange} placeholder="+91 XXXXXXXXXX" />
                </div>
              </SectionCard>

              <SectionCard title="App Download Links" icon={Info} iconColor="#f59e0b">
                <div className="grid md:grid-cols-2 gap-5">
                  <Field label="Google Play URL" name="play_store_url" value={settings.play_store_url} onChange={handleChange} placeholder="https://play.google.com/..." />
                  <Field label="Apple App Store URL" name="app_store_url" value={settings.app_store_url} onChange={handleChange} placeholder="https://apps.apple.com/..." />
                </div>
              </SectionCard>

              <SectionCard title="Social Media" icon={Info} iconColor="#8b5cf6">
                <div className="grid md:grid-cols-2 gap-5">
                  <Field label="Instagram URL" name="instagram_url" value={settings.instagram_url} onChange={handleChange} placeholder="https://instagram.com/eqosy" />
                  <Field label="Twitter / X URL" name="twitter_url" value={settings.twitter_url} onChange={handleChange} placeholder="https://twitter.com/eqosy" />
                </div>
              </SectionCard>
            </>
          )}

          {/* ── TERMS & PRIVACY ── */}
          {activeTab === "legal" && (
            <>
              <div className="mb-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Shield size={14} />
                These policies are displayed on the landing page footer and app onboarding screens. Write in plain text or basic HTML.
              </div>

              <SectionCard title="Terms & Conditions" icon={FileText} iconColor="#6366f1">
                <Field
                  label="Terms & Conditions Content"
                  name="terms_and_conditions"
                  value={settings.terms_and_conditions}
                  onChange={handleChange}
                  placeholder="Enter your terms and conditions here..."
                  type="textarea"
                  rows={10}
                />
              </SectionCard>

              <SectionCard title="Privacy Policy" icon={Shield} iconColor="#3b82f6">
                <Field
                  label="Privacy Policy Content"
                  name="privacy_policy"
                  value={settings.privacy_policy}
                  onChange={handleChange}
                  placeholder="Enter your privacy policy here..."
                  type="textarea"
                  rows={10}
                />
              </SectionCard>

              <SectionCard title="Refund Policy" icon={FileText} iconColor="#f59e0b">
                <Field
                  label="Refund Policy Content"
                  name="refund_policy"
                  value={settings.refund_policy}
                  onChange={handleChange}
                  placeholder="Enter your refund and cancellation policy here..."
                  type="textarea"
                  rows={8}
                />
              </SectionCard>

              <SectionCard title="Cancellation Policy" icon={FileText} iconColor="#ef4444">
                <Field
                  label="Cancellation Policy Content"
                  name="cancellation_policy"
                  value={settings.cancellation_policy}
                  onChange={handleChange}
                  placeholder="Enter your cancellation policy here..."
                  type="textarea"
                  rows={8}
                />
              </SectionCard>

              <SectionCard title="About Us" icon={Info} iconColor="#10b981">
                <Field
                  label="About Us Content"
                  name="about_us"
                  value={settings.about_us}
                  onChange={handleChange}
                  placeholder="Tell users about Eqosy — the vision, the team, the mission..."
                  type="textarea"
                  rows={8}
                />
              </SectionCard>
            </>
          )}

          {/* ── FOOTER ── */}
          {activeTab === "footer" && (
            <SectionCard title="Footer Text" icon={FileText} iconColor="#667085">
              <div className="space-y-5">
                <Field
                  label="Copyright Text"
                  name="footer_text"
                  value={settings.footer_text}
                  onChange={handleChange}
                  placeholder="© 2025 Eqosy. All rights reserved."
                />
                <Field
                  label="Footer Tagline"
                  name="footer_tagline"
                  value={settings.footer_tagline}
                  onChange={handleChange}
                  placeholder="Made with ❤️ in India"
                />
              </div>

              {/* Preview */}
              <div className="mt-6 rounded-2xl border border-gray-100 bg-[#172033] p-6">
                <p className="text-xs text-gray-400 mb-3 uppercase tracking-wider font-bold">Footer Preview</p>
                <p className="text-sm text-gray-300">{settings.footer_text || "© 2025 Eqosy"}</p>
                <p className="text-xs text-gray-500 mt-1">{settings.footer_tagline || "Made with ❤️ in India"}</p>
              </div>
            </SectionCard>
          )}

          {/* ── Saved indicator ── */}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow transition-all disabled:opacity-60 active:scale-95"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {saving ? "Saving…" : "Save All Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
