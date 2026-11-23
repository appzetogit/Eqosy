import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

/** Swipe-down gesture props for a bottom sheet: only the handle starts the drag, so the sheet body still scrolls normally. */
export const getSheetDragProps = (controls, onMinimize) => ({
  drag: 'y',
  dragControls: controls,
  dragListener: false,
  dragConstraints: { top: 0, bottom: 0 },
  dragElastic: { top: 0, bottom: 0.7 },
  onDragEnd: (_e, info) => {
    if (info.offset.y > 70 || info.velocity.y > 500) onMinimize?.();
  },
});

/**
 * Large, animated grab handle: a gentle bounce + "Swipe down" hint tells the rider the sheet can be pulled down.
 * Dragging it down, or a single tap, minimizes the sheet to the map.
 */
export const SheetHandle = ({ controls, onMinimize }) => (
  <div
    role="button"
    tabIndex={0}
    aria-label="Swipe down or tap to minimize"
    onPointerDown={(e) => controls?.start(e)}
    onClick={() => onMinimize?.()}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onMinimize?.(); }}
    style={{ touchAction: 'none' }}
    className="w-full flex flex-col items-center pt-2.5 pb-2 bg-white sticky top-0 z-30 cursor-grab active:cursor-grabbing select-none"
  >
    <div className="w-14 h-1.5 bg-gray-500 rounded-full" />
    <motion.div
      animate={{ y: [0, 4, 0], opacity: [0.8, 1, 0.8] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-700 mt-1"
    >
      <ChevronDown className="w-3.5 h-3.5" />
      Swipe down to minimize
    </motion.div>
  </div>
);

export default SheetHandle;
