import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, MapPin, Phone, MessageCircle, Navigation,
  Package, Receipt, Store, User, StickyNote,
} from 'lucide-react';
import { PaymentBadge } from '@/modules/DeliveryV2/components/PaymentBadge';

const money = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(/\.00$/, '')}`;

/** Restaurant + customer details read from any rider-facing order payload. */
export const getOrderContacts = (order) => {
  const o = order || {};
  const restLoc = o.restaurantLocation || o.restaurantId?.location || {};
  const restLat = o.restaurant_lat || o.restaurantLat || restLoc.latitude || restLoc.lat || (Array.isArray(restLoc.coordinates) ? restLoc.coordinates[1] : null);
  const restLng = o.restaurant_lng || o.restaurantLng || restLoc.longitude || restLoc.lng || (Array.isArray(restLoc.coordinates) ? restLoc.coordinates[0] : null);
  const restaurantName = o.restaurantName || o.restaurant_name || o.restaurantId?.restaurantName || o.restaurantId?.name || 'Restaurant';
  const restaurantAddress = o.restaurantAddress || o.restaurant_address || restLoc.address || restLoc.formattedAddress ||
    [o.restaurantId?.addressLine1, o.restaurantId?.area, o.restaurantId?.city].filter(Boolean).join(', ') || '';
  const restaurantPhone = o.restaurantPhone || o.restaurant_phone || o.restaurantId?.phone || o.restaurantId?.ownerPhone || '';
  let restaurantNavUrl = null;
  if (restLat && restLng && !isNaN(Number(restLat)) && !isNaN(Number(restLng))) {
    restaurantNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${restLat},${restLng}`;
  } else if (restaurantAddress) {
    restaurantNavUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurantAddress}, ${restaurantName}`)}`;
  }
  return {
    name: restaurantName,
    phone: restaurantPhone,
    address: restaurantAddress,
    navUrl: restaurantNavUrl,
    logo: o.restaurantImage || o.restaurant?.logo || o.restaurant?.profileImage || '',
  };
};

const ActionIcon = ({ onClick, label, className, children, badge }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    aria-label={label}
    title={label}
    className={`relative w-10 h-10 rounded-xl flex items-center justify-center border active:scale-90 transition ${className}`}
  >
    {children}
    {badge > 0 && (
      <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white font-black text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border-2 border-white">
        {badge}
      </span>
    )}
  </button>
);

/** A card whose body opens and closes when its header is tapped. */
const CollapsibleCard = ({ icon, title, subtitle, defaultOpen = false, actions, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
        className="w-full flex items-center justify-between gap-3 p-4 cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">{icon}</div>
          <div className="min-w-0 text-left">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</p>
            <p className="text-sm font-black text-gray-900 truncate">{subtitle || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-50">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DetailRow = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 pt-3">
      <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-400 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
        <p className="text-sm font-bold text-gray-900 break-words">{value}</p>
      </div>
    </div>
  );
};

const BillCard = ({ order }) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const p = order?.pricing || {};
  const lines = [
    ['Item total', p.subtotal],
    ['Delivery fee', p.deliveryFee],
    ['Packaging', p.packagingFee],
    ['Platform fee', p.platformFee],
    ['GST', p.tax],
    ['Discount', p.discount ? -Math.abs(Number(p.discount)) : 0],
  ].filter(([, v]) => Number(v));
  const total = Number(p.total ?? order?.total ?? 0) || 0;

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Receipt className="w-4 h-4 text-gray-400" />
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Bill details</p>
      </div>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-xs font-bold text-gray-400">No item details available</p>}
        {items.map((item, idx) => {
          const variant = item.variantName || item.variant || item.variation || item.selectedVariant?.name || item.optionName || item.size || '';
          const addons = Array.isArray(item.addons) ? item.addons.map((a) => a.name || a.title || a).join(', ') : '';
          const qty = Number(item.quantity) || 1;
          const price = Number(item.price);
          return (
            <div key={idx} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-900">
                  <span className="text-emerald-700 mr-1.5">{qty}x</span>{item.name || 'Item'}
                </p>
                {variant && <p className="text-[11px] font-bold text-orange-600">{variant}</p>}
                {addons && <p className="text-[11px] font-semibold text-gray-500">+ {addons}</p>}
                {item.notes && <p className="text-[11px] italic text-gray-400">Note: {item.notes}</p>}
              </div>
              {Number.isFinite(price) && price > 0 && (
                <span className="text-sm font-black text-gray-900 shrink-0">{money(price * qty)}</span>
              )}
            </div>
          );
        })}
      </div>
      {(lines.length > 0 || total > 0) && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200 space-y-1.5">
          {lines.map(([label, v]) => (
            <div key={label} className="flex justify-between text-xs font-bold text-gray-500">
              <span>{label}</span><span>{Number(v) < 0 ? `-${money(Math.abs(v))}` : money(v)}</span>
            </div>
          ))}
          {total > 0 && (
            <div className="flex justify-between text-sm font-black text-gray-950 pt-1">
              <span>Bill total</span><span>{money(total)}</span>
            </div>
          )}
        </div>
      )}
      <PaymentBadge order={order} className="mt-4" />
    </div>
  );
};

