import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  GoogleMap,
  Marker,
  DirectionsService,
  Polygon,
  Polyline,
  OverlayView
} from '@react-google-maps/api';
import { useAppGoogleMapsLoader } from '@/modules/Taxi/modules/admin/utils/googleMaps';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { zoneAPI } from '@food/api';
import bikeLogo from '@food/assets/bikelogo.png';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  position: 'absolute',
  inset: 0
};

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  mapTypeControl: false,
  scaleControl: false,
  streetViewControl: false,
  rotateControl: false,
  fullscreenControl: false,
  styles: [
    { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
    { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] }
  ]
};
export const LiveMap = ({ onMapClick, onMapLoad, onPathReceived, onPolylineReceived, zoom = 12 }) => {
  const { riderLocation, activeOrder, tripStatus } = useDeliveryStore();
  
  const { isLoaded, loadError } = useAppGoogleMapsLoader();

  const [directions, setDirections] = useState(null);
  const [map, setMapInternal] = useState(null);
  const [zones, setZones] = useState([]);
  const [lastDirectionsAt, setLastDirectionsAt] = useState(0);

  const handleMapLoad = (mapInstance) => {
    mapInstance.setOptions({
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      scaleControl: false,
      streetViewControl: false,
      rotateControl: false,
      fullscreenControl: false
    });
    setMapInternal(mapInstance);
    if (onMapLoad) onMapLoad(mapInstance);
  };

  useEffect(() => {
    if (!activeOrder || tripStatus === 'COMPLETED' || tripStatus === 'IDLE') {
      setLastDirectionsAt(0);
      setDirections(null);
    }
  }, [tripStatus, activeOrder?._id, activeOrder]);

  const targetLocation = useMemo(() => {
    if (!activeOrder) return null;
    let rawLoc = null;
    if (tripStatus === 'PICKING_UP' || tripStatus === 'REACHED_PICKUP') {
      rawLoc = activeOrder.restaurantLocation || activeOrder.restaurant_location || activeOrder.restaurantId?.location;
      if (!rawLoc && (activeOrder.restaurant_lat || activeOrder.restaurantLat)) {
        rawLoc = { lat: activeOrder.restaurant_lat || activeOrder.restaurantLat, lng: activeOrder.restaurant_lng || activeOrder.restaurantLng };
      }
    } else if (tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP') {
      rawLoc = activeOrder.customerLocation || activeOrder.customer_location || activeOrder.deliveryAddress?.location;
      if (!rawLoc && (activeOrder.customer_lat || activeOrder.customerLat)) {
        rawLoc = { lat: activeOrder.customer_lat || activeOrder.customerLat, lng: activeOrder.customer_lng || activeOrder.customerLng };
      }
    }
    if (!rawLoc) return null;
    const coords = Array.isArray(rawLoc.coordinates) ? rawLoc.coordinates : [];
    const lat = parseFloat(rawLoc.lat || rawLoc.latitude || (coords.length >= 2 ? coords[1] : null));
    const lng = parseFloat(rawLoc.lng || rawLoc.longitude || (coords.length >= 2 ? coords[0] : null));
    return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : null;
  }, [activeOrder, tripStatus]);

  useEffect(() => {
    setDirections(null);
    setLastDirectionsAt(0);
  }, [targetLocation?.lat, targetLocation?.lng, activeOrder?._id]);

  const parsedRiderLocation = useMemo(() => {
    if (!riderLocation) return null;
    const lat = parseFloat(riderLocation.lat || riderLocation.latitude);
    const lng = parseFloat(riderLocation.lng || riderLocation.longitude);
    return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng, heading: parseFloat(riderLocation.heading || 0) } : null;
  }, [riderLocation]);

  useEffect(() => { if (map) map.setZoom(zoom); }, [zoom, map]);

  const shouldUpdateRoute = useMemo(() => {
    const now = Date.now();
    if (!directions) return true;

    const elapsed = now - lastDirectionsAt;
    if (elapsed < 15000) return false;

    if (parsedRiderLocation && directions?.routes?.[0]?.overview_path?.length && window.google?.maps?.geometry) {
      const fullPath = directions.routes[0].overview_path;
      const riderPos = new window.google.maps.LatLng(parsedRiderLocation.lat, parsedRiderLocation.lng);
      let minDist = Infinity;
      for (let i = 0; i < fullPath.length; i++) {
        const d = window.google.maps.geometry.spherical.computeDistanceBetween(riderPos, fullPath[i]);
        if (d < minDist) minDist = d;
      }
      if (minDist > 80) return true;
    }

    return elapsed >= 60000;
  }, [lastDirectionsAt, directions, parsedRiderLocation]);

  useEffect(() => {
    if (directions && onPathReceived) {
      const path = directions.routes[0]?.overview_path;
      if (path) {
        const simplePath = path.map(p => ({
          lat: typeof p.lat === 'function' ? p.lat() : (p.lat || p.latitude),
          lng: typeof p.lng === 'function' ? p.lng() : (p.lng || p.longitude)
        }));
        onPathReceived(simplePath);
      }
    }
  }, [directions, onPathReceived]);

  const directionsCallback = useCallback((result, status) => {
    if (status === 'OK' && result) {
      setDirections(result);
      setLastDirectionsAt(Date.now());
      const encodedPolyline = result.routes[0]?.overview_polyline;
      if (encodedPolyline && onPolylineReceived) onPolylineReceived(encodedPolyline);
    }
  }, [onPolylineReceived]);

  useEffect(() => {
    (async () => {
      try {
        const response = await zoneAPI.getPublicZones();
        if (response?.data?.success && response.data.data?.zones) {
          const formattedZones = response.data.data.zones.map(zone => ({
            ...zone,
            paths: (zone.coordinates || []).map(coord => ({ lat: coord.latitude, lng: coord.longitude }))
          })).filter(z => z.paths.length >= 3);
          setZones(formattedZones);
        }
      } catch (err) {}
    })();
  }, []);

  const restaurantMarkerUrl = useMemo(() => {
    if (!activeOrder) return 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png';
    return activeOrder.restaurantImage || activeOrder.restaurant?.logo || activeOrder.restaurant?.profileImage || 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png';
  }, [activeOrder]);

  const customerMarkerUrl = useMemo(() => {
    if (!activeOrder) return 'https://cdn-icons-png.flaticon.com/512/1275/1275302.png';
    return activeOrder.customerImage || activeOrder.user?.logo || activeOrder.user?.profileImage || 'https://cdn-icons-png.flaticon.com/512/1275/1275302.png';
  }, [activeOrder]);

  const lastCenteredPosRef = useRef(null);
  useEffect(() => {
    if (map && parsedRiderLocation) {
      if (!lastCenteredPosRef.current) {
        map.panTo(parsedRiderLocation);
        lastCenteredPosRef.current = parsedRiderLocation;
        return;
      }
      const dist = window.google.maps.geometry.spherical.computeDistanceBetween(
        new window.google.maps.LatLng(parsedRiderLocation.lat, parsedRiderLocation.lng),
        new window.google.maps.LatLng(lastCenteredPosRef.current.lat, lastCenteredPosRef.current.lng)
      );
      if (dist > 30) {
        map.panTo(parsedRiderLocation);
        lastCenteredPosRef.current = parsedRiderLocation;
      }
    }
  }, [map, parsedRiderLocation]);

  const remainingPath = useMemo(() => {
    if (!directions || !parsedRiderLocation) return [];
    const fullPath = directions.routes[0].overview_path;
    if (!fullPath?.length || !window.google?.maps?.geometry) return fullPath || [];

    let closestIndex = 0;
    let minDist = Infinity;
    const rPos = new window.google.maps.LatLng(parsedRiderLocation.lat, parsedRiderLocation.lng);
    for (let i = 0; i < fullPath.length; i++) {
      const d = window.google.maps.geometry.spherical.computeDistanceBetween(rPos, fullPath[i]);
      if (d < minDist) { minDist = d; closestIndex = i; }
    }
    return fullPath.slice(closestIndex);
  }, [directions, parsedRiderLocation]);

  if (loadError) return <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-red-500 font-bold">Map Load Error</div>;
  if (!isLoaded) return <div className="absolute inset-0 flex items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" /></div>;

  const directionsServiceOptions = (parsedRiderLocation && targetLocation) ? {
    origin: parsedRiderLocation,
    destination: targetLocation,
    travelMode: 'DRIVING',
  } : null;

  return (
    <div className="absolute inset-0 z-0 text-gray-900 overflow-hidden flex flex-col">
      <GoogleMap
        onLoad={handleMapLoad}
        mapContainerStyle={mapContainerStyle}
        zoom={14}
        onClick={(e) => onMapClick?.(e.latLng.lat(), e.latLng.lng())}
        options={mapOptions}
      >
        {directionsServiceOptions && shouldUpdateRoute && (
          <DirectionsService options={directionsServiceOptions} callback={directionsCallback} />
        )}

        {remainingPath.length > 0 && (
          <Polyline path={remainingPath} options={{ strokeColor: '#22c55e', strokeOpacity: 0.9, strokeWeight: 6, zIndex: 10 }} />
        )}

        {directions && (
          <Polyline path={directions.routes[0].overview_path} options={{ strokeColor: '#94a3b8', strokeOpacity: 0, strokeWeight: 4, zIndex: 1, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.3, scale: 3, strokeWeight: 4, strokeColor: '#64748b' }, offset: '0', repeat: '15px' }] }} />
        )}

        {parsedRiderLocation && (
          <OverlayView position={parsedRiderLocation} mapPaneName={OverlayView.MARKER_LAYER}>
            <div style={{ transform: `translate(-50%, -50%) rotate(${parsedRiderLocation.heading || 0}deg)`, transition: 'transform 0.5s linear' }} className="relative w-[4.5rem] h-[4.5rem]">
              <img
                src="/MapRider.png"
                alt="Delivery partner"
                className="w-full h-full object-contain drop-shadow-2xl pointer-events-none select-none"
                onError={(e) => { e.target.src = "/MapRider.png"; }}
              />
            </div>
          </OverlayView>
        )}

        {targetLocation && (
          <Marker position={targetLocation} icon={{ url: (tripStatus === 'PICKING_UP' || tripStatus === 'REACHED_PICKUP') ? restaurantMarkerUrl : customerMarkerUrl, scaledSize: new window.google.maps.Size(44, 44), anchor: new window.google.maps.Point(22, 22) }} />
        )}

        {zones.map((zone) => (
          <Polygon key={zone._id} paths={zone.paths} options={{ fillColor: "#22c55e", fillOpacity: 0.1, strokeColor: "#22c55e", strokeOpacity: 0.4, strokeWeight: 2, zIndex: 1 }} />
        ))}
      </GoogleMap>
    </div>
  );
};

export default LiveMap;
