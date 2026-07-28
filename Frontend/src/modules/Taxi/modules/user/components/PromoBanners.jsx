import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Clock3, ShieldCheck, Sparkles, MapPin } from 'lucide-react';

// Asset Imports for Vehicles
import autoImg from '../../../assets/icons/auto.png';
import taxiImg from '../../../assets/3d images/AutoCab/taxi.png';

const RecommendedCard = ({ title, description, path, gradient, accentColor, image, isLeft, onNavigate, delay }) => {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Magnetic pull limit (4px)
    setCoords({ x: (x / rect.width) * 5, y: (y / rect.height) * 5 });
  };

  const handleMouseLeave = () => {
    setCoords({ x: 0, y: 0 });
    setIsHovered(false);
  };

  // Card slide animation variants
  const cardVariants = {
    hidden: { opacity: 0, x: isLeft ? -50 : 50, filter: 'blur(6px)' },
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
      className="relative overflow-visible"
    >
      {/* Glow Accent Behind Card */}
      <motion.div
        animate={isHovered ? { opacity: 0.25, scale: 1.05 } : { opacity: 0, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={`absolute -inset-1 rounded-[10px] bg-gradient-to-br from-[#FF6B00] to-[#E53935] blur-md opacity-0 pointer-events-none z-0`}
      />

      <motion.button
        type="button"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={() => setIsHovered(true)}
        onClick={() => onNavigate(path)}
        animate={{ x: coords.x, y: coords.y }}
        whileHover={{ y: -10, scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        className={`relative z-10 w-full min-h-[170px] flex flex-col justify-between p-4.5 rounded-[8px] bg-gradient-to-br ${gradient} border border-white/70 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.04)] text-left overflow-visible select-none group`}
      >
        {/* Shine Sweep Effect */}
        <motion.div
          animate={isHovered ? { x: ['-100%', '200%'] } : { x: '-100%' }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none z-20"
        />

        {/* Subtle Route Dotted SVG Background */}
        <div className="absolute inset-0 opacity-20 pointer-events-none z-0 overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 160 140" fill="none">
            <path
              d={isLeft ? "M-10,30 Q40,60 80,20 T170,80" : "M170,30 Q120,60 80,20 T-10,80"}
              stroke="#0F172A"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {/* Animated Location Pin */}
            <motion.g
              animate={{ 
                x: isLeft ? [0, 90, 0] : [0, -90, 0],
                y: isLeft ? [0, -10, 0] : [0, 10, 0]
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
              <circle cx={isLeft ? 30 : 130} cy={isLeft ? 40 : 35} r="2" fill={accentColor} />
            </motion.g>
          </svg>
        </div>

        {/* Top Content: Badge & Icon */}
        <div className="relative z-10 flex justify-between items-start w-full">
          <div className="h-6 w-6 rounded-lg bg-white/60 backdrop-blur-md flex items-center justify-center shadow-sm">
            {isLeft ? (
              <Clock3 size={12} className="text-[#FF6B00]" />
            ) : (
              <ShieldCheck size={12} className="text-[#2563EB]" />
            )}
          </div>
          <span className="text-[8px] font-black uppercase tracking-wider text-slate-500 bg-white/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
            {isLeft ? 'Fastest' : 'Comfort'}
          </span>
        </div>

        {/* Mid Content: Text */}
        <div className="relative z-10 max-w-[65%] mt-1.5">
          <h3 className="text-[15px] font-black text-slate-800 tracking-tight leading-tight">
            {title}
          </h3>
          <p className="mt-1.5 text-[9.5px] font-bold text-slate-500 leading-tight">
            {description}
          </p>
        </div>

        {/* Bottom Content: Premium CTA Button */}
        <div className="relative z-10 flex items-center mt-2.5">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 3, delay: isLeft ? 0 : 1.5 }}
            className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FF6B00] to-[#E53935] flex items-center justify-center text-white shadow-md shadow-orange-500/25 group-hover:shadow-orange-500/40 relative overflow-hidden"
          >
            <motion.div
              animate={isHovered ? { x: 2 } : { x: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <ArrowRight size={13} strokeWidth={2.5} />
            </motion.div>
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.div>
        </div>

        {/* Overlapping Vehicle Illustration (drives in on load, floats thereafter) */}
        <div className="absolute bottom-[-10px] right-[-10px] w-[95px] h-[95px] pointer-events-none z-10 overflow-visible">
          <motion.div
            initial={{ 
              x: isLeft ? -90 : 90, 
              rotate: isLeft ? -10 : 10,
              opacity: 0 
            }}
            animate={{ 
              x: 0, 
              rotate: 0,
              opacity: 1 
            }}
            transition={{ 
              type: "spring", 
              stiffness: 60, 
              damping: 14, 
              delay: delay + 0.3 
            }}
            className="w-full h-full"
          >
            {/* Infinite floating & hover tilt */}
            <motion.div
              animate={{ 
                y: [0, -3.5, 0],
              }}
              transition={{ 
                duration: 2.8, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: isLeft ? 0 : 1.4 
              }}
              style={{ originX: 0.5, originY: 0.8 }}
              className="w-full h-full flex items-center justify-center"
            >
              <motion.img
                animate={isHovered ? { rotate: 3, scale: 1.05 } : { rotate: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                src={image}
                alt=""
                className="w-[90px] h-[90px] object-contain drop-shadow-[0_12px_20px_rgba(15,23,42,0.18)]"
              />
            </motion.div>
          </motion.div>
        </div>
      </motion.button>
    </motion.div>
  );
};

const PromoBanners = ({ plain = false }) => {
  const navigate = useNavigate();

  // Section entrance variants
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
      {/* Background blobs for the whole section (only if NOT plain) */}
      {!plain && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-10 w-44 h-44 rounded-full bg-yellow-400/8 blur-3xl" />
          <div className="absolute bottom-0 left-10 w-48 h-48 rounded-full bg-[#E53935]/3 blur-3xl" />
        </div>
      )}

      {/* Header with badge design */}
      <div className="mb-5 relative z-10 ml-1">
        <div className="flex items-center gap-1.5">
          <Sparkles size={11} className="text-[#FF6B00] animate-pulse" />
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#FF6B00]">
            Recommended for you
          </span>
        </div>
        <h2 className="text-[19px] font-black text-slate-800 tracking-tight mt-0.5 relative inline-block">
          Smart choices
          <motion.div 
            initial={{ width: 0 }}
            whileInView={{ width: '80%' }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
            className="absolute bottom-[-2px] left-0 h-[2px] bg-gradient-to-r from-[#FF6B00]/40 to-transparent" 
          />
        </h2>
      </div>

      {/* Responsive Grid of Cards */}
      <div className="grid grid-cols-2 gap-3.5 relative z-10 overflow-visible">
        <RecommendedCard
          title="In a hurry?"
          description="Auto for shorter wait times."
          path="/taxi/user/ride/select-location"
          gradient="from-[#FFFDF0]/80 via-[#FFF5EC]/70 to-[#FFE3CF]/70"
          accentColor="#FF6B00"
          image={autoImg}
          isLeft={true}
          onNavigate={navigate}
          delay={0.1}
        />
        <RecommendedCard
          title="Need space?"
          description="Cab for comfort and luggage."
          path="/taxi/user/ride/select-location"
          gradient="from-[#FFFDF5]/80 via-[#EEF5FF]/70 to-[#E3ECFF]/70"
          accentColor="#2563EB"
          image={taxiImg}
          isLeft={false}
          onNavigate={navigate}
          delay={0.22}
        />
      </div>

      {/* Savings Promo Strip at the Bottom */}
      <motion.div
        initial={{ opacity: 0, y: 15, filter: 'blur(6px)' }}
        whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-slate-900 to-slate-800 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.12)] mt-5"
      >
        <div className="absolute inset-0 bg-[radial-gradient(240px_160px_at_20%_25%,rgba(56,189,248,0.16),transparent_60%)]" aria-hidden="true" />
        <div className="absolute inset-0 bg-[radial-gradient(260px_180px_at_85%_85%,rgba(251,191,36,0.10),transparent_62%)]" aria-hidden="true" />

        <div className="relative z-10 flex min-h-[155px] items-end justify-between gap-4">
          <div className="max-w-[62%]">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/85">
              <Sparkles size={11} strokeWidth={2.5} className="text-cyan-200" />
              Savings
            </div>

            <h3 className="mt-2.5 text-[18px] font-black leading-tight tracking-tight text-white">
              Better savings on your next ride.
            </h3>
            <p className="mt-1 text-[10.5px] font-bold leading-relaxed text-white/60">Book quickly and save more.</p>

            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/taxi/user/ride/select-location')}
              className="mt-3.5 inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-black text-slate-900 shadow-lg shadow-black/15"
            >
              Ride Now
              <ArrowRight size={12} strokeWidth={3} />
            </motion.button>
          </div>

          <div className="pointer-events-none w-[130px] shrink-0 opacity-95">
            <img src="/ride_now_banner.png" alt="Promo" className="w-full drop-shadow-2xl" />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PromoBanners;
