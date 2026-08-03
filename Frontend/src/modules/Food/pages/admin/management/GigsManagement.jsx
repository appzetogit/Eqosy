import React, { useState, useEffect } from 'react';
import { 
  Calendar, Clock, Plus, Users, CheckCircle2, AlertTriangle, XCircle, 
  Search, Filter, Edit, Trash2, X, RefreshCcw, ShieldCheck 
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { toast } from 'sonner';

export const GigsManagement = () => {
  const [gigs, setGigs] = useState([]);
  const [stats, setStats] = useState(null);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGig, setEditingGig] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomZone, setIsCustomZone] = useState(false);

  const [formData, setFormData] = useState({
    title: 'Lunch Peak Shift',
    date: new Date().toISOString().slice(0, 10),
    startTime: '12:00',
    endTime: '16:00',
    capacity: 20,
    zoneName: 'All Zones',
    cancellationCutoffMinutes: 60
  });

  const fetchGigs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/food/gigs/admin/gigs', {
        params: { date: selectedDate, status: statusFilter }
      });
      if (res.data?.success && res.data.data) {
        setGigs(res.data.data.gigs || []);
      }
    } catch (err) {
      toast.error('Failed to load gigs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiClient.get('/food/gigs/admin/gigs/stats');
      if (res.data?.success && res.data.data) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.warn('Failed to load gig stats:', err);
    }
  };

  const fetchZones = async () => {
    try {
      const res = await apiClient.get('/food/admin/zones');
      const list = res.data?.data?.zones || res.data?.zones || [];
      if (Array.isArray(list)) {
        setZones(list);
      }
    } catch (err) {
      console.warn('Failed to load zones:', err);
    }
  };

  useEffect(() => {
    fetchGigs();
    fetchStats();
    fetchZones();
  }, [selectedDate, statusFilter]);

  const handleCreateOrUpdateGig = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingGig) {
        await apiClient.patch(`/food/gigs/admin/gigs/${editingGig._id}`, formData);
        toast.success('Gig updated successfully');
      } else {
        await apiClient.post('/food/gigs/admin/gigs', formData);
        toast.success('Gig created successfully');
      }
      setShowCreateModal(false);
      setEditingGig(null);
      fetchGigs();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save gig');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateGig = async (gigId) => {
    if (!window.confirm('Are you sure you want to deactivate this gig slot?')) return;
    try {
      await apiClient.delete(`/food/gigs/admin/gigs/${gigId}`);
      toast.success('Gig deactivated');
      fetchGigs();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate gig');
    }
  };

  const openEditModal = (gig) => {
    setEditingGig(gig);
    const zName = gig.zoneName || 'All Zones';
    const knownNames = ['All Zones', ...zones.map((z) => z.name || z.serviceLocation || z.zoneName).filter(Boolean)];
    setIsCustomZone(!knownNames.includes(zName));
    setFormData({
      title: gig.title || 'Shift',
      date: gig.date || selectedDate,
      startTime: gig.startTime || '12:00',
      endTime: gig.endTime || '16:00',
      capacity: gig.capacity || 20,
      zoneName: zName,
      cancellationCutoffMinutes: gig.cancellationCutoffMinutes ?? 60
    });
    setShowCreateModal(true);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Operations Control</span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Delivery Gig & Shift Management</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">Configure predefined working slots, slot capacities, and track partner shift attendance.</p>
        </div>

        <button
          onClick={() => {
            setEditingGig(null);
            setIsCustomZone(false);
            setFormData({
              title: 'Shift',
              date: selectedDate,
              startTime: '12:00',
              endTime: '16:00',
              capacity: 20,
              zoneName: 'All Zones',
              cancellationCutoffMinutes: 60
            });
            setShowCreateModal(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Gig</span>
        </button>
      </div>

      {/* Attendance Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Total Bookings</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats?.totalBookings || 0}</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Completed Shifts</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600">{stats?.completed || 0}</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">No-Shows</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600">{stats?.noShow || 0}</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest">Attendance Rate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats?.attendanceRate || '100%'}</p>
        </div>
      </div>

      {/* Controls & Filters */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto no-scrollbar">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <button
          onClick={fetchGigs}
          className="p-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          title="Refresh List"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Gigs List / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400 font-bold text-xs">
            Loading gigs list...
          </div>
        ) : gigs.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
            <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-700">No Gigs Found for Selected Date</p>
            <p className="text-xs text-slate-400 mt-1">Click "Create New Gig" to add shift slots.</p>
          </div>
        ) : (
          gigs.map((gig) => (
            <div
              key={gig._id}
              className={`p-6 rounded-3xl bg-white border shadow-sm flex flex-col justify-between transition-all ${
                gig.status === 'inactive' ? 'border-slate-200 opacity-60' : 'border-slate-100 hover:border-emerald-300'
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                      {gig.zoneName || 'All Zones'}
                    </span>
                    <h3 className="text-lg font-black text-slate-900 mt-2">{gig.title}</h3>
                  </div>
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                      gig.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}
                  >
                    {gig.status}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-600 text-sm font-bold my-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>{gig.startTime} – {gig.endTime}</span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center my-3">
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Capacity</span>
                    <span className="text-sm font-black text-slate-900">{gig.capacity}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Booked</span>
                    <span className="text-sm font-black text-blue-600">{gig.bookedCount}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 block">No-Shows</span>
                    <span className="text-sm font-black text-rose-600">{gig.stats?.noShow || 0}</span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => openEditModal(gig)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                {gig.status === 'active' && (
                  <button
                    onClick={() => handleDeactivateGig(gig._id)}
                    className="p-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Deactivate Gig"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[500] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900">
                {editingGig ? 'Edit Gig Slot' : 'Create New Gig Slot'}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdateGig} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Shift Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Lunch Peak Shift"
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Zone Name</label>
                  {!isCustomZone ? (
                    <select
                      value={formData.zoneName}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomZone(true);
                          setFormData({ ...formData, zoneName: '' });
                        } else {
                          setFormData({ ...formData, zoneName: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-emerald-500 bg-white cursor-pointer"
                    >
                      <option value="All Zones">All Zones</option>
                      {Array.from(
                        new Set(
                          zones
                            .map((z) => z.name || z.serviceLocation || z.zoneName)
                            .filter(Boolean)
                        )
                      ).map((zoneName) => (
                        <option key={zoneName} value={zoneName}>
                          {zoneName}
                        </option>
                      ))}
                      <option value="__custom__">+ Enter Custom Zone Name...</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.zoneName}
                        onChange={(e) => setFormData({ ...formData, zoneName: e.target.value })}
                        placeholder="e.g. Salar"
                        className="flex-1 px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomZone(false);
                          setFormData({ ...formData, zoneName: 'All Zones' });
                        }}
                        className="px-2.5 py-2 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50 shrink-0"
                      >
                        List
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Time (24-hr)</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Time (24-hr)</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Partner Capacity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cutoff (Mins)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.cancellationCutoffMinutes}
                    onChange={(e) => setFormData({ ...formData, cancellationCutoffMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 active:scale-95 transition-all"
                >
                  {isSubmitting ? 'Saving...' : editingGig ? 'Update Gig' : 'Create Gig'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GigsManagement;
