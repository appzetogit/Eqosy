import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChefHat, MapPin, Phone, 
  ChevronDown, ChevronUp, Package, 
  Navigation, CheckCircle2, Camera, Loader2, Image as ImageIcon,
  AlertTriangle, RefreshCw, X
} from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { uploadAPI, deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { openCamera } from "@food/utils/imageUploadUtils";

/**
 * PickupActionModal - Unified White/Green Theme with Slider Actions.
 * Includes Bill Upload feature prior to pickup & Emergency Handover flow.
 */
export const PickupActionModal = ({ 
  order, 
  status, 
  isWithinRange, 
  distanceToTarget,
  eta,
  onReachedPickup, 
  onPickedUp,
  onMinimize,
  onCancel
}) => {
  const [showItems, setShowItems] = useState(false);
  const [isUploadingBill, setIsUploadingBill] = useState(false);
  const [billImageUploaded, setBillImageUploaded] = useState(false);
  const [billImageUrl, setBillImageUrl] = useState(null);
  
  // Emergency Handover States
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);
  const cameraInputRef = useRef(null);

  const emergencyReasons = [
    { id: "breakdown", label: "🚗 Vehicle Breakdown / Flat Tire", detail: "गाड़ी ख़राब / पंचर" },
    { id: "medical", label: "🤒 Health Issue / Medical Emergency", detail: "तबीयत ख़राब / इमरजेंसी" },
    { id: "accident", label: "🚨 Accident / Road Hazard", detail: "हादसा / आपात स्थिति" },
    { id: "traffic", label: "🚧 Heavy Traffic / Road Closed", detail: "जाम / रास्ता बंद" },
    { id: "other", label: "📝 Other Emergency Reason", detail: "अन्य कारण" },
  ];

  const handleHandoverSubmit = async () => {
    if (!selectedReason) {
      toast.error("Please select an emergency reason");
      return;
    }

    const orderId = order._id || order.orderId || order.order_id;
    if (!orderId) {
      toast.error("Order ID not found");
      return;
    }

    setIsSubmittingHandover(true);
    try {
      const reasonLabel = emergencyReasons.find(r => r.id === selectedReason)?.label || selectedReason;
      const res = await deliveryAPI.handoverOrder(orderId, {
        emergencyReason: reasonLabel,
        note: customNote
      });

      if (res.data?.success) {
        toast.success("Order handed over successfully. Re-searching another driver in this zone...");
        setShowHandoverModal(false);
        if (onCancel) await onCancel();
      } else {
        toast.error(res.data?.message || "Failed to handover order");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to handover order");
    } finally {
      setIsSubmittingHandover(false);
    }
  };

  if (!order) return null;

  const handleBillImageSelect = async (file) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    setIsUploadingBill(true);
    try {
      const res = await uploadAPI.uploadMedia(file, { folder: 'eqosy/delivery/bills' });
      if (res?.data?.success && res?.data?.data) {
        setBillImageUrl(res.data.data.url || res.data.data.secure_url);
        setBillImageUploaded(true);
        // toast.success('Bill image uploaded!');
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      toast.error('Failed to upload bill image');
      setBillImageUploaded(false);
      setBillImageUrl(null);
    } finally {
      setIsUploadingBill(false);
    }
  };

  const handleTakeCameraPhoto = () => {
    openCamera({
      onSelectFile: (file) => handleBillImageSelect(file),
      fileNamePrefix: `bill-${order.orderId || order._id}`
    })
  }

  const handlePickFromGallery = () => {
    cameraInputRef.current?.click()
  }

  const isAtPickup = status === 'REACHED_PICKUP';
  const displayOrderId = order.order_id || order.orderId || order.displayOrderId || order.orderMongoId || (order._id ? String(order._id).slice(-6) : null);
  const restaurantName = order.restaurantName || order.restaurant_name || order.restaurantId?.restaurantName || order.restaurantId?.name || 'Restaurant';
  const restLoc = order.restaurantLocation || order.restaurantId?.location || {};
  const restLat = order.restaurant_lat || order.restaurantLat || restLoc.latitude || restLoc.lat || (Array.isArray(restLoc.coordinates) ? restLoc.coordinates[1] : null);
  const restLng = order.restaurant_lng || order.restaurantLng || restLoc.longitude || restLoc.lng || (Array.isArray(restLoc.coordinates) ? restLoc.coordinates[0] : null);
  const restaurantAddress = order.restaurantAddress || order.restaurant_address || restLoc.address || restLoc.formattedAddress || [order.restaurantId?.addressLine1, order.restaurantId?.area, order.restaurantId?.city].filter(Boolean).join(', ') || 'Address not available';
  const restaurantPhone =
    order.restaurantPhone ||
    order.restaurant_phone ||
    order.restaurantId?.phone ||
    order.restaurantId?.ownerPhone ||
    '';
  const items = order.items || [];
  const restaurantLogo = order.restaurantImage || order.restaurant?.logo || order.restaurant?.profileImage || 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png';

  const handleNavigateToRestaurant = () => {
    let navUrl = '';
    if (restLat && restLng && !isNaN(Number(restLat)) && !isNaN(Number(restLng))) {
      navUrl = `https://www.google.com/maps/dir/?api=1&destination=${restLat},${restLng}`;
    } else if (restaurantAddress && restaurantAddress !== 'Address not available') {
      navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurantAddress + ', ' + restaurantName)}`;
    } else {
      navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurantName)}`;
    }
    window.open(navUrl, '_blank');
  };

  return (
    <div className="absolute inset-0 z-[110] flex items-end justify-center">
      {/* Background Dim */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm -z-10"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full max-w-lg bg-white rounded-t-[3.5rem] shadow-[0_-25px_80px_rgba(0,0,0,0.5)] flex flex-col max-h-[88vh] overflow-hidden"
      >
        {/* Handle / Minimize */}
        <div className="w-full flex justify-center py-3 bg-white relative z-20">
          <button 
            onClick={onMinimize} 
            className="w-12 h-1.5 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors active:scale-95"
            aria-label="Minimize"
          />
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {/* Restaurant Header */}
          <div className="p-8 pb-6">
            <div className="flex items-start justify-between mb-6 pb-6 border-b border-gray-50">
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-black/5 overflow-hidden border border-gray-100 ring-4 ring-gray-50">
                  <img src={restaurantLogo} alt="Logo" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-gray-950 text-2xl font-black tracking-tight leading-none">{restaurantName}</h3>
                    {displayOrderId && (
                      <span className="bg-gray-100 text-gray-800 text-xs font-black px-2.5 py-1 rounded-lg border border-gray-200 shrink-0">
                        #{displayOrderId}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAtPickup ? (
                      <div className="bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                        <span className="text-emerald-600 text-[10px] font-black uppercase tracking-widest">At Restaurant ✓</span>
                      </div>
                    ) : (
                      <div className="bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                        <span className="text-orange-600 text-[10px] font-black uppercase tracking-widest">
                          {(distanceToTarget / 1000).toFixed(1)} km • {eta || '--'} min
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5">
                {restaurantPhone && (
                  <button
                    onClick={() => window.location.href = `tel:${restaurantPhone}`}
                    className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 hover:bg-emerald-100 transition-colors active:scale-90"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={handleNavigateToRestaurant}
                  className="w-11 h-11 rounded-2xl bg-gray-950 flex items-center justify-center text-white shadow-xl hover:bg-gray-800 transition-colors active:scale-90"
                  title="Navigate to Restaurant on Google Maps"
                >
                  <Navigation className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="space-y-4">
              {/* Real-time Food Preparation Status Banner */}
              {(() => {
                const normalizedStatus = String(order?.orderStatus || order?.status || order?.deliveryState?.status || '').toLowerCase();
                const isFoodReady = 
                  normalizedStatus === 'ready_for_pickup' || 
                  normalizedStatus === 'ready' || 
                  Boolean(order?.isFoodReady) || 
                  Boolean(order?.deliveryState?.isFoodReady) ||
                  Boolean(order?.deliveryState?.foodReadyAt);

                return (
                  <div className={`p-4 rounded-[2rem] border transition-all ${
                    isFoodReady 
                      ? 'bg-emerald-50/90 border-emerald-200 shadow-sm' 
                      : 'bg-amber-50/90 border-amber-200 shadow-sm'
                  }`}>
                    <div className="flex items-start gap-3.5">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                        isFoodReady ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white animate-pulse'
                      }`}>
                        {isFoodReady ? <CheckCircle2 className="w-5 h-5" /> : <ChefHat className="w-5 h-5" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs font-black uppercase tracking-widest ${
                            isFoodReady ? 'text-emerald-800' : 'text-amber-800'
                          }`}>
                            {isFoodReady ? '🟢 Food Ready for Pickup' : '🟠 Food Preparation in Progress'}
                          </p>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                            isFoodReady ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-amber-100 border-amber-300 text-amber-800'
                          }`}>
                            {isFoodReady ? 'Ready' : 'Preparing'}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-gray-700 mt-1 leading-relaxed">
                          {isFoodReady 
                            ? 'Your order is ready. Please collect the order from the restaurant.'
                            : 'The restaurant is still preparing your order. You can wait outside until the order is marked ready.'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* Delivery Instructions (User Note) */}
              {order?.note && (
                <div className="bg-orange-50/50 border border-orange-100 rounded-[2rem] p-5 flex gap-4 items-start relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ChefHat className="w-12 h-12 text-orange-500" />
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                    <ChefHat className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em] mb-1.5">User Note</p>
                    <p className="text-sm font-bold text-gray-800 leading-relaxed italic">"{order.note}"</p>
                  </div>
                </div>
              )}

              {/* Order Items Summary */}
              <div className="space-y-4">
                <button 
                  onClick={() => setShowItems(!showItems)}
                  className="w-full flex items-center justify-between p-5 bg-gray-50/80 rounded-[2rem] border border-gray-100 hover:bg-gray-100 transition-all group"
                >
                  <div className="flex items-center gap-4 text-gray-900">
                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors">
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <span className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Order Contents</span>
                      <span className="text-sm font-black tracking-tight">{items.length || 0} Items Reserved</span>
                    </div>
                  </div>
                  {showItems ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronUp className="w-5 h-5 text-gray-400" />}
                </button>

                <AnimatePresence>
                  {showItems && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-2 px-2"
                    >
                      {items.map((item, idx) => {
                        const variant = item.variantName || item.variant || item.variation || item.selectedVariant?.name || item.optionName || item.size || '';
                        const addons = Array.isArray(item.addons) ? item.addons.map(a => a.name || a.title || a).join(', ') : '';
                        return (
                          <div key={idx} className="flex justify-between items-start p-3.5 bg-gray-50/50 rounded-2xl border border-gray-100">
                            <div className="flex-1 pr-2">
                              <span className="text-gray-900 text-sm font-black uppercase tracking-tight block">
                                {item.name || 'Item Name'}
                              </span>
                              {variant && (
                                <span className="text-xs font-bold text-orange-600 block mt-0.5">
                                  Variation: {variant}
                                </span>
                              )}
                              {addons && (
                                <span className="text-[11px] font-semibold text-gray-500 block mt-0.5">
                                  Addons: {addons}
                                </span>
                              )}
                              {item.notes && (
                                <span className="text-[11px] italic text-gray-400 block mt-0.5">
                                  Note: {item.notes}
                                </span>
                              )}
                            </div>
                            <span className="text-emerald-700 font-black bg-emerald-100/60 px-3 py-1 rounded-xl text-xs shrink-0">
                              x{item.quantity || 1}
                            </span>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Action Sliders (Sticky Bottom) */}
        <div className="p-8 pt-0 pb-12 space-y-6 bg-white border-t border-gray-50">
          {!isAtPickup ? (
            <div className="pt-6">
              <p className={`text-center text-[10px] font-black uppercase tracking-[0.2em] mb-4 transition-colors ${
                isWithinRange ? 'text-emerald-600' : 'text-orange-500 animate-pulse'
              }`}>
                {isWithinRange ? 'Ready - Swipe to confirm arrival' : 'Get closer to restaurant'}
              </p>
              <ActionSlider 
                key="action-reach"
                label="Slide to Reach" 
                successLabel="Reached!"
                disabled={!isWithinRange}
                onConfirm={onReachedPickup}
                color="bg-emerald-600"
              />
            </div>
          ) : (
            <div className="pt-6 space-y-6">
              <div className="flex justify-center items-center gap-4 w-full">
                 {!billImageUploaded && !isUploadingBill && (
                   <>
                      <button
                        onClick={handleTakeCameraPhoto}
                        className="flex-1 flex items-center justify-center gap-3 py-5 rounded-[1.5rem] bg-gray-950 text-white font-black text-[11px] uppercase tracking-widest shadow-2xl active:scale-95 transition-all group"
                      >
                        <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span>Camera</span>
                      </button>
                      <button
                        onClick={handlePickFromGallery}
                        className="flex-1 flex items-center justify-center gap-3 py-5 rounded-[1.5rem] bg-orange-50 text-orange-600 border-2 border-dashed border-orange-200 font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all group"
                      >
                        <ImageIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span>Gallery</span>
                      </button>
                   </>
                 )}

                 {isUploadingBill && (
                    <div className="w-full flex items-center justify-center gap-3 py-5 rounded-[1.5rem] bg-gray-50 text-gray-400 border border-gray-100 font-black text-[11px] uppercase tracking-widest">
                       <Loader2 className="w-5 h-5 animate-spin" />
                       <span>Uploading Bill...</span>
                    </div>
                 )}

                 {billImageUploaded && (
                    <div className="w-full flex items-center justify-center gap-3 py-5 rounded-[1.5rem] bg-emerald-50 text-emerald-700 border border-emerald-100 font-black text-[11px] uppercase tracking-widest shadow-inner">
                       <CheckCircle2 className="w-5 h-5" />
                       <span>Bill Verified ✓</span>
                    </div>
                 )}

                 <input
                   ref={cameraInputRef}
                   type="file"
                   accept="image/*"
                   onChange={(e) => handleBillImageSelect(e.target.files[0])}
                   className="hidden"
                 />
              </div>

              <div>
                <p className={`text-center text-[10px] font-black uppercase tracking-[0.2em] mb-4 ${billImageUploaded ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {billImageUploaded ? "Order Ready - Swipe to pick up" : "Capture bill to unlock pickup"}
                </p>
                <ActionSlider 
                  key="action-pickup"
                  label="Slide to Pick Up" 
                  successLabel="Picked Up!"
                  disabled={!billImageUploaded}
                  onConfirm={() => onPickedUp(billImageUrl)}
                  color="bg-orange-500"
                />
              </div>
            </div>
          )}

          {/* Emergency Handover Order */}
          <div className="pt-2">
            <button
              onClick={() => setShowHandoverModal(true)}
              className="w-full py-3.5 text-xs font-black text-amber-700 bg-amber-50 rounded-2xl border border-amber-200 hover:bg-amber-100 active:scale-95 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4 text-amber-600 animate-spin-slow" />
              <span>Handover Order (Emergency)</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Emergency Handover Modal */}
      <AnimatePresence>
        {showHandoverModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !isSubmittingHandover && setShowHandoverModal(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl z-10 space-y-4 border border-gray-100"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 leading-tight">Emergency Handover</h3>
                    <p className="text-xs text-gray-500 font-semibold">Select reason to release order for re-dispatch</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHandoverModal(false)}
                  disabled={isSubmittingHandover}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {emergencyReasons.map((reason) => {
                  const isSelected = selectedReason === reason.id;
                  return (
                    <div
                      key={reason.id}
                      onClick={() => setSelectedReason(reason.id)}
                      className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? "border-amber-500 bg-amber-50/80 shadow-sm"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-900">{reason.label}</p>
                        <span className="text-[10px] font-semibold text-gray-400">{reason.detail}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedReason === "other" && (
                <div>
                  <textarea
                    placeholder="Enter additional emergency detail..."
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    rows={2}
                    className="w-full p-3 text-xs border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowHandoverModal(false)}
                  disabled={isSubmittingHandover}
                  className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-gray-700 font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleHandoverSubmit}
                  disabled={!selectedReason || isSubmittingHandover}
                  className="flex-1 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20"
                >
                  {isSubmittingHandover && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Handover Order</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PickupActionModal;

