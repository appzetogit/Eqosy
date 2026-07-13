import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  LockKeyhole,
  MapPinned,
  Shield,
  UserRound,
} from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { adminAPI } from "@/services/api";
import {
  ADMIN_LEVELS,
  FOOD_PERMISSION_GROUPS,
  flattenResourcePermissions,
  getCreatableAdminTypes,
  isFoodSuperAdminLike,
  parentCanAssignRead,
  parentCanAssignWrite,
  resourcePermissionsFromFlat,
} from "@food/constants/foodAdminAccess";
import { getCurrentUser } from "@food/utils/auth";
import { Skeleton } from "@food/components/ui/skeleton";

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100";
const labelClass = "mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500";

const getApiErrorMessage = (error, fallback) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;

const initialForm = {
  name: "",
  email: "",
  phone: "",
  role: "Operations Subadmin",
  adminTargetType: "subadmin",
  resourcePermissions: {},
  food_zone_ids: [],
  password: "",
  passwordConfirmation: "",
  active: true,
};

const formFromAdmin = (admin) => {
  if (!admin) return initialForm;
  const adminLevel = String(admin.adminLevel || "").toLowerCase();
  return {
    name: admin.name || "",
    email: admin.email || "",
    phone: admin.phone || "",
    role: admin.role || "Operations Subadmin",
    adminTargetType:
      adminLevel === ADMIN_LEVELS.FOOD_SUPERADMIN ? ADMIN_LEVELS.FOOD_SUPERADMIN : ADMIN_LEVELS.SUBADMIN,
    resourcePermissions: resourcePermissionsFromFlat(admin.permissions || []),
    food_zone_ids: Array.isArray(admin.food_zone_ids) ? admin.food_zone_ids.map(String) : [],
    password: "",
    passwordConfirmation: "",
    active: admin.active !== false,
  };
};

const AccessToggle = ({ checked, label, disabled = false, onChange }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onChange}
    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
      checked
        ? "border-orange-200 bg-orange-50 text-orange-800"
        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
    }`}
  >
    <span
      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
        checked ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300 bg-white text-transparent"
      }`}
    >
      <Check size={10} />
    </span>
    {label}
  </button>
);

