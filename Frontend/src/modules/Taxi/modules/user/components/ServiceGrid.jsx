import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { userService } from '../services/userService';
import { POOLING_ENABLED, RENTAL_ENABLED } from '../../../shared/featureFlags';
import toast from 'react-hot-toast';
import { ArrowRight, Compass, Car, Package, Users, Bus } from 'lucide-react';
import { getSavedLocationCoords } from '../services/locationStore';

// Asset Imports
import busImg from '../../../assets/3d images/AutoCab/bus.png';
import poolingImg from '../../../assets/3d images/AutoCab/taxi.png';
import outstationImg from '../../../assets/3d images/AutoCab/one way.png';
import rideImg from '../../../assets/3d images/AutoCab/taxi.png';
import deliveryImg from '../../../assets/icons/Delivery.png';

const ServiceCard = ({ icon, fallbackIcon, label, description, path, iconGradient, borderColor, delay }) => {
  const navigate = useNavigate();
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [imgSrc, setImgSrc] = useState(icon);

  useEffect(() => {
    setImgSrc(icon);
  }, [icon]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Magnetic physics pull (4px limit for square cards)
    setCoords({ x: (x / rect.width) * 5, y: (y / rect.height) * 5 });
  };

  const handleMouseLeave = () => {
    setCoords({ x: 0, y: 0 });
    setIsHovered(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      className="relative w-full"
    >
      {/* Glowing background on hover (outside color glow) */}
      <motion.div
        animate={isHovered ? { opacity: 0.9, scale: 1.05 } : { opacity: 0, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={`absolute -inset-0.5 rounded-[14px] bg-gradient-to-br ${iconGradient} blur-md opacity-0 pointer-events-none z-0`}
      />

      <motion.button
        type="button"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={() => setIsHovered(true)}
        onClick={() => path && navigate(path)}
        animate={{ x: coords.x, y: coords.y }}
        whileHover={{ y: -6, scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="relative z-10 w-full h-[94px] flex flex-col items-center justify-between p-2.5 rounded-[12px] bg-white/85 border border-slate-200/50 backdrop-blur-xl shadow-md shadow-slate-200/20 hover:shadow-lg hover:shadow-slate-300/30 transition-shadow duration-300 text-center overflow-hidden select-none group"
      >
        {/* Shine Sweep Effect */}
        <motion.div
          animate={isHovered ? { x: ['-100%', '200%'] } : { x: '-100%' }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none z-20"
        />

        {/* Center: Icon container with continuous floating animation */}
        <div className="flex flex-col items-center justify-center flex-1 w-full">
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className={`flex h-9 w-9 items-center justify-center rounded-[8px] bg-gradient-to-br ${iconGradient} shadow-md shadow-black/10`}
          >
            <motion.img
              animate={isHovered ? { rotate: [0, 4, 0] } : {}}
              transition={{ duration: 0.3 }}
              src={imgSrc || icon}
              onError={() => fallbackIcon && setImgSrc(fallbackIcon)}
              alt={label || ''}
              className="h-6 w-6 object-contain drop-shadow-sm"
            />
          </motion.div>
        </div>

        {/* Bottom: Text area */}
        <div className="w-full mt-1">
          <h3 className="text-[10px] font-black text-slate-800 tracking-tight leading-tight truncate">
            {label}
          </h3>
          <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wider leading-none mt-0.5 truncate">
            {description}
          </p>
        </div>
      </motion.button>
    </motion.div>
  );
};

const DEFAULT_SERVICES = [
  { id: 'cab', icon: rideImg, label: 'Cab', description: 'Ride', iconGradient: 'from-[#FF6B00] to-[#FF8C42]', path: '/taxi/user/ride/select-location' },
  { id: 'parcel', icon: deliveryImg, label: 'Parcel', description: 'Send Pack', iconGradient: 'from-[#FF8A65] to-[#E53935]', path: '/taxi/user/parcel/type' },
  { id: 'outstation', icon: outstationImg, label: 'Book Outstation', description: 'Intercity', iconGradient: 'from-[#1E3A8A] to-[#2563EB]', path: '/taxi/user/intercity' },
  { id: 'bus', icon: busImg, label: 'Bus', description: 'Reserve', iconGradient: 'from-[#7C3AED] to-[#A855F7]', path: '/taxi/user/bus' },
  { id: 'pooling', icon: poolingImg, label: 'Pooling', description: 'Share Cab', iconGradient: 'from-[#10B981] to-[#34D399]', path: '/taxi/user/pooling' },
];

const ServiceGrid = ({ plain = false }) => {
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [loading, setLoading] = useState(false);

  const getPath = (module) => {
    if (module.transport_type === 'delivery') return '/taxi/user/parcel/type';
    if (RENTAL_ENABLED && module.service_type === 'rental') return '/taxi/user/rental';
    if (module.service_type === 'outstation') return '/taxi/user/intercity';
    if (POOLING_ENABLED && (module.service_type === 'pooling' || module.name.toLowerCase().includes('pooling'))) {
      return '/taxi/user/pooling';
    }
    if (module.service_type === 'bus' || module.name.toLowerCase().includes('bus')) {
      return '/taxi/user/bus';
    }
    return '/taxi/user/ride/select-location';
  };

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoading(true);
        const coords = getSavedLocationCoords();
        const params = {};
        if (coords) {
          params.lng = coords[0];
          params.lat = coords[1];
        }
        const res = await userService.getAppModules(params);
        const results = res?.results || res?.data?.results || [];
        
        // Filter active app modules
        const activeModules = results.filter((m) => {
          if (!m.active) return false;
          if (!RENTAL_ENABLED && m.service_type === 'rental') return false;
          if (!POOLING_ENABLED && (m.service_type === 'pooling' || String(m.name || '').toLowerCase().includes('pooling'))) {
            return false;
          }
          return true;
        });

        // Config mappings matching premium designs & admin settings
        const mapped = activeModules.map((m, idx) => {
          const nameLower = String(m.name || '').toLowerCase();
          const isBus = m.service_type === 'bus' || nameLower.includes('bus');
          const isPooling = m.service_type === 'pooling' || nameLower.includes('pooling');
          const isOutstation = m.service_type === 'outstation' || nameLower.includes('outstation');
          const isParcel = m.transport_type === 'delivery' || nameLower.includes('parcel') || nameLower.includes('delivery');

          const adminIcon = (
            m.mobile_menu_icon ||
            m.mobile_menu_cover_image ||
            m.icon ||
            m.image ||
            m.thumbnail ||
            m.icon_url
          );

          let fallbackIcon = rideImg;
          let iconGradient = 'from-[#FF6B00] to-[#FF8C42]';
          let label = m.name || 'Cab';
          let description = m.short_description || 'Ride';

          if (isParcel) {
            fallbackIcon = deliveryImg;
            iconGradient = 'from-[#FF8A65] to-[#E53935]';
            if (!m.short_description) description = 'Send Pack';
          } else if (isOutstation) {
            fallbackIcon = outstationImg;
            iconGradient = 'from-[#1E3A8A] to-[#2563EB]';
            if (!m.short_description) description = 'Intercity';
          } else if (isBus) {
            fallbackIcon = busImg;
            iconGradient = 'from-[#7C3AED] to-[#A855F7]';
            if (!m.short_description) description = 'Reserve';
          } else if (isPooling) {
            fallbackIcon = poolingImg;
            iconGradient = 'from-[#10B981] to-[#34D399]';
            if (!m.short_description) description = 'Share Cab';
          }

          return {
            id: m._id || idx,
            icon: adminIcon && String(adminIcon).trim() !== '' ? adminIcon : fallbackIcon,
            fallbackIcon,
            label,
            description,
            iconGradient,
            path: getPath(m)
          };
        }).filter((item) => Boolean(item.path));

        if (mapped.length > 0) {
          setServices(mapped);
        } else {
          setServices(DEFAULT_SERVICES);
        }
      } catch (err) {
        console.warn('Failed to load services from API, falling back to defaults:', err);
        setServices(DEFAULT_SERVICES);
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  const optionCount = loading ? '...' : services.length;
  const optionLabel = services.length === 1 ? 'Service' : 'Services';

  // Dynamic subtitle listing loaded services
  const serviceListText = services.map(s => s.label).join(', ');
  const dynamicSubtitle = loading 
    ? 'Everything you need in one app.' 
    : `${serviceListText} and more in one app.`;

  const containerClass = plain
    ? 'relative z-10 px-5 mt-1'
    : 'w-full rounded-b-[32px] rounded-t-none bg-gradient-to-br from-[#EBF1FA] via-[#F3F7FC] to-[#F8FAFC] border-b border-x border-blue-100/20 shadow-[0_24px_50px_rgba(30,41,59,0.04)] relative overflow-hidden px-5 pb-6 pt-3';

  return (
    <div className={containerClass}>
      {/* 1. Background Animated Blobs (only if NOT plain) */}
      {!plain && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{
              x: [0, 20, 0],
              y: [0, -15, 0],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-5 left-5 w-52 h-52 rounded-full bg-[#3B82F6]/5 blur-[60px]"
          />
          <motion.div
            animate={{
              x: [0, -15, 0],
              y: [0, 20, 0],
            }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute bottom-10 right-5 w-60 h-60 rounded-full bg-[#6366F1]/5 blur-[80px]"
          />
        </div>
      )}

      {/* 2. Tiny Floating Particles (only if NOT plain) */}
      {!plain && (
        <div className="absolute inset-0 pointer-events-none opacity-20">
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ y: 200, x: Math.random() * 320, opacity: 0.05 }}
              animate={{
                y: -30,
                opacity: [0.05, 0.3, 0.05],
              }}
              transition={{
                duration: 7 + Math.random() * 3,
                repeat: Infinity,
                delay: i * 2,
                ease: 'linear'
              }}
              className="absolute w-1.5 h-1.5 rounded-full bg-blue-300"
            />
          ))}
        </div>
      )}

      {/* 3. Header Section */}
      <div className="relative z-10 flex items-start justify-between gap-4 mb-4">
        <div>
          <motion.p 
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600"
          >
            SERVICES
          </motion.p>
          <motion.h2 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-0.5 text-[20px] font-black tracking-tight text-slate-800 leading-tight"
          >
            Choose your next ride
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-1 text-[11px] font-bold text-slate-500 leading-tight"
          >
            {dynamicSubtitle}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 15px rgba(59,130,246,0.15)' }}
          className="flex items-center gap-1 rounded-full border border-blue-200/30 bg-blue-50/50 backdrop-blur-md px-3 py-1 text-[9px] font-black text-blue-600 transition-all cursor-pointer group flex-shrink-0"
        >
          <span>{optionCount} {optionLabel}</span>
          <ArrowRight size={9} className="transform group-hover:translate-x-1 transition-transform" />
        </motion.div>
      </div>

      {/* 4. Grid of Square Cards (Left aligned) */}
      <div className="relative z-10 grid grid-cols-3 gap-3.5">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="w-full h-[94px] animate-pulse rounded-[12px] border border-white/80 bg-white/40" />
          ))
        ) : (
          services.map((service, index) => (
            <ServiceCard 
              key={service.id} 
              delay={0.2 + index * 0.06}
              {...service} 
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ServiceGrid;
