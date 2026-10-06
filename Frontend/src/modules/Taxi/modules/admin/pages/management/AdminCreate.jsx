import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  LockKeyhole,
  MapPinned,
  Search,
  Shield,
  UserRound,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import {
  ADMIN_PERMISSION_GROUPS,
  resourcePermissionsFromFlat,
  flattenResourcePermissions,
  getCreatableAdminTypes,
  isTaxiSuperAdminLike,
  parentCanAssignRead,
  parentCanAssignWrite,
  ADMIN_LEVELS,
} from '../../constants/adminAccess';
import { getUnifiedAdminProfile } from '../../services/adminSession';

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#1D4ED8] focus:ring-4 focus:ring-blue-100';
const labelClass = 'mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  role: 'Operations Subadmin',
  admin_type: 'subadmin',
  resourcePermissions: {},
  service_location_ids: [],
  zone_ids: [],
  password: '',
  passwordConfirmation: '',
  active: true,
};

const PermissionCheckbox = ({ checked, label, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
      checked
        ? 'border-blue-200 bg-blue-50 text-blue-900 font-bold'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 font-semibold'
    }`}
  >
    <span className="text-sm">{label}</span>
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full border ${
        checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'
      }`}
    >
      <Check size={12} />
    </span>
  </button>
);

const AccessToggle = ({ checked, label, disabled = false, onChange }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onChange}
    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
      checked
        ? 'border-blue-200 bg-blue-50 text-blue-800'
        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
    }`}
  >
    <span
      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
        checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'
      }`}
    >
      <Check size={10} />
    </span>
    {label}
  </button>
);

