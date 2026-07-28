import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, MapPin, Send, Package } from 'lucide-react';

// Asset Imports
import bikeImg from '../../../assets/icons/bike.png';
import autoImg from '../../../assets/icons/auto.png';
import carImg from '../../../assets/icons/car.png';
import deliveryImg from '../../../assets/icons/Delivery.png';

const GatewayCard = ({ title, subtitle, path, gradient, accentColor, buttonGradient, isRide, onNavigate, delay }) => {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Magnetic pull (4-5px limit)
    setCoords({ x: (x / rect.width) * 5, y: (y / rect.height) * 5 });
  };

  const handleMouseLeave = () => {
    setCoords({ x: 0, y: 0 });
    setIsHovered(false);
  };

  // Card slide-in animation variants
  const cardVariants = {
    hidden: { opacity: 0, x: isRide ? -50 : 50, filter: 'blur(6px)' },
    visible: { 
      opacity: 1, 
      x: 0, 
      filter: 'blur(0px)',
      transition: { duration: 0.6, ease: 'easeOut' }
    }
  };

  return (
    <motion.div
      variants={cardVariants}
      className="relative overflow-visible flex-1"
    >
      {/* Dynamic Background Glow on Hover */}
      <motion.div
        animate={isHovered ? { opacity: 0.2, scale: 1.05 } : { opacity: 0, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={`absolute -inset-1 rounded-[10px] bg-gradient-to-br ${buttonGradient} blur-lg opacity-0 pointer-events-none z-0`}
      />

      <motion.button
        type="button"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={() => setIsHovered(true)}
        onClick={() => onNavigate(path)}
        animate={{ x: coords.x, y: coords.y }}
        whileHover={{ y: -12, scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
        className={`relative z-10 w-full min-h-[190px] flex flex-col justify-between p-4.5 rounded-[8px] bg-gradient-to-br ${gradient} border border-white/70 backdrop-blur-md shadow-[0_16px_36px_rgba(15,23,42,0.05)] text-left overflow-visible select-none group`}
      >
        {/* Shine Sweep Effect */}
        <motion.div
          animate={isHovered ? { x: ['-100%', '200%'] } : { x: '-100%' }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none z-20"
        />

        {/* Faint Road/Map Dotted Pattern */}
        <div className="absolute inset-0 opacity-15 pointer-events-none z-0 overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 160 160" fill="none">
            <path
              d={isRide ? "M-10,40 Q40,70 85,30 T170,90" : "M170,40 Q120,70 85,30 T-10,90"}
              stroke="#0F172A"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {/* Location Pins */}
            <circle cx={isRide ? 90 : 70} cy={isRide ? 35 : 25} r="2" fill={accentColor} />
            <circle cx={isRide ? 30 : 130} cy={isRide ? 55 : 45} r="1.5" fill="#475569" />
          </svg>
        </div>

        {/* Top: Branding/Labels */}
        <div className="relative z-10 flex justify-between items-start w-full">
          <div>
            <h3 className="text-[20px] font-black text-slate-800 tracking-tight leading-none">
              {title}
            </h3>
            <p className="mt-1.5 text-[10.5px] font-bold text-slate-500 max-w-[130px] leading-snug">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Mid: Illustrations Overlay (Drives in, floats infinitely) */}
        {isRide ? (
          // Ride Illustration (Car + Bike + Auto overlapping)
          <div className="absolute inset-0 pointer-events-none z-10 overflow-visible">
            {/* Auto (Right layer) */}
            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 50, delay: delay + 0.3 }}
              className="absolute bottom-1 right-[-4px] w-[50px] h-[50px]"
            >
              <motion.img
                animate={{ y: [0, -3.5, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                src={autoImg}
                alt=""
                className="w-full h-full object-contain drop-shadow-md"
              />
            </motion.div>

            {/* Bike (Middle layer) */}
            <motion.div
              initial={{ x: -80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 60, delay: delay + 0.4 }}
              className="absolute bottom-1.5 right-[34px] w-[36px] h-[36px]"
            >
              <motion.img
                animate={isHovered ? { rotate: -6 } : { rotate: 0 }}
                transition={{ duration: 0.3 }}
                src={bikeImg}
                alt=""
                className="w-full h-full object-contain drop-shadow-md"
              />
            </motion.div>

            {/* Car (Front layer) */}
            <motion.div
              initial={{ x: -120, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 45, delay: delay + 0.2 }}
              className="absolute bottom-[24px] right-[-10px] w-[62px] h-[62px]"
            >
              <motion.img
                animate={isHovered ? { scale: 1.05, rotate: 2 } : { scale: 1, rotate: 0 }}
                transition={{ duration: 0.3 }}
                src={carImg}
                alt=""
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </motion.div>
          </div>
        ) : (
          // Delivery Illustration (Scooter delivering parcel)
          <div className="absolute inset-0 pointer-events-none z-10 overflow-visible">
            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 50, delay: delay + 0.3 }}
              className="absolute bottom-[6px] right-[-8px] w-[86px] h-[86px]"
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="relative w-full h-full"
              >
                <img
                  src={deliveryImg}
                  alt=""
                  className="w-full h-full object-contain drop-shadow-lg"
                />
                {/* Floating mini parcel badge indicator */}
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-1 right-2 bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-1 rounded-lg border border-white/50 shadow-md"
                >
                  <Package size={8} />
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        )}

        {/* Bottom: Custom Pulsing Gradient CTA Button */}
        <div className="relative z-10 flex items-center">
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ repeat: Infinity, duration: 3, delay: isRide ? 0 : 1.5 }}
            className={`h-9 px-4.5 rounded-full bg-gradient-to-r ${buttonGradient} flex items-center gap-1.5 text-[11px] font-black text-white shadow-md shadow-slate-900/10 relative overflow-hidden group-hover:shadow-lg`}
          >
            <span>{isRide ? 'Book Now' : 'Send Now'}</span>
            <motion.div
              animate={isHovered ? { x: 3 } : { x: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <ArrowRight size={12} strokeWidth={2.5} />
            </motion.div>
            {/* Ripple shine layer */}
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.div>
        </div>
      </motion.button>
    </motion.div>
  );
};

const ActionsSection = ({ plain = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const resolvePath = (path) => `${routePrefix}${path}`;

  // Section entrance reveal variants triggered on scroll
  const sectionVariants = {
    hidden: { opacity: 0, y: 35, filter: 'blur(8px)' },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        duration: 0.6,
        ease: 'easeOut',
        staggerChildren: 0.12
      }
    }
  };

  const containerClass = plain
    ? 'relative z-10 px-4 mt-1'
    : 'mx-5 my-4 rounded-[32px] bg-gradient-to-br from-[#EBF1FA] via-[#F3F7FC] to-[#F8FAFC] border border-blue-100/30 shadow-[0_24px_50px_rgba(30,41,59,0.04)] relative overflow-visible px-5 py-5.5';

  return (
    <motion.div 
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={sectionVariants}
      className={containerClass}
    >
      {/* Light yellow & red-orange background blobs (only if NOT plain) */}
      {!plain && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-10 left-4 w-44 h-44 rounded-full bg-yellow-400/8 blur-3xl animate-pulse" />
          <div className="absolute bottom-10 right-4 w-48 h-48 rounded-full bg-[#E53935]/4 blur-3xl" />
        </div>
      )}

      {/* Header with expand animations */}
      <div className="mb-5 relative z-10 ml-1">
        <h2 className="text-[19px] font-black text-slate-800 tracking-tight relative inline-block">
          What do you need today?
          <motion.div 
            initial={{ width: 0 }}
            whileInView={{ width: '80%' }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
            className="absolute bottom-[-3px] left-0 h-[2.5px] bg-gradient-to-r from-[#FF6B00] to-transparent" 
          />
        </h2>
      </div>

      {/* Grid wrapper */}
      <div className="flex gap-3.5 relative z-10 overflow-visible">
        <GatewayCard
          title="Ride"
          subtitle="Bike, Auto & Cab rides"
          path={resolvePath('/ride/select-location')}
          gradient="from-[#FFFDF0]/80 via-[#FFF7F1]/80 to-[#FFE5D3]/70"
          accentColor="#FF6B00"
          buttonGradient="from-[#FF6B00] to-[#E53935]"
          isRide={true}
          onNavigate={navigate}
          delay={0.1}
        />

        <GatewayCard
          title="Delivery"
          subtitle="Send parcels across the city"
          path={resolvePath('/parcel/type')}
          gradient="from-[#FFFDF5]/80 via-[#F4F5FF]/80 to-[#ECE9FF]/70"
          accentColor="#7C3AED"
          buttonGradient="from-[#7C3AED] to-[#4F46E5]"
          isRide={false}
          onNavigate={navigate}
          delay={0.22}
        />
      </div>
    </motion.div>
  );
};

export default ActionsSection;