/**
 * Bill + collapsible customer card + collapsible restaurant card, meant to sit inside the
 * scrollable body of the order bottom sheet so the rider sees every detail in one place.
 */
export const OrderInfoSections = ({ order, customer, restaurant, openCard = 'restaurant' }) => {
  const c = customer || {};
  const r = restaurant || {};
  const note = String(order?.note || '').trim();

  return (
    <div className="space-y-3">
      <BillCard order={order} />

      <CollapsibleCard
        icon={<User className="w-5 h-5" />}
        title="Customer details"
        subtitle={c.name}
        defaultOpen={openCard === 'customer'}
        actions={(
          <>
            {c.phone && (
              <ActionIcon onClick={() => { window.location.href = `tel:${c.phone}`; }} label="Call customer" className="bg-emerald-50 text-emerald-600 border-emerald-100">
                <Phone className="w-4 h-4" />
              </ActionIcon>
            )}
            {c.mapNavUrl && (
              <ActionIcon onClick={() => window.open(c.mapNavUrl, '_blank')} label="Navigate to customer" className="bg-gray-950 text-white border-gray-950">
                <Navigation className="w-4 h-4" />
              </ActionIcon>
            )}
          </>
        )}
      >
        <DetailRow icon={<User className="w-4 h-4" />} label="Name" value={c.name} />
        <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone" value={c.phone} />
        <DetailRow icon={<MapPin className="w-4 h-4" />} label="Delivery address" value={c.address} />
        <DetailRow icon={<StickyNote className="w-4 h-4" />} label="Delivery instruction" value={note} />
      </CollapsibleCard>

      <CollapsibleCard
        icon={<Store className="w-5 h-5" />}
        title="Restaurant details"
        subtitle={r.name}
        defaultOpen={openCard === 'restaurant'}
        actions={(
          <>
            {r.phone && (
              <ActionIcon onClick={() => { window.location.href = `tel:${r.phone}`; }} label="Call restaurant" className="bg-emerald-50 text-emerald-600 border-emerald-100">
                <Phone className="w-4 h-4" />
              </ActionIcon>
            )}
            {r.navUrl && (
              <ActionIcon onClick={() => window.open(r.navUrl, '_blank')} label="Navigate to restaurant" className="bg-gray-950 text-white border-gray-950">
                <Navigation className="w-4 h-4" />
              </ActionIcon>
            )}
          </>
        )}
      >
        <DetailRow icon={<Store className="w-4 h-4" />} label="Name" value={r.name} />
        <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone" value={r.phone} />
        <DetailRow icon={<MapPin className="w-4 h-4" />} label="Pickup address" value={r.address} />
      </CollapsibleCard>
    </div>
  );
};

export default OrderInfoSections;
