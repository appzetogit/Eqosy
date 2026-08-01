import React from 'react';
import { Bus, CalendarDays, ClipboardList, LayoutDashboard, User } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { id: 'overview', label: 'Home', Icon: LayoutDashboard },
  { id: 'schedule', label: 'Schedule', Icon: CalendarDays },
  { id: 'desk', label: 'Seat Desk', Icon: Bus },
  { id: 'bookings', label: 'Bookings', Icon: ClipboardList },
  { id: 'profile', label: 'Profile', Icon: User },
];

const BusDriverBottomNav = ({ activeTab = 'overview', onChangeTab }) => (
  <div className="fixed bottom-4 left-0 right-0 z-50 px-4 pointer-events-none flex justify-center">
    <nav className="pointer-events-auto w-full max-w-md overflow-hidden rounded-full border border-slate-700/60 bg-[#0F172A]/95 p-1.5 shadow-2xl shadow-slate-950/50 backdrop-blur-xl">
      <div className="grid grid-cols-5 items-center gap-1 relative">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.Icon;

          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={() => onChangeTab?.(item.id)}
              className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-full transition-colors ${
                isActive ? 'text-white font-black' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive ? (
                <motion.div
                  layoutId="busNavActivePill"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-[#FF6B00] to-[#FF8533] shadow-lg shadow-[#FF6B00]/40"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              ) : null}

              <div className="relative z-10 flex flex-col items-center gap-0.5">
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} className={isActive ? 'text-white' : ''} />
                <span className="text-[9px] font-black uppercase tracking-wider scale-95 truncate">
                  {item.label}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </nav>
  </div>
);

export default BusDriverBottomNav;

