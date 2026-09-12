import { useState, useMemo } from "react";
import { Bell, Clock, Loader2, Trash2, X, ShieldAlert, Bike, MessageSquare, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useAdminNotifications from "@food/hooks/useAdminNotifications";
import HandoverApprovalModal from "@food/components/admin/HandoverApprovalModal";

export default function AdminNotifications() {
  const navigate = useNavigate();
  const { items, loading, clearAll, dismissOne, approveHandover, rejectHandover } = useAdminNotifications();
  const [selectedHandoverItem, setSelectedHandoverItem] = useState(null);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const handoverCount = useMemo(() => items.filter(i => i.category === "handover_approval").length, [items]);
  const approvalCount = useMemo(() => items.filter(i => ["restaurant_approval", "delivery_approval", "food_approval"].includes(i.category)).length, [items]);
  const supportCount = useMemo(() => items.filter(i => ["support", "delivery_support"].includes(i.category)).length, [items]);
  const complianceCount = useMemo(() => items.filter(i => i.type === "compliance" || i.category === "fssai_expired").length, [items]);

  const filteredItems = useMemo(() => {
    if (activeTab === "handovers") return items.filter(i => i.category === "handover_approval");
    if (activeTab === "approvals") return items.filter(i => ["restaurant_approval", "delivery_approval", "food_approval"].includes(i.category));
    if (activeTab === "support") return items.filter(i => ["support", "delivery_support"].includes(i.category));
    if (activeTab === "compliance") return items.filter(i => i.type === "compliance" || i.category === "fssai_expired");
    return items;
  }, [activeTab, items]);

  const handleItemClick = (item) => {
    if (item?.category === "handover_approval") {
      navigate(`/admin/food/delivery-partners/gigs?handoverId=${item.orderMongoId || item.orderId}`);
    } else if (item?.path) {
      navigate(item.path);
    }
  };

  return (
    <div className="p-6">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Notifications</h1>
              <p className="text-sm text-slate-500 font-medium">
                Latest approvals, handovers, support chats and compliance alerts.
              </p>
            </div>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/50 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Clear all ({items.length})
            </button>
          )}
        </div>

        {/* Category Tabs (Matching Taxi Admin) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {[
            { id: "all", label: "All Notifications", count: items.length },
            { id: "handovers", label: "🚨 Handover Requests", count: handoverCount, alert: true },
            { id: "approvals", label: "Pending Approvals", count: approvalCount },
            { id: "support", label: "Support Tickets", count: supportCount },
            { id: "compliance", label: "Compliance & FSSAI", count: complianceCount },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.id
                  ? tab.alert && tab.count > 0
                    ? "bg-rose-600 text-white shadow-md shadow-rose-500/20"
                    : "bg-slate-900 text-white shadow-md"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === tab.id
                    ? "bg-white/20 text-white"
                    : tab.alert
                    ? "bg-rose-100 text-rose-700 font-bold"
                    : "bg-slate-200 text-slate-700"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List Body */}
        {loading ? (
          <div className="py-16 text-sm text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Loading notifications...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-slate-400 font-medium text-xs border border-dashed border-slate-200 rounded-3xl">
            No notifications found in {activeTab}.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const isHandover = item?.category === "handover_approval";
              const isDeliverySupport = item?.category === "delivery_support";
              const isUserSupport = item?.category === "support";
              const isCompliance = item?.type === "compliance";

              let badgeText = "APPROVAL";
              let badgeStyle = "bg-amber-50 text-amber-800 border border-amber-200/80 font-bold";

              if (isHandover) {
                badgeText = "HANDOVER";
                badgeStyle = "bg-rose-50 text-rose-700 border border-rose-200 font-black shadow-xs";
              } else if (item?.category === "restaurant_approval") {
                badgeText = "RESTAURANT";
                badgeStyle = "bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold";
              } else if (item?.category === "delivery_approval") {
                badgeText = "DRIVER";
                badgeStyle = "bg-sky-50 text-sky-700 border border-sky-200 font-bold";
              } else if (item?.category === "food_approval") {
                badgeText = "FOOD";
                badgeStyle = "bg-amber-50 text-amber-800 border border-amber-200 font-bold";
              } else if (isUserSupport || isDeliverySupport) {
                badgeText = "SUPPORT";
                badgeStyle = "bg-purple-50 text-purple-700 border border-purple-200 font-bold";
              } else if (isCompliance) {
                badgeText = "COMPLIANCE";
                badgeStyle = "bg-red-50 text-red-700 border border-red-200 font-bold";
              }

              return (
                <div
                  key={item?.id}
                  className={`relative rounded-3xl border p-5 transition-all shadow-xs group cursor-pointer ${
                    isHandover
                      ? "border-rose-200 bg-rose-50/40 hover:bg-rose-50/80"
                      : "border-slate-200 bg-white hover:bg-slate-50/70 hover:border-emerald-200"
                  }`}
                  onClick={() => handleItemClick(item)}
                >
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${badgeStyle}`}>
                          {badgeText}
                        </span>
                      </div>
                      <p className="text-base font-black text-slate-900 leading-snug">
                        {item?.title || "Notification"}
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        {item?.message || "-"}
                      </p>
                      {item?.metaLabel && (
                        <p className="text-xs text-slate-400 font-medium pt-1">
                          📞 {item.metaLabel}
                        </p>
                      )}
                    </div>
                  </div>

                  {isHandover && (
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-rose-200/80">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/food/delivery-partners/gigs?handoverId=${item.orderMongoId || item.orderId}`);
                        }}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-rose-500/20 transition-all"
                      >
                        Review & Approve in List
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await approveHandover(item.orderMongoId || item.orderId);
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-emerald-500/20 transition-all"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const reason = prompt("Enter reason for rejection:", "Rejected by admin") || "Rejected by admin";
                          await rejectHandover(item.orderMongoId || item.orderId, reason);
                        }}
                        className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 rounded-2xl text-xs font-bold transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-400 pt-2 border-t border-slate-100">
                    <span className="text-emerald-600 hover:underline flex items-center gap-1 font-bold">
                      Tap to inspect →
                    </span>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{item?.timeLabel || "N/A"}</span>
                    </div>
                  </div>

                  {/* Dismiss button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissOne(item?.id);
                    }}
                    className="absolute right-4 top-4 rounded-xl p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    aria-label="Dismiss notification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <HandoverApprovalModal
        isOpen={handoverModalOpen}
        onClose={() => setHandoverModalOpen(false)}
        notification={selectedHandoverItem}
        onApprove={approveHandover}
        onReject={rejectHandover}
      />
    </div>
  );
}
