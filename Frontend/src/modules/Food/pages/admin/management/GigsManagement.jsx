import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar, Clock, Plus, Users, CheckCircle2, AlertTriangle, XCircle,
  Search, Filter, Edit, Trash2, X, RefreshCcw, ShieldCheck, LayoutGrid, List, ShieldAlert
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { toast } from 'sonner';
import useAdminNotifications from '@food/hooks/useAdminNotifications';
import HandoverApprovalModal from '@food/components/admin/HandoverApprovalModal';

export const GigsManagement = () => {
  const [searchParams] = useSearchParams();
  const handoverIdFromUrl = searchParams.get('handoverId');
  const { items: adminNotifications, approveHandover, rejectHandover } = useAdminNotifications();
  const pendingHandovers = adminNotifications.filter(it => it.category === "handover_approval");

  const [selectedHandoverItem, setSelectedHandoverItem] = useState(null);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);

  useEffect(() => {
    if (handoverIdFromUrl && pendingHandovers.length > 0) {
      const match = pendingHandovers.find(h => String(h.orderMongoId) === String(handoverIdFromUrl) || String(h.orderId) === String(handoverIdFromUrl));
      if (match) {
        setSelectedHandoverItem(match);
        setHandoverModalOpen(true);
      }
    }
  }, [handoverIdFromUrl, pendingHandovers]);

  const [gigs, setGigs] = useState([]);
  const [stats, setStats] = useState(null);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState('active');
  const [viewMode, setViewMode] = useState('card');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGig, setEditingGig] = useState(null);
  const [deactivatingGig, setDeactivatingGig] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomZone, setIsCustomZone] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '12:00',
    endTime: '16:00',
    capacity: 20,
    zoneName: 'All Zones',
    cancellationCutoffMinutes: 60
  });

  const [partnerBookings, setPartnerBookings] = useState([]);
  const [bookingSummary, setBookingSummary] = useState(null);
  const [partnerFilterTab, setPartnerFilterTab] = useState('all');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('');
  const [selectedGigIdFilter, setSelectedGigIdFilter] = useState('');
  const [remindingBookingId, setRemindingBookingId] = useState(null);

  const handleRemindPartner = async (booking) => {
    const bookingId = booking._id || booking.bookingId;
    if (!bookingId) {
      toast.error('Invalid booking record');
      return;
    }

    try {
      setRemindingBookingId(bookingId);
      const res = await apiClient.post(`/food/gigs/admin/gigs/bookings/${bookingId}/remind`, {
        partnerId: booking.partnerId
      });
      if (res.data?.success) {
        toast.success(res.data.message || `Reminder notification sent to ${booking.partnerName}`);
      } else {
        toast.error(res.data?.message || 'Failed to send reminder notification');
      }
    } catch (err) {
      console.error('Send reminder error:', err);
      toast.error(err.response?.data?.message || 'Failed to send reminder notification');
    } finally {
      setRemindingBookingId(null);
    }
  };

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

  const fetchPartnerBookings = async () => {
    try {
      const res = await apiClient.get('/food/gigs/admin/gigs/bookings', {
        params: {
          date: selectedDate,
          status: partnerFilterTab,
          zoneId: selectedZoneFilter,
          gigId: selectedGigIdFilter
        }
      });
      if (res.data?.success && res.data.data) {
        setPartnerBookings(res.data.data.bookings || []);
        setBookingSummary(res.data.data.summary || null);
      }
    } catch (err) {
      console.warn('Failed to load partner gig bookings:', err);
    }
  };

  useEffect(() => {
    fetchGigs();
    fetchStats();
    fetchZones();
    fetchPartnerBookings();
  }, [selectedDate, statusFilter, partnerFilterTab, selectedZoneFilter, selectedGigIdFilter]);

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
    try {
      await apiClient.delete(`/food/gigs/admin/gigs/${gigId}`);
      toast.success('Gig slot deactivated successfully');
      setGigs((prev) => prev.filter((g) => g._id !== gigId));
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
              title: '',
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

      {/* 🚨 Pending Emergency Handover Requests List Box */}
      {pendingHandovers.length > 0 && (
        <div className="bg-gradient-to-br from-rose-50 to-amber-50 p-6 rounded-3xl border border-rose-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Pending Order Handover Requests
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-xs font-bold">
                    {pendingHandovers.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">Review driver emergency handover requests zone-wise, inspect customer & driver details, and approve for automatic re-dispatch.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingHandovers.map((item) => {
              const rawOrder = item?.rawOrder || {};
              const orderDisplayId = item?.orderId || item?.orderMongoId || "N/A";
              const partnerName = item?.partnerName || rawOrder?.deliveryPartnerName || "Delivery Partner";
              const partnerPhone = item?.partnerPhone || rawOrder?.deliveryPartnerPhone || "N/A";
              const customerName = item?.customerName || rawOrder?.customerName || "Customer";
              const customerPhone = item?.customerPhone || rawOrder?.userPhone || "N/A";
              const restaurantName = item?.restaurantName || rawOrder?.restaurantName || "Restaurant";
              const zoneName = item?.zoneName || rawOrder?.zoneName || "Zone";
              const reason = item?.reason || "Emergency";

              return (
                <div key={item.id} className="bg-white p-5 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-all space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                      Order #{orderDisplayId}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                      Zone: {zoneName}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Requesting Driver</span>
                      <span className="font-bold text-slate-900">{partnerName}</span>
                      <span className="text-[11px] text-slate-500 block">{partnerPhone}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Customer</span>
                      <span className="font-bold text-slate-900">{customerName}</span>
                      <span className="text-[11px] text-slate-500 block">{customerPhone}</span>
                    </div>
                  </div>

                  <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-500 font-medium">Restaurant: </span>
                    <span className="font-bold text-slate-900">{restaurantName}</span>
                    <div className="mt-1 text-rose-700 font-medium">
                      Reason: "{reason}"
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        setSelectedHandoverItem(item);
                        setHandoverModalOpen(true);
                      }}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors text-center shadow-sm"
                    >
                      Review & Approve Request
                    </button>
                    {partnerPhone && partnerPhone !== "N/A" && (
                      <a
                        href={`tel:${partnerPhone}`}
                        className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                      >
                        Call
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
            className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 bg-white cursor-pointer"
          >
            <option value="active">Active Gigs</option>
            <option value="inactive">Inactive Gigs</option>
            <option value="all">All Statuses</option>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          {/* View Mode Toggle: Card vs List */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              onClick={() => setViewMode('card')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'card'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
                }`}
              title="Card View"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Cards</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'list'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
                }`}
              title="List View"
            >
              <List className="w-4 h-4" />
              <span>List</span>
            </button>
          </div>

          <button
            onClick={fetchGigs}
            className="p-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Refresh List"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Gigs View: Card vs List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 font-bold text-xs bg-white rounded-3xl border border-slate-100">
          Loading gigs list...
        </div>
      ) : gigs.length === 0 ? (
        <div className="py-16 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
          <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-2" />
          <p className="font-bold text-slate-700">No Gigs Found for Selected Date</p>
          <p className="text-xs text-slate-400 mt-1">Click "Create New Gig" to add shift slots.</p>
        </div>
      ) : viewMode === 'card' ? (
        /* CARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {gigs.map((gig) => (
            <div
              key={gig._id}
              className={`p-6 rounded-3xl bg-white border shadow-sm flex flex-col justify-between transition-all ${gig.status === 'inactive' ? 'border-slate-200 opacity-60' : 'border-slate-100 hover:border-emerald-300'
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
                    className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${gig.status === 'active'
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
                    onClick={() => setDeactivatingGig(gig)}
                    className="p-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Deactivate Gig"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-4 px-6">Gig / Shift Title</th>
                  <th className="py-4 px-6">Zone</th>
                  <th className="py-4 px-6">Time Slot</th>
                  <th className="py-4 px-6 text-center">Capacity</th>
                  <th className="py-4 px-6 text-center">Booked</th>
                  <th className="py-4 px-6 text-center">No-Shows</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {gigs.map((gig) => (
                  <tr
                    key={gig._id}
                    className={`hover:bg-slate-50/60 transition-colors ${gig.status === 'inactive' ? 'opacity-60' : ''
                      }`}
                  >
                    <td className="py-4 px-6 font-bold text-slate-900">
                      {gig.title}
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                        {gig.zoneName || 'All Zones'}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{gig.startTime} – {gig.endTime}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center font-black text-slate-900">
                      {gig.capacity}
                    </td>
                    <td className="py-4 px-6 text-center font-black text-blue-600">
                      {gig.bookedCount}
                    </td>
                    <td className="py-4 px-6 text-center font-black text-rose-600">
                      {gig.stats?.noShow || 0}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span
                        className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border inline-block ${gig.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-600 border-rose-200'
                          }`}
                      >
                        {gig.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(gig)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 font-bold text-xs"
                          title="Edit Gig"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        {gig.status === 'active' && (
                          <button
                            onClick={() => setDeactivatingGig(gig)}
                            className="p-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Deactivate Gig"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Handover Requests Control Box */}
      <div className="bg-gradient-to-r from-rose-50 via-amber-50/50 to-white p-6 rounded-3xl border border-rose-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">Pending Delivery Handover Requests</h2>
                <span className="bg-rose-600 text-white px-2.5 py-0.5 rounded-full text-xs font-black">
                  {pendingHandovers.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Emergency handover requests submitted by delivery partners requiring admin authorization.
              </p>
            </div>
          </div>
        </div>

        {pendingHandovers.length === 0 ? (
          <div className="py-6 text-center text-xs font-medium text-slate-400 bg-white/60 rounded-2xl border border-dashed border-rose-200">
            No active pending handover requests.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingHandovers.map((item) => (
              <div key={item.id} className="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                      Order #{item.orderId}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">{item.timeLabel}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-600 mt-1 leading-snug">{item.message}</p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHandoverItem(item);
                      setHandoverModalOpen(true);
                    }}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all text-center"
                  >
                    Review Handover Box
                  </button>
                  <button
                    type="button"
                    onClick={() => approveHandover(item.orderMongoId || item.orderId)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const r = prompt("Reason for rejection:", "Rejected by admin") || "Rejected by admin";
                      rejectHandover(item.orderMongoId || item.orderId, r);
                    }}
                    className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 5 & 9: Delivery Partner Workforce Status & Attendance Table */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
              Live Workforce Attendance
            </span>
            <h2 className="text-xl font-black text-slate-900 mt-1">Booked Delivery Partner Status</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Track delivery partners who booked gigs, partners currently working/online, and partners booked but offline in real time.
            </p>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <select
              value={selectedZoneFilter}
              onChange={(e) => setSelectedZoneFilter(e.target.value)}
              className="px-4 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 bg-white"
            >
              <option value="">All Areas / Zones</option>
              {zones.map((z) => {
                const zName = z.name || z.serviceLocation || z.zoneName;
                return zName ? <option key={z._id || zName} value={zName}>{zName}</option> : null;
              })}
            </select>

            <select
              value={selectedGigIdFilter}
              onChange={(e) => setSelectedGigIdFilter(e.target.value)}
              className="px-4 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 bg-white"
            >
              <option value="">All Shift Slots</option>
              {gigs.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.title} ({g.startTime} - {g.endTime})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3 Main Filter Tabs as specified in Section 5 of requirement doc */}
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setPartnerFilterTab('all')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              partnerFilterTab === 'all'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Filter 1 — All Booked</span>
            <span className="bg-slate-800 text-white px-2 py-0.5 rounded-full text-[10px]">
              {bookingSummary?.totalBooked || partnerBookings.length}
            </span>
          </button>

          <button
            onClick={() => setPartnerFilterTab('working')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              partnerFilterTab === 'working'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Filter 2 — Currently Working / Online</span>
            <span className="bg-emerald-700 text-white px-2 py-0.5 rounded-full text-[10px]">
              {bookingSummary?.currentlyWorking || 0}
            </span>
          </button>

          <button
            onClick={() => setPartnerFilterTab('offline')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              partnerFilterTab === 'offline'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Filter 3 — Booked but Offline</span>
            <span className="bg-amber-700 text-white px-2 py-0.5 rounded-full text-[10px]">
              {bookingSummary?.bookedButOffline || 0}
            </span>
          </button>

          <button
            onClick={() => setPartnerFilterTab('no_show')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              partnerFilterTab === 'no_show'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <span>No-shows</span>
            <span className="bg-rose-700 text-white px-2 py-0.5 rounded-full text-[10px]">
              {bookingSummary?.noShowCount || 0}
            </span>
          </button>
        </div>

        {/* Table of Booked Delivery Partners */}
        {partnerBookings.length === 0 ? (
          <div className="py-12 text-center text-slate-400 font-medium text-xs border border-dashed border-slate-200 rounded-2xl">
            No delivery partners found for selected filter status ({partnerFilterTab}).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">Delivery Partner</th>
                  <th className="py-3.5 px-4">Phone Number</th>
                  <th className="py-3.5 px-4">Area / Zone</th>
                  <th className="py-3.5 px-4">Gig & Shift Time</th>
                  <th className="py-3.5 px-4 text-center">Current Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {partnerBookings.map((b) => (
                  <tr key={b._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-3">
                      {b.profilePhoto ? (
                        <img src={b.profilePhoto} alt={b.partnerName} className="w-8 h-8 rounded-full object-cover border border-slate-200" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-black text-xs flex items-center justify-center border border-slate-200">
                          {b.partnerName?.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-black text-slate-900">{b.partnerName}</p>
                        <p className="text-[10px] text-slate-400 font-medium">Booked {new Date(b.bookedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-700">
                      {b.partnerPhone}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                        {b.zoneName}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      <div>
                        <p className="text-xs font-black text-slate-900">{b.gigTitle}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{b.gigTime}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                          b.workStatus === 'Working / Online'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : b.workStatus === 'Booked but Offline'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : b.workStatus === 'Completed'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-rose-50 text-rose-600 border-rose-200'
                        }`}
                      >
                        {b.workStatus === 'Working / Online' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        {b.workStatus === 'Booked but Offline' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                        {b.workStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`tel:${b.partnerPhone}`}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-black transition-colors"
                          title="Call Partner"
                        >
                          Call
                        </a>
                        <button
                          type="button"
                          disabled={remindingBookingId === (b._id || b.bookingId)}
                          onClick={() => handleRemindPartner(b)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-black transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {remindingBookingId === (b._id || b.bookingId) ? (
                            <>
                              <span className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                              Sending...
                            </>
                          ) : (
                            'Contact / Remind'
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Custom Deactivation Confirmation Modal (Replaces native browser window.confirm popup) */}
      {deactivatingGig && (
        <div className="fixed inset-0 z-[500] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Deactivate Gig Slot</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Are you sure you want to deactivate <span className="font-bold text-slate-800">"{deactivatingGig.title}"</span> ({deactivatingGig.startTime} - {deactivatingGig.endTime})?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeactivatingGig(null)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleDeactivateGig(deactivatingGig._id);
                  setDeactivatingGig(null);
                }}
                className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

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
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
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
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
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

      <HandoverApprovalModal
        isOpen={handoverModalOpen}
        onClose={() => setHandoverModalOpen(false)}
        notification={selectedHandoverItem}
        onApprove={approveHandover}
        onReject={rejectHandover}
      />
    </div>
  );
};

export default GigsManagement;
