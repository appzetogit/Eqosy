import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import indiaGateImg from '@/assets/india_gate_real.png';
import jaipurImg from '@/assets/jaipur.avif';
import tajMahalImg from '@/assets/taj mahal.jpeg';

const ExplorerSection = ({ plain = false }) => {
  const navigate = useNavigate();

  const indiaCities = [
    {
      title: 'Taj Mahal',
      image: tajMahalImg,
      label: 'Agra',
      code: 'AGR',
      drop: 'Taj Mahal, Agra',
    },
    {
      title: 'Hawa Mahal',
      image: jaipurImg,
      label: 'Jaipur',
      code: 'JAI',
      drop: 'Hawa Mahal, Jaipur',
    },
    {
      title: 'India Gate',
      image: indiaGateImg,
      label: 'New Delhi',
      code: 'DEL',
      drop: 'India Gate, New Delhi',
    },
    {
      title: 'Charminar',
      image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=400&q=80',
      label: 'Hyderabad',
      code: 'HYD',
      drop: 'Charminar, Hyderabad',
    },
    {
      title: 'Gateway of India',
      image: 'https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=400&q=80',
      label: 'Mumbai',
      code: 'BOM',
      drop: 'Gateway of India, Mumbai',
    },
    {
      title: 'Howrah Bridge',
      image: 'https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=400&q=80',
      label: 'Kolkata',
      code: 'CCU',
      drop: 'Howrah Bridge, Kolkata',
    }
  ];

  const handleExploreDestination = (city) => {
    navigate('/taxi/user/ride/select-location', {
      state: {
        drop: city.drop || city.title,
      },
    });
  };

  // Double the array for seamless infinite marquee scrolling
  const doubledCities = [...indiaCities, ...indiaCities];

  const marqueeStyle = `
    @keyframes marquee {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    .animate-marquee-left {
      display: flex;
      width: max-content;
      animation: marquee 30s linear infinite;
    }
    .marquee-wrapper:hover .animate-marquee-left {
      animation-play-state: paused;
    }
  `;

  const containerClass = plain
    ? 'relative z-10 px-5 mt-1'
    : 'mx-5 my-4 rounded-[32px] bg-gradient-to-br from-[#EBF1FA] via-[#F3F7FC] to-[#F8FAFC] border border-blue-100/30 shadow-[0_24px_50px_rgba(30,41,59,0.04)] relative overflow-visible px-5 py-5.5';

  return (
    <div className={containerClass}>
      <style>{marqueeStyle}</style>

      {/* Explore India Section */}
      <div>
        {/* Header Section */}
        <div className="mb-4 ml-1">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-indigo-600 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-indigo-600">
              DISCOVER INCREDIBLE INDIA
            </span>
          </div>
          <h2 className="text-[19px] font-black text-slate-800 tracking-tight mt-0.5 relative inline-block">
            Explore India
            <div className="absolute bottom-[-3px] left-0 right-0 h-[2.5px] bg-gradient-to-r from-indigo-500/40 to-transparent" />
          </h2>
          <p className="mt-1 text-[11px] font-bold text-slate-500 leading-tight">
            Top tourist destinations across the country
          </p>
        </div>

        {/* Infinite Auto-Scrolling Marquee (No Scrollbars, Pauses on Hover) */}
        <div className="marquee-wrapper w-full overflow-hidden relative py-2 select-none mask-gradient">
          {/* Subtle horizontal mask gradient for soft fading edges */}
          <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-slate-50 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-50 to-transparent z-10 pointer-events-none" />

          <div className="animate-marquee-left flex gap-4">
            {doubledCities.map((city, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleExploreDestination(city)}
                className="flex-shrink-0 w-[190px] group text-left transition-all active:scale-[0.98] cursor-pointer"
              >
                <div className="rounded-[18px] bg-white border border-slate-100 shadow-[0_8px_20px_rgba(15,23,42,0.04)] overflow-hidden h-[120px] transition-all relative">
                  <img
                    src={city.image}
                    alt={city.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/20 to-transparent"></div>
                  <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2 py-0.5 rounded-full shadow-sm border border-white/60 z-10">
                    <p className="text-[8px] font-black text-indigo-600 tracking-widest uppercase">{city.code}</p>
                  </div>
                </div>
                <div className="mt-2.5 px-1 flex flex-col">
                  <h4 className="text-[13px] font-black text-slate-800 tracking-tight leading-tight flex items-center justify-between">
                    {city.title}
                    <ArrowRight size={11} className="text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                  </h4>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">
                    {city.label}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExplorerSection;