const AdminCreate = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const currentAdmin = getUnifiedAdminProfile() || {};

  const [form, setForm] = useState(initialForm);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const creatableTypes = useMemo(() => getCreatableAdminTypes(currentAdmin), [currentAdmin]);
  const isSuperTarget = form.admin_type === 'superadmin' || form.admin_type === 'taxi_superadmin';

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [serviceLocationResponse, zoneResponse, adminResponse] = await Promise.all([
          adminService.getServiceLocations(),
          adminService.getZones(),
          isEdit ? adminService.getAdminById(id).catch(() => adminService.getAdmins()) : Promise.resolve(null),
        ]);

        const nextServiceLocations = Array.isArray(serviceLocationResponse?.data)
          ? serviceLocationResponse.data
          : serviceLocationResponse?.data?.results || serviceLocationResponse?.data?.locations || [];
        const nextZones = Array.isArray(zoneResponse?.data?.results)
          ? zoneResponse.data.results
          : Array.isArray(zoneResponse?.data)
          ? zoneResponse.data
          : zoneResponse?.data?.zones || [];

        setServiceLocations(nextServiceLocations);
        setZones(nextZones);

        if (isEdit) {
          const rawAdmin = adminResponse?.data?.results || adminResponse?.data;
          const existingAdmin = Array.isArray(rawAdmin)
            ? rawAdmin.find((item) => String(item.id || item._id) === String(id))
            : rawAdmin;
          if (!existingAdmin || !existingAdmin._id && !existingAdmin.id) {
            toast.error('Admin account not found.');
            navigate('/taxi/admin/management/admins');
            return;
          }

          setForm({
            name: existingAdmin.name || '',
            email: existingAdmin.email || '',
            phone: existingAdmin.phone || '',
            role: existingAdmin.role || 'Operations Subadmin',
            admin_type: existingAdmin.admin_type || 'subadmin',
            resourcePermissions: resourcePermissionsFromFlat(existingAdmin.permissions || []),
            service_location_ids: Array.isArray(existingAdmin.service_location_ids)
              ? existingAdmin.service_location_ids.map((item) => String(item._id || item.id || item))
              : [],
            zone_ids: Array.isArray(existingAdmin.zone_ids)
              ? existingAdmin.zone_ids.map((item) => String(item._id || item.id || item))
              : [],
            password: '',
            passwordConfirmation: '',
            active: existingAdmin.active !== false,
          });
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || error?.message || 'Unable to load admin setup data.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEdit, navigate]);

  const visibleZones = useMemo(() => {
    if (isSuperTarget || !form.service_location_ids || form.service_location_ids.length === 0) {
      return zones;
    }

    const serviceLocationSet = new Set((form.service_location_ids || []).map(String));
    const matched = zones.filter((zone) => {
      const locId = String(
        zone.service_location_id?._id ||
        zone.service_location_id?.id ||
        zone.service_location_id ||
        zone.serviceLocationId ||
        zone.service_location ||
        ''
      );
      return !locId || locId === 'undefined' || locId === 'null' || serviceLocationSet.has(locId);
    });

    return matched.length > 0 ? matched : zones;
  }, [isSuperTarget, form.service_location_ids, zones]);

  useEffect(() => {
    if (isSuperTarget) {
      setForm((current) => ({
        ...current,
        resourcePermissions: {},
        service_location_ids: [],
        zone_ids: [],
      }));
    }
  }, [isSuperTarget]);

  const filteredPermissionGroups = useMemo(() => {
    if (isSuperTarget) return [];
    const query = permissionSearch.trim().toLowerCase();

    return ADMIN_PERMISSION_GROUPS.map((group) => {
      const assignableItems = group.items.filter(
        (item) => parentCanAssignRead(currentAdmin, item.key) || parentCanAssignWrite(currentAdmin, item.key)
      );

      const items = query
        ? assignableItems.filter(
            (item) =>
              item.label.toLowerCase().includes(query) ||
              item.key.toLowerCase().includes(query) ||
              group.title.toLowerCase().includes(query)
          )
        : assignableItems;

      return {
        ...group,
        items,
      };
    }).filter((group) => group.items.length > 0);
  }, [currentAdmin, isSuperTarget, permissionSearch]);

  const setResourceAccess = (resource, action, enabled) => {
    setForm((current) => {
      const next = {
        ...(current.resourcePermissions || {}),
        [resource]: {
          read: Boolean(current.resourcePermissions?.[resource]?.read),
          write: Boolean(current.resourcePermissions?.[resource]?.write),
        },
      };

      if (action === 'read') {
        next[resource].read = enabled;
      } else {
        next[resource].write = enabled;
      }

      if (!next[resource].read && !next[resource].write) {
        delete next[resource];
      }

      return { ...current, resourcePermissions: next };
    });
  };

  const handleMultiSelect = (key, value) => {
    setForm((current) => {
      const currentValues = Array.isArray(current[key]) ? current[key] : [];
      return {
        ...current,
        [key]: currentValues.includes(value)
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    const failSubmit = (message) => {
      setSubmitError(message);
      toast.error(message);
    };

    const nameTrimmed = form.name.trim();
    if (!nameTrimmed) {
      failSubmit('Name is required.');
      return;
    }
    if (nameTrimmed.length < 2) {
      failSubmit('Name must be at least 2 characters.');
      return;
    }

    const emailTrimmed = form.email.trim();
    if (!emailTrimmed) {
      failSubmit('Email is required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      failSubmit('Please enter a valid email address.');
      return;
    }

    const phoneTrimmed = form.phone.trim();
    if (!phoneTrimmed) {
      failSubmit('Phone number is required.');
      return;
    }
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phoneTrimmed)) {
      failSubmit('Please enter a valid 10-digit phone number (must start with 6, 7, 8, or 9).');
      return;
    }

    if (!isSuperTarget) {
      const roleTrimmed = form.role.trim();
      if (!roleTrimmed) {
        failSubmit('Role label is required.');
        return;
      }
    }

    if (!isEdit && !form.password.trim()) {
      failSubmit('Password is required for new admins.');
      return;
    }

    if (form.password || form.passwordConfirmation) {
      if (form.password.length < 5) {
        failSubmit('Password must be at least 5 characters long.');
        return;
      }
      if (form.password !== form.passwordConfirmation) {
        failSubmit('Passwords do not match.');
        return;
      }
    }

    const permissions = isSuperTarget ? [] : flattenResourcePermissions(form.resourcePermissions);

    if (!isSuperTarget && permissions.length === 0) {
      failSubmit('Select at least one permission for the subadmin.');
      return;
    }

    const payload = {
      name: nameTrimmed,
      email: emailTrimmed,
      phone: phoneTrimmed,
      role: isSuperTarget ? 'superadmin' : form.role.trim(),
      admin_type: isSuperTarget ? 'superadmin' : 'subadmin',
      adminLevel: isSuperTarget ? ADMIN_LEVELS.TAXI_SUPERADMIN : ADMIN_LEVELS.SUBADMIN,
      module: 'taxi',
      permissions,
      service_location_ids: isSuperTarget ? [] : form.service_location_ids,
      zone_ids: isSuperTarget ? [] : form.zone_ids,
      active: form.active,
      status: form.active ? 'active' : 'inactive',
      password: form.password,
      passwordConfirmation: form.passwordConfirmation,
      password_confirmation: form.passwordConfirmation,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await adminService.updateAdminAccount(id, payload);
        toast.success('Admin account updated.');
      } else {
        await adminService.createAdminAccount(payload);
        toast.success(isSuperTarget ? 'Taxi super admin created.' : 'Subadmin created.');
      }
      navigate('/taxi/admin/management/admins');
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Unable to save admin account.';
      failSubmit(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={30} className="animate-spin text-blue-600" />
          <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Preparing access form</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#EFF6FF_0%,_#F8FAFC_32%)] p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              <span>Admin Management</span>
              <ChevronRight size={12} />
              <span className="text-slate-700">{isEdit ? 'Edit Admin' : 'Create Admin'}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              {isEdit ? 'Update Scoped Access' : 'Create Scoped Admin'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
              Assign read or write access per module, then limit the account to the right service locations and working zones.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/taxi/admin/management/admins')}
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
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
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
                    <div className="grid grid-cols-2 gap-3">
                      {creatableTypes.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setField('admin_type', option.key)}
                          className={`w-full min-w-0 rounded-2xl border px-4 py-3 text-center text-sm font-bold transition-all ${
                            form.admin_type === option.key
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-white text-slate-500'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Name</label>
                  <input
                    value={form.name}
                    onChange={(event) => setField('name', event.target.value.slice(0, 60))}
                    placeholder="Enter full name"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setField('email', event.target.value.replace(/\s/g, '').slice(0, 100))}
                    placeholder="Enter email address"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(event) => setField('phone', event.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Enter 10-digit phone number"
                    className={inputClass}
                  />
                </div>
                {!isSuperTarget && (
                  <div>
                    <label className={labelClass}>Role Label</label>
                    <input
                      value={form.role}
                      onChange={(event) => setField('role', event.target.value.slice(0, 50))}
                      placeholder="e.g. Operations Subadmin"
                      className={inputClass}
                    />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Account Status</label>
                  <button
                    type="button"
                    onClick={() => setField('active', !form.active)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                      form.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                  >
                    <span>{form.active ? 'Active account' : 'Inactive account'}</span>
                    <span className="text-xs font-black uppercase tracking-[0.18em]">
                      {form.active ? 'Enabled' : 'Disabled'}
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
                    {isEdit ? 'Leave blank to keep the current password.' : 'Set initial login password.'}
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setField('password', event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Confirm Password</label>
                  <input
                    type="password"
                    value={form.passwordConfirmation}
                    onChange={(event) => setField('passwordConfirmation', event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 xl:col-span-8">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
                    <Shield size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Sidebar Permissions</h3>
                    <p className="text-xs font-semibold text-slate-500">Choose read-only or read+write access for each module.</p>
                  </div>
                </div>

                {!isSuperTarget && (
                  <div className="relative min-w-[240px]">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search (driver, ride, zone)..."
                      value={permissionSearch}
                      onChange={(e) => setPermissionSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                )}
              </div>

              {isSuperTarget ? (
                <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
                  Superadmin inherits all sidebar menus and API permissions automatically.
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredPermissionGroups.length === 0 ? (
                    <div className="py-8 text-center text-sm font-semibold text-slate-400">
                      No matching permissions found for "{permissionSearch}".
                    </div>
                  ) : (
                    filteredPermissionGroups.map((group) => (
                      <div key={group.title} className="space-y-3">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{group.title}</div>
                        <div className="space-y-3">
                          {group.items.map((item) => {
                            const access = form.resourcePermissions?.[item.key] || { read: false, write: false };
                            const canAssignRead = parentCanAssignRead(currentAdmin, item.key);
                            const canAssignWrite = !item.readOnly && parentCanAssignWrite(currentAdmin, item.key);

                            const isDriverItem = item.key === 'drivers';
                            const isTripsItem = item.key === 'trips';
                            const isOngoingItem = item.key === 'ongoing';
                            const isZonesItem = item.key === 'zones';

                            return (
                              <div
                                key={item.key}
                                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-black text-slate-900">{item.label}</p>
                                    {isDriverItem && (
                                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                                        ★ Active Drivers
                                      </span>
                                    )}
                                    {isTripsItem && (
                                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-800">
                                        ★ Ride Details
                                      </span>
                                    )}
                                    {isOngoingItem && (
                                      <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-violet-800">
                                        ★ Live Rides
                                      </span>
                                    )}
                                    {isZonesItem && (
                                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                                        ★ Working Zone Config
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-semibold text-slate-500">
                                    {item.readOnly ? 'Read access only' : 'Read or write access'}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <AccessToggle
                                    label="Read"
                                    checked={access.read}
                                    disabled={!canAssignRead}
                                    onChange={() => setResourceAccess(item.key, 'read', !access.read)}
                                  />
                                  {!item.readOnly && (
                                    <AccessToggle
                                      label="Write"
                                      checked={access.write}
                                      disabled={!canAssignWrite}
                                      onChange={() => setResourceAccess(item.key, 'write', !access.write)}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <MapPinned size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Working Zone & Location Scope</h3>
                  <p className="text-xs font-semibold text-slate-500">Assign specific cities (Service Locations) and working zones where this subadmin will operate.</p>
                </div>
              </div>

              {isSuperTarget ? (
                <div className="rounded-3xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-bold text-blue-800">
                  Superadmin scope stays global, so no location or zone limits are applied.
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className={labelClass}>Assigned Service Locations (Cities / Regions)</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {serviceLocations.map((location) => {
                        const value = String(location._id || location.id || '');
                        const checked = form.service_location_ids.includes(value);

                        return (
                          <PermissionCheckbox
                            key={value}
                            checked={checked}
                            label={`${location.service_location_name || location.name} ${location.country ? `• ${location.country}` : ''}`}
                            onChange={() => handleMultiSelect('service_location_ids', value)}
                          />
                        );
                      })}
                      {serviceLocations.length === 0 && (
                        <p className="text-sm font-semibold text-slate-400 md:col-span-2">No service locations configured yet.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className={labelClass}>Assigned Working Zones</div>
                      <span className="text-[11px] font-bold text-slate-400">
                        {visibleZones.length} Zone{visibleZones.length === 1 ? '' : 's'} Available
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {visibleZones.map((zone) => {
                        const value = String(zone._id || zone.id || '');
                        const checked = form.zone_ids.includes(value);
                        return (
                          <PermissionCheckbox
                            key={value}
                            checked={checked}
                            label={zone.name || 'Unnamed Zone'}
                            onChange={() => handleMultiSelect('zone_ids', value)}
                          />
                        );
                      })}
                      {visibleZones.length === 0 && (
                        <p className="text-sm font-semibold text-slate-400 md:col-span-2">No zones configured yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:flex-row sm:items-center sm:justify-end">
              {submitError ? (
                <p className="mr-auto text-sm font-semibold text-rose-600 sm:max-w-md">{submitError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('/taxi/admin/management/admins')}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1D4ED8] px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {isEdit ? 'Update Admin Access' : 'Create Admin Access'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminCreate;
