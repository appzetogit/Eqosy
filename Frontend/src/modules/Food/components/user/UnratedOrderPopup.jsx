import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, UtensilsCrossed, Car } from 'lucide-react';
import { Button } from '@food/components/ui/button';
import api from '@food/api';

export default function UnratedOrderPopup() {
  const [unratedOrder, setUnratedOrder] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUnratedOrder = async () => {
      try {
        const response = await api.get('/food/user/orders/unrated');
        if (response?.data?.data?.order) {
          setUnratedOrder(response.data.data.order);
          setIsOpen(true);
        }
      } catch (error) {
        console.error('Error fetching unrated order:', error);
      }
    };
    
    // Slight delay so it doesn't block initial render
    const timer = setTimeout(() => {
      checkUnratedOrder();
    }, 1500);
    
    return () => clearTimeout(timer);
  }, []);

  const handleSkip = async () => {
    if (!unratedOrder) return;
    try {
      await api.patch(`/food/user/orders/${unratedOrder._id}/skip-rating`);
    } catch (error) {
      console.error('Error skipping rating:', error);
    } finally {
      setIsOpen(false);
    }
  };

  const handleRate = () => {
    if (!unratedOrder) return;
    setIsOpen(false);
    navigate(`/food/user/orders/${unratedOrder._id}`); // Navigating to order details where user can rate
  };

  if (!isOpen || !unratedOrder) return null;

  const restaurantName = unratedOrder.restaurantId?.restaurantName || 'Restaurant';
  
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
        >
          <button 
            onClick={handleSkip}
            className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="mb-6 flex flex-col items-center text-center mt-2">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
              <Star className="h-8 w-8 text-orange-500" fill="currentColor" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">How was your food?</h3>
            <p className="text-sm text-gray-500">
              You recently ordered from <span className="font-semibold text-gray-800">{restaurantName}</span>. Rate your experience to help others!
            </p>
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              onClick={handleSkip}
              className="flex-1 rounded-xl py-6 font-semibold border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              Skip
            </Button>
            <Button
              onClick={handleRate}
              className="flex-1 rounded-xl py-6 font-semibold bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg hover:from-orange-600 hover:to-rose-600 border-none"
            >
              Rate Now
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
