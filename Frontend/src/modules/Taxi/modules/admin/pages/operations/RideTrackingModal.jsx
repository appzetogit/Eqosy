import React from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import { Loader2, MapPin, Navigation, Phone, X } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER, useAppGoogleMapsLoader } from '../../utils/googleMaps';

const POLL_MS = 4000;
const MAP_STYLE = { width: '100%', height: '100%' };

const hasPoint = (point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng);

const formatAgo = (value) => {
  const time = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(time)) return 'No location yet';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)} min ago`;
};

const RideTrackingModal = ({ ride, onClose }) => {
  const { isLoaded } = useAppGoogleMapsLoader();
  const [tracking, setTracking] = React.useState(null);
  const [error, setError] = React.useState('');
  const [map, setMap] = React.useState(null);
  const hasFramedRef = React.useRef(false);

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await adminService.getRideTracking(ride.id);
        const payload = response?.data?.data || response?.data || response;
        if (active) {
          setTracking(payload);
          setError('');
        }
      } catch (err) {
        if (active) setError(err?.message || 'Could not load tracking');
      }
    };

    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [ride.id]);

  const driverPoint = hasPoint(tracking?.driverLocation) ? tracking.driverLocation : null;
  const pickupPoint = hasPoint(tracking?.pickup) ? tracking.pickup : null;
  const dropPoint = hasPoint(tracking?.drop) ? tracking.drop : null;
  const started = ['started', 'arrived'].includes(String(tracking?.liveStatus || '').toLowerCase());
  const target = started ? dropPoint : pickupPoint;

  // Fit the map once, then only follow the driver so the admin can still zoom around.
  React.useEffect(() => {
    if (!map || !window.google?.maps || hasFramedRef.current) return;
    const points = [driverPoint, pickupPoint, dropPoint].filter(Boolean);
    if (points.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 80);
    hasFramedRef.current = true;
  }, [map, driverPoint, pickupPoint, dropPoint]);

  React.useEffect(() => {
    if (map && hasFramedRef.current && driverPoint) {
      map.panTo(driverPoint);
    }
  }, [map, driverPoint?.lat, driverPoint?.lng]);

  const driverIcon = isLoaded && window.google?.maps
    ? {
      path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 6,
      fillColor: '#0f172a',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      rotation: Number(tracking?.driverLocation?.heading) || 0,
    }
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Navigation size={18} /> Live tracking
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600">
                {tracking?.liveStatus || ride.liveStatus || 'live'}
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">{ride.requestId} • updates every few seconds</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_280px]">
          <div className="relative min-h-[280px] bg-slate-100">
            {!HAS_VALID_GOOGLE_MAPS_KEY ? (
              <p className="p-6 text-sm text-slate-500">Google Maps key is not configured.</p>
            ) : !isLoaded ? (
              <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : (
              <GoogleMap
                mapContainerStyle={MAP_STYLE}
                center={driverPoint || pickupPoint || INDIA_CENTER}
                zoom={14}
                onLoad={setMap}
                options={{ disableDefaultUI: false, streetViewControl: false, mapTypeControl: false }}
              >
                {driverPoint && target ? (
                  <PolylineF path={[driverPoint, target]} options={{ strokeColor: '#0f172a', strokeOpacity: 0.6, strokeWeight: 3 }} />
                ) : null}
                {pickupPoint ? <MarkerF position={pickupPoint} label={{ text: 'P', color: '#fff', fontWeight: '700' }} /> : null}
                {dropPoint ? <MarkerF position={dropPoint} label={{ text: 'D', color: '#fff', fontWeight: '700' }} /> : null}
                {driverPoint ? <MarkerF position={driverPoint} icon={driverIcon} zIndex={10} /> : null}
              </GoogleMap>
            )}
            {!driverPoint && tracking ? (
              <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-amber-100 px-4 py-1.5 text-xs font-bold text-amber-700">
                Waiting for the driver's location
              </div>
            ) : null}
          </div>

          <div className="space-y-4 overflow-y-auto border-t border-slate-100 p-4 text-sm lg:border-l lg:border-t-0">
            {error ? <p className="font-medium text-red-600">{error}</p> : null}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Driver</p>
              <p className="mt-1 font-bold text-slate-900">{tracking?.driver?.name || ride.driverName || '--'}</p>
              <p className="text-xs text-slate-500">{tracking?.driver?.vehicleType} {tracking?.driver?.vehicleNumber}</p>
              {tracking?.driver?.phone ? (
                <a href={`tel:${tracking.driver.phone}`} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-indigo-600"><Phone size={12} /> {tracking.driver.phone}</a>
              ) : null}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rider</p>
              <p className="mt-1 font-bold text-slate-900">{tracking?.user?.name || ride.userName || '--'}</p>
              {tracking?.user?.phone ? <p className="text-xs text-slate-500">{tracking.user.phone}</p> : null}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Route</p>
              <p className="mt-1 flex items-start gap-1.5 text-slate-700"><MapPin size={14} className="mt-0.5 shrink-0 text-emerald-500" /> {tracking?.pickup?.label || ride.pickupLabel || '--'}</p>
              <p className="mt-1 flex items-start gap-1.5 text-slate-700"><MapPin size={14} className="mt-0.5 shrink-0 text-rose-500" /> {tracking?.drop?.label || ride.dropLabel || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last location</p>
              <p className="mt-1 font-semibold text-slate-900">{formatAgo(tracking?.driverLocation?.updatedAt)}</p>
              {Number.isFinite(Number(tracking?.driverLocation?.speed)) ? (
                <p className="text-xs text-slate-500">{Math.round(Number(tracking.driverLocation.speed) * 3.6)} km/h</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RideTrackingModal;
