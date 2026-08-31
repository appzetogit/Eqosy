import { useState } from "react"
import { createPortal } from "react-dom"
import { X, Clock, CheckCircle, XCircle, User, Phone, Package, MapPin, Search, Loader2, Truck, Check } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const getStatusColor = (status) => {
  const colors = {
    "Ordered": "bg-blue-100 text-blue-700 border-blue-200",
    "Restaurant Accepted": "bg-green-100 text-green-700 border-green-200",
    "Accepted": "bg-green-100 text-green-700 border-green-200", // Keep for backward compatibility
    "Rejected": "bg-red-100 text-red-700 border-red-200",
    "Delivery Boy Assigned": "bg-purple-100 text-purple-700 border-purple-200",
    "Delivery Boy Reached Pickup": "bg-orange-100 text-orange-700 border-orange-200",
    "Reached Pickup": "bg-orange-100 text-orange-700 border-orange-200", // Keep for backward compatibility
    "Order ID Accepted": "bg-indigo-100 text-indigo-700 border-indigo-200",
    "Reached Drop": "bg-amber-100 text-amber-700 border-amber-200",
    "Ordered Delivered": "bg-emerald-100 text-emerald-700 border-emerald-200",
  }
  return colors[status] || "bg-slate-100 text-slate-700 border-slate-200"
}

const getStatusIcon = (status) => {
  if (status === "Rejected") return XCircle
  if (status === "Ordered Delivered") return CheckCircle
  return Clock
}

