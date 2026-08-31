import { useState } from "react"
import { createPortal } from "react-dom"
import { Eye, MapPin, Package, User, Phone, Mail, Calendar, Clock, Truck, CreditCard, X, Receipt, CheckCircle2, Search, Loader2, Check } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const getStatusColor = (orderStatus) => {
  const colors = {
    "Delivered": "bg-emerald-100 text-emerald-700",
    "Pending": "bg-blue-100 text-blue-700",
    "Scheduled": "bg-blue-100 text-blue-700",
    "Accepted": "bg-green-100 text-green-700",
    "Processing": "bg-orange-100 text-orange-700",
    "Food On The Way": "bg-yellow-100 text-yellow-700",
    "Canceled": "bg-rose-100 text-rose-700",
    "Cancelled by Restaurant": "bg-red-100 text-red-700",
    "Cancelled by User": "bg-orange-100 text-orange-700",
    "Payment Failed": "bg-red-100 text-red-700",
    "Refunded": "bg-sky-100 text-sky-700",
    "Dine In": "bg-indigo-100 text-indigo-700",
    "Offline Payments": "bg-slate-100 text-slate-700",
  }
  return colors[orderStatus] || "bg-slate-100 text-slate-700"
}

const getPaymentStatusColor = (paymentStatus) => {
  if (paymentStatus === "Paid" || paymentStatus === "Collected") return "text-emerald-600"
  if (paymentStatus === "Not Collected") return "text-amber-600"
  if (paymentStatus === "Unpaid" || paymentStatus === "Failed") return "text-red-600"
  return "text-slate-600"
}

