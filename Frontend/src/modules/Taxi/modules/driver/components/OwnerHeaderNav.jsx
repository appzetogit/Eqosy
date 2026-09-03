import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Bus,
  Car,
  ChevronDown,
  Home,
  IndianRupee,
  LogOut,
  Menu,
  ShieldCheck,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useSettings } from '../../../shared/context/SettingsContext';
import { clearDriverAuthState } from '../services/registrationService';

const OwnerHeaderNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const busEnabled = String(settings.transportRide?.enable_bus_service ?? '1') !== '0';
  const appName = settings.general?.app_name || 'Eqosy';

  const navItems = [
    { label: 'Dashboard', path: '/taxi/owner/dashboard', icon: Home },
    { label: 'Drivers', path: '/taxi/owner/manage-drivers', icon: Users },
    { label: 'Vehicles', path: '/taxi/owner/vehicle-fleet', icon: Car },
    ...(busEnabled
      ? [
          { label: 'Bus Services', path: '/taxi/owner/bus-service', icon: Bus },
          { label: 'Bus Bookings', path: '/taxi/owner/bus-bookings', icon: Briefcase },
        ]
      : []),
    { label: 'Wallet', path: '/taxi/owner/wallet', icon: IndianRupee },
    { label: 'Account', path: '/taxi/owner/profile', icon: User },
  ];

  const handleLogout = () => {
    clearDriverAuthState();
    navigate('/taxi/owner/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-blue-900/10 bg-slate-900 text-white shadow-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Badge */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/taxi/owner/dashboard')}>
          <img
            src={settings.general?.logo || settings.customization?.logo || '/eqosy-logo.png'}
            alt={appName}
            className="h-10 w-10 object-contain rounded-xl shrink-0"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/eqosy-logo.png';
            }}
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-tight text-white">{appName}</span>
              <span className="rounded-md bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-400 border border-orange-500/30">
                Owner Suite
              </span>
            </div>
            <p className="text-[10px] font-medium text-slate-400 hidden sm:block">Fleet Operator Portal</p>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/taxi/owner/dashboard' && location.pathname.startsWith(item.path));

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-white/10 text-white shadow-sm border border-white/15'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-orange-400' : 'text-slate-400'} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Actions / User Dropdown */}
        <div className="hidden md:flex items-center gap-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30"
            title="Sign out of Owner Account"
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="border-t border-white/10 bg-slate-900 px-4 py-4 md:hidden">
          <div className="grid gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                (item.path !== '/taxi/owner/dashboard' && location.pathname.startsWith(item.path));

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${
                    isActive ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 flex w-full items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-300"
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default OwnerHeaderNav;
