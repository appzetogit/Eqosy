import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Clock, Map, User, BusFront } from 'lucide-react';
import { useSettings } from '../../../shared/context/SettingsContext';
import { useHideOnScroll } from '@/shared/hooks/useHideOnScroll';

const BottomNavbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const showBusService = String(settings.transportRide?.enable_bus_service || '0') === '1';
  const isVisible = useHideOnScroll({ threshold: 6, topOffset: 20 });

  const navItems = [
    { icon: Home, label: 'Ride', path: '/taxi/user' },
    { icon: Clock, label: 'Rides', path: '/taxi/user/activity' },
    ...(showBusService ? [{ icon: BusFront, label: 'Bus', path: '/taxi/user/bus' }] : []),
    { icon: Map, label: 'Support', path: '/taxi/user/support' },
    { icon: User, label: 'Profile', path: '/taxi/user/profile' },
  ];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 max-w-lg mx-auto z-[100] will-change-transform transition-all duration-300 ease-in-out transform ${
        isVisible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      <div className="flex items-center justify-around h-auto px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-white/10 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive =
            path === '/taxi/user'
              ? pathname === path
              : pathname === path || pathname.startsWith(`${path}/`);

          return (
            <button
              key={label}
              type="button"
              onClick={() => navigate(path)}
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isActive
                  ? 'text-[#2563EB] bg-[#2563EB]/10 dark:text-[#60A5FA] dark:bg-[#2563EB]/20'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isActive
                      ? 'scale-110 text-[#2563EB] dark:text-[#60A5FA]'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isActive
                    ? 'text-[#2563EB] dark:text-[#60A5FA]'
                    : 'text-gray-500 dark:text-gray-400 opacity-80'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavbar;