export default function ViewOrderDetectDeliveryDialog({ isOpen, onOpenChange, order }) {
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [availablePartners, setAvailablePartners] = useState([])
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [isAssigning, setIsAssigning] = useState(false)
  const [searchDriverQuery, setSearchDriverQuery] = useState("")

  const [onlyOnlineFilter, setOnlyOnlineFilter] = useState(true)

  if (!isOpen || !order) return null

  const targetOrderId = order.originalOrder?._id || order._id || order.id || order.orderId

  const handleOpenAssignModal = async (onlineOnly = onlyOnlineFilter) => {
    try {
      setIsAssignModalOpen(true)
      setLoadingPartners(true)
      setSelectedPartnerId("")
      const res = await adminAPI.getAvailableDeliveryPartnersForOrder(targetOrderId, { onlineOnly: onlineOnly ? 'true' : 'false' })
      if (res.data?.success && res.data?.data?.deliveryPartners) {
        setAvailablePartners(res.data.data.deliveryPartners)
      } else {
        setAvailablePartners([])
      }
    } catch (err) {
      toast.error("Failed to load available drivers")
      setAvailablePartners([])
    } finally {
      setLoadingPartners(false)
    }
  }

  const handleConfirmAssign = async () => {
    if (!selectedPartnerId) {
      toast.error("Please select a delivery partner")
      return
    }

    try {
      setIsAssigning(true)
      const res = await adminAPI.assignDeliveryPartner(targetOrderId, selectedPartnerId)
      if (res.data?.success) {
        toast.success("Delivery partner assigned successfully!")
        const assignedPartner = availablePartners.find(p => p._id === selectedPartnerId)
        if (assignedPartner) {
          order.deliveryBoyName = assignedPartner.name
          order.deliveryBoyNumber = assignedPartner.phone
          order.status = "Delivery Boy Assigned"
        }
        setIsAssignModalOpen(false)
      } else {
        toast.error(res.data?.message || "Failed to assign delivery partner")
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to assign delivery partner")
    } finally {
      setIsAssigning(false)
    }
  }

  const filteredPartners = availablePartners.filter(p => 
    p.name?.toLowerCase().includes(searchDriverQuery.toLowerCase()) ||
    p.phone?.includes(searchDriverQuery) ||
    p.vehicleNumber?.toLowerCase().includes(searchDriverQuery.toLowerCase())
  )

  const StatusIcon = getStatusIcon(order.status)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Order Details</h2>
            <p className="text-sm text-slate-500 mt-1">Order ID: #{order.orderId}</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Order Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* User Information */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                User Information
              </h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Name</p>
                  <p className="text-sm font-medium text-slate-900">{order.userName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Phone Number</p>
                  <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {order.userNumber}
                  </p>
                </div>
              </div>
            </div>

            {/* Restaurant Information */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Restaurant Information
              </h3>
              <div>
                <p className="text-xs text-slate-500">Restaurant Name</p>
                <p className="text-sm font-medium text-slate-900">{order.restaurantName}</p>
              </div>
            </div>

            {/* Delivery Boy Information & Manual Assign */}
            <div className="bg-slate-50 rounded-lg p-4 md:col-span-2 border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Package className="w-4 h-4 text-orange-600" />
                  Delivery Boy Information
                </h3>
                <button
                  type="button"
                  onClick={() => handleOpenAssignModal()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg shadow-sm transition-all active:scale-95"
                >
                  {order.deliveryBoyName ? "Reassign Delivery Boy" : "+ Assign Delivery Boy"}
                </button>
              </div>

              {order.deliveryBoyName ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3 rounded-lg border border-slate-200">
                  <div>
                    <p className="text-xs text-slate-500">Name</p>
                    <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                      <User className="w-3.5 h-3.5 text-blue-600" />
                      {order.deliveryBoyName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Phone Number</p>
                    <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      {order.deliveryBoyNumber || "N/A"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    <span className="font-bold">No Delivery Boy Assigned yet</span>
                  </div>
                  <span className="text-[11px] text-amber-700">Click button above to set driver</span>
                </div>
              )}
            </div>
          </div>

          {/* Current Status */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Current Status</h3>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getStatusColor(order.status)}`}>
              <StatusIcon className="w-4 h-4" />
              <span className="font-semibold">{order.status}</span>
            </div>
          </div>

          {/* Status History Timeline */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Status History</h3>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
              
              {/* Status items */}
              <div className="space-y-4">
                {order.statusHistory && order.statusHistory.map((historyItem, index) => {
                  const isLast = index === order.statusHistory.length - 1
                  const HistoryIcon = getStatusIcon(historyItem.status)
                  
                  return (
                    <div key={index} className="relative flex items-start gap-4">
                      {/* Icon */}
                      <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 ${getStatusColor(historyItem.status)}`}>
                        <HistoryIcon className="w-4 h-4" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 pt-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-semibold ${getStatusColor(historyItem.status).split(' ')[1]}`}>
                            {historyItem.status}
                          </span>
                          <span className="text-xs text-slate-500">{historyItem.timestamp}</span>
                        </div>
                        {historyItem.deliveryBoy && (
                          <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded p-2">
                            <p><span className="font-medium">Delivery Boy:</span> {historyItem.deliveryBoy}</p>
                            {historyItem.deliveryBoyNumber && (
                              <p><span className="font-medium">Phone:</span> {historyItem.deliveryBoyNumber}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Order Date & Time */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-slate-500">Order Date</p>
                <p className="font-medium text-slate-900">{order.orderDate}</p>
              </div>
              <div>
                <p className="text-slate-500">Order Time</p>
                <p className="font-medium text-slate-900">{order.orderTime}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
          >
            Close
          </button>
        </div>
      </div>

      {/* Assign Delivery Boy Modal */}
      {isAssignModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-auto">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              if (!isAssigning) setIsAssignModalOpen(false);
            }}
          />
          <div 
            className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-orange-500" />
                  Assign Delivery Partner
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Select a driver from this zone for Order #{order.orderId}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAssignModalOpen(false);
                }}
                disabled={isAssigning}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Filter */}
            <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search driver by name, phone, or vehicle..."
                  value={searchDriverQuery}
                  onChange={(e) => setSearchDriverQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextVal = !onlyOnlineFilter;
                  setOnlyOnlineFilter(nextVal);
                  handleOpenAssignModal(nextVal);
                }}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 shrink-0 ${
                  onlyOnlineFilter
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm"
                    : "bg-slate-50 text-slate-600 border-slate-200"
                }`}
              >
                <span>{onlyOnlineFilter ? "🟢 Online Drivers Only" : "⚪ All Zone Drivers"}</span>
              </button>
            </div>

            {/* Drivers List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {loadingPartners ? (
                <div className="py-12 text-center flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                  <p className="text-xs text-slate-500 font-medium">Fetching drivers from zone...</p>
                </div>
              ) : filteredPartners.length === 0 ? (
                <div className="py-12 text-center bg-slate-50 rounded-xl border border-slate-200 p-6">
                  <p className="text-sm font-semibold text-slate-700">No available delivery partners found</p>
                  <p className="text-xs text-slate-500 mt-1">Make sure delivery partners are registered and approved in this zone.</p>
                </div>
              ) : (
                filteredPartners.map((partner) => {
                  const isSelected = selectedPartnerId === partner._id;
                  return (
                    <div
                      key={partner._id}
                      onClick={() => setSelectedPartnerId(partner._id)}
                      className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? "border-orange-500 bg-orange-50/60 shadow-sm"
                          : "border-slate-100 hover:border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                          partner.isOnline ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}>
                          {partner.name?.charAt(0)?.toUpperCase() || "D"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900 truncate">{partner.name}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              partner.isOnline ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                            }`}>
                              {partner.isOnline ? "Online 🟢" : "Offline ⚪"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>📞 {partner.phone}</span>
                            <span>•</span>
                            <span>🛵 {partner.vehicleNumber || partner.vehicleType || "Bike"}</span>
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                            <span>⭐ {partner.rating || "5.0"} ({partner.totalRatings || 0})</span>
                            <span>•</span>
                            <span className="font-semibold text-slate-700">Active Orders: {partner.activeOrdersCount || 0}</span>
                          </div>
                        </div>
                      </div>

                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300"
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAssignModalOpen(false);
                }}
                disabled={isAssigning}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirmAssign();
                }}
                disabled={!selectedPartnerId || isAssigning}
                className="px-5 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isAssigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