export default function FoodSubadminCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const prefilledAdmin = location.state?.admin;
  const currentAdmin = getCurrentUser("admin") || {};
  const [form, setForm] = useState(() => {
    if (isEdit) {
      if (prefilledAdmin && String(prefilledAdmin.id || prefilledAdmin._id) === String(id)) {
        return formFromAdmin(prefilledAdmin);
      }
      return initialForm;
    }
    try {
      const saved = localStorage.getItem("food_subadmin_create_form");
      if (saved) {
        return {
          ...initialForm,
          ...JSON.parse(saved),
        };
      }
    } catch (e) {
      console.error("Failed to parse saved subadmin form data", e);
    }
    return initialForm;
  });
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(
    isEdit && (!prefilledAdmin || String(prefilledAdmin.id || prefilledAdmin._id) !== String(id)),
  );
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const creatableTypes = useMemo(() => getCreatableAdminTypes(currentAdmin), [currentAdmin]);
  const isFoodSuperTarget = form.adminTargetType === ADMIN_LEVELS.FOOD_SUPERADMIN;

  const assignableGroups = useMemo(() => {
    if (isFoodSuperTarget) return [];
    return FOOD_PERMISSION_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => parentCanAssignRead(currentAdmin, item.key) || parentCanAssignWrite(currentAdmin, item.key),
      ),
    })).filter((group) => group.items.length > 0);
  }, [currentAdmin, isFoodSuperTarget]);

  const scopedZones = useMemo(() => zones, [zones]);

  const hydrateFormFromAdmin = (admin) => {
    setForm(formFromAdmin(admin));
  };

  useEffect(() => {
    let cancelled = false;

    const loadZones = async () => {
      setZonesLoading(true);
      setZonesError("");
      try {
        const zoneResponse = await adminAPI.getAssignableFoodZones();
        if (cancelled) return;
        const zonePayload = zoneResponse?.data?.data || zoneResponse?.data || {};
        const nextZones = Array.isArray(zonePayload?.zones) ? zonePayload.zones : [];
        setZones(nextZones);
        if (nextZones.length === 0 && zoneResponse?.data?.success === false) {
          setZonesError(zoneResponse?.data?.message || "Unable to load food zones.");
        }
      } catch (error) {
        if (!cancelled) {
          const message = getApiErrorMessage(error, "Unable to load food zones.");
          setZonesError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setZonesLoading(false);
      }
    };

    const loadAdmin = async () => {
      if (!isEdit) return;

      if (prefilledAdmin && String(prefilledAdmin.id || prefilledAdmin._id) === String(id)) {
        hydrateFormFromAdmin(prefilledAdmin);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const adminResponse = await adminAPI.getFoodAdminById(id);
        if (cancelled) return;
        const admin = adminResponse?.data?.data || adminResponse?.data;
        if (!admin) {
          toast.error("Admin account not found.");
          navigate("/admin/food/management/admins");
          return;
        }
        hydrateFormFromAdmin(admin);
      } catch (error) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(error, "Unable to load admin account."));
          navigate("/admin/food/management/admins");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadZones();
    loadAdmin();

    return () => {
      cancelled = true;
    };
  }, [id, isEdit, navigate, prefilledAdmin]);

  useEffect(() => {
    if (isFoodSuperTarget) {
      setForm((current) => ({
        ...current,
        resourcePermissions: {},
        food_zone_ids: [],
      }));
    }
  }, [isFoodSuperTarget]);

  useEffect(() => {
    if (!isEdit) {
      const { password, passwordConfirmation, ...persistedData } = form;
      localStorage.setItem("food_subadmin_create_form", JSON.stringify(persistedData));
    }
  }, [form, isEdit]);

  const setResourceAccess = (resource, action, enabled) => {
    setForm((current) => {
      const next = {
        ...(current.resourcePermissions || {}),
        [resource]: {
          read: Boolean(current.resourcePermissions?.[resource]?.read),
          write: Boolean(current.resourcePermissions?.[resource]?.write),
        },
      };

      if (action === "read") {
        next[resource].read = enabled;
        if (!enabled) next[resource].write = false;
      } else {
        next[resource].write = enabled;
        if (enabled) next[resource].read = true;
      }

      if (!next[resource].read && !next[resource].write) {
        delete next[resource];
      }

      return { ...current, resourcePermissions: next };
    });
  };

  const handleMultiSelect = (value) => {
    setForm((current) => {
      const currentValues = Array.isArray(current.food_zone_ids) ? current.food_zone_ids : [];
      return {
        ...current,
        food_zone_ids: currentValues.includes(value)
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    const failSubmit = (message) => {
      setSubmitError(message);
      toast.error(message);
    };

    const nameTrimmed = form.name.trim();
    if (!nameTrimmed) {
      failSubmit("Name is required.");
      return;
    }
    if (nameTrimmed.length < 2) {
      failSubmit("Name must be at least 2 characters.");
      return;
    }

    const emailTrimmed = form.email.trim();
    if (!emailTrimmed) {
      failSubmit("Email is required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      failSubmit("Please enter a valid email address.");
      return;
    }

    const phoneTrimmed = form.phone.trim();
    if (!phoneTrimmed) {
      failSubmit("Phone number is required.");
      return;
    }
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phoneTrimmed)) {
      failSubmit("Please enter a valid 10-digit phone number (must start with 6, 7, 8, or 9).");
      return;
    }

    const isSuperTarget = form.adminTargetType === ADMIN_LEVELS.FOOD_SUPERADMIN;

    if (!isSuperTarget) {
      const roleTrimmed = form.role.trim();
      if (!roleTrimmed) {
        failSubmit("Role label is required.");
        return;
      }
      if (roleTrimmed.length < 2) {
        failSubmit("Role label must be at least 2 characters.");
        return;
      }
    }

    if (!isEdit && !form.password.trim()) {
      failSubmit("Password is required for new admins.");
      return;
    }

    if (form.password || form.passwordConfirmation) {
      if (form.password.length < 8) {
        failSubmit("Password must be at least 8 characters long.");
        return;
      }
      if (form.password !== form.passwordConfirmation) {
        failSubmit("Passwords do not match.");
        return;
      }
    }
    const permissions = isSuperTarget ? [] : flattenResourcePermissions(form.resourcePermissions);

    if (!isSuperTarget && permissions.length === 0) {
      failSubmit("Select at least one permission.");
      return;
    }

    if (!isSuperTarget && form.food_zone_ids.length === 0) {
      failSubmit("Assign at least one food zone.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      role: isSuperTarget ? "superadmin" : form.role.trim(),
      admin_type: isSuperTarget ? "superadmin" : "subadmin",
      adminLevel: isSuperTarget ? ADMIN_LEVELS.FOOD_SUPERADMIN : ADMIN_LEVELS.SUBADMIN,
      module: "food",
      permissions,
      food_zone_ids: isSuperTarget ? [] : form.food_zone_ids,
      active: form.active,
      status: form.active ? "active" : "inactive",
      password: form.password,
      passwordConfirmation: form.passwordConfirmation,
      password_confirmation: form.passwordConfirmation,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await adminAPI.updateFoodAdminAccount(id, payload);
        toast.success("Admin account updated.");
      } else {
        await adminAPI.createFoodAdminAccount(payload);
        toast.success(isSuperTarget ? "Food super admin created." : "Subadmin created.");
        localStorage.removeItem("food_subadmin_create_form");
      }
      navigate("/admin/food/management/admins");
    } catch (error) {
      const message = getApiErrorMessage(error, "Unable to save admin account.");
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={30} className="animate-spin text-orange-600" />
          <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Loading admin account</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#FFF7ED_0%,_#F8FAFC_32%)] p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              <span>Admin Management</span>
              <ChevronRight size={12} />
              <span className="text-slate-700">{isEdit ? "Edit Admin" : "Create Admin"}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              {isEdit ? "Update Scoped Access" : "Create Scoped Admin"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
              Assign read or write access per module, then limit the account to the right food zones.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/admin/food/management/admins")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Admins
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-4">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-orange-50 p-3 text-orange-700">
                  <UserRound size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Identity</h3>
                  <p className="text-xs font-semibold text-slate-500">Who will use this access profile</p>
                </div>
              </div>

              <div className="space-y-5">
                 {creatableTypes.length > 1 && (
                  <div>
                    <label className={labelClass}>Admin Type</label>
                    <div className="grid grid-cols-2 gap-4">
                      {creatableTypes.map((option) => {
                        const isSelected = form.adminTargetType === option.key;
                        const isSuper = option.key === 'food_superadmin';
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setField("adminTargetType", option.key)}
                            className={`rounded-[24px] border-2 py-5 px-4 text-center transition-all ${
                              isSelected
                                ? "border-orange-500 bg-orange-50/50 text-orange-600 font-extrabold shadow-sm"
                                : "border-slate-100 bg-white text-slate-500 font-bold hover:border-slate-200 hover:bg-slate-50/30"
                            }`}
                          >
                            <div className="flex flex-col items-center justify-center leading-tight">
                              <span className="text-[15px]">{isSuper ? "Super" : "Sub"}</span>
                              <span className="text-[15px]">Admin</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-zA-Z\s.-]/g, "").slice(0, 50);
                      setField("name", val);
                    }}
                    placeholder="Enter name"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\s/g, "").slice(0, 100);
                      setField("email", val);
                    }}
                    placeholder="Enter email address"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setField("phone", val);
                    }}
                    placeholder="Enter 10-digit phone number"
                    className={inputClass}
                  />
                </div>
                {!isFoodSuperTarget && (
                  <div>
                    <label className={labelClass}>Role Label</label>
                    <input
                      value={form.role}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^a-zA-Z0-9\s.-]/g, "").slice(0, 50);
                        setField("role", val);
                      }}
                      placeholder="e.g. Operations Subadmin"
                      className={inputClass}
                    />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Account Status</label>
                  <button
                    type="button"
                    onClick={() => setField("active", !form.active)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                      form.active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <span>{form.active ? "Active account" : "Inactive account"}</span>
                    <span className="text-xs font-black uppercase tracking-[0.18em]">
                      {form.active ? "Enabled" : "Disabled"}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <LockKeyhole size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Credentials</h3>
                  <p className="text-xs font-semibold text-slate-500">
                    {isEdit ? "Leave blank to keep the current password." : "Set initial login password."}
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Confirm Password</label>
                  <input
                    type="password"
                    value={form.passwordConfirmation}
                    onChange={(e) => setField("passwordConfirmation", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 xl:col-span-8">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
                  <Shield size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Sidebar Permissions</h3>
                  <p className="text-xs font-semibold text-slate-500">
                    Choose read-only or read+write access for each module.
                  </p>
                </div>
              </div>

              {isFoodSuperTarget ? (
                <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
                  Food Super Admin inherits all sidebar menus and API permissions automatically.
                </div>
              ) : (
                <div className="space-y-6">
                  {assignableGroups.map((group) => (
                    <div key={group.title} className="space-y-3">
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{group.title}</div>
                      <div className="space-y-3">
                        {group.items.map((item) => {
                          const access = form.resourcePermissions?.[item.key] || { read: false, write: false };
                          const canAssignRead = parentCanAssignRead(currentAdmin, item.key);
                          const canAssignWrite = !item.readOnly && parentCanAssignWrite(currentAdmin, item.key);

                          return (
                            <div
                              key={item.key}
                              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="text-sm font-black text-slate-900">{item.label}</p>
                                <p className="text-xs font-semibold text-slate-500">
                                  {item.readOnly ? "Read access only" : "Read or write access"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <AccessToggle
                                  label="Read"
                                  checked={access.read}
                                  disabled={!canAssignRead}
                                  onChange={() => setResourceAccess(item.key, "read", !access.read)}
                                />
                                {!item.readOnly && (
                                  <AccessToggle
                                    label="Write"
                                    checked={access.write}
                                    disabled={!canAssignWrite}
                                    onChange={() => setResourceAccess(item.key, "write", !access.write)}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <MapPinned size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Food Zone Scope</h3>
                  <p className="text-xs font-semibold text-slate-500">
                    Subadmins only see records inside the zones selected here.
                  </p>
                </div>
              </div>

              {isFoodSuperTarget ? (
                <div className="rounded-3xl border border-orange-100 bg-orange-50 px-5 py-4 text-sm font-bold text-orange-800">
                  Food Super Admin scope stays global, so no zone limits are applied.
                </div>
              ) : zonesLoading ? (
                <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-500">
                  <Loader2 size={16} className="animate-spin text-orange-600" />
                  Loading zones...
                </div>
              ) : zonesError ? (
                <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
                  {zonesError}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {scopedZones.map((zone) => {
                    const value = String(zone._id || zone.id || "");
                    const checked = form.food_zone_ids.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleMultiSelect(value)}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                          checked
                            ? "border-orange-200 bg-orange-50 text-orange-900"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-sm font-bold">{zone.name || zone.zoneName || "Unnamed Zone"}</span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            checked ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300 bg-white text-transparent"
                          }`}
                        >
                          <Check size={12} />
                        </span>
                      </button>
                    );
                  })}
                  {scopedZones.length === 0 && (
                    <p className="text-sm font-semibold text-slate-400 md:col-span-2">
                      {isFoodSuperAdminLike(currentAdmin)
                        ? "No food zones exist yet. Create zones under Zone Setup first."
                        : "No zones in your scope. Ask your parent admin to assign food zones to your account."}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:flex-row sm:items-center sm:justify-end">
              {submitError ? (
                <p className="mr-auto text-sm font-semibold text-rose-600 sm:max-w-md">{submitError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => navigate("/admin/food/management/admins")}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-orange-200 transition-all hover:-translate-y-0.5 hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {isEdit ? "Update Admin Access" : "Create Admin Access"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
