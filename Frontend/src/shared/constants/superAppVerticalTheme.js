/**
 * Eqosy super-app vertical colours — matched to eqosy-logo.png
 *
 * Logo accents (bright):
 *   Food    — orange  #FC6C00 (scooter, food icon)
 *   Taxi    — dark blue (logo navy / rides)
 *   Grocery — green   #74CC08 (E, grocery cart)
 *
 * UI uses darker shades for headers / inactive tabs; logo brights for accents & active tabs.
 */
export const EQOSY_LOGO_COLORS = {
  food: '#FC6C00',
  taxi: '#1E4A8C',
  grocery: '#74CC08',
};

export const SUPER_APP_VERTICAL_THEME = {
  food: {
    accent: EQOSY_LOGO_COLORS.food,
    activeTab: EQOSY_LOGO_COLORS.food,
    theme: '#B84600',
    inactiveTab: '#8A3200',
    stickyBackdrop: 'rgba(184, 70, 0, 0.92)',
    accentSoft: '#FFF4EB',
    accentSoftHover: '#FFE8D6',
    themeBg: 'bg-[#B84600]',
    activeTabBg: 'bg-[#FC6C00]',
    inactiveTabBg: 'bg-[#8A3200]/85',
  },
  taxi: {
    accent: '#5B9BD5',
    activeTab: '#2563EB',
    theme: '#0B172A',
    inactiveTab: '#050C16',
    stickyBackdrop: 'rgba(11, 23, 42, 0.96)',
    accentSoft: '#E8EEF7',
    accentSoftHover: '#D4E2F4',
    themeBg: 'bg-[#0B172A]',
    activeTabBg: 'bg-[#2563EB]',
    inactiveTabBg: 'bg-[#050C16]/90',
  },
  grocery: {
    accent: EQOSY_LOGO_COLORS.grocery,
    activeTab: EQOSY_LOGO_COLORS.grocery,
    theme: '#4A8508',
    inactiveTab: '#2E5505',
    stickyBackdrop: 'rgba(74, 133, 8, 0.92)',
    accentSoft: '#F3FBE8',
    accentSoftHover: '#E3F5CE',
    themeBg: 'bg-[#4A8508]',
    activeTabBg: 'bg-[#74CC08]',
    inactiveTabBg: 'bg-[#2E5505]/90',
  },
};

export function getVerticalTheme(verticalId) {
  return SUPER_APP_VERTICAL_THEME[verticalId] || SUPER_APP_VERTICAL_THEME.food;
}
