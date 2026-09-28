import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  Package, 
  Truck, 
  Send, 
  Star, 
  MessageSquare, 
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  Smartphone,
  Check,
  Flower2,
  Mail,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import confetti from 'canvas-confetti';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, update } from 'firebase/database';
import { db, rtdb } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Order, OrderMessage, OrderStatus } from '../types';
import { 
  subscribeToOrder, 
  subscribeToOrderMessages, 
  sendOrderMessageRealtime,
  cacheOrderLocally,
  getCachedOrders,
  removeOrderFromCache,
  markReceiptSentRealtime
} from '../lib/realtimeSync';
import { clearActiveOrderId, getActivePendingOrder } from '../lib/deviceFingerprint';
import { CancelOrderModal } from '../components/CancelOrderModal';
import { sendReceiptToCustomerEmail } from '../lib/emailReceipt';
import { sanitizeSearchQuery, isValidOrderId, sanitizeText } from '../lib/security';

interface OrderTrackerPageProps {
  initialOrderId?: string | null;
  onReturnHome: () => void;
  onNavigateToCatalog?: () => void;
}

export const OrderTrackerPage: React.FC<OrderTrackerPageProps> = ({
  initialOrderId,
  onReturnHome,
  onNavigateToCatalog,
}) => {
  const { user, profile } = useAuth();
  const cleanInitialId = (initialOrderId && initialOrderId !== 'undefined' && initialOrderId !== 'null') ? initialOrderId.trim() : '';
  const [orderIdInput, setOrderIdInput] = useState<string>(cleanInitialId);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(cleanInitialId || null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Cancellation and Email Receipt States
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState<boolean>(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  // Chat messages
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [newMsgText, setNewMsgText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Always keep outer window pinned at the top when entering or switching orders in Tracker
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [activeOrderId]);

  const handleResendReceipt = async () => {
    if (!order) return;
    setResendingEmail(true);
    setEmailNotice(null);
    try {
      const res = await sendReceiptToCustomerEmail(order);
      if (res.success) {
        setEmailNotice(`Receipt successfully sent to ${order.customerInfo?.email || 'your email'}.`);
        markReceiptSentRealtime(order.id).catch(() => {});
      } else {
        setEmailNotice('Could not send email. Please verify email address or try again shortly.');
      }
    } catch {
      setEmailNotice('Notice: Email could not be dispatched.');
    } finally {
      setResendingEmail(false);
      setTimeout(() => setEmailNotice(null), 4000);
    }
  };

  // Step 8: Completion Rating State
  const [ratingValue, setRatingValue] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');
  const [ratingSubmitted, setRatingSubmitted] = useState<boolean>(false);
  const [submittingRating, setSubmittingRating] = useState<boolean>(false);
  const [supportRequested, setSupportRequested] = useState<boolean>(false);

  // Auto-scroll ONLY within the chat box container itself, NEVER scroll the entire window/page
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Automatically fetch active pending order for logged in customer upon mount/sign-in
  useEffect(() => {
    if (activeOrderId) return;
    let isMounted = true;
    const targetUid = user?.uid || profile?.id;
    const targetEmail = user?.email || profile?.email;

    getActivePendingOrder(targetUid, targetEmail).then((found) => {
      if (isMounted && found && found.id) {
        setActiveOrderId(found.id);
        setOrderIdInput(found.id);
        cacheOrderLocally(found);
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [user, profile, activeOrderId]);

  // Active order: only 1 RECENT active order they placed
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  useEffect(() => {
    try {
      const cached = getCachedOrders();
      // Filter out any cancelled orders or invalid IDs so cancelled orders never show within the website
      const activeList = Object.values(cached || {}).filter(
        (o) => o && typeof o.id === 'string' && o.id.trim() !== '' && o.id !== 'undefined' && o.id !== 'null' && o.status !== 'cancelled'
      );
      if (activeList.length > 0) {
        activeList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setActiveOrder(activeList[0]);
      } else {
        setActiveOrder(null);
      }
    } catch {
      setActiveOrder(null);
    }
  }, [order, activeOrderId]);

  // Real-time listener for the Order document and messages
  useEffect(() => {
    if (!activeOrderId) return;
    setLoading(true);
    setError(null);

    const unsubscribeOrder = subscribeToOrder(
      activeOrderId,
      (data) => {
        setLoading(false);
        // If order is cancelled, it should NO LONGER show within the website, and will remain in the database only!
        if (data.status === 'cancelled') {
          setOrder(null);
          clearActiveOrderId();
          removeOrderFromCache(activeOrderId);
          setError(`Order #${activeOrderId} was cancelled and is no longer available on the website (archived in studio database).`);
          return;
        }
        setOrder(data);
        if (data.rating) {
          setRatingSubmitted(true);
        }
      },
      () => {
        setLoading(false);
        setError(`Order #${activeOrderId} not found. Please double check the order ID.`);
      }
    );

    const unsubscribeMsgs = subscribeToOrderMessages(
      activeOrderId,
      (list) => {
        setMessages(list);
      }
    );

    return () => {
      unsubscribeOrder();
      unsubscribeMsgs();
    };
  }, [activeOrderId]);

  const handleSelectOrder = (id: string) => {
    const { cleanQuery, hasInjectionRisk } = sanitizeSearchQuery(id);

    if (hasInjectionRisk) {
      setError('Security Notice: Disallowed SQL characters or syntax detected. Input safely neutralized.');
      return;
    }

    if (!cleanQuery) return;

    if (!isValidOrderId(cleanQuery)) {
      setError('Invalid Order Reference format. Valid order IDs contain only letters, numbers, and hyphens (e.g. ORD-1727...).');
      return;
    }

    setOrderIdInput(cleanQuery);
    setActiveOrderId(cleanQuery);
    setError(null);
    setCancelNotice(null);
  };

  const handleSearchOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderIdInput.trim()) {
      handleSelectOrder(orderIdInput.trim());
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMsg = sanitizeText(newMsgText, 1000);
    if (!cleanMsg || !activeOrderId) return;

    setSendingMsg(true);
    try {
      const senderName = profile 
        ? `${profile.firstName} ${profile.lastName}` 
        : user?.displayName || 'Customer';

      const msg: OrderMessage = {
        id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        orderId: activeOrderId,
        senderId: user?.uid || 'guest_customer',
        senderRole: 'customer',
        senderName: sanitizeText(senderName, 100),
        text: cleanMsg,
        createdAt: new Date().toISOString(),
      };

      await sendOrderMessageRealtime(activeOrderId, msg);
      setNewMsgText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSendingMsg(false);
    }
  };

  // Step 8: Rating Submission
  const handleRatingSubmit = async (satisfied: boolean) => {
    if (!activeOrderId) return;

    if (!satisfied) {
      // Directs to Order Support / Temporary Chat loop
      setSupportRequested(true);
      // Post automatic support alert in chat
      try {
        const supportMsg: OrderMessage = {
          id: `msg_${Date.now()}_support`,
          orderId: activeOrderId,
          senderId: 'support_bot',
          senderRole: 'system',
          senderName: 'Petal-Trak Care',
          text: `Customer flagged a concern: "${ratingComment || 'Need assistance with order.'}". Allyson has been notified and will assist you right here!`,
          createdAt: new Date().toISOString(),
        };
        await sendOrderMessageRealtime(activeOrderId, supportMsg);
      } catch (err) {
        console.warn('Support alert failed:', err);
      }
      return;
    }

    setSubmittingRating(true);
    try {
      const ratingUpdates = {
        rating: ratingValue,
        ratingComment: ratingComment.trim(),
        ratingSatisfied: true,
        updatedAt: new Date().toISOString(),
      };

      // Update RTDB
      try {
        await update(ref(rtdb, `orders/${activeOrderId}`), ratingUpdates);
      } catch (err) {
        console.warn('RTDB rating update notice:', err);
      }

      // Update Firestore
      try {
        await updateDoc(doc(db, 'orders', activeOrderId), ratingUpdates);
      } catch (err) {
        console.warn('Firestore rating update notice:', err);
      }

      if (order) {
        cacheOrderLocally({ ...order, ...ratingUpdates });
      }

      setRatingSubmitted(true);

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#F5EFC0', '#F0D9DD', '#A9D8E8', '#F4A6B0', '#A8D5C0'],
        });
      } catch {
        // confetti fallback
      }
    } catch (err) {
      console.error('Rating update failed:', err);
    } finally {
      setSubmittingRating(false);
    }
  };

  const statusStepMap: { [key in OrderStatus]: number } = {
    'pending': 1,
    'in-progress': 2,
    'completed': 3,
    'delivered': 4,
    'cancelled': 0,
  };

  const currentStepNum = order ? statusStepMap[order.status] : 1;

  // Framer-motion animation variants for smooth order switching
  const orderContainerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.04,
      },
    },
    exit: {
      opacity: 0,
      y: -18,
      scale: 0.985,
      transition: {
        duration: 0.22,
        ease: 'easeInOut',
      },
    },
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 22, scale: 0.985 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.38,
        ease: 'easeOut',
      },
    },
    exit: {
      opacity: 0,
      y: -14,
      scale: 0.985,
      transition: {
        duration: 0.18,
        ease: 'easeInOut',
      },
    },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      
      {/* Header & Order Lookup */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-2xl mx-auto space-y-3"
      >
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#A9D8E8]/40 text-[#195262] text-xs font-bold uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5" />
          LYPetal Live Order Tracker
        </div>
        <h1 className="font-serif-title text-3xl sm:text-4xl font-bold text-[#2D2A2E]">
          Track Your Flower Order
        </h1>
        <p className="text-xs sm:text-sm text-[#5C5552]">
          Follow the progress of your handmade satin bouquet in real time—from ribbon cutting to packaging and delivery.
        </p>

        {/* Order search bar */}
        <form onSubmit={handleSearchOrder} className="pt-2 flex gap-2 max-w-md mx-auto">
          <input
            type="text"
            value={orderIdInput}
            onChange={(e) => setOrderIdInput(e.target.value)}
            placeholder="Enter your Order ID (e.g. LYP-123456-789)"
            className="flex-1 px-4 py-2.5 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
          />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            type="submit"
            className="py-3 px-6 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] shadow-2xs hover:shadow-xs transition-all active:scale-95 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
          >
            Track
          </motion.button>
        </form>

        {/* Active Orders switcher: shows ONLY 1 RECENT active order they did */}
        {activeOrder && activeOrder.id && activeOrder.id !== 'undefined' && activeOrder.id !== 'null' && activeOrder.id.trim() !== '' && (
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] font-semibold text-[#7C7472]">Active Orders:</span>
            <button
              type="button"
              onClick={() => handleSelectOrder(activeOrder.id)}
              className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                activeOrderId === activeOrder.id
                  ? 'bg-[#F4A6B0] text-[#2D2A2E] shadow-2xs ring-2 ring-[#EE8E9B] scale-105'
                  : 'bg-white hover:bg-[#F0D9DD]/70 text-[#5C5552] border border-[#E8E2DA]'
              }`}
              title={`Switch to your active order #${activeOrder.id}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>#{activeOrder.id}</span>
            </button>
          </div>
        )}
      </motion.div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-600 text-center"
        >
          {error}
        </motion.div>
      )}

      {/* Main Order View Wrapped with Framer Motion AnimatePresence */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div 
            key="order-loading"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="text-center py-16 text-xs text-[#7C7472] flex flex-col items-center justify-center gap-3 bg-white/70 rounded-3xl border border-[#F0D9DD]/60 shadow-xs"
          >
            <div className="w-10 h-10 rounded-2xl bg-[#F0D9DD]/50 flex items-center justify-center">
              <Clock className="w-5 h-5 animate-spin text-[#F4A6B0]" />
            </div>
            <span className="font-semibold text-[#2D2A2E]">
              Fetching status for {activeOrderId ? `#${activeOrderId}` : 'order'}...
            </span>
          </motion.div>
        ) : order ? (
          <motion.div 
            key={`order-view-${order.id}`}
            variants={orderContainerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-8"
          >
            
            {/* CARD 1: Order Header & Status Pipeline Card */}
            <motion.div 
              variants={cardVariants}
              className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-sm space-y-6"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-[#F0D9DD]/70">
                <div>
                  <span className="text-[11px] font-semibold text-[#7C7472] uppercase tracking-wider">
                    Order Reference
                  </span>
                  <h2 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                    #{order.id}
                  </h2>
                  <p className="text-xs text-[#5C5552] mt-0.5">
                    Placed on {order.createdAt ? `${new Date(order.createdAt).toLocaleDateString()} at ${new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'N/A'}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-[11px] font-semibold text-[#7C7472] uppercase tracking-wider block">
                    Payment Status ({order.paymentMode})
                  </span>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-1 ${
                    order.paymentStatus === 'paid' 
                      ? 'bg-[#A8D5C0] text-[#1D5E43]' 
                      : order.paymentStatus === 'partial' 
                      ? 'bg-[#F5EFC0] text-[#70640F]' 
                      : 'bg-[#F0D9DD] text-[#7A4B53]'
                  }`}>
                    {(order.paymentStatus || 'PENDING').toUpperCase()} • ₱{(order.totalAmount ?? 0).toLocaleString()}
                  </span>
                  {(order.balance ?? 0) > 0 && (
                    <p className="text-[11px] text-[#7C7472] mt-0.5">
                      Remaining Balance: ₱{(order.balance ?? 0).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Quick Actions: Email confirmation & Cancel Order */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-b border-[#F0D9DD]/50 pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs bg-[#FAF6F0] text-[#2D2A2E] border border-[#E8E2DA]">
                    <Mail className="w-3.5 h-3.5 text-[#F4A6B0]" />
                    <span>
                      Receipt sent to <strong className="font-semibold text-[#2D2A2E]">{order.customerInfo?.email || 'your email'}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResendReceipt}
                    disabled={resendingEmail}
                    className="py-1.5 px-3 rounded-xl text-xs font-semibold text-[#7A4B53] hover:text-[#2D2A2E] hover:bg-[#F0D9DD]/40 transition-colors cursor-pointer disabled:opacity-50"
                    title="Resend receipt to email"
                  >
                    {resendingEmail ? 'Sending...' : 'Resend Email'}
                  </button>
                </div>

                {order.status !== 'cancelled' && order.status !== 'delivered' && (
                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    className="py-2 px-3.5 rounded-xl text-xs font-bold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                    <span>Cancel Order</span>
                  </button>
                )}
              </div>

              {emailNotice && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                  <span>{emailNotice}</span>
                  <button onClick={() => setEmailNotice(null)} className="font-bold text-emerald-700 ml-2">✕</button>
                </div>
              )}

              {cancelNotice && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                  <span>{cancelNotice}</span>
                  <button onClick={() => setCancelNotice(null)} className="font-bold text-amber-700 ml-2">✕</button>
                </div>
              )}

              {/* ORDER STATUS VIEW: CANCELLED OR LIVE PIPELINE */}
              <AnimatePresence mode="wait">
                {order.status === 'cancelled' ? (
                  <motion.div 
                    key="status-cancelled"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.28 }}
                    className="p-6 rounded-3xl bg-red-50/70 border border-red-200/90 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-red-200/60">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                          <XCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-serif-title text-lg font-bold text-red-900">
                            Order Has Been Cancelled
                          </h4>
                          <span className="text-[11px] text-red-600">
                            Cancelled by {order.cancelledBy === 'owner' ? 'Studio Owner (Allyson)' : 'Customer'}
                            {order.cancelledAt && ` on ${new Date(order.cancelledAt).toLocaleDateString()} at ${new Date(order.cancelledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          </span>
                        </div>
                      </div>
                      <span className="self-start sm:self-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-200">
                        Cancelled
                      </span>
                    </div>

                    {/* Reason Breakdown */}
                    <div className="p-4 rounded-2xl bg-white border border-red-100 space-y-1.5 shadow-2xs">
                      <span className="text-[11px] font-bold text-red-900 uppercase tracking-wider block">
                        Reason Provided:
                      </span>
                      <p className="text-xs text-[#2D2A2E] leading-relaxed italic bg-red-50/40 p-2.5 rounded-xl border border-red-100/60 font-medium">
                        "{order.cancellationReason || 'No reason specified'}"
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                      <p className="text-xs text-red-700/90 text-center sm:text-left">
                        Reserved floral materials have been released back to studio inventory. You can still message Allyson below!
                      </p>
                      {onNavigateToCatalog && (
                        <button
                          onClick={onNavigateToCatalog}
                          className="w-full sm:w-auto py-2.5 px-4 rounded-xl text-xs font-bold bg-[#2D2A2E] text-white hover:bg-[#3D383C] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                        >
                          <Flower2 className="w-3.5 h-3.5 text-[#F4A6B0]" />
                          <span>Browse Other Bouquets</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  /* STEP 7: ORDER STATUS PIPELINE (Completed? Loop) */
                  <motion.div
                    key={`status-pipeline-${order.status}`}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.28 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-serif-title text-base font-bold text-[#2D2A2E]">
                        Live Production Pipeline
                      </h3>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#FAF6F0] border border-[#E8E2DA] text-[#2D2A2E]">
                        Est. Deadline: {order.deadline || '3–5 days'}
                      </span>
                    </div>

                    {/* Status Stepper Graphic */}
                    <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center">
                      
                      {/* 1. Pending */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className={`h-2 rounded-full transition-all ${
                          currentStepNum >= 1 ? 'bg-[#F4A6B0]' : 'bg-[#E8E2DA]'
                        }`} />
                        <div className="flex items-center justify-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#F4A6B0] shrink-0" />
                          <span className="text-[10px] sm:text-xs font-bold text-[#2D2A2E] truncate">Order Placed</span>
                        </div>
                        <p className="text-[9px] sm:text-[10px] text-[#7C7472] truncate">Materials reserved</p>
                      </div>

                      {/* 2. In-Progress */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className={`h-2 rounded-full transition-all ${
                          currentStepNum >= 2 ? 'bg-[#F4A6B0]' : 'bg-[#E8E2DA]'
                        }`} />
                        <div className="flex items-center justify-center gap-1">
                          <Flower2 className={`w-3.5 h-3.5 shrink-0 ${currentStepNum >= 2 ? 'text-[#F4A6B0] animate-spin' : 'text-[#7C7472]'}`} />
                          <span className="text-[10px] sm:text-xs font-bold text-[#2D2A2E] truncate">In-Progress</span>
                        </div>
                        <p className="text-[9px] sm:text-[10px] text-[#7C7472] truncate">Hand-folding petals</p>
                      </div>

                      {/* 3. Completed */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className={`h-2 rounded-full transition-all ${
                          currentStepNum >= 3 ? 'bg-[#A8D5C0]' : 'bg-[#E8E2DA]'
                        }`} />
                        <div className="flex items-center justify-center gap-1">
                          <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${currentStepNum >= 3 ? 'text-[#1D5E43]' : 'text-[#7C7472]'}`} />
                          <span className="text-[10px] sm:text-xs font-bold text-[#2D2A2E] truncate">Completed</span>
                        </div>
                        <p className="text-[9px] sm:text-[10px] text-[#7C7472] truncate">Arranged & inspected</p>
                      </div>

                      {/* 4. Delivered */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className={`h-2 rounded-full transition-all ${
                          currentStepNum >= 4 ? 'bg-[#A8D5C0]' : 'bg-[#E8E2DA]'
                        }`} />
                        <div className="flex items-center justify-center gap-1">
                          <Truck className={`w-3.5 h-3.5 shrink-0 ${currentStepNum >= 4 ? 'text-[#1D5E43]' : 'text-[#7C7472]'}`} />
                          <span className="text-[10px] sm:text-xs font-bold text-[#2D2A2E] truncate">Delivered</span>
                        </div>
                        <p className="text-[9px] sm:text-[10px] text-[#7C7472] truncate">Handed to recipient</p>
                      </div>

                    </div>

                    {/* Loop indicator if in pending/in-progress */}
                    {(order.status === 'pending' || order.status === 'in-progress') && (
                      <div className="mt-6 p-4 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#F5EFC0] flex items-center justify-center text-[#70640F] shrink-0">
                          <Clock className="w-4 h-4 animate-spin" />
                        </div>
                        <div className="text-xs text-[#5C5552]">
                          <strong>Flowers in Progress:</strong> Allyson is currently crafting your ribbon bouquet in our studio. This tracker updates automatically as soon as your flowers move to the next step!
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* CARD 2: Bespoke Bouquet Specifications & Item Breakdown */}
            {order.items && order.items.length > 0 && (
              <motion.div 
                variants={cardVariants}
                className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-sm space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0D9DD]/70 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#FAF6F0] border border-[#F0D9DD] flex items-center justify-center text-[#7A4B53]">
                      <Package className="w-5 h-5 text-[#F4A6B0]" />
                    </div>
                    <div>
                      <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E]">
                        Arrangement & Bouquet Specifications
                      </h3>
                      <p className="text-[11px] text-[#7C7472]">
                        Handmade satin blooms crafted for #{order.id}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#FAF6F0] text-[#2D2A2E] border border-[#E8E2DA]">
                    {order.items.length} {order.items.length === 1 ? 'Bouquet Item' : 'Bouquet Items'}
                  </span>
                </div>

                <div className="divide-y divide-[#F0D9DD]/50">
                  {order.items.map((item, idx) => (
                    <div key={item.id || idx} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-serif-title font-bold text-base text-[#2D2A2E]">
                            {item.flowerName}
                          </span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#F0D9DD]/60 text-[#7A4B53]">
                            {item.type === 'customized' ? 'Bespoke Custom' : 'Premade'}
                          </span>
                          <span className="text-xs text-[#7C7472]">× {item.quantity}</span>
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs text-[#5C5552] pt-1">
                          <span className="px-2.5 py-0.5 rounded-lg bg-[#FAF6F0] border border-[#E8E2DA]">
                            Stem Count: <strong>{item.stemsCount} stems</strong>
                          </span>
                          {(item.color || (item.colors && item.colors.length > 0)) && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-[#FAF6F0] border border-[#E8E2DA]">
                              Petal Hues: <strong>{item.colors ? item.colors.join(', ') : item.color}</strong>
                            </span>
                          )}
                          {item.wrapperColor && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-[#FAF6F0] border border-[#E8E2DA]">
                              Wrapper: <strong>{item.wrapperColor}</strong>
                            </span>
                          )}
                          {item.ribbonColor && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-[#FAF6F0] border border-[#E8E2DA]">
                              Ribbon: <strong>{item.ribbonColor}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right sm:self-center">
                        <span className="font-bold text-sm text-[#2D2A2E]">
                          ₱{(item.totalPrice ?? 0).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-[#7C7472] block">
                          ₱{(item.unitPrice ?? 0).toLocaleString()} each
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delivery & Recipient Information */}
                {order.customerInfo && (
                  <div className="pt-4 border-t border-[#F0D9DD]/60 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] space-y-1">
                      <span className="text-[10px] font-bold text-[#7C7472] uppercase tracking-wider block">
                        Recipient & Contact
                      </span>
                      <p className="font-semibold text-[#2D2A2E]">{order.customerInfo?.name || 'Customer'}</p>
                      <p className="text-[#5C5552]">
                        {[order.customerInfo?.phone, order.customerInfo?.email].filter(Boolean).join(' • ') || 'Contact details provided'}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] space-y-1">
                      <span className="text-[10px] font-bold text-[#7C7472] uppercase tracking-wider block">
                        Delivery / Pick-up Address
                      </span>
                      <p className="text-[#2D2A2E] font-medium leading-relaxed">
                        {order.customerInfo.address || 'San Pedro, Laguna Studio'}
                      </p>
                    </div>
                  </div>
                )}

                {order.notes && (
                  <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-[#2D2A2E]">
                    <span className="font-bold text-amber-900 block mb-0.5">Customer Note for Studio:</span>
                    <p className="italic text-[#5C5552]">"{order.notes}"</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* CARD 3: STEP 8 COMPLETION RATING SHEET (Active when order is completed or delivered) */}
            {(order.status === 'completed' || order.status === 'delivered') && (
              <motion.div 
                variants={cardVariants}
                className="bg-gradient-to-br from-white via-[#FAF6F0] to-[#F5EFC0]/30 rounded-3xl p-6 sm:p-8 border border-[#F5EFC0] shadow-sm space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#F5EFC0] mx-auto flex items-center justify-center text-[#70640F] shadow-xs">
                    <Star className="w-6 h-6 fill-[#C98A12] text-[#C98A12]" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#70640F]">
                    Order Complete • Share Your Thoughts
                  </span>
                  <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                    How do your flowers look?
                  </h3>
                  <p className="text-xs text-[#5C5552] max-w-md mx-auto">
                    Allyson just finished putting your bouquet together! Please let us know how everything turned out so we can keep making our flowers even better.
                  </p>
                </div>

                {ratingSubmitted ? (
                  <div className="p-6 rounded-2xl bg-white border border-[#A8D5C0] text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-[#A8D5C0] text-[#1D5E43] flex items-center justify-center mx-auto">
                      <Check className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <h4 className="font-serif-title text-lg font-bold text-[#2D2A2E]">
                      Thank You for Your Feedback!
                    </h4>
                    <p className="text-xs text-[#5C5552] max-w-sm mx-auto">
                      Your rating of <strong>{order.rating || ratingValue} stars</strong> has been saved. Allyson reads and appreciates every single note!
                    </p>

                    {/* Soft Mobile App CTA */}
                    <div className="mt-4 pt-4 border-t border-[#F0D9DD]/60 flex items-center justify-center gap-2 text-xs text-[#7C7472]">
                      <Smartphone className="w-4 h-4 text-[#F4A6B0]" />
                      <span>LYPetal mobile ordering app coming soon</span>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={onReturnHome}
                        className="py-3 px-6 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] transition-all active:scale-95 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                      >
                        Return to Homepage
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-md mx-auto space-y-4">
                    {/* Star Rating Selectors (1 to 5) */}
                    <div className="flex items-center justify-center gap-3 py-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRatingValue(star)}
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center transform hover:scale-110 active:scale-95 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C98A12] rounded-xl"
                          aria-label={`Rate ${star} star`}
                        >
                          <Star className={`w-8 h-8 ${
                            star <= ratingValue 
                              ? 'text-[#C98A12] fill-[#C98A12]' 
                              : 'text-[#E8E2DA]'
                          }`} />
                        </button>
                      ))}
                    </div>
                    <p className="text-center text-xs font-bold text-[#2D2A2E]">
                      {ratingValue === 5 && '★★★★★ Absolutely loved it! Beautiful work.'}
                      {ratingValue === 4 && '★★★★☆ Really pretty bouquet! Very happy with it.'}
                      {ratingValue === 3 && '★★★☆☆ Looks good, meets expectations.'}
                      {ratingValue === 2 && '★★☆☆☆ A few details could be improved.'}
                      {ratingValue === 1 && '★☆☆☆☆ Needs attention from the studio.'}
                    </p>

                    <textarea
                      rows={2}
                      value={ratingComment}
                      onChange={(e) => setRatingComment(e.target.value)}
                      placeholder="Leave a short note or feedback for Allyson (optional)..."
                      className="w-full p-3 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                    />

                    {/* Step 8 Decision Point: Satisfied? */}
                    <div className="pt-2 space-y-2">
                      <p className="text-center text-[11px] font-bold text-[#5C5552] uppercase tracking-wider">
                        Are you happy with your flowers?
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Satisfied = Yes */}
                        <button
                          type="button"
                          onClick={() => handleRatingSubmit(true)}
                          disabled={submittingRating}
                          className="w-full py-3.5 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#A8D5C0] hover:bg-[#97c4af] text-[#1D5E43] shadow-xs transition-all active:scale-95 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D5E43]"
                        >
                          Yes, Submit Review
                        </button>

                        {/* Satisfied = No -> Loops to support / temporary chat */}
                        <button
                          type="button"
                          onClick={() => handleRatingSubmit(false)}
                          disabled={submittingRating}
                          className="w-full py-3.5 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-white hover:bg-[#FAF6F0] text-[#C53030] border border-red-200 transition-all active:scale-95 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        >
                          No, I Need Help
                        </button>
                      </div>
                    </div>

                    {supportRequested && (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                        <strong>Note sent to Allyson:</strong> We've connected you to Allyson in the chat below. Please let her know what needs adjustment so we can make it right!
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* CARD 4: TEMPORARY LIVE ORDER CHAT */}
            <motion.div 
              variants={cardVariants}
              className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#F0D9DD]/70 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#F0D9DD] flex items-center justify-center text-[#2D2A2E]">
                    <MessageSquare className="w-5 h-5 text-[#F4A6B0]" />
                  </div>
                  <div>
                    <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E]">
                      Chat Directly with Allyson
                    </h3>
                    <p className="text-[11px] text-[#7C7472]">
                      Have a question about ribbon shades, card notes, or delivery timing for #{order.id}? Message here anytime.
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat message thread */}
              <div 
                ref={chatContainerRef}
                className="h-52 sm:h-64 max-h-[40vh] sm:max-h-none overflow-y-auto p-4 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] space-y-3 transition-[height] duration-200"
              >
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-xs text-[#7C7472]">
                    No messages yet. Send a note to Allyson below!
                  </div>
                ) : (
                  messages.map((m) => {
                    const isOwner = m.senderRole === 'owner';
                    const isCustomer = m.senderRole === 'customer';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5 text-[10px] text-[#7C7472]">
                          <span className="font-semibold text-[#2D2A2E]">{m.senderName}</span>
                          {isOwner && (
                            <span className="px-1.5 py-0.2 rounded bg-[#F5EFC0] text-[#70640F] font-bold text-[9px]">
                              Studio Owner
                            </span>
                          )}
                          <span>• {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div className={`p-3 rounded-2xl max-w-sm text-xs leading-relaxed ${
                          isCustomer
                            ? 'bg-[#F4A6B0] text-[#2D2A2E] rounded-tr-xs shadow-2xs'
                            : 'bg-white text-[#2D2A2E] rounded-tl-xs border border-[#E8E2DA] shadow-2xs'
                        }`}>
                          {m.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat input box */}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMsgText}
                  onChange={(e) => setNewMsgText(e.target.value)}
                  onFocus={(e) => {
                    const target = e.target;
                    setTimeout(() => {
                      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      if (chatContainerRef.current) {
                        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                      }
                    }, 200);
                  }}
                  placeholder="Type a message for Allyson (e.g. delivery instructions, special requests)..."
                  className="flex-1 px-4 py-2.5 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E]"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !newMsgText.trim()}
                  className="py-2.5 px-4 min-h-[42px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                >
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  <span>Send</span>
                </button>
              </form>
            </motion.div>

          </motion.div>
        ) : (
          <motion.div
            key="order-empty"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="text-center py-16 text-xs text-[#7C7472] bg-white/70 rounded-3xl border border-[#F0D9DD]/60 space-y-3 shadow-xs"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6F0] border border-[#F0D9DD] mx-auto flex items-center justify-center text-[#7A4B53]">
              <Package className="w-6 h-6 text-[#F4A6B0]" />
            </div>
            <p className="font-semibold text-sm text-[#2D2A2E]">
              {activeOrderId ? `Order #${activeOrderId} Not Found` : 'No Order Selected'}
            </p>
            <p className="max-w-xs mx-auto text-[#5C5552]">
              Please enter your Order Reference ID or click your Active Order above to track its live status.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancellation Modal with Reason Selection */}
      <CancelOrderModal
        isOpen={isCancelModalOpen}
        order={order}
        onClose={() => setIsCancelModalOpen(false)}
        onCancelled={(reason) => {
          const cancelledId = order?.id;
          if (cancelledId) {
            removeOrderFromCache(cancelledId);
            clearActiveOrderId();
          }
          setOrder(null);
          setActiveOrderId(null);
          setOrderIdInput('');
          setCancelNotice(`Order #${cancelledId} has been cancelled and removed from the website. It remains archived in our database.`);
          setIsCancelModalOpen(false);
        }}
      />

    </div>
  );
};