export default function ViewOrderDialog({ isOpen, onOpenChange, order }) {
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [availablePartners, setAvailablePartners] = useState([])
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [isAssigning, setIsAssigning] = useState(false)
  const [searchDriverQuery, setSearchDriverQuery] = useState("")

  const [onlyOnlineFilter, setOnlyOnlineFilter] = useState(true)

  if (!order) return null

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
          order.deliveryPartnerName = assignedPartner.name
          order.deliveryPartnerPhone = assignedPartner.phone
          order.orderStatus = "Accepted"
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

  // Debug: Log order data to check billImageUrl
  if (order.billImageUrl) {
    debugLog('?? Bill Image URL found:', order.billImageUrl)
  } else {
    debugLog('?? Bill Image URL not found in order:', {
      orderId: order.orderId,
      hasBillImageUrl: !!order.billImageUrl,
      orderKeys: Object.keys(order)
    })
  }

  // Format address for display
  const formatAddress = (address) => {
    if (!address || typeof address !== "object") return "N/A"

    const formattedAddress = String(address.formattedAddress || "").trim()
    const rawAddress = String(address.address || "").trim()
    const parts = [
      formattedAddress,
      rawAddress,
      address.label,
      address.street,
      address.additionalDetails,
      address.landmark,
      address.addressLine1,
      address.addressLine2,
      address.area,
      address.city,
      address.state,
      address.zipCode,
      address.postalCode,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)

    const uniqueParts = []
    parts.forEach((part) => {
      const key = part.toLowerCase()
      const isContained = uniqueParts.some((existingPart) => {
        const existingKey = existingPart.toLowerCase()
        return existingKey === key || existingKey.includes(key) || key.includes(existingKey)
      })
      if (isContained) return
      uniqueParts.push(part)
    })

    return uniqueParts.length > 0 ? uniqueParts.join(", ") : "Address not available"
  }

  // Get coordinates if available
  const getCoordinates = (address) => {
    if (address?.location?.coordinates && Array.isArray(address.location.coordinates) && address.location.coordinates.length === 2) {
      const [lng, lat] = address.location.coordinates
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-white p-0 overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-orange-600" />
            Order Details
          </DialogTitle>
          <DialogDescription>
            View complete information about this order
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-6 space-y-6">
          {/* Basic Order Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Order ID
                </p>
                <p className="text-sm font-medium text-slate-900">{order.orderId || order.id || order.subscriptionId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Order Date
                </p>
                <p className="text-sm font-medium text-slate-900">{order.date}{order.time ? `, ${order.time}` : ""}</p>
              </div>
              {order.orderOtp && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Handover Code (OTP)
                  </p>
                  <p className="text-lg font-bold text-slate-950 tracking-[0.2em]">{order.orderOtp}</p>
                </div>
              )}
              {order.estimatedDeliveryTime && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Estimated Delivery Time
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.estimatedDeliveryTime} minutes</p>
                </div>
              )}
              {order.deliveredAt && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Delivered At
                  </p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(order.deliveredAt).toLocaleString('en-GB', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).toUpperCase()}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {order.orderStatus && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Status</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus)}`}>
                    {order.orderStatus}
                  </span>
                  {order.cancellationReason && (
                    <div className="mt-1.5 p-2 bg-red-50 rounded-lg border border-red-100 text-xs text-red-600">
                      <p className="font-bold">
                        {String(order.cancelledBy || '').toUpperCase() === 'USER' ? 'Cancelled by Customer' : 
                         String(order.cancelledBy || '').toUpperCase() === 'RESTAURANT' ? 'Cancelled by Restaurant' : 
                         'Cancelled'}
                      </p>
                      <p className="text-slate-700 font-medium mt-0.5">
                        <span className="font-semibold text-red-600">Reason:</span> {order.cancellationReason}
                      </p>
                      {order.cancellationComment && order.cancellationComment !== order.cancellationReason && (
                        <p className="text-slate-600 italic mt-0.5 text-[11px]">
                          Note: "{order.cancellationComment}"
                        </p>
                      )}
                    </div>
                  )}
                  {order.cancelledAt && (
                    <p className="text-xs text-slate-500 mt-1">
                      Cancelled: {new Date(order.cancelledAt).toLocaleString('en-GB', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }).toUpperCase()}
                    </p>
                  )}
                </div>
              )}
              {(order.paymentStatus || order.paymentCollectionStatus != null) && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Payment Status
                  </p>
                  <p className={`text-sm font-medium ${getPaymentStatusColor(
                    order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                      ? (order.paymentCollectionStatus ? 'Collected' : (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                      : order.paymentStatus
                  )}`}>
                    {order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                      ? (order.paymentCollectionStatus ? 'Collected' : (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                      : order.paymentStatus}
                  </p>
                </div>
              )}
              {order.deliveryType && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Delivery Type
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.deliveryType}</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Information */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Name</p>
                <p className="text-sm font-medium text-slate-900">{order.customerName || "N/A"}</p>
              </div>
              {order.customerPhone && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerPhone}</p>
                </div>
              )}
              {order.customerEmail && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerEmail}</p>
                </div>
              )}
            </div>
          </div>

          {/* Restaurant Information */}
          {order.restaurant && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Restaurant Information</h3>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Restaurant Name</p>
                <p className="text-sm font-medium text-slate-900">{order.restaurant}</p>
              </div>
            </div>
          )}

          {/* Order Items */}
          {order.items && Array.isArray(order.items) && order.items.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Order Items ({order.items.length})
              </h3>
              <div className="space-y-3">
                {order.items.map((item, index) => (
                  <div key={index} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded">
                          {item.quantity || 1}x
                        </span>
                        <p className="text-sm font-medium text-slate-900">{item.name || "Unknown Item"}</p>
                        {item.isVeg !== undefined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${item.isVeg ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {item.isVeg ? 'Veg' : 'Non-Veg'}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1 ml-8">{item.description}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bill Image (Captured by Delivery Boy) */}
          {(order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-600" />
                Bill Image (Captured by Delivery Boy)
              </h3>
              <div className="space-y-3">
                <div className="relative w-full max-w-2xl border-2 border-slate-300 rounded-xl overflow-hidden bg-white shadow-sm">
                  <img
                    src={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    alt="Order Bill"
                    className="w-full h-auto object-contain max-h-[500px] mx-auto block"
                    loading="lazy"
                    onError={(e) => {
                      debugError('? Failed to load bill image:', e.target.src)
                      e.target.style.display = 'none';
                      const errorDiv = e.target.parentElement.querySelector('.error-message');
                      if (errorDiv) errorDiv.style.display = 'block';
                    }}
                    onLoad={() => {
                      debugLog('? Bill image loaded successfully')
                    }}
                  />
                  <div className="error-message hidden p-6 text-center text-slate-500 text-sm bg-slate-50">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    Failed to load bill image
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    View Full Size
                  </a>
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Package className="w-4 h-4" />
                    Download
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Delivery Address */}
          {order.address && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Delivery Address
              </h3>
              <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-900">{formatAddress(order.address)}</p>
                {getCoordinates(order.address) && (
                  <p className="text-xs text-slate-500 mt-2">
                    <span className="font-medium">Coordinates:</span> {getCoordinates(order.address)}
                  </p>
                )}
                {order.address.label && (
                  <p className="text-xs text-slate-500">
                    <span className="font-medium">Label:</span> {order.address.label}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Delivery Partner Information & Manual Assign */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-orange-600" />
                Delivery Partner
              </h3>
              <button
                type="button"
                onClick={() => handleOpenAssignModal()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg shadow-sm transition-all active:scale-95"
              >
                {order.deliveryPartnerName ? "Reassign Delivery Partner" : "+ Assign Delivery Partner"}
              </button>
            </div>

            {order.deliveryPartnerName ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</p>
                  <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    {order.deliveryPartnerName}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</p>
                  <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    {order.deliveryPartnerPhone || "N/A"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span className="font-bold">No Delivery Partner Assigned yet</span>
                </div>
                <span className="text-[11px] text-amber-700">Click button above to set driver</span>
              </div>
            )}
          </div>

          {/* Pricing Breakdown */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Pricing Breakdown</h3>
            <div className="space-y-2">
              {order.totalItemAmount !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">₹{order.totalItemAmount.toFixed(2)}</span>
                </div>
              )}
              {order.itemDiscount !== undefined && order.itemDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.itemDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.couponDiscount !== undefined && order.couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Coupon Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.deliveryCharge !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Delivery Charge</span>
                  <span className="font-medium text-slate-900">
                    {order.deliveryCharge > 0 ? `₹${order.deliveryCharge.toFixed(2)}` : <span className="text-emerald-600">Free delivery</span>}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Platform Fee</span>
                <span className="font-medium text-slate-900">
                  {order.platformFee !== undefined && order.platformFee > 0 
                    ? `₹${order.platformFee.toFixed(2)}` 
                    : <span className="text-slate-400">₹0.00</span>}
                </span>
              </div>
              {order.deliveryPartnerTip !== undefined && order.deliveryPartnerTip > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Delivery Partner Tip</span>
                  <span className="font-medium text-slate-900">₹{order.deliveryPartnerTip.toFixed(2)}</span>
                </div>
              )}
              {order.vatTax !== undefined && order.vatTax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax (GST)</span>
                  <span className="font-medium text-slate-900">₹{order.vatTax.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-slate-700">Total Amount</span>
                  <span className="text-xl font-bold text-emerald-600">
                    ₹{(order.totalAmount || order.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

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
                <p className="text-xs text-slate-500 mt-0.5">Select a driver from this zone for Order #{order.orderId || order.id || order._id}</p>
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
    </Dialog>
  )
}


