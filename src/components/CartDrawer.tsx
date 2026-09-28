import React, { useState, useEffect } from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, Sparkles, User, ShieldAlert, Clock, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { getActivePendingOrder } from '../lib/deviceFingerprint';
import { Order } from '../types';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToCheckout: () => void;
  onNavigateToCustomize: () => void;
  onNavigateToPremade: () => void;
  onOpenAuth?: (mode: 'login' | 'signup') => void;
  onTrackOrder?: (orderId: string) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  onProceedToCheckout,
  onNavigateToCustomize,
  onNavigateToPremade,
  onOpenAuth,
  onTrackOrder,
}) => {
  const { user, profile } = useAuth();
  const isLoggedIn = Boolean(user || profile);
  const activeUid = user?.uid || profile?.id;
  const activeEmail = user?.email || profile?.email;

  const { items, subtotal, itemCount, updateQuantity, removeItem, clearCart } = useCart();
  const [activePendingOrder, setActivePendingOrder] = useState<Order | null>(null);
  const [checkingActiveOrder, setCheckingActiveOrder] = useState(false);

  // Check if this device or user already has an active pending order
  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      setCheckingActiveOrder(true);
      getActivePendingOrder(activeUid, activeEmail)
        .then((order) => {
          if (isMounted) {
            setActivePendingOrder(order);
            setCheckingActiveOrder(false);
          }
        })
        .catch(() => {
          if (isMounted) setCheckingActiveOrder(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, activeUid, activeEmail]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          {/* Drawer Container */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative z-10 w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between border-l border-[#F0D9DD]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-[#F0D9DD]/70 flex items-center justify-between bg-[#FAF6F0]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#F0D9DD] flex items-center justify-center text-[#2D2A2E]">
                  <ShoppingBag className="w-4 h-4 text-[#F4A6B0]" />
                </div>
                <div>
                  <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E]">Your Flower Basket</h3>
                  <p className="text-[11px] text-[#7C7472]">{itemCount} {itemCount === 1 ? 'item' : 'items'} ready for crafting</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="min-h-[38px] min-w-[38px] p-2 rounded-xl text-[#7C7472] hover:bg-white active:scale-95 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                aria-label="Close cart"
              >
                <X className="w-5 h-5 shrink-0" />
              </button>
            </div>

            {/* Cart Item List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {items.length === 0 ? (
                <div className="text-center py-16 px-4 space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-[#FAF6F0] flex items-center justify-center mx-auto text-[#A89E9C]">
                    <ShoppingBag className="w-8 h-8 stroke-[1.5]" />
                  </div>
                  <h4 className="font-serif-title text-lg font-bold text-[#2D2A2E]">Your basket is empty</h4>
                  <p className="text-xs text-[#7C7472] max-w-xs mx-auto">
                    Take a look at our satin roses and dahlias, or design your own custom bouquet!
                  </p>
                  <div className="pt-2 flex flex-col gap-2.5">
                    <button
                      onClick={() => { onClose(); onNavigateToPremade(); }}
                      className="py-3 px-4 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] text-[#2D2A2E] hover:bg-[#EE8E9B] active:scale-[0.98] transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                    >
                      Browse Premade Flowers
                    </button>
                    <button
                      onClick={() => { onClose(); onNavigateToCustomize(); }}
                      className="py-3 px-4 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F5EFC0] text-[#2D2A2E] hover:bg-[#EAE2A6] border border-[#E8DF97] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C98A12]"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#C98A12] shrink-0" />
                      <span>Customize a Bouquet</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-[#7C7472] pb-1">
                    <span>Selected Flowers</span>
                    <button 
                      onClick={clearCart} 
                      className="min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-semibold text-[#C53030] hover:bg-red-50 hover:underline active:scale-95 transition-all"
                    >
                      Clear all
                    </button>
                  </div>

                  {items.map((item) => (
                    <div 
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-[#FCFAF8] border border-[#F0D9DD]/70 hover:border-[#F4A6B0]/50 transition-all space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              item.type === 'customized' 
                                ? 'bg-[#F5EFC0] text-[#70640F]' 
                                : 'bg-[#F0D9DD] text-[#7A4B53]'
                            }`}>
                          {item.type === 'customized' ? 'Customized' : 'Premade Stem'}
                        </span>
                        <h4 className="font-bold text-xs text-[#2D2A2E]">
                          {item.flowerName}
                        </h4>
                      </div>

                      {/* Spec details */}
                      <div className="text-[11px] text-[#5C5552] mt-1 space-y-0.5">
                        {item.type === 'premade' && item.color && (
                          <p>Color: <span className="font-semibold text-[#2D2A2E]">{item.color}</span></p>
                        )}

                        {item.type === 'customized' && (
                          <>
                            <p>Colors: <span className="font-semibold text-[#2D2A2E]">{item.colors?.join(', ')}</span></p>
                            <p>Stems: <span className="font-semibold text-[#2D2A2E]">{item.stemsCount} pcs</span></p>
                            {item.wrapperColor && (
                              <p>Wrapper: <span className="font-semibold text-[#2D2A2E]">{item.wrapperColor}</span></p>
                            )}
                            {item.ribbonColor && (
                              <p>Ribbon: <span className="font-semibold text-[#2D2A2E]">{item.ribbonColor}</span></p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      <span className="font-serif-title text-sm font-bold text-[#2D2A2E]">
                        ₱{(item.totalPrice ?? 0).toLocaleString()}
                      </span>
                      <p className="text-[10px] text-[#7C7472]">₱{item.unitPrice ?? 0} each</p>
                    </div>
                  </div>

                  {/* Quantity and Remove */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#F0D9DD]/40">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-8 h-8 min-h-[32px] min-w-[32px] rounded-xl bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD]/40 active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5 shrink-0" />
                      </button>
                      <span className="text-xs font-bold text-[#2D2A2E] w-6 text-center select-none">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-8 h-8 min-h-[32px] min-w-[32px] rounded-xl bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD]/40 active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeItem(item.id)}
                      className="min-h-[32px] px-2 py-1 rounded-lg text-xs text-[#7C7472] hover:text-[#C53030] hover:bg-red-50 flex items-center gap-1 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-[10px]">Remove</span>
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Drawer Footer / Checkout CTA */}
        {items.length > 0 && (
          <div className="p-5 border-t border-[#F0D9DD] bg-[#FAF6F0] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#5C5552]">Estimated Total:</span>
              <span className="font-serif-title text-xl font-bold text-[#2D2A2E]">
                ₱{(subtotal ?? 0).toLocaleString()}
              </span>
            </div>

            {/* Case A: Active Pending Order exists for this device/user */}
            {activePendingOrder ? (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2.5">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-amber-950">Active Order in Progress</p>
                    <p className="text-[11px] text-amber-800 leading-tight mt-0.5">
                      To prevent spam, our studio allows <strong>1 active order per device</strong> at a time. Order <strong>#{activePendingOrder.id}</strong> is currently <strong>{activePendingOrder.status === 'pending' ? 'Pending Approval' : 'In Production'}</strong>.
                    </p>
                  </div>
                </div>
                <button
                  id="cart-track-active-order-btn"
                  onClick={() => {
                    onClose();
                    if (onTrackOrder) {
                      onTrackOrder(activePendingOrder.id);
                    }
                  }}
                  className="w-full py-2.5 min-h-[40px] rounded-xl text-xs font-bold uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Track Active Order #{activePendingOrder.id}</span>
                </button>
              </div>
            ) : !isLoggedIn ? (
              /* Case B: User is a guest (not logged in) */
              <div className="p-3.5 rounded-2xl bg-white border border-[#F0D9DD] space-y-2.5 shadow-2xs">
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-[#F4A6B0] shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-[#2D2A2E]">Account Required to Place Order</p>
                    <p className="text-[11px] text-[#5C5552] leading-tight mt-0.5">
                      Guests can freely browse and customize, but creating an account is required to place and track your order.
                    </p>
                  </div>
                </div>
                <button
                  id="cart-auth-gate-btn"
                  onClick={() => {
                    onClose();
                    if (onOpenAuth) {
                      onOpenAuth('signup');
                    }
                  }}
                  className="w-full py-3 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span>Log In / Sign Up to Order</span>
                </button>
              </div>
            ) : (
              /* Case C: User is authenticated and has no pending orders */
              <>
                <p className="text-[11px] text-[#7C7472]">
                  Next: Select payment mode & verify recipient details (Steps 3-5).
                </p>

                <button
                  id="cart-proceed-checkout"
                  onClick={() => {
                    onClose();
                    onProceedToCheckout();
                  }}
                  className="w-full py-3.5 min-h-[46px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </>
            )}
          </div>
        )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
