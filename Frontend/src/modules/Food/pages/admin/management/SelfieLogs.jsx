import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, Search, Filter, RefreshCcw, Eye, X, Check } from 'lucide-react';
import { apiClient } from '@/services/api';
import { toast } from 'sonner';

export const SelfieLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/food/gigs/admin/gigs/selfie-logs', {
        params: { status: statusFilter }
      });
      if (res.data?.success && res.data.data) {
        setLogs(res.data.data.logs || []);
      }
    } catch (err) {
      toast.error('Failed to load selfie verification logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [statusFilter]);

  const handleReviewLog = async (logId, newStatus) => {
    setIsReviewing(true);
    try {
      await apiClient.patch(`/food/gigs/admin/gigs/selfie-logs/${logId}`, {
        status: newStatus,
        adminNote
      });
      toast.success(`Selfie log marked as ${newStatus}`);
      setSelectedLog(null);
      setAdminNote('');
      fetchLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update log');
    } finally {
      setIsReviewing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex justify-between items-center">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Identity Audit</span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Selfie Verification Logs</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Review delivery partner live selfie verification attempts, face match scores, and handle failed attempts.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="p-3 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          title="Refresh"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
        >
          <option value="all">All Verification Statuses</option>
          <option value="verified">Verified Only</option>
          <option value="failed">Failed Only</option>
          <option value="flagged">Flagged Only</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 font-bold text-xs">
            Loading selfie verification logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <ShieldCheck className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-700">No Verification Logs Available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="p-4 pl-6">Delivery Partner</th>
                  <th className="p-4">Match Score</th>
                  <th className="p-4">Verification Status</th>
                  <th className="p-4">Captured Date & Time</th>
                  <th className="p-4 text-right pr-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {logs.map((log) => {
                  const partner = log.deliveryPartnerId || {};
                  return (
                    <tr key={log._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <img
                            src={log.selfieUrl || 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png'}
                            alt="Selfie"
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                          <div>
                            <span className="font-black text-slate-900 block">{partner.name || 'Delivery Partner'}</span>
                            <span className="text-[11px] text-slate-400">{partner.phone || ''}</span>
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <span className={`font-black text-sm ${log.matchScore >= 70 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {log.matchScore || 0}% Match
                        </span>
                      </td>

                      <td className="p-4">
                        <span
                          className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${
                            log.status === 'verified'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : log.status === 'failed'
                              ? 'bg-rose-50 text-rose-600 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {log.status === 'verified' && <CheckCircle2 className="w-3 h-3" />}
                          {log.status === 'failed' && <AlertTriangle className="w-3 h-3" />}
                          <span>{log.status}</span>
                        </span>
                      </td>

                      <td className="p-4 text-slate-500 font-medium">
                        {new Date(log.capturedAt || log.createdAt).toLocaleString()}
                      </td>

                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect & Manual Review Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[500] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900">Selfie Verification Review</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Photos Side by Side */}
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Live Captured Selfie</span>
                <img
                  src={selectedLog.selfieUrl}
                  alt="Live Selfie"
                  className="w-full h-48 rounded-2xl object-cover border border-slate-200 shadow-sm"
                />
              </div>

              <div className="text-center space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Registered KYC Photo</span>
                <img
                  src={selectedLog.profilePhotoUrl || selectedLog.deliveryPartnerId?.profilePhoto || 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png'}
                  alt="KYC Profile"
                  className="w-full h-48 rounded-2xl object-cover border border-slate-200 shadow-sm"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 text-left text-xs">
              <p><span className="font-bold text-slate-500">Match Score:</span> <strong className="text-slate-900">{selectedLog.matchScore}%</strong></p>
              <p><span className="font-bold text-slate-500">Status:</span> <strong className="text-emerald-600 uppercase">{selectedLog.status}</strong></p>
              {selectedLog.failureReason && (
                <p><span className="font-bold text-slate-500">Failure Reason:</span> <span className="text-rose-600">{selectedLog.failureReason}</span></p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 text-left">Admin Review Note (Optional)</label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Enter review notes..."
                className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-medium outline-none focus:border-emerald-500"
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleReviewLog(selectedLog._id, 'failed')}
                disabled={isReviewing}
                className="flex-1 py-3 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 font-black text-xs uppercase tracking-wider hover:bg-rose-100"
              >
                Reject Selfie
              </button>

              <button
                onClick={() => handleReviewLog(selectedLog._id, 'verified')}
                disabled={isReviewing}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-700"
              >
                Approve Verified
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SelfieLogs;
