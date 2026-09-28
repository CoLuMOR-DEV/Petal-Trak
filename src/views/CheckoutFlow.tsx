import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  AlertCircle, 
  ShieldCheck,
  ShieldAlert,
  Clock,
  LogIn,
  Edit3,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { PaymentMode, CustomerOrderSnapshot, Order, InventoryItem, OrderMessage, StudioSettings } from '../types';
import { collection, doc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { placeOrderRealtime, markReceiptSentRealtime } from '../lib/realtimeSync';
import { sendReceiptToCustomerEmail } from '../lib/emailReceipt';
import { 
  getDeviceId, 
  getDeviceFingerprint, 
  getActivePendingOrder, 
  saveActiveOrderId 
} from '../lib/deviceFingerprint';
import { sanitizeText, containsSqlInjection } from '../lib/security';

interface CheckoutFlowProps {
  inventory: InventoryItem[];
  studioSettings?: StudioSettings | null;
  onOrderSuccess: (orderId: string) => void;
  onCancel: () => void;
  onOpenAuth?: (mode: 'login' | 'signup') => void;
}

export const CheckoutFlow: React.FC<CheckoutFlowProps> = ({
  inventory,
  studioSettings,
  onOrderSuccess,
  onCancel,
  onOpenAuth,
}) => {
  const { user, profile, updateCustomerProfile } = useAuth();
  const { items, subtotal, clearCart } = useCart();

  // Active Pending Order Check (anti-spam / 1 active order per device limit)
  const [activePendingOrder, setActivePendingOrder] = useState<Order | null>(null);
  const [isCheckingActiveOrder, setIsCheckingActiveOrder] = useState(true);

  // Current step: 3 (Payment Mode), 4 (Customer Info), 5 (Verify & Submit)
  const [step, setStep] = useState<3 | 4 | 5>(3);

  // Step 3 state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('GCash');

  // Step 4 state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState<number | undefined>(undefined);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  // Pre-fill from profile when available
  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setAge(profile.age);
      setAddress(profile.address || '');
      setPhone(profile.phone || '');
      setEmail(profile?.email || '');
    } else if (user?.email) {
      setEmail(user.email);
    }
  }, [profile, user]);

  // Check if device or user already has an active pending order
  useEffect(() => {
    let isMounted = true;
    setIsCheckingActiveOrder(true);
    getActivePendingOrder(user?.uid, user?.email)
      .then((order) => {
        if (isMounted) {
          setActivePendingOrder(order);
          setIsCheckingActiveOrder(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsCheckingActiveOrder(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validate Step 4 inputs
  const handleProceedToVerify = () => {
    setValidationError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setValidationError('Please enter your full name (First and Last name).');
      return;
    }
    if (address.trim().length < 10) {
      setValidationError('Please provide a complete delivery address (minimum 10 letters, including street, barangay, and city).');
      return;
    }
    if (!phone.trim()) {
      setValidationError('Please enter your active contact phone number.');
      return;
    }
    if (!email.trim()) {
      setValidationError('Please enter a valid email address.');
      return;
    }
    setStep(5);
  };

  // Step 5: Verify & Submit Order to Firestore
  const handleSubmitOrder = async () => {
    if (!user) {
      setValidationError('An account is required to place an order. Please log in or sign up first.');
      return;
    }

    if (items.length === 0) {
      setValidationError('Your flower basket is empty.');
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    try {
      // 1. Anti-Spam Check: Verify no active pending order exists on this device/account
      const existingActive = await getActivePendingOrder(user.uid, user.email || email);
      if (existingActive) {
        setActivePendingOrder(existingActive);
        setValidationError(`You already have an active order (#${existingActive.id}) in progress. To prevent spam, our studio only accepts one active order at a time.`);
        setSubmitting(false);
        return;
      }

      const orderId = `LYP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      const now = new Date().toISOString();

      // Estimated deadline (3-5 business days for handmade satin flowers)
      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + 4);

      const customerSnapshot: CustomerOrderSnapshot = {
        name: `${sanitizeText(firstName, 50)} ${sanitizeText(lastName, 50)}`.trim(),
        email: sanitizeText(email, 120),
        phone: sanitizeText(phone, 30),
        address: sanitizeText(address, 300),
      };
      if (age && !isNaN(Number(age)) && Number(age) > 0) {
        customerSnapshot.age = Number(age);
      }

      const deviceId = getDeviceId();
      const deviceFingerprint = getDeviceFingerprint();

      // Ensure every item is clean of undefined fields so Firestore accepts it unconditionally
      const sanitizedItems = items.map((it) => {
        const clean: any = {
          id: it.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: it.type || 'premade',
          flowerType: it.flowerType || 'rose',
          flowerName: it.flowerName || 'Handcrafted Satin Flower',
          stemsCount: Number(it.stemsCount) || 1,
          unitPrice: Number(it.unitPrice) || 80,
          quantity: Number(it.quantity) || 1,
          totalPrice: Number(it.totalPrice) || 80,
          createdAt: it.createdAt || now,
        };
        if (it.color) clean.color = it.color;
        if (it.colors && it.colors.length > 0) clean.colors = it.colors;
        if (it.wrapperColor) clean.wrapperColor = it.wrapperColor;
        if (it.ribbonColor) clean.ribbonColor = it.ribbonColor;
        return clean;
      });

      const newOrder: Order = {
        id: orderId,
        customerId: user.uid,
        customerInfo: customerSnapshot,
        items: sanitizedItems,
        totalAmount: Number(subtotal),
        paymentMode: paymentMode,
        paymentStatus: 'pending',
        amountPaid: 0,
        balance: Number(subtotal),
        status: 'pending',
        deadline: deadlineDate.toISOString().split('T')[0],
        notes: sanitizeText(notes, 1000) || '',
        deviceId,
        deviceFingerprint,
        createdAt: now,
        updatedAt: now,
      };

      // 2. Initial order message from Studio / Allyson
      const initialMessage: OrderMessage = {
        id: `msg_${Date.now()}`,
        orderId,
        senderId: 'system_allyson',
        senderRole: 'owner',
        senderName: 'Allyson (LYPetal)',
        text: `Thank you for ordering with LYPetal! We received your order #${orderId} for ${items.length} item(s). Our studio will begin measuring and cutting your satin ribbons shortly. Feel free to chat here with any special instructions!`,
        createdAt: now,
      };

      // 3. Synchronize order to Firestore and Cache (with non-blocking RTDB)
      await placeOrderRealtime(newOrder, initialMessage);

      // 3b. Automatically dispatch official receipt to customer's email in website styling
      sendReceiptToCustomerEmail(newOrder).then((res) => {
        if (res.success) {
          markReceiptSentRealtime(orderId).catch(() => {});
        }
      }).catch((mailErr) => {
        console.warn('Automated receipt email dispatch notice:', mailErr);
      });

      // 4. Save active order ID locally for fast device matching
      saveActiveOrderId(orderId);

      // Keep customer profile updated with latest delivery location and contact
      if (updateCustomerProfile) {
        updateCustomerProfile({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          age: age ? Number(age) : undefined,
        }).catch(() => {});
      }

      // 5. Material inventory adjustments (best-effort, non-blocking background)
      (async () => {
        try {
          for (const item of items) {
            const flowerStockId = item.flowerType === 'rose' ? 'flower_rose' : 'flower_dahlia';
            const stemCount = item.stemsCount * item.quantity;
            setDoc(doc(db, 'inventory', flowerStockId), {
              stock: increment(-stemCount),
              updatedAt: now,
            }, { merge: true }).catch(() => {});
            setDoc(doc(db, 'inventory', 'craft_sticks'), {
              stock: increment(-stemCount),
              updatedAt: now,
            }, { merge: true }).catch(() => {});
          }
        } catch (stockErr) {
          console.warn('Inventory adjustment note:', stockErr);
        }
      })();

      // 6. Clear Cart (safe timeout)
      try {
        await Promise.race([
          clearCart(),
          new Promise((resolve) => setTimeout(resolve, 800))
        ]);
      } catch (cartErr) {
        console.warn('Cart clear note:', cartErr);
      }

      // 7. Navigate to Order Tracker (Step 6)
      onOrderSuccess(orderId);
    } catch (err: unknown) {
      console.error('Order submission error:', err);
      handleFirestoreError(err, OperationType.CREATE, 'orders');
      setValidationError('Could not place order. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Account Required Gate for Guests
  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="p-8 sm:p-10 rounded-3xl bg-white border border-[#F0D9DD] shadow-lg space-y-6"
        >
          <div className="w-16 h-16 rounded-3xl bg-[#F0D9DD]/70 flex items-center justify-center mx-auto text-[#7A4B53]">
            <User className="w-8 h-8 stroke-[1.75]" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F0D9DD] text-[#7A4B53] text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              Sign in to Continue
            </span>
            <h2 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#2D2A2E]">
              Please Sign In to Place an Order
            </h2>
            <p className="text-xs sm:text-sm text-[#5C5552] leading-relaxed max-w-md mx-auto">
              You're always welcome to browse our flowers and build bouquets, but having an account lets Allyson confirm your address, send real-time updates, and chat with you directly.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              id="checkout-gate-signup-btn"
              onClick={() => onOpenAuth ? onOpenAuth('signup') : null}
              className="py-3.5 px-6 min-h-[46px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <LogIn className="w-4 h-4" />
              <span>Create an Account</span>
            </button>
            <button
              id="checkout-gate-login-btn"
              onClick={() => onOpenAuth ? onOpenAuth('login') : null}
              className="py-3.5 px-6 min-h-[46px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#FAF6F0] hover:bg-[#F0D9DD]/40 text-[#2D2A2E] border border-[#E8E2DA] transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <span>Log In</span>
            </button>
          </div>

          <div className="pt-2 border-t border-[#F0D9DD]/50">
            <button
              onClick={onCancel}
              className="text-xs font-semibold text-[#7C7472] hover:text-[#2D2A2E] hover:underline"
            >
              ← Back to Flower Catalog
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 2. Active Pending Order Barrier (Spam Prevention / 1 Order per Device limit)
  if (activePendingOrder) {
    const isPending = activePendingOrder.status === 'pending';
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="p-8 sm:p-10 rounded-3xl bg-white border border-[#F5EFC0] shadow-lg space-y-6"
        >
          <div className="w-16 h-16 rounded-3xl bg-[#F5EFC0] flex items-center justify-center mx-auto text-[#70640F]">
            <ShieldAlert className="w-8 h-8 stroke-[1.75]" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5EFC0] text-[#70640F] text-xs font-bold uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              1 Active Order Limit
            </span>
            <h2 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#2D2A2E]">
              You already have an order in progress
            </h2>
            <p className="text-xs sm:text-sm text-[#5C5552] leading-relaxed max-w-md mx-auto">
              Because each flower is hand-folded by Allyson, our studio handles one order per customer at a time so every arrangement gets full attention and care.
            </p>
          </div>

          {/* Active Order Summary Card */}
          <div className="p-4 rounded-2xl bg-[#FCFAF8] border border-[#E8DF97] text-left space-y-2 text-xs">
            <div className="flex items-center justify-between font-bold text-sm text-[#2D2A2E]">
              <span>Order #{activePendingOrder.id}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F5EFC0] text-[#70640F]">
                {isPending ? 'Pending Studio Review' : 'In Production'}
              </span>
            </div>
            <div className="text-[#5C5552] space-y-1">
              <p>Items: <strong>{activePendingOrder.items?.length || 0} item(s)</strong> (₱{(activePendingOrder.totalAmount ?? 0).toLocaleString()})</p>
              <p>Payment: <strong>{activePendingOrder.paymentMode || 'N/A'}</strong> ({activePendingOrder.paymentStatus || 'pending'})</p>
              {activePendingOrder.deadline && (
                <p>Est. Ready Date: <strong>{activePendingOrder.deadline}</strong></p>
              )}
            </div>
            <p className="text-[11px] text-[#7C7472] italic pt-1 border-t border-[#E8DF97]/50">
              You can place a new order once this one is marked as <strong>Completed</strong>, <strong>Delivered</strong>, or <strong>Cancelled</strong>.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              id="checkout-barrier-track-btn"
              onClick={() => {
                if (activePendingOrder.id && activePendingOrder.id !== 'undefined' && activePendingOrder.id !== 'null') {
                  onOrderSuccess(activePendingOrder.id);
                }
              }}
              className="py-3.5 px-6 min-h-[46px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <Clock className="w-4 h-4" />
              <span>Track Order #{activePendingOrder.id}</span>
            </button>
            <button
              onClick={onCancel}
              className="py-3.5 px-6 min-h-[46px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#FAF6F0] hover:bg-[#F0D9DD]/40 text-[#2D2A2E] border border-[#E8E2DA] transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <span>Back to Shop</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      
      {/* Progress Stepper */}
      <div className="mb-10">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
              step >= 3 ? 'bg-[#F4A6B0] text-[#2D2A2E]' : 'bg-[#FAF6F0] text-[#7C7472]'
            }`}>
              3
            </div>
            <span className="text-[11px] font-semibold text-[#5C5552] mt-1.5">Payment Mode</span>
          </div>

          <div className={`flex-1 h-0.5 mx-2 ${step >= 4 ? 'bg-[#F4A6B0]' : 'bg-[#E8E2DA]'}`} />

          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
              step >= 4 ? 'bg-[#F4A6B0] text-[#2D2A2E]' : 'bg-[#FAF6F0] text-[#7C7472]'
            }`}>
              4
            </div>
            <span className="text-[11px] font-semibold text-[#5C5552] mt-1.5">Customer Info</span>
          </div>

          <div className={`flex-1 h-0.5 mx-2 ${step >= 5 ? 'bg-[#F4A6B0]' : 'bg-[#E8E2DA]'}`} />

          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
              step === 5 ? 'bg-[#F4A6B0] text-[#2D2A2E]' : 'bg-[#FAF6F0] text-[#7C7472]'
            }`}>
              5
            </div>
            <span className="text-[11px] font-semibold text-[#5C5552] mt-1.5">Verify & Submit</span>
          </div>

        </div>
      </div>

      {/* Validation alert */}
      {validationError && (
        <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{validationError}</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* STEP 3: SELECT MODE OF PAYMENT */}
        {step === 3 && (
          <motion.div 
            key="step-3"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-sm space-y-6"
          >
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#F4A6B0]">
                Step 3 • Payment
              </span>
              <h2 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#2D2A2E]">
                How would you like to pay?
              </h2>
              <p className="text-xs text-[#5C5552]">
                Choose your preferred payment method. You'll complete payment once Allyson receives your order.
              </p>
            </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* GCash */}
            <button
              type="button"
              onClick={() => setPaymentMode('GCash')}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] ${
                paymentMode === 'GCash'
                  ? 'border-[#2D2A2E] bg-[#FAF6F0] ring-2 ring-[#F4A6B0]'
                  : 'border-[#E8E2DA] hover:border-[#F4A6B0] bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-[#007DFE]">GCash e-Wallet</span>
                <span className="text-xs font-bold text-[#2D2A2E]">{studioSettings?.contactPhone || '0912-345-6789'}</span>
              </div>
              <p className="text-xs text-[#5C5552]">
                Account: {studioSettings?.ownerName || 'Allyson'} • {studioSettings?.businessName || 'LYPetal Flower Studio'}
              </p>
              <span className="text-[11px] text-[#7C7472] block mt-1">
                Transfer or scan QR code via GCash app.
              </span>
            </button>

            {/* Cash on Delivery / Pick-up */}
            <button
              type="button"
              onClick={() => setPaymentMode('Cash on Delivery / Pick-up')}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] ${
                paymentMode === 'Cash on Delivery / Pick-up' || paymentMode === 'Cash on Pick-up / Delivery'
                  ? 'border-[#2D2A2E] bg-[#FAF6F0] ring-2 ring-[#F4A6B0]'
                  : 'border-[#E8E2DA] hover:border-[#F4A6B0] bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-[#2D2A2E]">Cash on Delivery / Pick-up</span>
                <span className="text-xs font-bold text-[#70640F] bg-[#F5EFC0] px-2 py-0.5 rounded-full">Laguna & NCR</span>
              </div>
              <p className="text-xs text-[#5C5552]">
                Pay in cash when picking up at the studio ({studioSettings?.pickupAddress ? studioSettings.pickupAddress.split(',')[0] : 'San Pedro Studio'}) or upon delivery.
              </p>
              <span className="text-[11px] text-[#7C7472] block mt-1">
                Hand cash directly to Allyson or the courier.
              </span>
            </button>

          </div>

          {/* Action buttons */}
          <div className="pt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-[#F0D9DD]/70">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto py-3 px-5 min-h-[44px] rounded-xl text-xs font-semibold text-[#5C5552] hover:text-[#2D2A2E] hover:bg-[#FAF6F0] transition-all text-center flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2A2E]"
            >
              ← Back to Shopping
            </button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => setStep(4)}
              className="w-full sm:w-auto py-3 px-6 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] flex items-center justify-center gap-2 shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
            >
              <span>Next: Delivery Details</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* STEP 4: CUSTOMER BASIC INFO INPUT */}
      {step === 4 && (
        <motion.div 
          key="step-4"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-sm space-y-6"
        >
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#F4A6B0]">
              Step 4 • Your Details
            </span>
            <h2 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#2D2A2E]">
              Where should we deliver?
            </h2>
            <p className="text-xs text-[#5C5552]">
              Please share your name, phone number, and address so Allyson can coordinate your bouquet delivery.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#5C5552] mb-1 uppercase tracking-wide">
                  First Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#A89E9C] absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Maria"
                    className="w-full pl-10 pr-3.5 py-3 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5C5552] mb-1 uppercase tracking-wide">
                  Last Name *
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Santos"
                  className="w-full px-3.5 py-3 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#5C5552] mb-1 uppercase tracking-wide">
                  Contact Phone Number *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#A89E9C] absolute left-3.5 top-3.5" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+63 9XX XXX XXXX"
                    className="w-full pl-10 pr-3.5 py-3 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5C5552] mb-1 uppercase tracking-wide">
                  Age (Optional)
                </label>
                <input
                  type="number"
                  value={age || ''}
                  onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="24"
                  className="w-full px-3.5 py-3 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5C5552] mb-1 uppercase tracking-wide">
                Email / Gmail Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#A89E9C] absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="youremail@gmail.com"
                  className="w-full pl-10 pr-3.5 py-3 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-[#5C5552] uppercase tracking-wide">
                  Delivery Address (or specify "Studio Pick-up") *
                </label>
                <span className={`text-[10px] font-bold ${
                  address.trim().length >= 10 ? 'text-emerald-600' : 'text-amber-700'
                }`}>
                  {address.trim().length}/10 letters min
                </span>
              </div>
              <div className="relative">
                <MapPin className="w-4 h-4 text-[#A89E9C] absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House/Unit #, Street, Barangay, Municipality/City, Province"
                  className={`w-full pl-10 pr-3.5 py-3 text-xs rounded-xl bg-[#FAF6F0] border focus:outline-none focus:ring-2 ${
                    address.trim().length > 0 && address.trim().length < 10
                      ? 'border-amber-400 focus:ring-amber-300'
                      : address.trim().length >= 10
                      ? 'border-emerald-300 focus:ring-emerald-200'
                      : 'border-[#E8E2DA] focus:ring-[#F4A6B0]'
                  }`}
                />
              </div>
              <p className="text-[11px] text-[#7C7472] mt-1">
                Studio Pick-up Address: {studioSettings?.pickupAddress || 'Block 4, Lot 12, Dahlia St., San Pedro, Laguna'}.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5C5552] mb-1 uppercase tracking-wide">
                Special Requests / Delivery Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Include a handwritten gift card note: 'Happy 21st Birthday, Jasmine! Love, Mom'"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="pt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-[#F0D9DD]/70">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="w-full sm:w-auto py-3 px-5 min-h-[44px] rounded-xl text-xs font-semibold text-[#5C5552] hover:text-[#2D2A2E] hover:bg-[#FAF6F0] transition-all text-center flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2A2E]"
            >
              ← Back to Payment Mode
            </button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={handleProceedToVerify}
              className="w-full sm:w-auto py-3 px-6 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] flex items-center justify-center gap-2 shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
            >
              <span>Next: Review Order</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* STEP 5: PROCEED TO CHECK-OUT (VERIFY INFO) */}
      {step === 5 && (
        <motion.div 
          key="step-5"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-sm space-y-6"
        >
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#F4A6B0]">
              Step 5 • Final Review
            </span>
            <h2 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#2D2A2E]">
              Double-check your order details
            </h2>
            <p className="text-xs text-[#5C5552]">
              Take a quick look at your flowers, delivery info, and payment selection before submitting.
            </p>
          </div>

          {/* Section 1: Customer Details Snapshot */}
          <div className="p-5 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-serif-title text-sm font-bold text-[#2D2A2E] flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#F4A6B0]" />
                Customer & Delivery Recipient
              </h4>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="text-xs font-semibold text-[#F4A6B0] hover:underline flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Details
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#5C5552]">
              <p>Name: <strong className="text-[#2D2A2E]">{firstName} {lastName}</strong> {age && `(${age} yrs)`}</p>
              <p>Contact: <strong className="text-[#2D2A2E]">{phone}</strong></p>
              <p>Email: <strong className="text-[#2D2A2E]">{email}</strong></p>
              <p>Payment Mode: <strong className="text-[#2D2A2E]">{paymentMode}</strong></p>
              <p className="sm:col-span-2">Address: <strong className="text-[#2D2A2E]">{address}</strong></p>
              {notes && (
                <p className="sm:col-span-2 italic bg-white p-2 rounded-xl border border-[#E8E2DA]">
                  Note: "{notes}"
                </p>
              )}
            </div>
          </div>

          {/* Section 2: Items Breakdown */}
          <div className="space-y-3">
            <h4 className="font-serif-title text-sm font-bold text-[#2D2A2E]">
              Flowers in this Order ({items.length})
            </h4>

            <div className="divide-y divide-[#F0D9DD]/60 border border-[#F0D9DD] rounded-2xl overflow-hidden">
              {items.map((it) => (
                <div key={it.id} className="p-4 flex items-center justify-between bg-white text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        it.type === 'customized' ? 'bg-[#F5EFC0] text-[#70640F]' : 'bg-[#F0D9DD] text-[#7A4B53]'
                      }`}>
                        {it.type === 'customized' ? 'Customized' : 'Premade'}
                      </span>
                      <strong className="text-[#2D2A2E] text-sm">{it.flowerName}</strong>
                    </div>

                    <div className="text-[11px] text-[#7C7472] mt-1 space-x-2">
                      {it.color && <span>Color: {it.color}</span>}
                      {it.colors && <span>Colors: {it.colors.join(', ')}</span>}
                      {it.wrapperColor && <span>• Wrap: {it.wrapperColor}</span>}
                      {it.ribbonColor && <span>• Ribbon: {it.ribbonColor}</span>}
                      <span>• Qty: {it.quantity}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-serif-title text-sm font-bold text-[#2D2A2E]">
                      ₱{(it.totalPrice ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Totals Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-[#FAF6F0] to-[#F0D9DD]/40 border border-[#F0D9DD] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#5C5552]">Total to Pay:</span>
              <p className="text-[11px] text-[#7C7472]">Includes handmade satin materials, wrapping, and packaging</p>
            </div>
            <span className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
              ₱{(subtotal ?? 0).toLocaleString()}
            </span>
          </div>

          {/* Step 5 Decision Point: Edit Info (No) vs Verify Info (Yes) */}
          <div className="pt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-[#F0D9DD]/70">
            <button
              type="button"
              onClick={() => setStep(4)}
              disabled={submitting}
              className="w-full sm:w-auto py-3 px-5 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-white hover:bg-[#FAF6F0] text-[#5C5552] hover:text-[#2D2A2E] border border-[#E8E2DA] transition-all active:scale-95 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2A2E]"
            >
              No, Edit Details
            </button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={handleSubmitOrder}
              disabled={submitting}
              className="w-full sm:w-auto py-3.5 px-8 min-h-[48px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#2D2A2E] shrink-0" />
                  <span>Sending Order to Studio...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#2D2A2E] shrink-0" />
                  <span>Looks Good, Place Order</span>
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

    </div>
  );
};
