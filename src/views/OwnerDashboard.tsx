import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  BarChart3, 
  Users, 
  PackageCheck, 
  Activity, 
  ClipboardList, 
  CreditCard, 
  Boxes, 
  MessageSquare, 
  DollarSign, 
  AlertTriangle, 
  Check, 
  Plus, 
  Minus, 
  Edit3, 
  Trash2, 
  Send, 
  Clock, 
  Sparkles, 
  Lock, 
  LogOut,
  Search,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  Copy,
  ExternalLink,
  ArrowLeft,
  KeyRound,
  X,
  RefreshCw,
  SlidersHorizontal,
  Filter,
  PackagePlus,
  Upload,
  Image as ImageIcon,
  Receipt,
  XCircle,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Loader2,
  Palette,
  CheckCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sendReceiptToCustomerEmail } from '../lib/emailReceipt';
import { containsSqlInjection, sanitizeSearchQuery, sanitizeText } from '../lib/security';
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc,
  updateDoc, 
  query, 
  orderBy, 
  addDoc, 
  setDoc,
  deleteDoc,
  increment 
} from 'firebase/firestore';
import { ref as rtdbRef, set as rtdbSet, update as rtdbUpdate } from 'firebase/database';
import { db, rtdb, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail,
  updatePassword
} from 'firebase/auth';
import { 
  subscribeToAllOrdersRealtime, 
  subscribeToCancelledOrdersRealtime,
  subscribeToOrderMessages, 
  sendOrderMessageRealtime, 
  updateOrderStatusRealtime, 
  updateOrderPaymentRealtime,
  cancelOrderRealtime,
  deleteOrderRealtime,
  markReceiptSentRealtime,
  unmarkOrderDeleted,
  markOrderDeleted,
  restoreOrderRealtime,
  cleanForFirestore,
  subscribeToProductsRealtime,
  updateProductPriceRealtime,
  saveProductRealtime,
  deleteProductRealtime,
  saveStudioSettingsRealtime,
  subscribeToInventoryRealtime,
  getCachedInventory,
  updateInventoryStockRealtime,
  adjustInventoryStockRealtime,
  flushPendingInventoryUpdates,
  fetchLatestInventoryRealtime,
  saveInventoryItemRealtime,
  deleteInventoryItemRealtime,
  syncOfficialInventoryRealtime
} from '../lib/realtimeSync';
import { useAuth, checkIsOwnerEmail, addCustomOwnerEmail } from '../context/AuthContext';
import { 
  INITIAL_INVENTORY, 
  INITIAL_PRODUCTS, 
  INITIAL_STUDIO_SETTINGS, 
  syncOfficialInventoryToFirestore 
} from '../data/seedData';
import { 
  Order, 
  CustomerUser, 
  ProductItem, 
  InventoryItem, 
  StudioSettings, 
  OrderStatus, 
  PaymentStatus, 
  OrderMessage,
  FlowerColor,
  FlowerType 
} from '../types';

const ALL_FLOWER_COLORS: FlowerColor[] = [
  'Pastel Pink',
  'Pink',
  'Violet',
  'White',
  'Yellow',
  'Sage Green',
  'Emerald',
  'Brown'
];

const FLOWER_PRESET_IMAGES = [
  { label: 'Satin Rose', url: '/Rose.jpg' },
  { label: 'Satin Dahlia', url: '/Dahlia.jpg' },
  { label: 'Satin Tulip', url: 'https://images.unsplash.com/photo-1520763185298-1b434c919102?auto=format&fit=crop&w=800&q=80' },
  { label: 'Satin Peony', url: 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=800&q=80' },
  { label: 'Satin Sunflower', url: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?auto=format&fit=crop&w=800&q=80' },
];

const safeFormatDate = (val: any): string => {
  if (!val) return 'N/A';
  try {
    const d = typeof val === 'object' && val !== null && 'seconds' in val 
      ? new Date((val as any).seconds * 1000) 
      : new Date(val);
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
  } catch {
    return 'N/A';
  }
};

const safeFormatDateTime = (val: any): string => {
  if (!val) return 'N/A';
  try {
    const d = typeof val === 'object' && val !== null && 'seconds' in val 
      ? new Date((val as any).seconds * 1000) 
      : new Date(val);
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
  } catch {
    return 'N/A';
  }
};

const safeFormatTime = (val: any): string => {
  if (!val) return '';
  try {
    const d = typeof val === 'object' && val !== null && 'seconds' in val 
      ? new Date((val as any).seconds * 1000) 
      : new Date(val);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

type DashboardTab = 
  | 'overview' 
  | 'customers' 
  | 'products' 
  | 'production' 
  | 'orders' 
  | 'payments' 
  | 'inventory' 
  | 'chat' 
  | 'sales'
  | 'settings';

interface OwnerDashboardProps {
  onReturnToStore: () => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({ onReturnToStore }) => {
  const { user, profile, role, logOut, logIn, authenticateAsRole } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [ordersSubFilter, setOrdersSubFilter] = useState<'active' | 'cancelled'>('active');

  // Live Firestore Data (default to seed constants so data is never blank)
  const [orders, setOrders] = useState<Order[]>([]);
  const [cancelledOrders, setCancelledOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<CustomerUser[]>([]);
  const [products, setProducts] = useState<ProductItem[]>(() => {
    try {
      const cached = localStorage.getItem('lypetal_products_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_PRODUCTS;
  });
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    return getCachedInventory();
  });
  const [studioSettings, setStudioSettings] = useState<StudioSettings | null>(() => {
    try {
      const cached = localStorage.getItem('lypetal_studio_settings_cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    return INITIAL_STUDIO_SETTINGS;
  });

  // Allyson's Founder Profile & Studio Contact Form State
  const [profileForm, setProfileForm] = useState({
    businessName: INITIAL_STUDIO_SETTINGS.businessName || 'LYPetal Flower Studio',
    ownerName: INITIAL_STUDIO_SETTINGS.ownerName || 'Allyson',
    ownerTitle: INITIAL_STUDIO_SETTINGS.ownerTitle || 'Founder & Artisan Florist',
    headline: INITIAL_STUDIO_SETTINGS.headline || '"Every flower tells a story that stays with you."',
    ownerIntro: INITIAL_STUDIO_SETTINGS.ownerIntro || '',
    story: INITIAL_STUDIO_SETTINGS.story || '',
    contactPhone: INITIAL_STUDIO_SETTINGS.contactPhone || '+63 912 345 6789',
    contactEmail: INITIAL_STUDIO_SETTINGS.contactEmail || 'allyson@lypetal.com',
    pickupAddress: INITIAL_STUDIO_SETTINGS.pickupAddress || 'Block 4, Lot 12, Dahlia St., San Pedro, Laguna, Philippines',
    facebookPage: INITIAL_STUDIO_SETTINGS.facebookPage || 'https://facebook.com/lypetal.studio',
    instagramHandle: INITIAL_STUDIO_SETTINGS.instagramHandle || '@lypetal.flowers',
    twoFactorEmails: INITIAL_STUDIO_SETTINGS.contactEmail || 'colum00r@gmail.com, hanzgonzales125@gmail.com, allyson@lypetal.com',
    senderEmail: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Sync profile form when studioSettings loads/updates
  useEffect(() => {
    if (studioSettings) {
      setProfileForm({
        businessName: studioSettings.businessName || 'LYPetal Flower Studio',
        ownerName: studioSettings.ownerName || 'Allyson',
        ownerTitle: studioSettings.ownerTitle || 'Founder & Artisan Florist',
        headline: studioSettings.headline || '"Every flower tells a story that stays with you."',
        ownerIntro: studioSettings.ownerIntro || '',
        story: studioSettings.story || '',
        contactPhone: studioSettings.contactPhone || '',
        contactEmail: studioSettings.contactEmail || '',
        pickupAddress: studioSettings.pickupAddress || '',
        facebookPage: studioSettings.facebookPage || '',
        instagramHandle: studioSettings.instagramHandle || '',
        twoFactorEmails: studioSettings.twoFactorEmails || 'colum00r@gmail.com, hanzgonzales125@gmail.com, allyson@lypetal.com',
        senderEmail: studioSettings.senderEmail || '',
      });
    }
  }, [studioSettings]);

  // In-app order action dialog states (safe alternative to blocked window.confirm / window.prompt in iframe)
  const [orderToVoid, setOrderToVoid] = useState<{ id: string; reason: string } | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [orderToRestore, setOrderToRestore] = useState<string | null>(null);

  // Flower & Product management modal states
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<ProductItem | null>(null);
  const [updatingPriceId, setUpdatingPriceId] = useState<string | null>(null);
  const [priceSuccessId, setPriceSuccessId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    flowerType: 'rose' as FlowerType,
    basePrice: 80,
    description: '',
    badge: '1 pc stem',
    imageUrl: '/Rose.jpg',
    availableColors: [...ALL_FLOWER_COLORS] as FlowerColor[],
    active: true,
  });

  // Inventory Management State
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('all');
  const [inventoryStockFilter, setInventoryStockFilter] = useState<'all' | 'low' | 'out' | 'healthy'>('all');
  const [inventorySortOrder, setInventorySortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [isAddingInventory, setIsAddingInventory] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState<InventoryItem | null>(null);
  const [inventoryItemToDelete, setInventoryItemToDelete] = useState<InventoryItem | null>(null);
  const [isRefreshingInventory, setIsRefreshingInventory] = useState(false);
  const [stockSyncStatus, setStockSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [stockSyncNotice, setStockSyncNotice] = useState<string | null>(null);

  // New inventory form state
  const [newInvName, setNewInvName] = useState('');
  const [newInvCategory, setNewInvCategory] = useState<InventoryItem['category']>('flower');
  const [newInvStock, setNewInvStock] = useState<number>(50);
  const [newInvUnit, setNewInvUnit] = useState<string>('pcs');
  const [newInvThreshold, setNewInvThreshold] = useState<number>(10);
  const [newInvColorHex, setNewInvColorHex] = useState<string>('#F4A6B0');
  const [editingInvColorHex, setEditingInvColorHex] = useState<string>('#F4A6B0');

  // Active chat selection in Chat Panel
  const [selectedChatOrderId, setSelectedChatOrderId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<OrderMessage[]>([]);
  const [ownerReplyText, setOwnerReplyText] = useState<string>('');
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);

  // Unread customer messages notifier state & audio chime
  const [unreadOrderMap, setUnreadOrderMap] = useState<Record<string, number>>({});
  const lastSeenMsgCountRef = useRef<Record<string, number>>({});
  const isFirstLoadRef = useRef(true);

  const playMessageChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime + 0.12);
      osc1.stop(ctx.currentTime + 0.3);
      osc2.stop(ctx.currentTime + 0.45);
    } catch (err) {
      console.warn('Audio chime notice:', err);
    }
  }, []);

  // Search & Filter States for High Performance & Usability
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');
  const [cancelledSearchQuery, setCancelledSearchQuery] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Notification / Feedback banner
  const [alertNotice, setAlertNotice] = useState<string | null>(null);

  // Private Owner Login states (Email + Password + 4-Digit 2FA + 30-Day Trusted Device)
  const [is2FAVerified, setIs2FAVerified] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('lypetal_owner_2fa_verified') === 'true';
  });
  const [authStage, setAuthStage] = useState<'credentials' | 'code_2fa' | 'approved'>(() => {
    if (typeof window === 'undefined') return 'credentials';
    return sessionStorage.getItem('lypetal_owner_2fa_verified') === 'true' ? 'approved' : 'credentials';
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [fourDigitCode, setFourDigitCode] = useState('');
  const [trustBrowser30Days, setTrustBrowser30Days] = useState(false);
  const [authenticatedUid, setAuthenticatedUid] = useState<string | null>(null);
  const [authenticatedEmail, setAuthenticatedEmail] = useState<string | null>(null);
  const [targetMaskedEmail, setTargetMaskedEmail] = useState<string | null>(null);
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string | null>(null);
  const [devCodeHelper, setDevCodeHelper] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [approvedSuccessCelebration, setApprovedSuccessCelebration] = useState(false);
  const [isCheckingTrustedDevice, setIsCheckingTrustedDevice] = useState(false);
  const [isRevokingTrustedDevices, setIsRevokingTrustedDevices] = useState(false);
  const [showRevokeConfirmModal, setShowRevokeConfirmModal] = useState(false);
  const [isClaimingOwner, setIsClaimingOwner] = useState(false);
  const [claimOwnerSuccess, setClaimOwnerSuccess] = useState<string | null>(null);

  // Password setup / reset states (Login Screen)
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);
  const [passwordResetSentNotice, setPasswordResetSentNotice] = useState<string | null>(null);
  const [showPasswordSetupPrompt, setShowPasswordSetupPrompt] = useState(false);

  // In-Dashboard password update states (Settings Tab)
  const [newDashboardPassword, setNewDashboardPassword] = useState('');
  const [confirmDashboardPassword, setConfirmDashboardPassword] = useState('');
  const [isUpdatingDashboardPassword, setIsUpdatingDashboardPassword] = useState(false);
  const [dashboardPasswordSuccess, setDashboardPasswordSuccess] = useState<string | null>(null);
  const [dashboardPasswordError, setDashboardPasswordError] = useState<string | null>(null);

  // Timer for 2FA resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Copy private URL state
  const [copiedLink, setCopiedLink] = useState(false);

  // Collapsible sidebar state (persisted in localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('lypetal_owner_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => !prev);
    try {
      const next = !isSidebarCollapsed;
      localStorage.setItem('lypetal_owner_sidebar_collapsed', String(next));
    } catch {}
  };

  // Mobile drawer state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Quick navigation filter input
  const [navSearch, setNavSearch] = useState('');

  // Per-category collapse state
  const [collapsedCategories, setCollapsedCategories] = useState<{ [key: string]: boolean }>({});
  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Security Check: Enforce Role Guard & 2FA Verification
  const isAuthorized = role === 'owner' && (is2FAVerified || authStage === 'approved');

  // Load real-time Firestore collections
  useEffect(() => {
    if (!isAuthorized) return;

    // 1. Orders (Multi-tier Realtime Sync: RTDB + Firestore + Local Cache)
    const unsubOrders = subscribeToAllOrdersRealtime((list) => {
      const orderMap = new Map<string, Order>();
      list.forEach((o, idx) => {
        const key = o.id || `order-${idx}`;
        if (!orderMap.has(key)) {
          orderMap.set(key, o);
        }
      });
      const uniqueOrders = Array.from(orderMap.values());
      setOrders(uniqueOrders);
      if (uniqueOrders.length > 0 && !selectedChatOrderId) {
        setSelectedChatOrderId(uniqueOrders[0].id);
      }
    });

    // 1b. Cancelled Orders (Dedicated 'cancelledorders' table/collection)
    const unsubCancelled = subscribeToCancelledOrdersRealtime((list) => {
      const cMap = new Map<string, Order>();
      list.forEach((o, idx) => {
        const key = o.id || `cancelled-${idx}`;
        if (!cMap.has(key)) {
          cMap.set(key, o);
        }
      });
      setCancelledOrders(Array.from(cMap.values()));
    });

    // 2. Customers
    const unsubCust = onSnapshot(collection(db, 'customers'), (snap) => {
      const custMap = new Map<string, CustomerUser>();
      snap.forEach(d => {
        const item = { id: d.id, ...d.data() } as CustomerUser;
        const key = item.id || item.email || `cust-${custMap.size}`;
        if (!custMap.has(key)) {
          custMap.set(key, item);
        }
      });
      setCustomers(Array.from(custMap.values()));
    }, (err) => {
      console.warn('Customers listener notice:', err);
    });

    // 3. Products (Unified multi-tier real-time listener)
    const unsubProd = subscribeToProductsRealtime((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setProducts(list);
      }
    });

    // 4. Inventory (Multi-tier Firestore + RTDB + Cache real-time listener)
    const unsubInv = subscribeToInventoryRealtime((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setInventory(list);
      }
    });

    // 5. Studio Settings
    const unsubSettings = onSnapshot(doc(db, 'studioSettings', 'content'), (snap) => {
      if (snap.exists()) {
        setStudioSettings(snap.data() as StudioSettings);
      }
    }, (err) => {
      console.warn('Studio settings listener notice:', err);
    });

    return () => {
      unsubOrders();
      unsubCancelled();
      unsubCust();
      unsubProd();
      unsubInv();
      unsubSettings();
      flushPendingInventoryUpdates().catch(() => {});
    };
  }, [isAuthorized]);

  // Listener for active chat thread
  useEffect(() => {
    if (!selectedChatOrderId || !isAuthorized) return;

    const unsubMsgs = subscribeToOrderMessages(selectedChatOrderId, (list) => {
      setChatMessages(list);
    });

    return () => unsubMsgs();
  }, [selectedChatOrderId, isAuthorized]);

  // Mobile virtual keyboard & visualViewport listener for chat drawer compression
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportResize = () => {
      if (window.visualViewport && isChatDrawerOpen) {
        setVisualViewportHeight(window.visualViewport.height);
      }
    };

    if (isChatDrawerOpen) {
      handleViewportResize();
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
    } else {
      setVisualViewportHeight(null);
    }

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('scroll', handleViewportResize);
    };
  }, [isChatDrawerOpen]);

  // Clear unread count when chat drawer is open for selected order
  useEffect(() => {
    if (isChatDrawerOpen && selectedChatOrderId) {
      setUnreadOrderMap(prev => {
        if (!prev[selectedChatOrderId]) return prev;
        const next = { ...prev };
        delete next[selectedChatOrderId];
        return next;
      });
    }
  }, [isChatDrawerOpen, selectedChatOrderId]);

  // Subscribe to all active order chats to track unread messages and play audio chime
  useEffect(() => {
    if (!isAuthorized) return;
    const activeOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'delivered');
    if (activeOrders.length === 0) return;

    const unsubs: (() => void)[] = [];

    activeOrders.forEach((o) => {
      const unsub = subscribeToOrderMessages(o.id, (msgList) => {
        const customerMsgs = msgList.filter(m => m.senderRole === 'customer');
        const count = customerMsgs.length;
        const prevCount = lastSeenMsgCountRef.current[o.id];

        if (prevCount !== undefined && count > prevCount) {
          // Play notification chime when a new customer message arrives
          playMessageChime();

          // Increment unread count if drawer is closed or viewing a different order
          if (!isChatDrawerOpen || selectedChatOrderId !== o.id) {
            const added = count - prevCount;
            setUnreadOrderMap(prev => ({
              ...prev,
              [o.id]: (prev[o.id] || 0) + added
            }));
          }
        }

        lastSeenMsgCountRef.current[o.id] = count;
      });

      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach(fn => fn());
    };
  }, [orders.map(o => o.id).join(','), isAuthorized, isChatDrawerOpen, selectedChatOrderId, playMessageChime]);

  // Calculate total unread customer messages across all active orders
  const totalUnreadCount = useMemo(() => {
    return Object.values(unreadOrderMap).reduce((sum, count) => sum + count, 0);
  }, [unreadOrderMap]);

  // Auto-scroll chat message stream to bottom when updated or opened
  useEffect(() => {
    if (isChatDrawerOpen) {
      setTimeout(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [chatMessages, isChatDrawerOpen]);

  // --- Handlers ---
  const handleVoidOrCancelOrder = (orderId: string, customReason?: string) => {
    setOrderToVoid({
      id: orderId,
      reason: customReason || 'Voided by Studio Owner (Allyson)'
    });
  };

  const handleRestoreOrder = (orderId: string) => {
    setOrderToRestore(orderId);
  };

  const handlePermanentDeleteOrder = (orderId: string) => {
    setOrderToDelete(orderId);
  };

  // Execution functions invoked from the in-app confirmation modals
  const confirmVoidOrder = async () => {
    if (!orderToVoid) return;
    const { id, reason } = orderToVoid;
    const finalReason = reason.trim() || 'Voided by Studio Owner (Allyson)';
    const voidedAt = new Date().toISOString();

    try {
      // 1. Optimistic UI update
      setOrders(prev => prev.map(o => o.id === id ? {
        ...o,
        status: 'cancelled',
        cancellationReason: finalReason,
        cancelledBy: 'owner',
        cancelledAt: voidedAt
      } : o));

      // 2. Persist in Firestore & RTDB
      await cancelOrderRealtime(id, finalReason, 'owner');
      showNotice(`Order #${id} has been moved to Cancelled / Void orders.`);
      setOrderToVoid(null);
    } catch (err: any) {
      console.error('Error voiding order:', err);
      showNotice(`Failed to void Order #${id}`);
    }
  };

  const confirmRestoreOrder = async () => {
    if (!orderToRestore) return;
    const id = orderToRestore;
    setOrderToRestore(null);

    try {
      unmarkOrderDeleted(id);
      setOrders(prev => prev.map(o => {
        if (o.id !== id) return o;
        const copy = { ...o, status: 'pending' as OrderStatus };
        delete (copy as any).cancellationReason;
        delete (copy as any).cancelledAt;
        delete (copy as any).cancelledBy;
        return copy;
      }));

      await restoreOrderRealtime(id);
      showNotice(`Order #${id} has been reinstated back to Active Orders!`);
    } catch (err: any) {
      console.error('Error restoring order:', err);
      showNotice(`Failed to reinstate Order #${id}`);
    }
  };

  const confirmPermanentDeleteOrder = async () => {
    if (!orderToDelete) return;
    const id = orderToDelete;
    setOrderToDelete(null);

    try {
      // 1. Instantly record persistent tombstone and remove from frontend state
      markOrderDeleted(id);
      setOrders(prev => prev.filter(o => o.id !== id));
      if (selectedChatOrderId === id) {
        setSelectedChatOrderId(null);
      }

      // 2. Delete permanently from Cloud Firestore, RTDB, and local cache
      await deleteOrderRealtime(id);
      showNotice(`Order #${id} permanently deleted from database and dashboard.`);
    } catch (err: any) {
      console.error('Error deleting order:', err);
      showNotice(`Order #${id} removed from dashboard.`);
    }
  };

  // --- Flower & Product Management Handlers ---
  const handleOpenAddProduct = () => {
    setEditingProductId(null);
    setProductForm({
      name: '',
      flowerType: 'rose',
      basePrice: 80,
      description: 'Artisan handcrafted satin ribbon flower delicately folded with lustrous finish.',
      badge: '1 pc stem',
      imageUrl: '/Rose.jpg',
      availableColors: [...ALL_FLOWER_COLORS],
      active: true,
    });
    setProductModalOpen(true);
  };

  const handleOpenEditProduct = (p: ProductItem) => {
    setEditingProductId(p.id);
    setProductForm({
      name: p.name,
      flowerType: p.flowerType,
      basePrice: p.basePrice,
      description: p.description,
      badge: p.badge || '1 pc stem',
      imageUrl: p.imageUrl,
      availableColors: p.availableColors || [...ALL_FLOWER_COLORS],
      active: p.active !== false,
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim()) {
      showNotice('Please enter a product/flower name.');
      return;
    }
    if (productForm.basePrice <= 0) {
      showNotice('Please enter a base price greater than 0.');
      return;
    }
    if (productForm.availableColors.length === 0) {
      showNotice('Please select at least one available color.');
      return;
    }

    try {
      const now = new Date().toISOString();
      const prodId = editingProductId || `flower_${(productForm.name || 'flower').toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
      
      const productData: ProductItem = {
        id: prodId,
        name: sanitizeText(productForm.name.trim()),
        flowerType: sanitizeText(productForm.flowerType.trim().toLowerCase()) as FlowerType,
        basePrice: Number(productForm.basePrice),
        description: sanitizeText(productForm.description.trim() || `Artisan handcrafted satin ribbon ${productForm.name}.`),
        badge: sanitizeText(productForm.badge.trim() || 'Handmade bloom'),
        imageUrl: productForm.imageUrl || '/Rose.jpg',
        availableColors: productForm.availableColors,
        active: productForm.active ?? true,
        updatedAt: now,
      };

      const updatedList = await saveProductRealtime(productData);
      setProducts(updatedList);

      showNotice(editingProductId 
        ? `Updated flower "${productData.name}" successfully!` 
        : `Added new flower "${productData.name}" to studio catalog & storefront!`
      );
      setProductModalOpen(false);
      setEditingProductId(null);
    } catch (err: any) {
      console.error('Error saving product:', err);
      showNotice('Saved flower locally to studio & storefront.');
      setProductModalOpen(false);
      setEditingProductId(null);
    }
  };

  const handleUpdateProductPrice = async (productId: string, newPrice: number) => {
    const validPrice = Math.max(1, Math.round(Number(newPrice)));
    if (!validPrice || validPrice <= 0 || isNaN(validPrice)) {
      showNotice('Please enter a valid price greater than ₱0.');
      return;
    }

    setUpdatingPriceId(productId);
    try {
      const updatedList = await updateProductPriceRealtime(productId, validPrice);
      setProducts(updatedList);
      setPriceSuccessId(productId);
      showNotice(`Price updated to ₱${validPrice}! Live across the entire storefront.`);
      setTimeout(() => {
        setPriceSuccessId(prev => prev === productId ? null : prev);
      }, 2500);
    } catch (err: any) {
      console.error('Error updating price:', err);
      showNotice(err.message || `Failed to update price for product.`);
    } finally {
      setUpdatingPriceId(null);
    }
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    const prodId = productToDelete.id;
    try {
      const updatedList = await deleteProductRealtime(prodId);
      setProducts(updatedList);
      showNotice(`Removed "${productToDelete.name}" from catalog.`);
      setProductToDelete(null);
    } catch (err) {
      console.error('Error deleting product:', err);
      showNotice(`Removed "${productToDelete.name}" locally.`);
      setProductToDelete(null);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    if (newStatus === 'cancelled') {
      await handleVoidOrCancelOrder(orderId);
      return;
    }

    try {
      await updateOrderStatusRealtime(orderId, newStatus);
      showNotice(`Order #${orderId} status set to "${newStatus.toUpperCase()}"!`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdatePayment = async (orderId: string, newStatus: PaymentStatus, amountPaid: number, total: number) => {
    try {
      await updateOrderPaymentRealtime(orderId, newStatus, amountPaid, total);
      showNotice(`Payment updated for Order #${orderId}`);
    } catch (err) {
      console.error(err);
    }
  };

  const PRESET_FLORAL_COLORS = useMemo(() => [
    { name: 'Pastel Pink', hex: '#FAD2E1' },
    { name: 'Classic Pink', hex: '#F4A6B0' },
    { name: 'Rose Petal', hex: '#E27396' },
    { name: 'Soft Violet', hex: '#C8B6FF' },
    { name: 'Royal Violet', hex: '#9B72AA' },
    { name: 'Lavender Frost', hex: '#E6E6FA' },
    { name: 'Pure White', hex: '#FFFFFF' },
    { name: 'Frosted Ivory', hex: '#FFF8E7' },
    { name: 'Canary Yellow', hex: '#F5E58C' },
    { name: 'Buttercup', hex: '#FFD166' },
    { name: 'Sage Green', hex: '#87A987' },
    { name: 'Forest Green', hex: '#2D6A4F' },
    { name: 'Emerald', hex: '#1D5E43' },
    { name: 'Warm Brown', hex: '#8B5E3C' },
    { name: 'Sky Blue', hex: '#90E0EF' },
    { name: 'Midnight Black', hex: '#2D2A2E' },
  ], []);

  const detectColorFromName = useCallback((name: string): string | null => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('pastel pink')) return '#FAD2E1';
    if (lower.includes('rose') || lower.includes('blush')) return '#E27396';
    if (lower.includes('pink')) return '#F4A6B0';
    if (lower.includes('lavender')) return '#E6E6FA';
    if (lower.includes('violet') || lower.includes('purple')) return '#9B72AA';
    if (lower.includes('lilac')) return '#C8B6FF';
    if (lower.includes('white') || lower.includes('snow') || lower.includes('frosted white')) return '#FFFFFF';
    if (lower.includes('ivory') || lower.includes('cream')) return '#FFF8E7';
    if (lower.includes('canary') || lower.includes('sunflower') || lower.includes('yellow')) return '#F5E58C';
    if (lower.includes('gold')) return '#FFD166';
    if (lower.includes('sage')) return '#87A987';
    if (lower.includes('emerald')) return '#1D5E43';
    if (lower.includes('forest') || lower.includes('green')) return '#2D6A4F';
    if (lower.includes('kraft') || lower.includes('brown') || lower.includes('chocolate')) return '#8B5E3C';
    if (lower.includes('rainbow')) return '#E8D5FF';
    if (lower.includes('sky blue') || lower.includes('blue')) return '#90E0EF';
    if (lower.includes('black') || lower.includes('midnight')) return '#2D2A2E';
    if (lower.includes('red') || lower.includes('crimson') || lower.includes('ruby')) return '#D62828';
    if (lower.includes('peach') || lower.includes('terracotta')) return '#FFDDD2';
    return null;
  }, []);

  const handleAdjustInventory = useCallback((itemId: string, delta: number) => {
    // 1. Instantly update React state for 0ms perceived latency (no lag on spam clicks)
    setInventory(prev => {
      const target = prev.find(i => i.id === itemId);
      const currentStock = target ? (target.stock ?? 0) : 50;
      const nextStock = Math.max(0, currentStock + delta);
      return prev.map(i => i.id === itemId ? { ...i, stock: nextStock, updatedAt: new Date().toISOString() } : i);
    });

    // 2. Set updating message and feedback so database roundtrips are transparent
    setStockSyncStatus('syncing');
    setStockSyncNotice('Please wait, updating the stocks...');

    // 3. Queue debounced background sync to Firestore + RTDB
    adjustInventoryStockRealtime(itemId, delta, 350)
      .then(() => {
        setStockSyncStatus('saved');
        setStockSyncNotice('Stocks saved & updated in database');
        setTimeout(() => {
          setStockSyncStatus(prev => prev === 'saved' ? 'idle' : prev);
          setStockSyncNotice(prev => prev === 'Stocks saved & updated in database' ? null : prev);
        }, 2200);
      })
      .catch(err => {
        console.warn('Inventory stock adjust notice:', err);
        setStockSyncStatus('error');
        setStockSyncNotice('Adjusted locally. Will sync to database automatically.');
        setTimeout(() => {
          setStockSyncStatus(prev => prev === 'error' ? 'idle' : prev);
          setStockSyncNotice(null);
        }, 3200);
      });
  }, []);

  const handleUpdateStockExact = useCallback((itemId: string, newStock: number) => {
    const validStock = Math.max(0, Math.round(Number(newStock) || 0));
    setInventory(prev => prev.map(i => i.id === itemId ? { ...i, stock: validStock, updatedAt: new Date().toISOString() } : i));
    setStockSyncStatus('syncing');
    setStockSyncNotice('Please wait, updating the stocks...');
    updateInventoryStockRealtime(itemId, validStock, 350)
      .then(() => {
        setStockSyncStatus('saved');
        setStockSyncNotice('Stocks saved & updated in database');
        setTimeout(() => {
          setStockSyncStatus(prev => prev === 'saved' ? 'idle' : prev);
          setStockSyncNotice(null);
        }, 2200);
      })
      .catch(err => {
        console.warn('Inventory stock update notice:', err);
        setStockSyncStatus('error');
        setStockSyncNotice('Updated locally. Will sync to database automatically.');
        setTimeout(() => {
          setStockSyncStatus(prev => prev === 'error' ? 'idle' : prev);
          setStockSyncNotice(null);
        }, 3200);
      });
  }, []);

  const handleSaveEditInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInventoryItem) return;

    const updated: InventoryItem = {
      ...editingInventoryItem,
      name: editingInventoryItem.name.trim(),
      stock: Math.max(0, Number(editingInventoryItem.stock) || 0),
      lowStockThreshold: Math.max(0, Number(editingInventoryItem.lowStockThreshold) || 0),
      colorHex: editingInvColorHex || editingInventoryItem.colorHex || detectColorFromName(editingInventoryItem.name) || '#F4A6B0',
      updatedAt: new Date().toISOString()
    };

    setEditingInventoryItem(null);
    setStockSyncStatus('syncing');
    setStockSyncNotice(`Please wait, updating '${updated.name}' stocks...`);

    try {
      const nextList = await saveInventoryItemRealtime(updated);
      setInventory(nextList);
      setStockSyncStatus('saved');
      setStockSyncNotice(`'${updated.name}' stocks updated & saved!`);
      showNotice(`Updated '${updated.name}' stock & details!`);
      setTimeout(() => {
        setStockSyncStatus(prev => prev === 'saved' ? 'idle' : prev);
        setStockSyncNotice(null);
      }, 2500);
    } catch (err) {
      console.warn('Inventory save notice:', err);
      setStockSyncStatus('error');
      setStockSyncNotice(`Updated '${updated.name}' locally; database syncing in background.`);
      showNotice(`Updated '${updated.name}' locally.`);
      setTimeout(() => {
        setStockSyncStatus(prev => prev === 'error' ? 'idle' : prev);
        setStockSyncNotice(null);
      }, 3500);
    }
  };

  const handleCreateNewInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvName.trim()) {
      showNotice('Please enter an item name');
      return;
    }

    const cleanId = `inv_${Date.now()}_${(newInvName || 'item').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15)}`;
    const finalColor = newInvColorHex || detectColorFromName(newInvName) || '#F4A6B0';

    const newItem: InventoryItem = {
      id: cleanId,
      name: newInvName.trim(),
      category: newInvCategory,
      stock: Math.max(0, Number(newInvStock) || 0),
      unit: newInvUnit.trim() || 'pcs',
      lowStockThreshold: Math.max(0, Number(newInvThreshold) || 5),
      colorHex: finalColor,
      updatedAt: new Date().toISOString()
    };

    setIsAddingInventory(false);
    setNewInvName('');
    setNewInvStock(50);
    setNewInvThreshold(10);
    setNewInvColorHex('#F4A6B0');
    setStockSyncStatus('syncing');
    setStockSyncNotice(`Please wait, adding '${newItem.name}' to database...`);

    try {
      const nextList = await saveInventoryItemRealtime(newItem);
      setInventory(nextList);
      setStockSyncStatus('saved');
      setStockSyncNotice(`'${newItem.name}' added to inventory & database!`);
      showNotice(`Added '${newItem.name}' to inventory!`);
      setTimeout(() => {
        setStockSyncStatus(prev => prev === 'saved' ? 'idle' : prev);
        setStockSyncNotice(null);
      }, 2500);
    } catch (err) {
      console.warn('Inventory create notice:', err);
      setStockSyncStatus('error');
      setStockSyncNotice(`Added '${newItem.name}' locally.`);
      showNotice(`Added '${newItem.name}' to inventory.`);
      setTimeout(() => {
        setStockSyncStatus(prev => prev === 'error' ? 'idle' : prev);
        setStockSyncNotice(null);
      }, 3500);
    }
  };

  const handleConfirmDeleteInventoryItem = async () => {
    if (!inventoryItemToDelete) return;
    const targetItem = inventoryItemToDelete;
    setInventoryItemToDelete(null);
    setStockSyncStatus('syncing');
    setStockSyncNotice(`Please wait, deleting '${targetItem.name}' from database...`);

    try {
      const nextList = await deleteInventoryItemRealtime(targetItem.id);
      setInventory(nextList);
      setStockSyncStatus('saved');
      setStockSyncNotice(`Deleted '${targetItem.name}' from inventory.`);
      showNotice(`Deleted '${targetItem.name}' from inventory.`);
      setTimeout(() => {
        setStockSyncStatus(prev => prev === 'saved' ? 'idle' : prev);
        setStockSyncNotice(null);
      }, 2500);
    } catch (err) {
      console.warn('Inventory delete notice:', err);
      setStockSyncStatus('error');
      setStockSyncNotice(`Removed '${targetItem.name}' locally.`);
      showNotice(`Removed '${targetItem.name}' from inventory.`);
      setTimeout(() => {
        setStockSyncStatus(prev => prev === 'error' ? 'idle' : prev);
        setStockSyncNotice(null);
      }, 3500);
    }
  };

  const handleRefreshInventory = async () => {
    setIsRefreshingInventory(true);
    try {
      showNotice('Refreshing supply stocks from database...');
      const list = await fetchLatestInventoryRealtime();
      setInventory(list);
      showNotice('Live supply stocks refreshed from database!');
    } catch (err) {
      console.error('Refresh inventory error:', err);
      showNotice('Refreshed inventory cache.');
    } finally {
      setTimeout(() => setIsRefreshingInventory(false), 500);
    }
  };

  const handleProductImageUpload = (productId: string, file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;
      try {
        await updateDoc(doc(db, 'products', productId), { imageUrl: dataUrl });
        setProducts(prev => prev.map(p => p.id === productId ? { ...p, imageUrl: dataUrl } : p));
        showNotice(`Product photo updated successfully!`);
      } catch (err) {
        console.error('Failed to update product photo:', err);
        setProducts(prev => prev.map(p => p.id === productId ? { ...p, imageUrl: dataUrl } : p));
        showNotice(`Photo loaded locally.`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOwnerPhotoUpload = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const updated: StudioSettings = {
        ...(studioSettings || INITIAL_STUDIO_SETTINGS),
        ownerPhotoUrl: dataUrl,
        updatedAt: new Date().toISOString(),
      };

      setStudioSettings(updated);
      try {
        localStorage.setItem('lypetal_studio_settings_cache', JSON.stringify(updated));
      } catch {}
      setTimeout(() => {
        try {
          window.dispatchEvent(new CustomEvent('lypetal_settings_updated', { detail: updated }));
        } catch {}
      }, 0);

      try {
        await setDoc(doc(db, 'studioSettings', 'content'), cleanForFirestore(updated), { merge: true });
        showNotice(`Allyson's founder photo updated across website!`);
      } catch (err) {
        console.error('Failed to update owner photo:', err);
        showNotice(`Photo loaded locally across storefront.`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveOwnerProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingProfile(true);

    const updated: StudioSettings = {
      ...(studioSettings || INITIAL_STUDIO_SETTINGS),
      businessName: sanitizeText(profileForm.businessName.trim()) || 'LYPetal Flower Studio',
      ownerName: sanitizeText(profileForm.ownerName.trim()) || 'Allyson',
      ownerTitle: sanitizeText(profileForm.ownerTitle.trim()) || 'Founder & Artisan Florist',
      headline: sanitizeText(profileForm.headline.trim()) || '"Every flower tells a story that stays with you."',
      ownerIntro: sanitizeText(profileForm.ownerIntro.trim()),
      story: sanitizeText(profileForm.story.trim()),
      contactPhone: sanitizeText(profileForm.contactPhone.trim()),
      contactEmail: sanitizeText(profileForm.contactEmail.trim()),
      pickupAddress: sanitizeText(profileForm.pickupAddress.trim()),
      facebookPage: sanitizeText(profileForm.facebookPage.trim()),
      instagramHandle: sanitizeText(profileForm.instagramHandle.trim()),
      twoFactorEmails: sanitizeText(profileForm.twoFactorEmails.trim()),
      senderEmail: sanitizeText(profileForm.senderEmail.trim()),
      updatedAt: new Date().toISOString(),
    };

    // 1. Optimistic update
    setStudioSettings(updated);

    // 2. Realtime persistence (Firestore + RTDB + Cache + CustomEvent)
    try {
      await saveStudioSettingsRealtime(updated);
      showNotice("Allyson's contact details, address, email, and studio bio updated live across the entire website!");
    } catch (err) {
      console.warn('Studio settings save notice:', err);
      showNotice("Contact details and bio updated locally across storefront!");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendOwnerReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerReplyText.trim() || !selectedChatOrderId) return;

    try {
      const msg: OrderMessage = {
        id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        orderId: selectedChatOrderId,
        senderId: user?.uid || 'owner_allyson',
        senderRole: 'owner',
        senderName: 'Allyson (Studio Owner)',
        text: ownerReplyText.trim(),
        createdAt: new Date().toISOString(),
      };
      await sendOrderMessageRealtime(selectedChatOrderId, msg);
      setOwnerReplyText('');
    } catch (err) {
      console.error(err);
    }
  };

  const showNotice = (msg: string) => {
    setAlertNotice(msg);
    setTimeout(() => setAlertNotice(null), 3500);
  };

  const handleEmailReceiptToCustomer = async (targetOrder: Order) => {
    const emailTo = targetOrder.customerInfo?.email;
    if (!emailTo) {
      showNotice(`Customer #${targetOrder.id} does not have an email address recorded.`);
      return;
    }
    showNotice(`Dispatching receipt to ${emailTo}...`);
    try {
      const res = await sendReceiptToCustomerEmail(targetOrder);
      if (res.success) {
        await markReceiptSentRealtime(targetOrder.id);
        showNotice(`Receipt successfully sent to ${emailTo}!`);
      } else {
        showNotice(`Notice: ${res.message || 'Could not send email'}`);
      }
    } catch (err: any) {
      showNotice(`Email error: ${err.message || 'Dispatch failed'}`);
    }
  };

  const getPrivateUrl = () => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.origin);
    url.searchParams.set('portal', 'owner');
    return url.toString();
  };

  const handleCopyLink = () => {
    const link = getPrivateUrl();
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    showNotice('Private Owner Link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleClaimStudioOwner = () => {
    const target = ownerEmail.trim().toLowerCase();
    if (!target || !target.includes('@')) {
      setAuthError('Please enter a valid email address to authorize.');
      return;
    }
    setIsClaimingOwner(true);
    try {
      addCustomOwnerEmail(target);
      setClaimOwnerSuccess(`"${target}" is now authorized as a Studio Owner! You can now sign in.`);
      setAuthError(null);
      showNotice(`Authorized "${target}" as Studio Owner!`);
    } catch {
      setAuthError('Could not authorize email.');
    } finally {
      setIsClaimingOwner(false);
    }
  };

  const handleOwnerPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setClaimOwnerSuccess(null);

    const email = ownerEmail.trim().toLowerCase();
    const pass = ownerPassword;

    if (!email || !pass) {
      setAuthError('Please enter both your owner email and password.');
      return;
    }

    if (containsSqlInjection(email) || containsSqlInjection(pass)) {
      setAuthError('Security Alert: Invalid characters or SQL syntax detected. Request blocked.');
      return;
    }

    // Fast check: verify if this email is an authorized owner without slow remote timeouts
    const isOwnerCandidate = checkIsOwnerEmail(email);
    if (!isOwnerCandidate) {
      setAuthError(`Access restricted: "${email}" is not currently on the studio owner list. If this is your account, click "Authorize as Studio Owner" below.`);
      return;
    }

    setAuthLoading(true);

    try {
      // 1. Authenticate against Firebase Authentication with email & password
      let user: any = null;
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        user = userCredential.user;
      } catch (authErr: any) {
        // If owner account does not exist yet, auto-provision it with their chosen password!
        if (authErr?.code === 'auth/user-not-found' || authErr?.code === 'auth/invalid-credential') {
          try {
            const newCred = await createUserWithEmailAndPassword(auth, email, pass);
            user = newCred.user;
          } catch (createErr: any) {
            if (createErr?.code === 'auth/email-already-in-use') {
              throw new Error('Incorrect password for this owner account. Please check your password or click "Set / Reset Password via Email".');
            }
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }

      if (!user) {
        throw new Error('Could not authenticate owner account.');
      }

      setAuthenticatedUid(user.uid);
      setAuthenticatedEmail(user.email || email);

      // 2. STEP 1.5: Check for Active Session / Trusted Device Token in localStorage (12h or 30d)
      const storedDeviceToken = localStorage.getItem('lypetal_owner_device_token');
      if (storedDeviceToken) {
        setIsCheckingTrustedDevice(true);
        try {
          const trustRes = await fetch('/api/auth/verify-trusted-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: user.uid,
              deviceToken: storedDeviceToken,
            }),
          });
          const trustData = await trustRes.json().catch(() => ({}));

          if (trustRes.ok && trustData.valid) {
            // Recognized 12-hour or 30-day session! Skip 2FA PIN completely
            sessionStorage.setItem('lypetal_owner_2fa_verified', 'true');
            setIs2FAVerified(true);
            setApprovedSuccessCelebration(true);
            try {
              confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
            } catch {}
            setTimeout(async () => {
              await authenticateAsRole('owner');
              const msg = trustData.trustMode === '30_days'
                ? 'Trusted browser recognized (30-day session active). Welcome back, Allyson!'
                : `Active session recognized (${trustData.remainingHours || 12}h remaining without PIN). Welcome back, Allyson!`;
              showNotice(msg);
              setAuthStage('approved');
            }, 600);
            return;
          } else {
            // Invalid or expired token: clear local storage
            localStorage.removeItem('lypetal_owner_device_token');
            localStorage.removeItem('lypetal_owner_device_meta');
          }
        } catch (trustErr) {
          console.warn('Trusted device verification notice:', trustErr);
        } finally {
          setIsCheckingTrustedDevice(false);
        }
      }

      // 3. STEP 2: Unrecognized browser or expired session (>12 hours / >30 days) -> Send 4-Digit Code via Cloud API
      const codeRes = await fetch('/api/auth/send-owner-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email || email,
        }),
      });

      const codeData = await codeRes.json().catch(() => ({}));

      if (codeRes.ok && codeData.success) {
        setTargetMaskedEmail(codeData.maskedEmail || user.email || email);
        setEmailPreviewUrl(codeData.previewUrl || null);
        if (codeData.devCode) {
          setDevCodeHelper(codeData.devCode);
        }
        setFourDigitCode('');
        setAuthStage('code_2fa');
        setResendCooldown(45);
        showNotice(`4-digit verification PIN sent to ${codeData.maskedEmail || 'your email'}!`);
      } else {
        setAuthError(codeData.error || 'Failed to dispatch 4-digit verification code. Please try again.');
      }
    } catch (err: any) {
      console.warn('Owner password login error:', err?.message || err);
      setAuthError(err?.message || 'Incorrect email or password. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendPasswordReset = async () => {
    const email = (ownerEmail || user?.email || auth.currentUser?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setAuthError('Please enter your owner email address above.');
      return;
    }
    const isOwner = checkIsOwnerEmail(email);
    if (!isOwner) {
      setAuthError(`Access denied: "${email}" is not registered as a studio owner.`);
      return;
    }

    setIsSendingPasswordReset(true);
    setAuthError(null);
    setPasswordResetSentNotice(null);

    try {
      await sendPasswordResetEmail(auth, email);
      setPasswordResetSentNotice(
        `A secure password setup/reset email has been dispatched to ${email}! Open the link in your inbox to set your password, then return here to sign in with your email & password.`
      );
      showNotice(`Password setup email sent to ${email}!`);
    } catch (err: any) {
      console.warn('Password setup email notice:', err);
      if (err?.code === 'auth/user-not-found') {
        setAuthError(`No account created yet for ${email}. Enter your desired password above and click 'Sign In & Continue' to automatically register it!`);
      } else {
        setAuthError(err?.message || 'Failed to dispatch password setup email. Please try again.');
      }
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  const handleUpdateDashboardPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDashboardPassword || newDashboardPassword.length < 6) {
      setDashboardPasswordError('Password must be at least 6 characters long.');
      return;
    }
    if (newDashboardPassword !== confirmDashboardPassword) {
      setDashboardPasswordError('Passwords do not match. Please verify.');
      return;
    }
    if (!auth.currentUser) {
      setDashboardPasswordError('No active owner session found. Please sign in again.');
      return;
    }

    setIsUpdatingDashboardPassword(true);
    setDashboardPasswordError(null);
    setDashboardPasswordSuccess(null);

    try {
      await updatePassword(auth.currentUser, newDashboardPassword);
      setDashboardPasswordSuccess('Password updated successfully! You can now log into the Owner Portal directly using your email and this password.');
      setNewDashboardPassword('');
      setConfirmDashboardPassword('');
      showNotice('Studio Owner password updated successfully!');
    } catch (err: any) {
      console.warn('Dashboard updatePassword notice:', err);
      if (err?.code === 'auth/requires-recent-login') {
        try {
          const targetEmail = auth.currentUser.email || ownerEmail;
          await sendPasswordResetEmail(auth, targetEmail);
          setDashboardPasswordSuccess(`For security, a password setup link has been sent to ${targetEmail}. Click it to choose your password.`);
        } catch {
          setDashboardPasswordError('Please log out and log back in before updating your password.');
        }
      } else {
        setDashboardPasswordError(err?.message || 'Could not update password. Please try again.');
      }
    } finally {
      setIsUpdatingDashboardPassword(false);
    }
  };

  const handleVerify4DigitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authenticatedUid || fourDigitCode.trim().length !== 4) return;

    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/verify-owner-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: authenticatedUid,
          code: fourDigitCode.trim(),
          trustDevice: trustBrowser30Days,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        // Save the issued token (30 days if checked, 12 hours if unchecked)
        if (data.deviceToken) {
          localStorage.setItem('lypetal_owner_device_token', data.deviceToken);
          localStorage.setItem('lypetal_owner_device_meta', JSON.stringify({
            uid: authenticatedUid,
            trustMode: data.trustMode, // '30_days' or '12_hours'
            expiresAt: data.expiresAt,
          }));
        }
        sessionStorage.setItem('lypetal_owner_2fa_verified', 'true');
        setIs2FAVerified(true);
        setApprovedSuccessCelebration(true);
        try {
          confetti({ particleCount: 70, spread: 80, origin: { y: 0.5 } });
        } catch {}
        setTimeout(async () => {
          await authenticateAsRole('owner');
          const noticeMsg = trustBrowser30Days
            ? 'Browser trusted for 30 days without PIN. Welcome back, Allyson!'
            : 'PIN verified! You can sign in without a PIN for the next 12 hours. Welcome back, Allyson!';
          showNotice(noticeMsg);
          setAuthStage('approved');
        }, 700);
      } else {
        setAuthError(data.error || 'Incorrect or expired PIN code. Please try again.');
      }
    } catch {
      setAuthError('Network error verifying code. Please check your connection.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResend4DigitCode = async () => {
    if (resendCooldown > 0 || !authenticatedUid || !authenticatedEmail) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/send-owner-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: authenticatedUid,
          email: authenticatedEmail,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setResendCooldown(45);
        setEmailPreviewUrl(data.previewUrl || null);
        if (data.devCode) {
          setDevCodeHelper(data.devCode);
        }
        showNotice(`New 4-digit verification code sent to ${data.maskedEmail || 'your email'}!`);
      } else {
        setAuthError(data.error || 'Failed to resend code.');
      }
    } catch {
      setAuthError('Network error resending code.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCancel2FA = () => {
    sessionStorage.removeItem('lypetal_owner_2fa_verified');
    setIs2FAVerified(false);
    setAuthStage('credentials');
    setFourDigitCode('');
    setAuthError(null);
  };

  const handleFullLogout = async () => {
    sessionStorage.removeItem('lypetal_owner_2fa_verified');
    localStorage.removeItem('lypetal_owner_device_token');
    localStorage.removeItem('lypetal_owner_device_meta');
    setIs2FAVerified(false);
    setAuthStage('credentials');
    await signOut(auth).catch(() => {});
    await logOut().catch(() => {});
  };

  const handleRevokeTrustedDevices = () => {
    setShowRevokeConfirmModal(true);
  };

  const executeRevokeTrustedDevices = async () => {
    setShowRevokeConfirmModal(false);
    setIsRevokingTrustedDevices(true);
    try {
      const currentUid = auth.currentUser?.uid || authenticatedUid;
      if (currentUid) {
        await fetch('/api/auth/revoke-trusted-devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUid }),
        });
      }
      localStorage.removeItem('lypetal_owner_device_token');
      showNotice('All trusted browser sessions revoked successfully.');
    } catch (err) {
      console.warn('Revoke trusted devices error:', err);
      localStorage.removeItem('lypetal_owner_device_token');
      showNotice('Trusted browser session token cleared.');
    } finally {
      setIsRevokingTrustedDevices(false);
    }
  };

  // Calculate Metrics (Separating Active Orders from Cancelled/Void Orders) with useMemo
  const activeOrders = useMemo(() => {
    return orders.filter(o => o.status !== 'cancelled');
  }, [orders]);
  
  // Merge dedicated 'cancelledorders' table with any legacy cancelled items in active table
  const cancelledVoidOrders = useMemo(() => {
    const cancelledMap = new Map<string, Order>();
    cancelledOrders.forEach(co => cancelledMap.set(co.id, co));
    orders.filter(o => o.status === 'cancelled').forEach(lo => {
      if (!cancelledMap.has(lo.id)) {
        cancelledMap.set(lo.id, lo);
      }
    });
    return Array.from(cancelledMap.values()).sort((a, b) => {
      const timeA = b.cancelledAt || b.updatedAt || b.createdAt || '';
      const timeB = a.cancelledAt || a.updatedAt || a.createdAt || '';
      return timeA > timeB ? 1 : -1;
    });
  }, [orders, cancelledOrders]);

  // Single-pass computation for active order metrics
  const { grossSales, totalPaid, totalBalance, activeOrdersCount, completedOrdersCount } = useMemo(() => {
    let gross = 0;
    let paid = 0;
    let balance = 0;
    let activeCount = 0;
    let completedCount = 0;

    for (let i = 0; i < activeOrders.length; i++) {
      const o = activeOrders[i];
      gross += o.totalAmount || 0;
      paid += o.amountPaid || 0;
      balance += o.balance || 0;
      if (o.status === 'pending' || o.status === 'in-progress') activeCount++;
      if (o.status === 'completed' || o.status === 'delivered') completedCount++;
    }

    return {
      grossSales: gross,
      totalPaid: paid,
      totalBalance: balance,
      activeOrdersCount: activeCount,
      completedOrdersCount: completedCount,
    };
  }, [activeOrders]);

  const totalVoidedAmount = useMemo(() => {
    return cancelledVoidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [cancelledVoidOrders]);

  const lowStockItems = useMemo(() => {
    return inventory.filter(i => i.stock <= i.lowStockThreshold);
  }, [inventory]);

  // Precomputed Customer Orders Lookup for instantaneous O(1) rendering
  const ordersCountByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (o.customerInfo?.email) {
        const key = o.customerInfo.email.toLowerCase();
        map.set(key, (map.get(key) || 0) + 1);
      }
      if (o.customerId) {
        map.set(o.customerId, (map.get(o.customerId) || 0) + 1);
      }
    }
    return map;
  }, [orders]);

  // Memoized Filtered Active Orders
  const filteredActiveOrders = useMemo(() => {
    let result = activeOrders;
    if (orderStatusFilter !== 'all') {
      result = result.filter(o => o.status === orderStatusFilter);
    }
    if (orderSearchQuery.trim()) {
      const q = orderSearchQuery.trim().toLowerCase();
      result = result.filter(o => 
        (o.id && o.id.toLowerCase().includes(q)) ||
        (o.customerInfo?.name && o.customerInfo.name.toLowerCase().includes(q)) ||
        (o.customerInfo?.phone && o.customerInfo.phone.toLowerCase().includes(q)) ||
        (o.customerInfo?.email && o.customerInfo.email.toLowerCase().includes(q)) ||
        (o.customerInfo?.address && o.customerInfo.address.toLowerCase().includes(q)) ||
        o.items?.some(it => it.flowerName?.toLowerCase().includes(q) || it.color?.toLowerCase().includes(q))
      );
    }
    return result;
  }, [activeOrders, orderStatusFilter, orderSearchQuery]);

  // Memoized Filtered Cancelled Orders
  const filteredCancelledOrders = useMemo(() => {
    if (!cancelledSearchQuery.trim()) return cancelledVoidOrders;
    const q = cancelledSearchQuery.trim().toLowerCase();
    return cancelledVoidOrders.filter(o => 
      (o.id && o.id.toLowerCase().includes(q)) ||
      (o.customerInfo?.name && o.customerInfo.name.toLowerCase().includes(q)) ||
      (o.cancellationReason && o.cancellationReason.toLowerCase().includes(q)) ||
      (o.customerInfo?.phone && o.customerInfo.phone.toLowerCase().includes(q))
    );
  }, [cancelledVoidOrders, cancelledSearchQuery]);

  // Memoized Filtered Customers
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.trim().toLowerCase();
    return customers.filter(c => 
      (c.firstName && c.firstName.toLowerCase().includes(q)) ||
      (c.lastName && c.lastName.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  }, [customers, customerSearchQuery]);

  // Define Organized Dashboard Categories
  interface NavTabItem {
    id: DashboardTab;
    label: string;
    shortLabel: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number | null;
    badgeColor?: string;
  }

  interface NavCategory {
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    items: NavTabItem[];
  }

  // Warm, humanized time-based greeting for Allyson
  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = studioSettings?.ownerName || 'Allyson';
    if (hour < 12) return `Good Morning, ${name}`;
    if (hour < 18) return `Good Afternoon, ${name}`;
    return `Good Evening, ${name}`;
  }, [studioSettings?.ownerName]);

  const categories: NavCategory[] = useMemo(() => [
    {
      id: 'operations',
      title: 'Orders & Studio',
      description: 'Daily bookings and order progress',
      icon: Activity,
      items: [
        { 
          id: 'overview', 
          label: 'Overview', 
          shortLabel: 'Overview',
          description: 'Store summary, quick numbers & alerts', 
          icon: BarChart3 
        },
        { 
          id: 'production', 
          label: 'Order Pipeline', 
          shortLabel: 'Pipeline', 
          description: 'Track orders from preparation to delivery',
          badge: activeOrdersCount > 0 ? `${activeOrdersCount} Active` : null,
          badgeColor: 'bg-emerald-100 text-emerald-800',
          icon: Activity 
        },
        { 
          id: 'orders', 
          label: 'Order Ledger', 
          shortLabel: 'Orders', 
          description: 'Active and cancelled customer orders',
          badge: activeOrders.length > 0 ? activeOrders.length : null,
          badgeColor: 'bg-[#F0D9DD] text-[#7A4B53]',
          icon: ClipboardList 
        },
      ]
    },
    {
      id: 'inventory_catalog',
      title: 'Flowers & Supplies',
      description: 'Handmade flowers, ribbon rolls & wrappers',
      icon: Boxes,
      items: [
        { 
          id: 'products', 
          label: 'Flower Catalog', 
          shortLabel: 'Flowers', 
          description: 'Manage flowers, prices & maker story',
          badge: products.length,
          badgeColor: 'bg-stone-100 text-stone-700',
          icon: PackageCheck 
        },
        { 
          id: 'inventory', 
          label: 'Supplies & Stock', 
          shortLabel: 'Supplies', 
          description: 'Satin ribbon rolls, stems & wrapper stock',
          badge: lowStockItems.length > 0 ? `! ${lowStockItems.length} Low` : null,
          badgeColor: 'bg-amber-100 text-amber-800 font-bold animate-pulse',
          icon: Boxes 
        },
      ]
    },
    {
      id: 'finance',
      title: 'Money & Payments',
      description: 'Downpayments, balances & revenue',
      icon: DollarSign,
      items: [
        { 
          id: 'payments', 
          label: 'Payments', 
          shortLabel: 'Payments', 
          description: 'Customer downpayments and remaining balances',
          badge: totalBalance > 0 ? `₱${totalBalance.toLocaleString()}` : null,
          badgeColor: 'bg-amber-100 text-amber-800',
          icon: CreditCard 
        },
        { 
          id: 'sales', 
          label: 'Sales & Income', 
          shortLabel: 'Sales', 
          description: 'Earnings summary and recent transactions',
          icon: DollarSign 
        },
      ]
    },
    {
      id: 'client_relations',
      title: 'Customer Accounts',
      description: 'Customer contact details & accounts',
      icon: Users,
      items: [
        { 
          id: 'customers', 
          label: 'Customers', 
          shortLabel: 'Customers', 
          description: 'Customer phone numbers, addresses & orders',
          badge: customers.length > 0 ? customers.length : null,
          badgeColor: 'bg-stone-100 text-stone-700',
          icon: Users 
        },
      ]
    },
    {
      id: 'studio_settings',
      title: 'Studio & Contact Info',
      description: "Allyson's contact details, address & story",
      icon: MapPin,
      items: [
        { 
          id: 'settings', 
          label: 'Studio & Contact Info', 
          shortLabel: 'Contact & Info', 
          description: 'Edit phone number, address, email & maker bio',
          icon: MapPin 
        },
      ]
    }
  ], [activeOrdersCount, activeOrders.length, products.length, lowStockItems.length, totalBalance, customers.length]);

  const allTabs = useMemo(() => categories.flatMap(c => c.items), [categories]);
  const currentCategory = useMemo(() => categories.find(c => c.items.some(it => it.id === activeTab)) || categories[0], [categories, activeTab]);
  const currentTabItem = useMemo(() => allTabs.find(it => it.id === activeTab) || allTabs[0], [allTabs, activeTab]);

  const handleSelectTab = (tabId: DashboardTab) => {
    setActiveTab(tabId);
    if (tabId === 'orders') {
      setOrdersSubFilter('active');
    }
    setMobileSidebarOpen(false);
  };

  const normalizedNavSearch = navSearch.trim().toLowerCase();

  // If unauthorized: show dedicated private owner access gate
  if (!isAuthorized) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 relative overflow-hidden">
        {/* Soft Animated Floating Ambient Petal Orbs */}
        <motion.div
          animate={{
            x: [0, 25, -25, 0],
            y: [0, -25, 25, 0],
            scale: [1, 1.15, 0.95, 1],
          }}
          transition={{ repeat: Infinity, duration: 14, ease: "easeInOut" }}
          className="absolute -top-12 -left-12 w-80 h-80 rounded-full bg-gradient-to-tr from-[#F4A6B0]/30 to-[#F5EFC0]/30 blur-3xl pointer-events-none"
        />
        <motion.div
          animate={{
            x: [0, -30, 20, 0],
            y: [0, 25, -20, 0],
            scale: [1, 0.9, 1.1, 1],
          }}
          transition={{ repeat: Infinity, duration: 16, ease: "easeInOut" }}
          className="absolute -bottom-16 -right-16 w-96 h-96 rounded-full bg-gradient-to-br from-[#E8DF97]/30 to-[#F0D9DD]/35 blur-3xl pointer-events-none"
        />

        {/* Floating Petal Accents */}
        <motion.div
          animate={{ y: [0, -12, 0], rotate: [0, 10, -10, 0] }}
          transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
          className="absolute top-20 right-[15%] hidden sm:block pointer-events-none opacity-40 text-2xl select-none"
        >
          🌸
        </motion.div>
        <motion.div
          animate={{ y: [0, 14, 0], rotate: [0, -15, 15, 0] }}
          transition={{ repeat: Infinity, duration: 8.5, ease: "easeInOut" }}
          className="absolute bottom-24 left-[12%] hidden sm:block pointer-events-none opacity-30 text-2xl select-none"
        >
          🌷
        </motion.div>

        {/* Main Card Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="max-w-md w-full bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#F0D9DD] relative z-10 overflow-hidden"
        >
          {/* Top Decorative Floral Bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#F4A6B0] via-[#E8DF97] to-[#F4A6B0]" />

          <AnimatePresence mode="wait">
            {approvedSuccessCelebration ? (
              /* Celebration state after verification */
              <motion.div
                key="stage-celebration"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="text-center py-6 space-y-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="w-18 h-18 rounded-full mx-auto flex items-center justify-center bg-gradient-to-tr from-emerald-100 to-teal-50 text-emerald-600 shadow-lg border border-emerald-200"
                >
                  <CheckCircle2 className="w-10 h-10" />
                </motion.div>
                <div>
                  <h2 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                    Access Approved!
                  </h2>
                  <p className="text-xs text-[#5C5552] mt-1.5">
                    Owner identity verified. Loading Petal-Trak Owner Dashboard...
                  </p>
                </div>
                <div className="flex justify-center pt-2">
                  <Loader2 className="w-6 h-6 text-[#2D2A2E] animate-spin" />
                </div>
              </motion.div>
            ) : authStage === 'code_2fa' ? (
              /* STAGE 2: ENTER 4-DIGIT VERIFICATION CODE */
              <motion.div
                key="stage-2fa"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="space-y-5"
              >
                <div className="text-center space-y-2">
                  <motion.div
                    animate={{ rotate: [0, 3, -3, 0] }}
                    transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                    className="relative w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-gradient-to-tr from-[#2D2A2E] to-[#403B3E] text-[#F5EFC0] shadow-lg"
                  >
                    <KeyRound className="w-8 h-8 text-[#E8DF97]" />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                    </span>
                  </motion.div>

                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-[11px] font-bold text-amber-800 border border-amber-200">
                    <Lock className="w-3 h-3 text-amber-600" />
                    <span>Two-Factor Authentication</span>
                  </div>

                  <h2 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                    Enter 4-Digit PIN
                  </h2>
                  <p className="text-xs text-[#5C5552] leading-relaxed">
                    We sent a 4-digit verification code to{' '}
                    <strong className="text-[#2D2A2E] underline">{targetMaskedEmail || authenticatedEmail || 'your email'}</strong>.
                  </p>
                </div>

                {authError && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0, x: [-8, 8, -6, 6, -3, 3, 0] }}
                    transition={{ duration: 0.4 }}
                    className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 text-center font-medium leading-relaxed"
                  >
                    {authError}
                  </motion.div>
                )}

                {/* 4-Digit Numeric Code Form */}
                <form onSubmit={handleVerify4DigitCode} className="space-y-4 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-[#5C5552] mb-2 uppercase tracking-wide text-center">
                      4-Digit Verification Code
                    </label>

                    {/* Interactive 4-Box PIN Display with Keyboard Input */}
                    <div className="relative py-2">
                      <input
                        type="text"
                        maxLength={4}
                        pattern="[0-9]*"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        disabled={authLoading}
                        value={fourDigitCode}
                        onChange={(e) => setFourDigitCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        aria-label="4-digit PIN verification code"
                      />
                      <div className="flex justify-center items-center gap-3">
                        {[0, 1, 2, 3].map((idx) => {
                          const char = fourDigitCode[idx] || '';
                          const isCurrent = fourDigitCode.length === idx;
                          return (
                            <motion.div
                              key={idx}
                              animate={char ? { scale: [1, 1.08, 1] } : isCurrent ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                              transition={{ duration: 0.2 }}
                              className={`w-14 h-16 rounded-2xl flex items-center justify-center font-mono text-2xl font-black border-2 transition-all select-none ${
                                char
                                  ? 'border-[#2D2A2E] bg-[#2D2A2E] text-[#F5EFC0] shadow-md scale-105'
                                  : isCurrent
                                  ? 'border-[#F4A6B0] bg-[#FFF5F7] ring-4 ring-[#F4A6B0]/25 shadow-xs'
                                  : 'border-[#E8E2DA] bg-[#FAF6F0] text-[#A89E9C]'
                              }`}
                            >
                              {char ? char : isCurrent ? <span className="animate-pulse text-[#F4A6B0]">|</span> : '•'}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    <p className="text-[10px] text-center text-[#7C7472] mt-2">
                      Click the boxes to type. Code expires in 10 minutes.
                    </p>
                  </div>

                  {/* 30-Day Browser Trust Checkbox */}
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setTrustBrowser30Days(!trustBrowser30Days)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center gap-3 ${
                      trustBrowser30Days
                        ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-200/50 shadow-xs'
                        : 'bg-[#FCFAF8] border-[#F0D9DD]'
                    }`}
                  >
                    <input
                      id="trust-browser-checkbox"
                      type="checkbox"
                      checked={trustBrowser30Days}
                      onChange={(e) => setTrustBrowser30Days(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-[#C95567] rounded border-gray-300 focus:ring-[#F4A6B0] cursor-pointer"
                    />
                    <div className="flex-1 flex items-center justify-between text-xs">
                      <span className="font-bold text-[#2D2A2E]">Trust this device for 30 Days</span>
                      {trustBrowser30Days && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                          30 Days Active
                        </span>
                      )}
                    </div>
                  </motion.div>

                  <button
                    type="submit"
                    disabled={authLoading || fourDigitCode.trim().length !== 4}
                    className="w-full py-3.5 px-4 rounded-2xl text-xs font-bold uppercase tracking-wider bg-[#2D2A2E] hover:bg-black text-[#F5EFC0] hover:text-white transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#F5EFC0]" />
                        <span>Verifying PIN...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-[#F5EFC0]" />
                        <span>Verify PIN &amp; Enter Dashboard</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Dev Sandbox Preview Link (If active) */}
                {emailPreviewUrl && (
                  <div className="text-center">
                    <a
                      href={emailPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-900 font-semibold underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View Email in Mail Sandbox</span>
                    </a>
                  </div>
                )}

                {/* Controls: Resend & Cancel */}
                <div className="pt-2 border-t border-[#F0D9DD]/60 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleResend4DigitCode}
                    disabled={resendCooldown > 0 || authLoading}
                    className="text-[#7C7472] hover:text-[#2D2A2E] font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel2FA}
                    className="text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
                  >
                    Use Different Account
                  </button>
                </div>
              </motion.div>
            ) : (
              /* STAGE 1: EMAIL & PASSWORD AUTHENTICATION */
              <motion.div
                key="stage-credentials"
                initial={{ opacity: 0, x: -28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 28 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                    className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-gradient-to-tr from-[#2D2A2E] to-[#403B3E] text-[#F5EFC0] shadow-lg border border-[#3D383C]"
                  >
                    <ShieldCheck className="w-8 h-8 text-[#E8DF97]" />
                  </motion.div>

                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF6F0] text-[11px] font-bold text-[#70640F] border border-[#E8DF97]">
                    <Lock className="w-3 h-3" />
                    Owner Portal
                  </div>

                  <h2 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                    Welcome Back, Allyson!
                  </h2>
                  <p className="text-xs text-[#7C7472] max-w-xs mx-auto leading-relaxed">
                    Sign in with your registered studio owner email and password.
                  </p>

                  <div className="pt-1 flex items-center justify-center gap-1.5 text-[11px] text-[#5C5552]">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-medium">Admin-Only Secure Login</span>
                  </div>
                </div>

                {claimOwnerSuccess && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 text-center font-medium leading-relaxed">
                    {claimOwnerSuccess}
                  </div>
                )}

                {authError && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0, x: [-8, 8, -6, 6, -3, 3, 0] }}
                    transition={{ duration: 0.4 }}
                    className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 text-center font-medium leading-relaxed space-y-2"
                  >
                    <p>{authError}</p>
                    {authError.includes('Access restricted') && (
                      <button
                        type="button"
                        onClick={handleClaimStudioOwner}
                        disabled={isClaimingOwner}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-200/80 hover:bg-rose-300 text-rose-950 font-bold text-xs transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-rose-700" />
                        <span>{isClaimingOwner ? 'Authorizing...' : `Authorize "${ownerEmail}" as Studio Owner`}</span>
                      </button>
                    )}
                  </motion.div>
                )}

                {/* Email + Password Form */}
                <form onSubmit={handleOwnerPasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#5C5552] mb-1.5 uppercase tracking-wide">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#A89E9C] absolute left-3 top-3.5" />
                      <input
                        type="email"
                        required
                        disabled={authLoading || isCheckingTrustedDevice}
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        className="w-full pl-9 pr-3.5 py-3 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0] disabled:opacity-60 text-[#2D2A2E]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#5C5552] mb-1.5 uppercase tracking-wide">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#A89E9C] absolute left-3 top-3.5" />
                      <input
                        type={showOwnerPassword ? 'text' : 'password'}
                        required
                        disabled={authLoading || isCheckingTrustedDevice}
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full pl-9 pr-10 py-3 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0] disabled:opacity-60 text-[#2D2A2E]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                        className="absolute right-3 top-3 text-[#A89E9C] hover:text-[#2D2A2E] p-0.5 rounded transition-colors cursor-pointer"
                        title={showOwnerPassword ? 'Hide password' : 'Show password'}
                      >
                        {showOwnerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Password Reset / Setup Help */}
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-[#A89E9C]">No password yet or forgot it?</span>
                      <button
                        type="button"
                        onClick={handleSendPasswordReset}
                        disabled={isSendingPasswordReset || !ownerEmail.trim()}
                        className="text-[#B34B5C] hover:text-[#8C2435] font-semibold underline disabled:opacity-50 cursor-pointer"
                      >
                        {isSendingPasswordReset ? 'Sending setup link...' : 'Set / Reset Password via Email'}
                      </button>
                    </div>
                  </div>

                  {passwordResetSentNotice && (
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 text-center font-medium leading-relaxed">
                      {passwordResetSentNotice}
                    </div>
                  )}

                  {showPasswordSetupPrompt && (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2 leading-relaxed">
                      <p className="font-semibold flex items-center gap-1.5 text-amber-950">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Set Up Your Owner Password</span>
                      </p>
                      <p className="text-[11px] text-amber-800">
                        If you haven't configured a password for this owner account yet, click below to receive a secure password setup link.
                      </p>
                      <button
                        type="button"
                        onClick={handleSendPasswordReset}
                        disabled={isSendingPasswordReset}
                        className="w-full py-2 px-3 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition-colors cursor-pointer"
                      >
                        {isSendingPasswordReset ? 'Sending Setup Link...' : 'Email Me a Password Setup Link'}
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading || isCheckingTrustedDevice || !ownerEmail.trim() || !ownerPassword}
                    className="w-full py-3.5 px-4 min-h-[46px] rounded-2xl text-xs font-bold uppercase tracking-wider bg-[#2D2A2E] hover:bg-[#3D383C] text-[#F5EFC0] hover:text-white transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#F5EFC0] cursor-pointer"
                  >
                    {authLoading || isCheckingTrustedDevice ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#F5EFC0]" />
                        <span>{isCheckingTrustedDevice ? 'Verifying Active Session...' : 'Authenticating...'}</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4 shrink-0 text-[#F5EFC0]" />
                        <span>Sign In &amp; Continue</span>
                      </>
                    )}
                  </button>
                </form>



                {/* Back to Public Store */}
                <div className="pt-2 border-t border-[#F0D9DD]/60 text-center">
                  <button
                    type="button"
                    onClick={onReturnToStore}
                    className="inline-flex items-center gap-1.5 text-xs text-[#7C7472] hover:text-[#2D2A2E] font-medium transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Flower Store</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFAF8] flex flex-col selection:bg-[#F0D9DD] selection:text-[#2D2A2E]">
      
      {/* Top Banner / Studio Control Bar */}
      <header className="sticky top-0 z-30 bg-[#2D2A2E] text-white border-b border-[#403B3E] shadow-md px-3 sm:px-6 lg:px-8 py-3 transition-all">
        <div className="max-w-[1680px] mx-auto flex items-center justify-between gap-3 sm:gap-4">
          
          {/* Left: Mobile Drawer Button (Icon Only) + Studio Identity & Warm Greeting */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {/* Mobile & Tablet Side Panel Access (On Left, Icon Only) */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-[#F5EFC0] hover:text-white transition-all cursor-pointer flex items-center justify-center border border-white/15 shadow-xs shrink-0"
              title="Open dashboard sections menu"
              aria-label="Open dashboard sections menu"
            >
              <Menu className="w-5 h-5 text-[#F5EFC0]" />
            </button>

            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#F0D9DD] via-[#F5EFC0] to-[#A8D5C0] p-0.5 shadow-sm hidden sm:block shrink-0">
              <div className="w-full h-full bg-[#2D2A2E] rounded-[10px] flex items-center justify-center text-[#F5EFC0]">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="font-serif-title text-base sm:text-lg font-bold tracking-tight text-white leading-none">
                  Petal-Trak Owner Dashboard
                </h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-[#F5EFC0] border border-white/10 shadow-2xs">
                  <span>🌸</span>
                  <span>{timeGreeting}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Low Stock Alert, View Store, & Sign Out */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {lowStockItems.length > 0 && (
              <button
                onClick={() => {
                  handleSelectTab('inventory');
                }}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all animate-pulse cursor-pointer"
                title={`${lowStockItems.length} items low in stock`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{lowStockItems.length} Low Stock</span>
                <span className="sm:hidden">{lowStockItems.length} Low</span>
              </button>
            )}

            <button
              type="button"
              onClick={onReturnToStore}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#F5EFC0] hover:text-white border border-white/15 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Return to public flower store"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#A8D5C0]" />
              <span className="hidden md:inline">View Store</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await signOut(auth).catch(() => {});
                await logOut().catch(() => {});
                sessionStorage.removeItem('lypetal_owner_2fa_verified');
                setAuthStage('credentials');
                onReturnToStore();
              }}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Sign out of owner dashboard"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Column Layout: Categorized Side Panel + Workspace */}
      <div className="max-w-[1680px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 flex items-start gap-6 flex-1">

        {/* ========================================================= */}
        {/* DESKTOP SIDE PANEL (Categorized & Minifiable) */}
        {/* ========================================================= */}
        <aside
          className={`hidden lg:flex flex-col shrink-0 sticky top-20 bg-white border border-[#F0D9DD] rounded-3xl shadow-sm transition-all duration-300 overflow-hidden ${
            isSidebarCollapsed ? 'w-20' : 'w-72'
          }`}
          style={{ maxHeight: 'calc(100vh - 6.5rem)' }}
        >
          {/* Sidebar Top Title / Collapse Action */}
          <div className="p-3.5 border-b border-[#F0D9DD] flex items-center justify-between gap-2 bg-[#FAF6F0]/60">
            {!isSidebarCollapsed ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full bg-[#F4A6B0] shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#2D2A2E] truncate">
                  Studio Sections
                </span>
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-[#F4A6B0]" />
              </div>
            )}

            <button
              onClick={toggleSidebarCollapse}
              className="p-1.5 rounded-xl hover:bg-white text-[#7C7472] hover:text-[#2D2A2E] border border-transparent hover:border-[#E8E2DA] transition-all cursor-pointer"
              title={isSidebarCollapsed ? "Expand side panel" : "Minimize side panel (Ctrl+B)"}
              aria-label={isSidebarCollapsed ? "Expand side panel" : "Minimize side panel"}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-[#2D2A2E]" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-[#2D2A2E]" />
              )}
            </button>
          </div>

          {/* Quick Filter (When Expanded) */}
          {!isSidebarCollapsed && (
            <div className="p-3 border-b border-[#F0D9DD]/70 bg-white">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#A89E9C]" />
                <input
                  type="text"
                  value={navSearch}
                  onChange={(e) => setNavSearch(e.target.value)}
                  placeholder="Filter dashboard tabs..."
                  className="w-full pl-8 pr-7 py-1.5 bg-[#FAF6F0] border border-[#E8E2DA] rounded-xl text-xs text-[#2D2A2E] placeholder-[#A89E9C] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                />
                {navSearch && (
                  <button
                    onClick={() => setNavSearch('')}
                    className="absolute right-2.5 top-2 text-[#A89E9C] hover:text-[#2D2A2E] cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Scrollable Categorized Navigation List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin">
            {categories.map((cat) => {
              const matchingItems = cat.items.filter(item => {
                if (!normalizedNavSearch) return true;
                return (
                  item.label.toLowerCase().includes(normalizedNavSearch) ||
                  item.shortLabel.toLowerCase().includes(normalizedNavSearch) ||
                  cat.title.toLowerCase().includes(normalizedNavSearch)
                );
              });

              if (matchingItems.length === 0) return null;

              const isCatCollapsed = collapsedCategories[cat.id] && !normalizedNavSearch;

              return (
                <div key={cat.id} className="space-y-1">
                  {/* Category Header */}
                  {!isSidebarCollapsed ? (
                    <button
                      type="button"
                      onClick={() => toggleCategoryCollapse(cat.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1 text-left group cursor-pointer"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7C7472] group-hover:text-[#2D2A2E] transition-colors">
                        {cat.title}
                      </span>
                      <span className="text-[#A89E9C] group-hover:text-[#2D2A2E]">
                        {isCatCollapsed ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronUp className="w-3 h-3" />
                        )}
                      </span>
                    </button>
                  ) : (
                    <div className="my-2 border-t border-[#F0D9DD]/70 mx-2" />
                  )}

                  {/* Category Items */}
                  {!isCatCollapsed && (
                    <div className="space-y-1">
                      {matchingItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;

                        // Minimized Rail View (Icon Only + Tooltip)
                        if (isSidebarCollapsed) {
                          return (
                            <div key={item.id} className="relative group flex justify-center">
                              <button
                                onClick={() => handleSelectTab(item.id)}
                                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer relative ${
                                  isActive
                                    ? 'bg-[#2D2A2E] text-[#F5EFC0] shadow-md ring-2 ring-[#F4A6B0]'
                                    : 'text-[#5C5552] hover:bg-[#FAF6F0] hover:text-[#2D2A2E]'
                                }`}
                                aria-label={item.label}
                              >
                                <Icon className="w-5 h-5 shrink-0" />
                                {item.badge && (
                                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white" />
                                )}
                              </button>

                              {/* Tooltip on hover in collapsed mode */}
                              <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-2 bg-[#2D2A2E] text-white text-xs rounded-xl shadow-xl whitespace-nowrap z-50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-0.5 border border-[#403B3E]">
                                <span className="text-[9px] uppercase tracking-wider text-[#F4A6B0] font-bold">
                                  {cat.title}
                                </span>
                                <span className="font-bold">
                                  {item.label}
                                </span>
                                {item.badge && (
                                  <span className="text-[10px] text-amber-300">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Expanded Full-Item View
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSelectTab(item.id)}
                            className={`w-full px-3 py-2 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 transition-all text-left cursor-pointer ${
                              isActive
                                ? 'bg-[#2D2A2E] text-white shadow-sm ring-1 ring-[#2D2A2E]'
                                : 'text-[#5C5552] hover:bg-[#FAF6F0] hover:text-[#2D2A2E]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#F5EFC0]' : 'text-[#7C7472]'}`} />
                              <span className="truncate">
                                {item.label}
                              </span>
                            </div>

                            {item.badge && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${item.badgeColor || 'bg-stone-100 text-stone-700'}`}>
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sidebar Footer Quick Actions & Shortcut */}
          {!isSidebarCollapsed ? (
            <div className="p-3 border-t border-[#F0D9DD] bg-[#FAF6F0]/60 space-y-2.5">
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#FAF6F0] text-[#2D2A2E] border border-[#E8E2DA] text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                  title="Copy secret link for owner access"
                >
                  <Copy className="w-3.5 h-3.5 text-[#C98A12]" />
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Private Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={onReturnToStore}
                  className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#FAF6F0] text-[#2D2A2E] border border-[#E8E2DA] text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                  title="Return to the flower store"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#1D5E43]" />
                  <span>View Flower Store</span>
                </button>

                <button
                  type="button"
                  onClick={handleFullLogout}
                  className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  title="Log out of owner dashboard"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600" />
                  <span>Log Out</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-[10px] text-[#A89E9C] px-1 pt-1 border-t border-[#F0D9DD]/40">
                <span>Shortcut: <kbd className="px-1 py-0.5 rounded bg-white border border-stone-200 text-[9px]">Ctrl+B</kbd></span>
                <button
                  onClick={toggleSidebarCollapse}
                  className="text-[11px] hover:text-[#2D2A2E] underline cursor-pointer"
                >
                  Minimize
                </button>
              </div>
            </div>
          ) : (
            <div className="p-2 border-t border-[#F0D9DD] flex flex-col items-center gap-2 bg-[#FAF6F0]/60">
              <button
                type="button"
                onClick={handleCopyLink}
                className="p-2 rounded-xl bg-white hover:bg-[#FAF6F0] text-[#2D2A2E] border border-[#E8E2DA] transition-colors cursor-pointer"
                title={copiedLink ? 'Link Copied!' : 'Copy Private Link'}
              >
                <Copy className="w-4 h-4 text-[#C98A12]" />
              </button>

              <button
                type="button"
                onClick={onReturnToStore}
                className="p-2 rounded-xl bg-white hover:bg-[#FAF6F0] text-[#2D2A2E] border border-[#E8E2DA] transition-colors cursor-pointer"
                title="View Flower Store"
              >
                <ExternalLink className="w-4 h-4 text-[#1D5E43]" />
              </button>

              <button
                type="button"
                onClick={handleFullLogout}
                className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer"
                title="Log Out"
              >
                <LogOut className="w-4 h-4 text-rose-600" />
              </button>

              <button
                onClick={toggleSidebarCollapse}
                className="p-2 rounded-xl hover:bg-white text-[#7C7472] hover:text-[#2D2A2E] transition-colors cursor-pointer"
                title="Expand side panel"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </aside>

        {/* ========================================================= */}
        {/* MOBILE SIDEBAR DRAWER OVERLAY WITH FRAMER MOTION ANIMATION */}
        {/* ========================================================= */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              {/* Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-xs"
                onClick={() => setMobileSidebarOpen(false)}
              />
              {/* Drawer */}
              <motion.aside 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="relative w-80 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col z-10 border-r border-[#F0D9DD]"
              >
                <div className="p-4 border-b border-[#F0D9DD] flex items-center justify-between bg-[#FAF6F0]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#2D2A2E] text-[#F5EFC0] flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-serif-title font-bold text-sm text-[#2D2A2E]">
                        Petal-Trak Menu
                      </h3>
                      <p className="text-[10px] text-[#7C7472]">Owner Studio Navigation</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileSidebarOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-stone-200 text-[#7C7472] hover:text-[#2D2A2E] transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Mobile Navigation List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                  {categories.map((cat) => (
                    <div key={cat.id} className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7C7472] px-2 block">
                        {cat.title}
                      </span>
                      <div className="space-y-1">
                        {cat.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeTab === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleSelectTab(item.id)}
                              className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2.5 transition-all text-left cursor-pointer ${
                                isActive
                                  ? 'bg-[#2D2A2E] text-white shadow-sm'
                                  : 'text-[#5C5552] hover:bg-[#FAF6F0] hover:text-[#2D2A2E]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#F5EFC0]' : 'text-[#7C7472]'}`} />
                                <span className="truncate">
                                  {item.label}
                                </span>
                              </div>
                              {item.badge && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.badgeColor || 'bg-stone-100 text-stone-700'}`}>
                                  {item.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Drawer Footer */}
                <div className="p-4 border-t border-[#F0D9DD] bg-[#FAF6F0] space-y-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="w-full py-2.5 rounded-xl bg-white border border-[#E8E2DA] text-xs font-semibold text-[#2D2A2E] flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                  >
                    <Copy className="w-3.5 h-3.5 text-[#C98A12]" />
                    <span>{copiedLink ? 'Link Copied!' : 'Copy Private Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileSidebarOpen(false);
                      onReturnToStore();
                    }}
                    className="w-full py-2.5 rounded-xl bg-white border border-[#E8E2DA] text-xs font-semibold text-[#2D2A2E] flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#1D5E43]" />
                    <span>View Flower Store</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileSidebarOpen(false);
                      handleFullLogout();
                    }}
                    className="w-full py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-600" />
                    <span>Log Out</span>
                  </button>
                </div>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* ========================================================= */}
        {/* MAIN WORKSPACE CONTENT AREA */}
        {/* ========================================================= */}
        <main className="flex-1 min-w-0 space-y-6">

          {/* Section Category Header Banner */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white border border-[#F0D9DD] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] shrink-0">
                {React.createElement(currentTabItem.icon, { className: 'w-6 h-6 text-[#2D2A2E]' })}
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#7C7472] uppercase tracking-wider">
                  <span>{currentCategory.title}</span>
                </div>
                <h2 className="font-serif-title text-xl sm:text-2xl font-bold text-[#2D2A2E] mt-0.5">
                  {currentTabItem.label}
                </h2>
                <p className="text-xs text-[#7C7472]">
                  {currentTabItem.description}
                </p>
              </div>
            </div>

            {/* Quick Context KPIs separated with a subtle divider line */}
            <div className="w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 sm:border-l border-[#F0D9DD]/80 sm:pl-5 flex items-center gap-2 flex-wrap text-xs">
              <div className="px-3 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#7C7472]" />
                <span className="text-[#5C5552]">In Progress:</span>
                <strong className="text-[#2D2A2E]">{activeOrdersCount}</strong>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-800">Total Sales:</span>
                <strong className="text-emerald-900">₱{grossSales.toLocaleString()}</strong>
              </div>
              {lowStockItems.length > 0 && (
                <button
                  onClick={() => handleSelectTab('inventory')}
                  className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span><strong>{lowStockItems.length}</strong> supplies low</span>
                </button>
              )}
            </div>
          </div>

          {/* Floating Notice */}
          {alertNotice && (
            <div className="p-3.5 rounded-2xl bg-[#2D2A2E] text-white text-xs font-semibold flex items-center gap-2 shadow-lg animate-in slide-in-from-top-2">
              <Check className="w-4 h-4 text-[#A8D5C0] shrink-0" />
              <span>{alertNotice}</span>
            </div>
          )}

          {/* Active Tab Panel Content */}
          {activeTab === 'overview' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.15 }} className="p-5 rounded-3xl bg-white border border-[#F0D9DD] shadow-xs flex flex-col justify-between min-h-[110px]">
              <div className="min-h-[28px] flex items-start">
                <span className="text-[11px] font-bold text-[#7C7472] uppercase tracking-wider leading-snug">
                  Total Sales
                </span>
              </div>
              <div className="mt-2 pt-1">
                <p className="font-serif-title text-2xl sm:text-3xl font-bold tracking-tight text-[#2D2A2E]">
                  ₱{(grossSales ?? 0).toLocaleString()}
                </p>
              </div>
            </motion.div>

            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.15 }} className="p-5 rounded-3xl bg-white border border-[#F0D9DD] shadow-xs flex flex-col justify-between min-h-[110px]">
              <div className="min-h-[28px] flex items-start">
                <span className="text-[11px] font-bold text-[#7C7472] uppercase tracking-wider leading-snug">
                  In Production
                </span>
              </div>
              <div className="mt-2 pt-1">
                <p className="font-serif-title text-2xl sm:text-3xl font-bold tracking-tight text-[#F4A6B0]">
                  {activeOrdersCount}
                </p>
              </div>
            </motion.div>

            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.15 }} className="p-5 rounded-3xl bg-white border border-[#F0D9DD] shadow-xs flex flex-col justify-between min-h-[110px]">
              <div className="min-h-[28px] flex items-start">
                <span className="text-[11px] font-bold text-[#7C7472] uppercase tracking-wider leading-snug">
                  Finished & Delivered
                </span>
              </div>
              <div className="mt-2 pt-1">
                <p className="font-serif-title text-2xl sm:text-3xl font-bold tracking-tight text-[#1D5E43]">
                  {completedOrdersCount}
                </p>
              </div>
            </motion.div>

            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.15 }} className="p-5 rounded-3xl bg-white border border-[#F0D9DD] shadow-xs flex flex-col justify-between min-h-[110px]">
              <div className="min-h-[28px] flex items-start">
                <span className="text-[11px] font-bold text-[#7C7472] uppercase tracking-wider leading-snug">
                  Pending Balance
                </span>
              </div>
              <div className="mt-2 pt-1">
                <p className="font-serif-title text-2xl sm:text-3xl font-bold tracking-tight text-[#C53030]">
                  ₱{(totalBalance ?? 0).toLocaleString()}
                </p>
              </div>
            </motion.div>
          </div>

          {/* Quick Action Matrix: Recent Orders & Stock Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Recent Orders Overview */}
            <div className="lg:col-span-8 bg-white rounded-3xl p-6 border border-[#F0D9DD] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E]">
                  Recent Orders & Deadlines
                </h3>
                <button
                  onClick={() => setActiveTab('production')}
                  className="text-xs font-semibold text-[#F4A6B0] hover:underline"
                >
                  Manage Statuses →
                </button>
              </div>

              <div className="divide-y divide-[#F0D9DD]/50">
                {activeOrders.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#7C7472]">
                    No active orders currently pending. New customer bookings will appear here.
                  </div>
                ) : (
                  activeOrders.slice(0, 5).map((o, idx) => (
                    <div key={o.id ? `${o.id}-${idx}` : `recent-${idx}`} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#2D2A2E]">#{o.id}</span>
                          <span className="text-[#5C5552]">{o.customerInfo?.name || 'Customer'}</span>
                        </div>
                        <p className="text-[11px] text-[#7C7472] mt-0.5">
                          {o.items?.length || 0} item(s) • Est. Deadline: <strong>{o.deadline || '3-5 days'}</strong>
                        </p>
                      </div>

                      <div className="text-right flex items-center gap-2 sm:gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          o.status === 'completed' || o.status === 'delivered'
                            ? 'bg-[#A8D5C0] text-[#1D5E43]'
                            : 'bg-[#F5EFC0] text-[#70640F]'
                        }`}>
                          {o.status}
                        </span>
                        <span className="font-bold text-[#2D2A2E] text-xs sm:text-sm">
                          ₱{(o.totalAmount ?? 0).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVoidOrCancelOrder(o.id);
                          }}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                          title="Void / Cancel Order (preserves in database, places into Cancelled / Void table)"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cancelledVoidOrders.length > 0 && (
                <div className="pt-3 border-t border-[#F0D9DD]/60 flex items-center justify-between text-xs">
                  <span className="text-[#7C7472] flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                    <strong>{cancelledVoidOrders.length}</strong> cancelled / void order(s) archived
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('orders');
                      setOrdersSubFilter('cancelled');
                    }}
                    className="font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                  >
                    View in Order Ledger →
                  </button>
                </div>
              )}
            </div>

            {/* Inventory Alerts Box */}
            <div className="lg:col-span-4 bg-white rounded-3xl p-6 border border-[#F0D9DD] shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E] flex items-center gap-2">
                    <Boxes className="w-5 h-5 text-[#C98A12]" />
                    <span>Supplies Running Low</span>
                  </h3>
                  {lowStockItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectTab('inventory');
                        setInventoryStockFilter('low');
                      }}
                      className="text-[11px] font-bold text-amber-800 hover:text-amber-950 hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <span>Manage</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {lowStockItems.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#FAF6F0] text-center text-xs text-[#5C5552]">
                    ✓ All ribbons, wrappers, and crafting supplies are well stocked!
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {lowStockItems.map((it, idx) => (
                      <button
                        key={it.id ? `${it.id}-${idx}` : `stock-${idx}`}
                        type="button"
                        onClick={() => {
                          handleSelectTab('inventory');
                          setInventorySearch(it.name || '');
                          setInventoryCategoryFilter(it.category || 'all');
                        }}
                        title={`Click to manage ${it.name} in Supplies & Stock`}
                        className="w-full p-3 rounded-2xl bg-amber-50 hover:bg-amber-100/90 border border-amber-200 text-xs flex items-center justify-between text-left transition-all active:scale-[0.99] cursor-pointer group shadow-2xs"
                      >
                        <div>
                          <strong className="text-amber-950 block group-hover:text-black transition-colors">{it.name}</strong>
                          <span className="text-[10px] text-amber-700">Minimum wanted: {it.lowStockThreshold} {it.unit}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-amber-900 bg-white px-2 py-0.5 rounded-lg border border-amber-200 shadow-2xs">
                            {it.stock} {it.unit}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lowStockItems.length > 0 && (
                <div className="pt-2 border-t border-[#F0D9DD]/60">
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectTab('inventory');
                      setInventoryStockFilter('low');
                    }}
                    className="w-full py-2 rounded-xl text-xs font-bold text-amber-900 hover:bg-amber-50 border border-amber-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>View all low supplies ({lowStockItems.length}) in Stock Table →</span>
                  </button>
                </div>
              )}
            </div>

            {/* Studio Contact & Storefront Coordinates Card */}
            <div className="lg:col-span-12 bg-white rounded-3xl p-6 border border-[#F0D9DD] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#F0D9DD]/60 flex items-center justify-center text-[#7A4B53] shrink-0">
                  <MapPin className="w-6 h-6 text-[#F4A6B0]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif-title text-base font-bold text-[#2D2A2E]">
                      Studio Contact & Storefront Info
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Live on Store
                    </span>
                  </div>
                  <p className="text-xs text-[#5C5552] mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Phone: <strong>{studioSettings?.contactPhone || '+63 912 345 6789'}</strong></span>
                    <span>•</span>
                    <span>Email: <strong>{studioSettings?.contactEmail || 'allyson@lypetal.com'}</strong></span>
                    <span>•</span>
                    <span>Studio: <strong>{studioSettings?.pickupAddress || 'San Pedro, Laguna'}</strong></span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSelectTab('settings')}
                className="px-4 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#F0D9DD]/50 text-[#2D2A2E] border border-[#E8E2DA] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#C95567]" />
                <span>Edit Contact & Address</span>
              </button>
            </div>

          </div>
        </motion.div>
      )}

      {/* ========================================================= */}
      {/* PANEL 2: CUSTOMER MANAGEMENT */}
      {/* ========================================================= */}
      {activeTab === 'customers' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-xs space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                Customer List ({customers.length})
              </h3>
              <p className="text-xs text-[#5C5552] mt-0.5">
                Names, phone numbers, addresses, and order history for all your customers.
              </p>
            </div>

            {/* Quick Customer Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#A89E9C]" />
              <input
                type="text"
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                placeholder="Search by name, email, phone..."
                className="w-full pl-8 pr-7 py-1.5 bg-[#FAF6F0] border border-[#E8E2DA] rounded-xl text-xs text-[#2D2A2E] placeholder-[#A89E9C] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
              />
              {customerSearchQuery && (
                <button
                  onClick={() => setCustomerSearchQuery('')}
                  className="absolute right-2.5 top-2 text-[#A89E9C] hover:text-[#2D2A2E] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCustomers.length === 0 ? (
              <div className="col-span-full py-12 text-center text-xs text-[#7C7472] bg-[#FAF6F0]/60 rounded-2xl border border-[#F0D9DD]">
                No customers matched your search.
              </div>
            ) : (
              filteredCustomers.map((c, idx) => {
                const count = (c.email ? ordersCountByCustomer.get(c.email.toLowerCase()) : 0) || (c.id ? ordersCountByCustomer.get(c.id) : 0) || 0;
                return (
                  <div key={c.id ? `${c.id}-${idx}` : `cust-${idx}`} className="p-5 rounded-2xl bg-[#FCFAF8] border border-[#F0D9DD] space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-[#2D2A2E]">
                        {c.firstName} {c.lastName}
                      </h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F0D9DD] text-[#7A4B53]">
                        {count} orders
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-[#5C5552]">
                      <p className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-[#A89E9C]" />
                        <span className="truncate">{c.email}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[#A89E9C]" />
                        <span>{c.phone || 'No phone recorded'}</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#A89E9C] shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{c.address || 'Pick-up from studio'}</span>
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}

      {/* ========================================================= */}
      {/* PANEL 3: PRODUCT & DESIGN MANAGEMENT */}
      {/* ========================================================= */}
      {activeTab === 'products' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                  Flower Catalog
                </h3>
                <p className="text-xs text-[#5C5552]">
                  Manage your flowers, update prices, choose colors, and upload new photos.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddProduct}
                className="px-4 py-2.5 rounded-2xl bg-[#2D2A2E] hover:bg-[#3D3A3E] text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4 text-[#F4A6B0]" />
                <span>Add New Flower</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {products.map((p, idx) => (
                <div key={p.id ? `${p.id}-${idx}` : `prod-${idx}`} className="p-6 rounded-2xl bg-[#FCFAF8] border border-[#F0D9DD] space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* Product Image Preview & Uploader */}
                    <div className="relative rounded-2xl overflow-hidden aspect-video bg-[#FAF6F0] border border-[#E8E2DA]">
                      <img 
                        src={p.imageUrl} 
                        alt={p.name} 
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                      <label className="absolute bottom-2.5 right-2.5 px-3 py-1.5 rounded-xl bg-[#2D2A2E]/85 hover:bg-[#2D2A2E] text-white text-xs font-semibold cursor-pointer shadow-md flex items-center gap-1.5 transition-all backdrop-blur-xs">
                        <Upload className="w-3.5 h-3.5 text-[#F4A6B0]" />
                        <span>Upload Real Photo</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleProductImageUpload(p.id, file);
                          }} 
                        />
                      </label>

                      {/* Storefront status badge */}
                      <div className="absolute top-2.5 left-2.5">
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-xs flex items-center gap-1 ${
                          p.active !== false
                            ? 'bg-emerald-600/90 text-white'
                            : 'bg-amber-600/90 text-white'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p.active !== false ? 'bg-emerald-300' : 'bg-amber-300'}`} />
                          {p.active !== false ? 'Active on Store' : 'Hidden'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-lg text-[#2D2A2E]">{p.name}</h4>
                        {p.badge && (
                          <span className="text-[10px] font-semibold text-[#8C2435] bg-[#FDF4F5] px-2 py-0.5 rounded-md">
                            {p.badge}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#F5EFC0] text-[#70640F] shrink-0">
                        ₱{p.basePrice} base
                      </span>
                    </div>

                    <p className="text-xs text-[#5C5552] line-clamp-3">{p.description}</p>

                    <div className="pt-2 flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#E8E2DA]">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-[#2D2A2E] whitespace-nowrap">Base Price:</label>
                        <div className="relative flex items-center">
                          <span className="absolute left-2.5 text-xs text-[#7C7472] font-bold">₱</span>
                          <input
                            type="number"
                            min="1"
                            key={`base-price-${p.id}-${p.basePrice}`}
                            defaultValue={p.basePrice}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = Number((e.target as HTMLInputElement).value);
                                if (val > 0) handleUpdateProductPrice(p.id, val);
                              }
                            }}
                            onBlur={(e) => {
                              const newPrice = Number(e.target.value);
                              if (newPrice > 0 && newPrice !== p.basePrice) {
                                handleUpdateProductPrice(p.id, newPrice);
                              }
                            }}
                            className="w-24 pl-6 pr-2 py-1.5 text-xs font-bold rounded-lg bg-[#FAF6F0] border border-[#E8E2DA] focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E]"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {priceSuccessId === p.id && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-bold flex items-center gap-1 animate-pulse">
                            <Check className="w-3 h-3 text-emerald-700" />
                            Saved!
                          </span>
                        )}
                        {updatingPriceId === p.id && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium">
                            Saving...
                          </span>
                        )}
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-200">
                          Live on Store
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-[#7C7472]">
                      Available Hues: {p.availableColors?.join(', ') || 'All standard colors'}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-[#F0D9DD]/70 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditProduct(p)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#2D2A2E] hover:bg-[#FAF6F0] border border-[#E8E2DA] flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#C95567]" />
                      <span>Edit Flower</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProductToDelete(p)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Remove from catalog"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ========================================================= */}
      {/* PANEL 4: PRODUCTION / ORDER STATUS TRACKING */}
      {/* ========================================================= */}
      {activeTab === 'production' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-xs space-y-6"
        >
          <div>
            <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
              Order Progress Pipeline
            </h3>
            <p className="text-xs text-[#5C5552]">
              Follow and update each customer order step by step from crafting to delivery.
            </p>
          </div>

          <div className="divide-y divide-[#F0D9DD]/70">
            {activeOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#7C7472]">
                No active orders right now. New customer orders will show up here automatically!
              </div>
            ) : (
              activeOrders.map((ord, idx) => (
                <div key={ord.id ? `${ord.id}-${idx}` : `prod-ord-${idx}`} className="py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-serif-title font-bold text-base text-[#2D2A2E]">
                        #{ord.id}
                      </span>
                      <span className="text-xs text-[#7C7472]">
                        ({ord.customerInfo?.name || 'Customer'})
                      </span>
                    </div>
                    <p className="text-xs text-[#5C5552]">
                      {(ord.items || []).map(i => `${i.quantity}x ${i.flowerName}`).join(' • ')}
                    </p>
                    <p className="text-[11px] text-[#7C7472]">
                      Deadline: <strong>{ord.deadline || '3-5 days'}</strong> • Destination: {ord.customerInfo?.address || 'San Pedro, Laguna Studio'}
                    </p>
                  </div>

                  {/* Real-time Status Toggle Buttons & Order Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F0D9DD]/50 w-full md:w-auto">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['pending', 'in-progress', 'completed', 'delivered'] as OrderStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleUpdateOrderStatus(ord.id, st)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                            ord.status === st
                              ? 'bg-[#2D2A2E] text-white shadow-xs'
                              : 'bg-[#FAF6F0] text-[#5C5552] hover:bg-[#F0D9DD]'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEmailReceiptToCustomer(ord)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#FAF6F0] hover:bg-[#F0D9DD] text-[#2D2A2E] border border-[#E8E2DA] flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Send official receipt to customer's email"
                      >
                        <Mail className="w-3.5 h-3.5 text-[#F4A6B0]" />
                        <span>Email Receipt</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleVoidOrCancelOrder(ord.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Cancel this order"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel Order</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* ========================================================= */}
      {/* ORDER LEDGER (ACTIVE & CANCELLED ORDERS UNIFIED) */}
      {/* ========================================================= */}
      {activeTab === 'orders' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-xs space-y-6"
        >
          {/* Header & Sub-filter Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F0D9DD]/70 pb-4">
            <div>
              <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                {ordersSubFilter === 'active' ? 'Active Orders Ledger' : 'Cancelled & Void Orders'}
              </h3>
              <p className="text-xs text-[#5C5552] mt-0.5">
                {ordersSubFilter === 'active'
                  ? 'All customer orders currently in production, awaiting pickup, or already delivered.'
                  : 'Orders that were cancelled or voided. You can restore them back to active orders anytime.'}
              </p>
            </div>

            {/* Table switcher toggle */}
            <div className="flex items-center gap-1.5 bg-[#FAF6F0] p-1.5 rounded-2xl border border-[#E8E2DA]">
              <button
                type="button"
                onClick={() => setOrdersSubFilter('active')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  ordersSubFilter === 'active'
                    ? 'bg-[#2D2A2E] text-white shadow-xs'
                    : 'text-[#5C5552] hover:bg-[#F0D9DD]'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Active Orders ({activeOrders.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setOrdersSubFilter('cancelled')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  ordersSubFilter === 'cancelled'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancelled / Void ({cancelledVoidOrders.length})</span>
              </button>
            </div>
          </div>

          {ordersSubFilter === 'active' ? (
            /* ================= ACTIVE ORDERS VIEW ================= */
            <div className="space-y-6">
              {/* Search & Status Filters for Orders */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#A89E9C]" />
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="Search by order ID, customer name, phone, item..."
                    className="w-full pl-8 pr-7 py-1.5 bg-[#FCFAF8] border border-[#E8E2DA] rounded-xl text-xs text-[#2D2A2E] placeholder-[#A89E9C] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                  />
                  {orderSearchQuery && (
                    <button
                      onClick={() => setOrderSearchQuery('')}
                      className="absolute right-2.5 top-2 text-[#A89E9C] hover:text-[#2D2A2E] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter Buttons */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                  {(['all', 'pending', 'in-progress', 'completed', 'delivered'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setOrderStatusFilter(st)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                        orderStatusFilter === st
                          ? 'bg-[#2D2A2E] text-white shadow-xs'
                          : 'bg-[#FAF6F0] text-[#5C5552] hover:bg-[#F0D9DD]'
                      }`}
                    >
                      {st === 'all' ? `All (${activeOrders.length})` : st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {activeOrders.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#7C7472] bg-[#FAF6F0]/60 rounded-2xl border border-[#F0D9DD]">
                    No active orders recorded yet. New customer orders will be listed here.
                  </div>
                ) : filteredActiveOrders.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#7C7472] bg-[#FAF6F0]/60 rounded-2xl border border-[#F0D9DD] space-y-2">
                    <p className="font-semibold text-[#2D2A2E]">No orders match your filter criteria.</p>
                    <button
                      type="button"
                      onClick={() => { setOrderSearchQuery(''); setOrderStatusFilter('all'); }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#2D2A2E] text-white font-bold text-xs hover:bg-[#403B3E] transition-colors cursor-pointer"
                    >
                      Clear Filters
                    </button>
                  </div>
                ) : (
                  filteredActiveOrders.map((o, idx) => (
                    <motion.div 
                      key={o.id ? `${o.id}-${idx}` : `ledger-${idx}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 rounded-2xl bg-[#FCFAF8] border border-[#F0D9DD] space-y-3 hover:border-[#E8B4BC] transition-all"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0D9DD]/50 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#2D2A2E]">#{o.id}</span>
                          <span className="text-xs text-[#7C7472]">• {safeFormatDate(o.createdAt)}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            o.status === 'completed' || o.status === 'delivered'
                              ? 'bg-[#A8D5C0] text-[#1D5E43]'
                              : o.status === 'in-progress'
                              ? 'bg-[#E3EBF8] text-[#2E5B9A]'
                              : 'bg-[#F5EFC0] text-[#70640F]'
                          }`}>
                            {o.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#2D2A2E]">₱{(o.totalAmount ?? 0).toLocaleString()}</span>
                          <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-[#F5EFC0] text-[#70640F]">
                            {o.paymentMode}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleEmailReceiptToCustomer(o)}
                            className="px-2.5 py-1 rounded-xl text-xs font-bold text-[#2D2A2E] bg-white hover:bg-[#FAF6F0] border border-[#E8E2DA] flex items-center gap-1 transition-colors ml-1 cursor-pointer"
                            title="Send official receipt to customer's email"
                          >
                            <Mail className="w-3.5 h-3.5 text-[#F4A6B0]" />
                            <span>Email Receipt</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleVoidOrCancelOrder(o.id)}
                            className="px-2.5 py-1 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 flex items-center gap-1 transition-colors ml-1 cursor-pointer"
                            title="Void / cancel order and move to Cancelled / Void list"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Void / Cancel</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePermanentDeleteOrder(o.id)}
                            className="px-2.5 py-1 rounded-xl text-xs font-bold text-stone-500 hover:text-red-700 bg-white hover:bg-red-50 border border-stone-200 hover:border-red-200 flex items-center gap-1 transition-colors ml-1 cursor-pointer"
                            title="Permanently remove order from database and dashboard"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#5C5552]">
                        <div>
                          <strong className="text-[#2D2A2E] block mb-1">Customer Details:</strong>
                          <p>Name: {o.customerInfo?.name || 'Customer'}</p>
                          <p>Phone: {o.customerInfo?.phone || 'N/A'}</p>
                          <p>Address: {o.customerInfo?.address || 'San Pedro, Laguna Studio'}</p>
                          {o.notes && <p className="italic text-[#70640F] mt-1">Note: "{o.notes}"</p>}
                        </div>

                        <div>
                          <strong className="text-[#2D2A2E] block mb-1">Arrangement Items:</strong>
                          <ul className="space-y-1">
                            {(o.items || []).map((it, itemIdx) => (
                              <li key={`${o.id}-item-${itemIdx}`} className="bg-white p-2 rounded-xl border border-[#E8E2DA]">
                                <span className="font-semibold text-[#2D2A2E]">{it.quantity}x {it.flowerName}</span>
                                <span className="text-[11px] text-[#7C7472] block">
                                  {it.color && `Color: ${it.color}`}
                                  {it.colors && `Colors: ${it.colors.join(' & ')} • Stems: ${it.stemsCount}`}
                                  {it.wrapperColor && ` • Wrap: ${it.wrapperColor}`}
                                  {it.ribbonColor && ` • Ribbon: ${it.ribbonColor}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* ================= CANCELLED / VOID ORDERS VIEW ================= */
            <div className="space-y-6">
              {/* Summary Callout Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-red-50/70 border border-red-200/80">
                  <span className="text-[11px] font-bold text-red-800 uppercase tracking-wider">Total Cancelled Orders</span>
                  <p className="text-2xl font-bold text-red-950 mt-1">{cancelledVoidOrders.length}</p>
                  <span className="text-[10px] text-red-700">Archived securely in your database</span>
                </div>

                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200">
                  <span className="text-[11px] font-bold text-stone-600 uppercase tracking-wider">Total Voided Value</span>
                  <p className="text-2xl font-bold text-[#2D2A2E] mt-1">₱{(totalVoidedAmount ?? 0).toLocaleString()}</p>
                  <span className="text-[10px] text-stone-500">Excluded from active revenue</span>
                </div>
              </div>

              {/* Search for Void / Cancelled Orders */}
              {cancelledVoidOrders.length > 0 && (
                <div className="relative max-w-md">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#A89E9C]" />
                  <input
                    type="text"
                    value={cancelledSearchQuery}
                    onChange={(e) => setCancelledSearchQuery(e.target.value)}
                    placeholder="Search cancelled orders by ID, customer, or reason..."
                    className="w-full pl-8 pr-7 py-1.5 bg-[#FFFBFB] border border-red-200 rounded-xl text-xs text-[#2D2A2E] placeholder-[#A89E9C] focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                  {cancelledSearchQuery && (
                    <button
                      onClick={() => setCancelledSearchQuery('')}
                      className="absolute right-2.5 top-2 text-[#A89E9C] hover:text-[#2D2A2E] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {cancelledVoidOrders.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#7C7472] bg-[#FCFAF8] rounded-2xl border border-dashed border-stone-200 space-y-2">
                    <Check className="w-6 h-6 text-emerald-500 mx-auto" />
                    <p className="font-bold text-[#2D2A2E]">No Cancelled or Void Orders</p>
                    <p className="text-[#7C7472]">All customer orders placed are currently active and moving forward.</p>
                  </div>
                ) : filteredCancelledOrders.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#7C7472] bg-[#FFFBFB] rounded-2xl border border-red-200 space-y-2">
                    <p className="font-semibold text-[#2D2A2E]">No cancelled orders match your search.</p>
                    <button
                      type="button"
                      onClick={() => setCancelledSearchQuery('')}
                      className="px-3.5 py-1.5 rounded-xl bg-stone-700 text-white font-bold text-xs cursor-pointer"
                    >
                      Clear Search
                    </button>
                  </div>
                ) : (
                  filteredCancelledOrders.map((o, idx) => (
                    <motion.div 
                      key={o.id ? `${o.id}-${idx}` : `void-${idx}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 rounded-2xl bg-[#FFFBFB] border border-red-200/80 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#2D2A2E]">#{o.id}</span>
                          <span className="text-xs text-[#7C7472]">• Placed: {safeFormatDate(o.createdAt)}</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            <span>CANCELLED / VOID</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                            By {o.cancelledBy === 'owner' ? 'Studio Owner (Allyson)' : 'Customer'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#2D2A2E]">₱{(o.totalAmount ?? 0).toLocaleString()}</span>
                          <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600">
                            {o.paymentMode}
                          </span>

                          {/* Restore / Reinstate Button */}
                          <button
                            type="button"
                            onClick={() => handleRestoreOrder(o.id)}
                            className="px-3 py-1 rounded-xl text-xs font-bold text-[#1D5E43] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Restore this order back to active status"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Restore Order</span>
                          </button>

                          {/* Permanent Database Delete */}
                          <button
                            type="button"
                            onClick={() => handlePermanentDeleteOrder(o.id)}
                            className="px-2.5 py-1 rounded-xl text-xs font-bold text-stone-500 hover:text-red-700 bg-white hover:bg-red-50 border border-stone-200 hover:border-red-200 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Permanently remove from database (cannot be undone)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Cancellation Reason Callout */}
                      <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-red-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          <span>Cancellation Reason:</span>
                        </div>
                        <p className="italic text-red-900 bg-white/80 p-2.5 rounded-lg border border-red-100 font-medium">
                          "{o.cancellationReason || 'No specific reason entered'}"
                        </p>
                        {o.cancelledAt && (
                          <span className="text-[10px] text-red-600 block mt-1">
                            Voided on: {safeFormatDateTime(o.cancelledAt)}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#5C5552]">
                        <div>
                          <strong className="text-[#2D2A2E] block mb-1">Customer Information:</strong>
                          <p>Name: {o.customerInfo?.name || 'Customer'}</p>
                          <p>Phone: {o.customerInfo?.phone || 'N/A'}</p>
                          <p>Email: {o.customerInfo?.email || 'N/A'}</p>
                          <p>Address: {o.customerInfo?.address || 'N/A'}</p>
                          {o.notes && <p className="italic text-[#70640F] mt-1">Customer Note: "{o.notes}"</p>}
                        </div>

                        <div>
                          <strong className="text-[#2D2A2E] block mb-1">Voided Bouquet Items:</strong>
                          <ul className="space-y-1">
                            {(o.items || []).map((it, itemIdx) => (
                              <li key={`${o.id}-void-item-${itemIdx}`} className="bg-white p-2 rounded-xl border border-[#E8E2DA]">
                                <span className="font-semibold text-[#2D2A2E]">{it.quantity}x {it.flowerName}</span>
                                <span className="text-[11px] text-[#7C7472] block">
                                  {it.color && `Color: ${it.color}`}
                                  {it.colors && `Colors: ${it.colors.join(' & ')} • Stems: ${it.stemsCount}`}
                                  {it.wrapperColor && ` • Wrap: ${it.wrapperColor}`}
                                  {it.ribbonColor && ` • Ribbon: ${it.ribbonColor}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ========================================================= */}
      {/* PANEL 5: PAYMENT MANAGEMENT */}
      {/* ========================================================= */}
      {activeTab === 'payments' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-xs space-y-6"
        >
          <div>
            <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
              Customer Payments
            </h3>
            <p className="text-xs text-[#5C5552]">
              Record customer payments (GCash, Maya, Bank Transfer, or Cash) and track remaining balances.
            </p>
          </div>

          <div className="divide-y divide-[#F0D9DD]/70">
            {activeOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#7C7472]">
                No orders needing payment right now.
              </div>
            ) : (
              activeOrders.map((o, idx) => (
                <div key={o.id ? `${o.id}-${idx}` : `pay-${idx}`} className="py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-[#2D2A2E]">#{o.id}</strong>
                      <span className="text-[#5C5552]">{o.customerInfo?.name || 'Customer'}</span>
                      <span className="text-[11px] text-[#7C7472]">({o.paymentMode || 'N/A'})</span>
                    </div>
                    <p className="text-[#7C7472] mt-0.5">
                      Total: <strong>₱{o.totalAmount}</strong> • Paid: <strong>₱{o.amountPaid || 0}</strong> • Balance: <strong className="text-red-600">₱{o.balance}</strong>
                    </p>
                  </div>

                  {/* Quick Payment Action Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdatePayment(o.id, 'paid', o.totalAmount, o.totalAmount)}
                      className="px-3 py-1.5 rounded-xl bg-[#A8D5C0] hover:bg-[#97c4af] text-[#1D5E43] font-bold text-xs cursor-pointer"
                    >
                      Mark as Paid (₱{o.totalAmount})
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdatePayment(o.id, 'partial', Math.floor(o.totalAmount / 2), o.totalAmount)}
                      className="px-3 py-1.5 rounded-xl bg-[#F5EFC0] hover:bg-[#ece2a4] text-[#70640F] font-bold text-xs cursor-pointer"
                    >
                      50% Deposit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdatePayment(o.id, 'pending', 0, o.totalAmount)}
                      className="px-3 py-1.5 rounded-xl bg-[#F0D9DD] hover:bg-[#e8c5cb] text-[#7A4B53] font-bold text-xs cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* ========================================================= */}
      {/* PANEL 6: INVENTORY MANAGEMENT */}
      {/* ========================================================= */}
      {activeTab === 'inventory' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-xs space-y-6"
        >
          {/* Header & Main Actions */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                Ribbon & Crafting Supplies
              </h3>
              <p className="text-xs text-[#5C5552] mt-1">
                Track your ribbon rolls, wrapping papers, flower stems, and craft supplies.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleRefreshInventory}
                disabled={isRefreshingInventory}
                title="Refresh live stocks from database"
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#FAF6F0] hover:bg-[#F0D9DD] text-[#2D2A2E] border border-[#E8E2DA] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#5C5552] ${isRefreshingInventory ? 'animate-spin' : ''}`} />
                <span>{isRefreshingInventory ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddingInventory(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#2D2A2E] hover:bg-black text-white flex items-center gap-1.5 transition-all shadow-xs"
              >
                <PackagePlus className="w-4 h-4 text-[#F4A6B0]" />
                <span>Add Supply Item</span>
              </button>
            </div>
          </div>

          {/* Live Database Stock Sync Status Indicator */}
          {stockSyncNotice && (
            <div 
              className={`flex items-center justify-between px-4 py-2.5 rounded-2xl border text-xs shadow-xs transition-all animate-in fade-in slide-in-from-top-1 ${
                stockSyncStatus === 'syncing'
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : stockSyncStatus === 'saved'
                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                  : stockSyncStatus === 'error'
                  ? 'bg-rose-50/90 border-rose-300 text-rose-950'
                  : 'bg-[#FAF6F0] border-[#E8E2DA] text-[#2D2A2E]'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {stockSyncStatus === 'syncing' && <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />}
                {stockSyncStatus === 'saved' && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                {stockSyncStatus === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{stockSyncNotice}</span>
              </div>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                stockSyncStatus === 'syncing'
                  ? 'bg-amber-200/80 text-amber-900 animate-pulse'
                  : stockSyncStatus === 'saved'
                  ? 'bg-emerald-200/80 text-emerald-900'
                  : 'bg-rose-200/80 text-rose-900'
              }`}>
                {stockSyncStatus === 'syncing' ? 'Updating' : stockSyncStatus === 'saved' ? 'Synced' : 'Local'}
              </span>
            </div>
          )}

          {/* Quick Metrics Bar with Click-to-Filter */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <button
              type="button"
              onClick={() => { setInventoryStockFilter('all'); setInventoryCategoryFilter('all'); }}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                inventoryStockFilter === 'all'
                  ? 'bg-[#FAF6F0] border-[#2D2A2E] ring-1 ring-[#2D2A2E]'
                  : 'bg-[#FAF6F0] border-[#E8E2DA] hover:border-[#2D2A2E]/50'
              }`}
            >
              <span className="text-[10px] uppercase font-bold text-[#7C7472] block">Total Items</span>
              <span className="font-serif-title text-xl font-bold text-[#2D2A2E]">{inventory.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setInventoryStockFilter(prev => prev === 'low' ? 'all' : 'low')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                inventoryStockFilter === 'low'
                  ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-400'
                  : 'bg-amber-50 border-amber-200 hover:border-amber-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-amber-900 block">Low Stock Alert</span>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <span className="font-serif-title text-xl font-bold text-amber-900">
                {inventory.filter(i => (i.stock ?? 0) <= (i.lowStockThreshold ?? 5)).length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setInventoryStockFilter(prev => prev === 'out' ? 'all' : 'out')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                inventoryStockFilter === 'out'
                  ? 'bg-red-100 border-red-500 ring-2 ring-red-400'
                  : 'bg-red-50 border-red-200 hover:border-red-400'
              }`}
            >
              <span className="text-[10px] uppercase font-bold text-red-800 block">Out of Stock</span>
              <span className="font-serif-title text-xl font-bold text-red-800">
                {inventory.filter(i => (i.stock ?? 0) === 0).length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setInventoryStockFilter(prev => prev === 'healthy' ? 'all' : 'healthy')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                inventoryStockFilter === 'healthy'
                  ? 'bg-[#A8D5C0]/50 border-emerald-600 ring-2 ring-emerald-500'
                  : 'bg-[#A8D5C0]/30 border-[#A8D5C0] hover:border-emerald-600'
              }`}
            >
              <span className="text-[10px] uppercase font-bold text-[#1D5E43] block">Healthy Stock</span>
              <span className="font-serif-title text-xl font-bold text-[#1D5E43]">
                {inventory.filter(i => (i.stock ?? 0) > (i.lowStockThreshold ?? 5)).length}
              </span>
            </button>
          </div>

          {/* Active Filter Notice if filtered by stock status */}
          {inventoryStockFilter !== 'all' && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <span className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Filtering by: <strong>{inventoryStockFilter === 'low' ? 'Low Stock Items (≤ threshold)' : inventoryStockFilter === 'out' ? 'Out of Stock (0 items)' : 'Healthy Stock'}</strong>
              </span>
              <button
                type="button"
                onClick={() => setInventoryStockFilter('all')}
                className="text-[11px] font-bold text-amber-800 hover:underline cursor-pointer"
              >
                Clear Filter
              </button>
            </div>
          )}

          {/* Search and Category Filter Controls */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#7C7472] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                placeholder="Search material by name or category..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
              />
              {inventorySearch && (
                <button
                  type="button"
                  onClick={() => setInventorySearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7C7472] hover:text-black cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Pills with Low Stock Warning Badges */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
              {[
                { id: 'all', label: 'All Supplies' },
                { id: 'flower', label: 'Flower Heads' },
                { id: 'color', label: 'Ribbon Colors' },
                { id: 'wrapper', label: 'Wrappers' },
                { id: 'ribbon', label: '5cm Ties' },
                { id: 'craft_supply', label: 'Craft Supplies' },
              ].map((cat) => {
                const isSelected = inventoryCategoryFilter === cat.id;
                const lowCount = inventory.filter(i => {
                  const isCat = cat.id === 'all' || i.category === cat.id;
                  return isCat && (i.stock ?? 0) <= (i.lowStockThreshold ?? 5);
                }).length;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setInventoryCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#2D2A2E] text-white shadow-xs'
                        : 'bg-[#FAF6F0] text-[#5C5552] hover:bg-[#F0D9DD]'
                    }`}
                  >
                    <span>{cat.label}</span>
                    {lowCount > 0 && (
                      <span 
                        title={`${lowCount} low stock item(s) in this category`}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isSelected
                            ? 'bg-amber-400 text-amber-950'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        <AlertTriangle className={`w-2.5 h-2.5 shrink-0 ${isSelected ? 'text-amber-950' : 'text-amber-600'}`} />
                        <span>{lowCount}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inventory Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#F0D9DD] text-[#7C7472] uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-2">Material / Item</th>
                  <th className="py-3 px-2">Category</th>
                  <th 
                    className="py-3 px-2 cursor-pointer select-none group transition-colors hover:text-[#2D2A2E]"
                    onClick={() => {
                      setInventorySortOrder(prev => {
                        if (prev === 'none') return 'asc';
                        if (prev === 'asc') return 'desc';
                        return 'asc';
                      });
                    }}
                    title={
                      inventorySortOrder === 'asc'
                        ? 'Sorted: Low Stock to High Stock (Click to sort High to Low)'
                        : inventorySortOrder === 'desc'
                        ? 'Sorted: High Stock to Low Stock (Click to sort Low to High)'
                        : 'Click to sort: Low Stock to High Stock'
                    }
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <span className={inventorySortOrder !== 'none' ? 'font-bold text-[#2D2A2E]' : ''}>
                        Current Stock
                      </span>
                      {inventorySortOrder === 'asc' && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <ArrowUp className="w-3 h-3 text-amber-700" />
                          <span>Low → High</span>
                        </span>
                      )}
                      {inventorySortOrder === 'desc' && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-[#2D2A2E] text-white">
                          <ArrowDown className="w-3 h-3 text-[#F4A6B0]" />
                          <span>High → Low</span>
                        </span>
                      )}
                      {inventorySortOrder === 'none' && (
                        <ArrowUpDown className="w-3 h-3 text-[#7C7472]/60 group-hover:text-[#2D2A2E] transition-colors" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-2">Threshold</th>
                  <th className="py-3 px-2 text-center">Quick Adjust</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0D9DD]/50">
                {inventory
                  .filter((item) => {
                    const matchesCategory = inventoryCategoryFilter === 'all' || item.category === inventoryCategoryFilter;
                    const matchesSearch = !inventorySearch.trim() || 
                      (item.name || '').toLowerCase().includes(inventorySearch.toLowerCase()) ||
                      (item.category || '').toLowerCase().includes(inventorySearch.toLowerCase()) ||
                      (item.unit || '').toLowerCase().includes(inventorySearch.toLowerCase());
                    
                    let matchesStockLevel = true;
                    if (inventoryStockFilter === 'low') {
                      matchesStockLevel = (item.stock ?? 0) <= (item.lowStockThreshold ?? 5);
                    } else if (inventoryStockFilter === 'out') {
                      matchesStockLevel = (item.stock ?? 0) === 0;
                    } else if (inventoryStockFilter === 'healthy') {
                      matchesStockLevel = (item.stock ?? 0) > (item.lowStockThreshold ?? 5);
                    }

                    return matchesCategory && matchesSearch && matchesStockLevel;
                  })
                  .sort((a, b) => {
                    if (inventorySortOrder === 'asc') {
                      return (a.stock ?? 0) - (b.stock ?? 0);
                    }
                    if (inventorySortOrder === 'desc') {
                      return (b.stock ?? 0) - (a.stock ?? 0);
                    }
                    return 0;
                  })
                  .map((item, idx) => {
                    const isLow = (item.stock ?? 0) <= (item.lowStockThreshold ?? 5) && (item.stock ?? 0) > 0;
                    const isOut = (item.stock ?? 0) === 0;
                    const itemColorHex = item.colorHex || detectColorFromName(item.name);

                    return (
                      <tr key={item.id ? `${item.id}-${idx}` : `inv-${idx}`} className="hover:bg-[#FCFAF8] transition-colors">
                        <td className="py-3 px-2 font-bold text-[#2D2A2E]">
                          <div className="flex items-center gap-2">
                            {itemColorHex && (
                              <span 
                                className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs shrink-0" 
                                style={{ backgroundColor: itemColorHex }}
                                title={`Color swatch: ${itemColorHex}`}
                              />
                            )}
                            <span>{item.name || 'Unnamed Item'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-[#5C5552] capitalize">
                          <span className="px-2 py-0.5 rounded-md bg-[#FAF6F0] text-[11px] text-[#5C5552] border border-[#E8E2DA]/60">
                            {(item.category || 'general').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold ${
                            isOut
                              ? 'bg-red-100 text-red-800'
                              : isLow 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-[#FAF6F0] text-[#2D2A2E]'
                          }`}>
                            {item.stock ?? 0} {item.unit || 'pcs'}
                            {(isLow || isOut) && <AlertTriangle className="w-3 h-3 text-red-500" />}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-[#7C7472]">
                          ≤ {item.lowStockThreshold ?? 5} {item.unit || 'pcs'}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <div className="inline-flex items-center gap-1 select-none">
                            <button
                              type="button"
                              onClick={() => handleAdjustInventory(item.id, -5)}
                              title="Decrease stock by 5"
                              className="w-7 h-7 rounded-lg bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD] active:scale-90 font-semibold text-[11px] select-none touch-manipulation transition-all cursor-pointer shadow-2xs"
                            >
                              -5
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustInventory(item.id, -1)}
                              title="Decrease stock by 1"
                              className="w-7 h-7 rounded-lg bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD] active:scale-90 select-none touch-manipulation transition-all cursor-pointer shadow-2xs"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustInventory(item.id, 1)}
                              title="Increase stock by 1"
                              className="w-7 h-7 rounded-lg bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD] active:scale-90 select-none touch-manipulation transition-all cursor-pointer shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustInventory(item.id, 5)}
                              title="Increase stock by 5"
                              className="w-7 h-7 rounded-lg bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD] active:scale-90 font-semibold text-[11px] select-none touch-manipulation transition-all cursor-pointer shadow-2xs"
                            >
                              +5
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustInventory(item.id, 10)}
                              title="Increase stock by 10"
                              className="w-7 h-7 rounded-lg bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD] active:scale-90 font-semibold text-[11px] select-none touch-manipulation transition-all cursor-pointer shadow-2xs"
                            >
                              +10
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingInventoryItem(item);
                                setEditingInvColorHex(item.colorHex || detectColorFromName(item.name) || '#F4A6B0');
                              }}
                              title="Edit item name, color, exact stock quantity, or threshold"
                              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#FAF6F0] border border-[#E8E2DA] text-[#2D2A2E] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-[#5C5552]" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setInventoryItemToDelete(item)}
                              title="Delete this supply from inventory database"
                              className="p-1.5 rounded-lg bg-white hover:bg-red-50 border border-red-200 text-red-600 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            {inventory.length === 0 && (
              <div className="py-12 text-center text-[#7C7472] space-y-3">
                <p>No inventory supplies found in database.</p>
                <button
                  type="button"
                  onClick={handleRefreshInventory}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#2D2A2E] text-white cursor-pointer"
                >
                  Refresh Supplies from Database
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD NEW INVENTORY ITEM */}
      {/* ========================================================= */}
      {isAddingInventory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-[#F0D9DD] shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F0D9DD] pb-3">
              <div className="flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-[#F4A6B0]" />
                <h3 className="font-serif-title text-xl font-bold text-[#2D2A2E]">Add Supply Item</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingInventory(false)}
                className="p-1 text-[#7C7472] hover:text-black rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewInventory} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#2D2A2E] block mb-1">Item / Material Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Satin Ribbon - Lavender Frost"
                  value={newInvName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewInvName(val);
                    const auto = detectColorFromName(val);
                    if (auto) {
                      setNewInvColorHex(auto);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
                />
                <p className="text-[10px] text-[#7C7472] mt-1">
                  💡 Tip: Typing color names (e.g. &apos;Lavender&apos;, &apos;Sage Green&apos;, &apos;Rose&apos;) automatically suggests the matching shade.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#2D2A2E] block mb-1">Category</label>
                  <select
                    value={newInvCategory}
                    onChange={(e) => setNewInvCategory(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
                  >
                    <option value="flower">Flower Heads</option>
                    <option value="color">Satin Ribbon Colors</option>
                    <option value="wrapper">Bouquet Wrappers</option>
                    <option value="ribbon">5cm Ribbon Ties</option>
                    <option value="craft_supply">Craft / Floristry Supplies</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[#2D2A2E] block mb-1">Unit of Measure</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. pcs, rolls, sheets, meters"
                    value={newInvUnit}
                    onChange={(e) => setNewInvUnit(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
                  />
                </div>
              </div>

              {/* Color Swatch & Storefront Preview (For flower, color, wrapper, ribbon) */}
              <div className="p-3.5 rounded-2xl bg-[#FCFAF8] border border-[#E8E2DA] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#2D2A2E] flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#F4A6B0]" />
                    <span>Color Swatch & Storefront Preview</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="w-4 h-4 rounded-full border border-black/20 shadow-2xs" 
                      style={{ backgroundColor: newInvColorHex }} 
                    />
                    <span className="font-mono text-[11px] text-[#5C5552]">{newInvColorHex}</span>
                  </div>
                </div>

                {/* Preset Floral & Ribbon Color Swatches */}
                <div>
                  <span className="text-[10px] text-[#7C7472] block mb-1.5">
                    Select a preset or click the custom picker:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_FLORAL_COLORS.map((preset) => {
                      const isChosen = newInvColorHex.toLowerCase() === preset.hex.toLowerCase();
                      return (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => setNewInvColorHex(preset.hex)}
                          title={`${preset.name} (${preset.hex})`}
                          className={`w-6 h-6 rounded-full border transition-all cursor-pointer relative ${
                            isChosen ? 'ring-2 ring-[#2D2A2E] scale-110 shadow-xs' : 'border-black/15 hover:scale-105'
                          }`}
                          style={{ backgroundColor: preset.hex }}
                        >
                          {isChosen && (
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white drop-shadow-md">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Color Input */}
                <div className="flex items-center gap-2 pt-1 border-t border-[#E8E2DA]/60">
                  <input
                    type="color"
                    value={newInvColorHex}
                    onChange={(e) => setNewInvColorHex(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-[#E8E2DA] p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={newInvColorHex}
                    onChange={(e) => setNewInvColorHex(e.target.value)}
                    placeholder="#HEX Code"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-[#E8E2DA] font-mono text-xs"
                  />
                  <div 
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-black/10 flex items-center gap-1.5 shadow-2xs"
                    style={{ backgroundColor: `${newInvColorHex}25`, color: '#2D2A2E' }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: newInvColorHex }} />
                    <span>Storefront Preview</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#2D2A2E] block mb-1">Initial Stock Count</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newInvStock}
                    onChange={(e) => setNewInvStock(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#2D2A2E] block mb-1">Low Stock Threshold</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newInvThreshold}
                    onChange={(e) => setNewInvThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#F0D9DD]">
                <button
                  type="button"
                  onClick={() => setIsAddingInventory(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#FAF6F0] hover:bg-[#E8E2DA] text-[#5C5552] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#2D2A2E] hover:bg-black text-white shadow-xs cursor-pointer"
                >
                  Save Item to Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EDIT INVENTORY ITEM & EXACT STOCK */}
      {/* ========================================================= */}
      {editingInventoryItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-[#F0D9DD] shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F0D9DD] pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#F4A6B0]" />
                <h3 className="font-serif-title text-xl font-bold text-[#2D2A2E]">Edit Supply Stock</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingInventoryItem(null)}
                className="p-1 text-[#7C7472] hover:text-black rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditInventory} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#2D2A2E] block mb-1">Item / Material Name</label>
                <input
                  type="text"
                  required
                  value={editingInventoryItem.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditingInventoryItem({ ...editingInventoryItem, name: val });
                    const auto = detectColorFromName(val);
                    if (auto && !editingInventoryItem.colorHex) {
                      setEditingInvColorHex(auto);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#2D2A2E] block mb-1">Category</label>
                  <select
                    value={editingInventoryItem.category}
                    onChange={(e) => setEditingInventoryItem({ ...editingInventoryItem, category: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
                  >
                    <option value="flower">Flower Heads</option>
                    <option value="color">Satin Ribbon Colors</option>
                    <option value="wrapper">Bouquet Wrappers</option>
                    <option value="ribbon">5cm Ribbon Ties</option>
                    <option value="craft_supply">Craft / Floristry Supplies</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[#2D2A2E] block mb-1">Unit of Measure</label>
                  <input
                    type="text"
                    required
                    value={editingInventoryItem.unit}
                    onChange={(e) => setEditingInventoryItem({ ...editingInventoryItem, unit: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
                  />
                </div>
              </div>

              {/* Color Swatch & Palette for Editing */}
              <div className="p-3.5 rounded-2xl bg-[#FCFAF8] border border-[#E8E2DA] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#2D2A2E] flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#F4A6B0]" />
                    <span>Color Swatch & Storefront Color</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="w-4 h-4 rounded-full border border-black/20 shadow-2xs" 
                      style={{ backgroundColor: editingInvColorHex }} 
                    />
                    <span className="font-mono text-[11px] text-[#5C5552]">{editingInvColorHex}</span>
                  </div>
                </div>

                {/* Preset Floral Swatches */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_FLORAL_COLORS.map((preset) => {
                    const isChosen = editingInvColorHex.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setEditingInvColorHex(preset.hex)}
                        title={`${preset.name} (${preset.hex})`}
                        className={`w-6 h-6 rounded-full border transition-all cursor-pointer relative ${
                          isChosen ? 'ring-2 ring-[#2D2A2E] scale-110 shadow-xs' : 'border-black/15 hover:scale-105'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      >
                        {isChosen && (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white drop-shadow-md">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-[#E8E2DA]/60">
                  <input
                    type="color"
                    value={editingInvColorHex}
                    onChange={(e) => setEditingInvColorHex(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-[#E8E2DA] p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={editingInvColorHex}
                    onChange={(e) => setEditingInvColorHex(e.target.value)}
                    placeholder="#HEX Code"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-[#E8E2DA] font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#2D2A2E] block mb-1">
                    Current Stock Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingInventoryItem.stock}
                    onChange={(e) => setEditingInventoryItem({ ...editingInventoryItem, stock: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0] font-bold text-sm"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#2D2A2E] block mb-1">
                    Low Stock Threshold
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingInventoryItem.lowStockThreshold}
                    onChange={(e) => setEditingInventoryItem({ ...editingInventoryItem, lowStockThreshold: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#F4A6B0]"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-[#F0D9DD]">
                <button
                  type="button"
                  onClick={() => {
                    const target = editingInventoryItem;
                    setEditingInventoryItem(null);
                    setInventoryItemToDelete(target);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Item</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingInventoryItem(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#FAF6F0] hover:bg-[#E8E2DA] text-[#5C5552] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#2D2A2E] hover:bg-black text-white shadow-xs cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DELETE INVENTORY ITEM CONFIRMATION */}
      {/* ========================================================= */}
      {inventoryItemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-red-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 rounded-2xl bg-red-100">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-serif-title text-xl font-bold text-[#2D2A2E]">Delete Stock Supply?</h3>
                <p className="text-xs text-[#7C7472]">This action removes the item from the database.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-950 space-y-2">
              <p>
                Are you sure you want to permanently delete <strong>&apos;{inventoryItemToDelete.name}&apos;</strong> ({inventoryItemToDelete.stock} {inventoryItemToDelete.unit}) from your inventory?
              </p>
              <p className="text-[11px] text-red-700">
                ⚠️ If this supply represents an active color or wrapper on the storefront, customers will no longer be able to select it for custom bouquets.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#F0D9DD]">
              <button
                type="button"
                onClick={() => setInventoryItemToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#FAF6F0] hover:bg-[#E8E2DA] text-[#5C5552] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteInventoryItem}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Stock</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PANEL 7: SALES & TRANSACTION MANAGEMENT */}
      {/* ========================================================= */}
      {activeTab === 'sales' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-xs space-y-6"
        >
          <div>
            <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
              Sales & Earnings
            </h3>
            <p className="text-xs text-[#5C5552]">
              Your sales summary, payment methods, and daily earnings.
            </p>
          </div>

          {/* Metrics summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA]">
              <span className="text-[11px] font-bold text-[#7C7472] uppercase">Total Sales</span>
              <p className="font-serif-title text-2xl font-bold text-[#2D2A2E] mt-1">₱{(grossSales ?? 0).toLocaleString()}</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#A8D5C0]/30 border border-[#A8D5C0]">
              <span className="text-[11px] font-bold text-[#1D5E43] uppercase">Payments Received</span>
              <p className="font-serif-title text-2xl font-bold text-[#1D5E43] mt-1">₱{(totalPaid ?? 0).toLocaleString()}</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#F0D9DD]/40 border border-[#F0D9DD]">
              <span className="text-[11px] font-bold text-[#7A4B53] uppercase">Pending Balance</span>
              <p className="font-serif-title text-2xl font-bold text-[#7A4B53] mt-1">₱{(totalBalance ?? 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Transactions List */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#F0D9DD] text-[#7C7472] uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-2">Order ID</th>
                  <th className="py-3 px-2">Date</th>
                  <th className="py-3 px-2">Customer</th>
                  <th className="py-3 px-2">Payment Mode</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0D9DD]/50">
                {orders.map((o, idx) => (
                  <tr key={o.id ? `${o.id}-${idx}` : `sales-row-${idx}`} className="hover:bg-[#FCFAF8]">
                    <td className="py-3 px-2 font-bold text-[#2D2A2E]">#{o.id}</td>
                    <td className="py-3 px-2 text-[#7C7472]">{safeFormatDate(o.createdAt)}</td>
                    <td className="py-3 px-2 text-[#2D2A2E]">{o.customerInfo?.name || 'Customer'}</td>
                    <td className="py-3 px-2 text-[#5C5552]">{o.paymentMode || 'N/A'}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                        o.paymentStatus === 'paid' ? 'bg-[#A8D5C0] text-[#1D5E43]' : 'bg-[#F0D9DD] text-[#7A4B53]'
                      }`}>
                        {o.paymentStatus || 'pending'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right font-bold text-[#2D2A2E]">
                      ₱{(o.totalAmount ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ========================================================= */}
      {/* PANEL 9: STUDIO PROFILE, ADDRESS & CONTACT SETTINGS */}
      {/* ========================================================= */}
      {activeTab === 'settings' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          {/* Main Settings Card */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0D9DD] shadow-xs space-y-6">
            
            {/* Header with Save Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0D9DD]">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF6F0] text-[11px] font-bold text-[#70640F] border border-[#E8DF97] mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#C98A12]" />
                  <span>Live Storefront & Checkout Sync</span>
                </div>
                <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                  Studio Profile & Contact Information
                </h3>
                <p className="text-xs text-[#5C5552]">
                  Update your contact phone number, studio pickup address, email, and founder story. Any changes will immediately reflect on the Checkout page, Storefront, and Website Footer.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleSaveOwnerProfile()}
                disabled={savingProfile}
                className="px-6 py-2.5 rounded-2xl bg-[#2D2A2E] hover:bg-[#3D3A3E] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Check className="w-4 h-4 text-[#A8D5C0]" />
                <span>{savingProfile ? 'Saving Changes...' : 'Save All Changes'}</span>
              </button>
            </div>

            {/* Section 1: Contact Coordinates & Physical Address */}
            <div className="p-5 rounded-2xl bg-[#FCFAF8] border border-[#F0D9DD] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-serif-title font-bold text-base text-[#2D2A2E] flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#C95567]" />
                  <span>Contact Coordinates & Pickup Address</span>
                </h4>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#F5EFC0] text-[#70640F]">
                  Used for GCash & Customer Coordination
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                    Contact Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-[#A89E9C] absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={profileForm.contactPhone}
                      onChange={(e) => setProfileForm({ ...profileForm, contactPhone: e.target.value })}
                      placeholder="+63 912 345 6789"
                      className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] font-medium"
                    />
                  </div>
                  <p className="text-[10px] text-[#7C7472] mt-1">
                    Displayed on Checkout as the GCash account recipient number and customer helpline.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                    Studio Contact Email *
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-[#A89E9C] absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={profileForm.contactEmail}
                      onChange={(e) => setProfileForm({ ...profileForm, contactEmail: e.target.value })}
                      placeholder="allyson@lypetal.com"
                      className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] font-medium"
                    />
                  </div>
                  <p className="text-[10px] text-[#7C7472] mt-1">
                    Official studio email address shown in the footer and receipt communications.
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                    Studio Pickup & Delivery Location Address *
                  </label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-[#A89E9C] absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={profileForm.pickupAddress}
                      onChange={(e) => setProfileForm({ ...profileForm, pickupAddress: e.target.value })}
                      placeholder="Block 4, Lot 12, Dahlia St., San Pedro, Laguna, Philippines"
                      className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] font-medium"
                    />
                  </div>
                  <p className="text-[10px] text-[#7C7472] mt-1">
                    Location provided to customers selecting Cash on Delivery / Studio Pick-up and displayed in the footer.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2: Founder Identity & Story Row */}
            <div className="p-5 rounded-2xl bg-[#FCFAF8] border border-[#F0D9DD] space-y-4">
              <h4 className="font-serif-title font-bold text-base text-[#2D2A2E] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#C98A12]" />
                <span>Founder Profile & Storytelling</span>
              </h4>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Photo Preview & Upload */}
                <div className="lg:col-span-4 p-4 rounded-2xl bg-white border border-[#E8E2DA] flex flex-col items-center text-center space-y-3">
                  <div className="relative w-36 h-36 rounded-2xl overflow-hidden border-2 border-[#F0D9DD] shadow-sm bg-[#FAF6F0]">
                    <img 
                      src={studioSettings?.ownerPhotoUrl || '/Allyson.jpg'} 
                      alt="Allyson Profile Preview" 
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="w-full space-y-2">
                    <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2D2A2E] hover:bg-black text-white text-xs font-bold cursor-pointer shadow-xs transition-all">
                      <Upload className="w-3.5 h-3.5 text-[#F4A6B0]" />
                      <span>Upload Profile Photo</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleOwnerPhotoUpload(file);
                        }} 
                      />
                    </label>
                    <p className="text-[10px] text-[#7C7472] leading-tight">
                      PNG or JPG • Instant live preview
                    </p>
                  </div>
                </div>

                {/* Identity Fields */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                        Owner / Maker Name
                      </label>
                      <input
                        type="text"
                        value={profileForm.ownerName}
                        onChange={(e) => setProfileForm({ ...profileForm, ownerName: e.target.value })}
                        placeholder="Allyson"
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                        Title / Role
                      </label>
                      <input
                        type="text"
                        value={profileForm.ownerTitle}
                        onChange={(e) => setProfileForm({ ...profileForm, ownerTitle: e.target.value })}
                        placeholder="Founder & Artisan Florist"
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] font-medium"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                        Business / Studio Name
                      </label>
                      <input
                        type="text"
                        value={profileForm.businessName}
                        onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
                        placeholder="LYPetal Flower Studio"
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] font-medium"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                        Headline Quote / Tagline
                      </label>
                      <input
                        type="text"
                        value={profileForm.headline}
                        onChange={(e) => setProfileForm({ ...profileForm, headline: e.target.value })}
                        placeholder='"Every flower tells a story that stays with you."'
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] font-serif-title font-medium"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio & Craft Story Textareas */}
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                    Introduction Bio (First Paragraph Greeting on Homepage)
                  </label>
                  <textarea
                    rows={3}
                    value={profileForm.ownerIntro}
                    onChange={(e) => setProfileForm({ ...profileForm, ownerIntro: e.target.value })}
                    placeholder="Hi! I am Allyson, the maker behind LYPetal..."
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] leading-relaxed resize-y"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                    Studio Crafting Story & Process (Second Paragraph)
                  </label>
                  <textarea
                    rows={3}
                    value={profileForm.story}
                    onChange={(e) => setProfileForm({ ...profileForm, story: e.target.value })}
                    placeholder="Everything is made by hand in San Pedro, Laguna..."
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] leading-relaxed resize-y"
                  />
                </div>

                {/* Social Media Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                      Facebook Page URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={profileForm.facebookPage}
                      onChange={(e) => setProfileForm({ ...profileForm, facebookPage: e.target.value })}
                      placeholder="https://facebook.com/lypetal.studio"
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                      Instagram Handle (Optional)
                    </label>
                    <input
                      type="text"
                      value={profileForm.instagramHandle}
                      onChange={(e) => setProfileForm({ ...profileForm, instagramHandle: e.target.value })}
                      placeholder="@lypetal.flowers"
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E]"
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* Section 3: Security & Trusted Browsers */}
            <div className="p-5 rounded-2xl bg-[#FCFAF8] border border-[#F0D9DD] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-serif-title font-bold text-base text-[#2D2A2E] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Security &amp; Trusted Browsers</span>
                </h4>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  30-Day Browser Trust
                </span>
              </div>

              <p className="text-xs text-[#5C5552] leading-relaxed">
                When you check <em>&quot;Trust this browser for 30 days&quot;</em> during login, a cryptographically secure token is stored to allow seamless login without entering the 4-digit code.
              </p>

              {/* 2FA Verification Recipient Emails & Custom Sender */}
              <div className="pt-2 border-t border-[#F0D9DD]/70 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                    2FA Verification Code Email Recipients (Owner &amp; Admins) *
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-[#A89E9C] absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={profileForm.twoFactorEmails}
                      onChange={(e) => setProfileForm({ ...profileForm, twoFactorEmails: e.target.value })}
                      placeholder="colum00r@gmail.com, hanzgonzales125@gmail.com, allyson@lypetal.com"
                      className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] font-medium"
                    />
                  </div>
                  <p className="text-[10px] text-[#7C7472] mt-1">
                    Put which email(s) should be receiving the 4-digit 2FA login code. You can list multiple owner and admin emails separated by commas (e.g. <code>colum00r@gmail.com, hanzgonzales125@gmail.com, allyson@lypetal.com</code>).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                    Custom Storefront Sender Address (Optional)
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-[#A89E9C] absolute left-3.5 top-3" />
                    <input
                      type="email"
                      value={profileForm.senderEmail}
                      onChange={(e) => setProfileForm({ ...profileForm, senderEmail: e.target.value })}
                      placeholder="receipts@lypetal.com or studio@lypetal.com"
                      className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] font-medium"
                    />
                  </div>
                  <p className="text-[10px] text-[#7C7472] mt-1">
                    Controls which email address is used when sending receipts and status updates instead of default Gmail.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-[#E8E2DA] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-[#2D2A2E]">Active Trusted Browsers</div>
                  <div className="text-[11px] text-[#7C7472]">
                    Lost a device or want to force 4-digit verification across all devices?
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRevokeTrustedDevices}
                  disabled={isRevokingTrustedDevices}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isRevokingTrustedDevices ? 'Revoking...' : 'Log Out of All Trusted Browsers'}</span>
                </button>
              </div>
            </div>

            {/* Section 4: Studio Owner Password Setup & Management */}
            <div className="p-5 rounded-2xl bg-[#FCFAF8] border border-[#F0D9DD] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-serif-title font-bold text-base text-[#2D2A2E] flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#C95567]" />
                  <span>Owner Account Password</span>
                </h4>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">
                  Direct Login Credentials
                </span>
              </div>

              <p className="text-xs text-[#5C5552] leading-relaxed">
                Set or change the password for your studio owner account (<strong>{auth.currentUser?.email || user?.email || ownerEmail}</strong>). This enables direct email + password login to the Owner Portal without relying on Google Sign-In.
              </p>

              {dashboardPasswordSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium leading-relaxed">
                  {dashboardPasswordSuccess}
                </div>
              )}

              {dashboardPasswordError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium leading-relaxed">
                  {dashboardPasswordError}
                </div>
              )}

              <form onSubmit={handleUpdateDashboardPassword} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newDashboardPassword}
                    onChange={(e) => setNewDashboardPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2D2A2E] mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmDashboardPassword}
                    onChange={(e) => setConfirmDashboardPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E]"
                  />
                </div>

                <div className="sm:col-span-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={isUpdatingDashboardPassword || !newDashboardPassword}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-[#2D2A2E] bg-[#F5EFC0] hover:bg-[#E8DF97] border border-[#E8DF97] transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{isUpdatingDashboardPassword ? 'Updating Password...' : 'Save New Password'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendPasswordReset}
                    disabled={isSendingPasswordReset}
                    className="text-xs text-[#7C7472] hover:text-[#2D2A2E] underline cursor-pointer"
                  >
                    {isSendingPasswordReset ? 'Sending link...' : 'Or email me a password reset link'}
                  </button>
                </div>
              </form>
            </div>

            {/* Bottom Save Action Bar */}
            <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-[#F0D9DD]">
              <p className="text-xs text-[#7C7472]">
                Changes save securely to the database and sync live to all customers.
              </p>

              <button
                type="button"
                onClick={() => handleSaveOwnerProfile()}
                disabled={savingProfile}
                className="px-8 py-3 rounded-2xl bg-[#2D2A2E] hover:bg-[#3D3A3E] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4 text-[#A8D5C0]" />
                <span>{savingProfile ? 'Saving All Changes...' : 'Save All Changes'}</span>
              </button>
            </div>

          </div>
        </motion.div>
      )}

        </main>
      </div>

      {/* ========================================================= */}
      {/* IN-APP MODAL: REVOKE ALL TRUSTED BROWSERS */}
      {/* ========================================================= */}
      {showRevokeConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-rose-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6 text-rose-600" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-serif-title font-bold text-xl text-[#2D2A2E]">
                Log Out of All Trusted Browsers?
              </h3>
              <p className="text-xs text-[#5C5552] leading-relaxed">
                This will immediately invalidate all active 30-day tokens across all devices. Next time you or anyone signs in, password authentication and the 4-digit code will be strictly required.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-normal flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Use this if you lost a laptop, phone, or want to secure your account across all browsers.</span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRevokeConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors border border-stone-200 cursor-pointer"
              >
                Keep Trust
              </button>
              <button
                type="button"
                onClick={executeRevokeTrustedDevices}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Revoke All Devices</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IN-APP MODAL: VOID & CANCEL ORDER */}
      {/* ========================================================= */}
      {orderToVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0D9DD]">
              <div className="flex items-center gap-2 text-red-700 font-bold text-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>Void / Cancel Order #{orderToVoid.id}</span>
              </div>
              <button 
                type="button"
                onClick={() => setOrderToVoid(null)}
                className="p-1 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#5C5552] leading-relaxed">
              This order will be removed from Active Production & Order Ledger and moved into the <strong>Cancelled / Void Orders</strong> table. It will remain securely logged in the database and hidden from the customer storefront.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#2D2A2E]">Cancellation / Void Reason:</label>
              <textarea
                value={orderToVoid.reason}
                onChange={(e) => setOrderToVoid({ ...orderToVoid, reason: e.target.value })}
                rows={3}
                placeholder="e.g. Customer requested cancellation, out of requested ribbon hue, etc."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:outline-hidden focus:border-[#C95567]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setOrderToVoid(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={confirmVoidOrder}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span>Confirm Void Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IN-APP MODAL: PERMANENTLY DELETE ORDER */}
      {/* ========================================================= */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-red-300 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-lg text-[#2D2A2E]">
                Permanently Delete Order #{orderToDelete}?
              </h3>
              <p className="text-xs text-[#7C7472] leading-relaxed">
                This will permanently delete Order #{orderToDelete} from Cloud Firestore, Realtime Database, and local cache. <strong>It will never show up in the dashboard again.</strong>
              </p>
            </div>

            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-[11px] text-red-800 leading-normal">
              <strong>Warning:</strong> This action cannot be undone. If you only want to cancel the order, use the "Void" feature instead.
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors border border-stone-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPermanentDeleteOrder}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IN-APP MODAL: REINSTATE ORDER */}
      {/* ========================================================= */}
      {orderToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-emerald-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <RefreshCw className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-lg text-[#2D2A2E]">
                Reinstate Order #{orderToRestore}?
              </h3>
              <p className="text-xs text-[#7C7472] leading-relaxed">
                This will return Order #{orderToRestore} back to the <strong>Active Orders Ledger & Production Pipeline</strong> with status reset to <em>Pending</em>.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOrderToRestore(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors border border-stone-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRestoreOrder}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Reinstate Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IN-APP MODAL: ADD / EDIT FLOWER PRODUCT */}
      {/* ========================================================= */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#F0D9DD] my-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0D9DD]">
              <div>
                <h3 className="font-serif-title text-xl font-bold text-[#2D2A2E]">
                  {editingProductId ? 'Edit Flower / Product' : 'Add New Handcrafted Flower'}
                </h3>
                <p className="text-xs text-[#5C5552]">
                  {editingProductId ? 'Update flower details, base pricing, or hue options.' : 'Create a new satin ribbon flower design for your catalog and storefront.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setProductModalOpen(false); setEditingProductId(null); }}
                className="p-1 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              {/* Flower Name & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2D2A2E]">Flower / Design Name *</label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    placeholder="e.g. Satin Ribbon Peony"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:border-[#C95567] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2D2A2E]">Flower Category / Type *</label>
                  <select
                    value={productForm.flowerType}
                    onChange={(e) => setProductForm({ ...productForm, flowerType: e.target.value as FlowerType })}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:border-[#C95567] focus:outline-hidden"
                  >
                    <option value="rose">Rose</option>
                    <option value="dahlia">Dahlia</option>
                    <option value="tulip">Tulip</option>
                    <option value="peony">Peony</option>
                    <option value="sunflower">Sunflower</option>
                    <option value="carnation">Carnation</option>
                    <option value="lily">Lily</option>
                    <option value="custom">Custom Bloom</option>
                  </select>
                </div>
              </div>

              {/* Base Price & Badge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2D2A2E]">Base Price (₱) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={productForm.basePrice}
                    onChange={(e) => setProductForm({ ...productForm, basePrice: Number(e.target.value) })}
                    placeholder="75"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:border-[#C95567] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2D2A2E]">Stem Badge / Tag</label>
                  <input
                    type="text"
                    value={productForm.badge}
                    onChange={(e) => setProductForm({ ...productForm, badge: e.target.value })}
                    placeholder="e.g. 1 pc stem, Signature, New Bloom"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:border-[#C95567] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2D2A2E]">Story & Description</label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  rows={2}
                  placeholder="Artisan handcrafted single stem folded with premium lustrous satin ribbon..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#FCFAF8] border border-[#E8E2DA] focus:border-[#C95567] focus:outline-hidden"
                />
              </div>

              {/* Available Hues Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#2D2A2E]">
                    Available Ribbon Colors ({productForm.availableColors.length} selected)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (productForm.availableColors.length === ALL_FLOWER_COLORS.length) {
                        setProductForm({ ...productForm, availableColors: ['Pastel Pink'] });
                      } else {
                        setProductForm({ ...productForm, availableColors: [...ALL_FLOWER_COLORS] });
                      }
                    }}
                    className="text-[11px] text-[#C95567] hover:underline cursor-pointer"
                  >
                    {productForm.availableColors.length === ALL_FLOWER_COLORS.length ? 'Reset to Default' : 'Select All Colors'}
                  </button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ALL_FLOWER_COLORS.map((c) => {
                    const isChecked = productForm.availableColors.includes(c);
                    return (
                      <label
                        key={c}
                        className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 cursor-pointer transition-all ${
                          isChecked 
                            ? 'bg-[#FDF4F5] border-[#F4A6B0] text-[#8C2435] font-semibold' 
                            : 'bg-white border-[#E8E2DA] text-stone-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setProductForm({ ...productForm, availableColors: [...productForm.availableColors, c] });
                            } else {
                              if (productForm.availableColors.length > 1) {
                                setProductForm({ ...productForm, availableColors: productForm.availableColors.filter(col => col !== c) });
                              }
                            }
                          }}
                          className="rounded text-[#C95567] focus:ring-0"
                        />
                        <span className="truncate">{c}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Photo Section */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-[#2D2A2E]">Product Photo</label>
                
                {/* Preview & Upload */}
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="w-36 h-28 rounded-2xl overflow-hidden bg-[#FAF6F0] border border-[#E8E2DA] shrink-0 relative">
                    <img
                      src={productForm.imageUrl}
                      alt="Preview"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 space-y-2 w-full">
                    {/* Upload File Button */}
                    <label className="w-full px-4 py-2.5 rounded-xl border border-dashed border-[#F4A6B0] bg-[#FFF5F6] hover:bg-[#FFEAEF] text-[#8C2435] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all">
                      <Upload className="w-4 h-4 text-[#C95567]" />
                      <span>Upload Custom Photo from Device</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result === 'string') {
                                setProductForm(prev => ({ ...prev, imageUrl: reader.result as string }));
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    {/* Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-stone-500 font-medium">Or choose a preset:</span>
                      {FLOWER_PRESET_IMAGES.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setProductForm({ ...productForm, imageUrl: preset.url })}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                            productForm.imageUrl === preset.url
                              ? 'bg-[#2D2A2E] text-white border-[#2D2A2E]'
                              : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Status */}
              <div className="pt-2 flex items-center justify-between border-t border-stone-100">
                <div>
                  <label className="text-xs font-bold text-[#2D2A2E] block">Show in Storefront Catalog</label>
                  <span className="text-[11px] text-stone-500">When enabled, customers can view and add this flower to orders.</span>
                </div>
                <input
                  type="checkbox"
                  checked={productForm.active}
                  onChange={(e) => setProductForm({ ...productForm, active: e.target.checked })}
                  className="w-4 h-4 text-[#C95567] rounded cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#F0D9DD]">
                <button
                  type="button"
                  onClick={() => { setProductModalOpen(false); setEditingProductId(null); }}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#2D2A2E] hover:bg-[#3D3A3E] shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4 text-[#F4A6B0]" />
                  <span>{editingProductId ? 'Save Changes' : 'Add to Catalog'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IN-APP MODAL: CONFIRM DELETE PRODUCT */}
      {/* ========================================================= */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-red-300 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-lg text-[#2D2A2E]">
                Remove "{productToDelete.name}" from Catalog?
              </h3>
              <p className="text-xs text-[#7C7472] leading-relaxed">
                This flower design will be deleted from your studio catalog and removed from the customer storefront.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors border border-stone-200 cursor-pointer"
              >
                Keep Flower
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProduct}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Flower</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Order Chat Quick-Access Button (PC, Tablet & Mobile) */}
      {!isChatDrawerOpen && (
        <button
          type="button"
          onClick={() => {
            const activeOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'delivered');
            if ((!selectedChatOrderId || !activeOrders.some(o => o.id === selectedChatOrderId)) && activeOrders.length > 0) {
              setSelectedChatOrderId(activeOrders[0].id);
            }
            setIsChatDrawerOpen(true);
          }}
          className="fixed bottom-5 right-5 z-[9999] px-4 sm:px-5 py-3 rounded-full bg-[#2D2A2E] hover:bg-[#3D383C] text-[#F5EFC0] shadow-2xl border border-white/20 flex items-center gap-2 text-xs font-bold active:scale-95 transition-all cursor-pointer"
          aria-label="Open Order Chat"
        >
          <MessageSquare className="w-4 h-4 text-[#F5EFC0]" />
          <span>Order Chat</span>
          {totalUnreadCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#F4A6B0] text-[#2D2A2E] animate-bounce shadow-xs">
              {totalUnreadCount} {totalUnreadCount === 1 ? 'new' : 'new'}
            </span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Live Messaging Ready" />
          )}
        </button>
      )}

      {/* ========================================================= */}
      {/* FLOATING ORDER CHAT SLIDE-OVER DRAWER (PC, TABLET & MOBILE) */}
      {/* ========================================================= */}
      <AnimatePresence>
        {isChatDrawerOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-6">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
              onClick={() => setIsChatDrawerOpen(false)}
            />

            {/* Slide-over Panel */}
            <motion.div 
              initial={{ x: '100%', opacity: 0.8 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              style={{
                height: visualViewportHeight && typeof window !== 'undefined' && window.innerWidth < 640
                  ? `${visualViewportHeight}px`
                  : undefined
              }}
              className="relative w-full sm:w-[480px] lg:w-[540px] h-[90dvh] max-h-[100dvh] sm:h-[620px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col z-10 border border-[#F0D9DD] overflow-hidden transition-[height] duration-150 ease-out"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Chat Header */}
              <div className="p-4 sm:p-5 border-b border-[#F0D9DD] bg-[#2D2A2E] text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#F0D9DD]/20 text-[#F5EFC0] flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-[#F5EFC0]" />
                  </div>
                  <div>
                    <h3 className="font-serif-title font-bold text-base text-white flex items-center gap-2">
                      <span>Order Chat</span>
                      {selectedChatOrderId && (
                        <span className="text-xs font-sans font-normal text-[#F5EFC0]">
                          (#{selectedChatOrderId})
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-[#A89E9C]">Real-time customer messaging</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsChatDrawerOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-[#A89E9C] hover:text-white transition-colors cursor-pointer"
                  aria-label="Close chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Order Quick Selector Tabs (Excludes cancelled & delivered orders) */}
              <div className="p-3 border-b border-[#F0D9DD] bg-[#FAF6F0] flex items-center gap-2 overflow-x-auto scrollbar-thin">
                {(() => {
                  const activeChatOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'delivered');
                  if (activeChatOrders.length === 0) {
                    return <span className="text-xs text-[#7C7472] px-2 py-1">No active order chats</span>;
                  }
                  return activeChatOrders.map((o) => {
                    const isSelected = selectedChatOrderId === o.id;
                    const unreadCount = unreadOrderMap[o.id] || 0;
                    return (
                      <button
                        key={`chat-tab-${o.id}`}
                        type="button"
                        onClick={() => setSelectedChatOrderId(o.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5 cursor-pointer relative ${
                          isSelected
                            ? 'bg-[#2D2A2E] text-white shadow-xs'
                            : 'bg-white hover:bg-[#F0D9DD]/50 text-[#5C5552] border border-[#E8E2DA]'
                        }`}
                      >
                        <span>#{o.id}</span>
                        <span className="text-[10px] opacity-80">({o.customerInfo?.name || 'Customer'})</span>
                        {unreadCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-[#F4A6B0] text-[#2D2A2E] animate-pulse">
                            {unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Message Stream */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-[#FCFAF8]">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-[#7C7472]">
                    <div className="w-12 h-12 rounded-2xl bg-[#F0D9DD]/40 text-[#7A4B53] flex items-center justify-center mb-3">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-[#2D2A2E]">
                      {selectedChatOrderId ? `No messages yet for Order #${selectedChatOrderId}` : 'Select an order above'}
                    </p>
                    <p className="text-[11px] text-[#A89E9C] mt-1 max-w-xs">
                      Send a message below to update your customer on their flower bouquet.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((m, idx) => {
                    const isOwner = m.senderRole === 'owner';
                    return (
                      <div
                        key={m.id ? `${m.id}-${idx}` : `chat-msg-${idx}`}
                        className={`flex flex-col ${isOwner ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-[#7C7472]">
                          <span className="font-semibold text-[#2D2A2E]">{m.senderName}</span>
                          <span>• {safeFormatTime(m.createdAt)}</span>
                        </div>
                        <div className={`p-3.5 rounded-2xl max-w-sm text-xs leading-relaxed ${
                          isOwner
                            ? 'bg-[#2D2A2E] text-white rounded-tr-xs shadow-xs'
                            : 'bg-white text-[#2D2A2E] rounded-tl-xs border border-[#E8E2DA] shadow-2xs'
                        }`}>
                          {m.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              {/* Reply Input Bar */}
              <form onSubmit={handleSendOwnerReply} className="p-3.5 border-t border-[#F0D9DD] bg-white flex gap-2 shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                <input
                  type="text"
                  value={ownerReplyText}
                  onChange={(e) => setOwnerReplyText(e.target.value)}
                  onFocus={(e) => {
                    setTimeout(() => {
                      e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }, 150);
                  }}
                  placeholder={selectedChatOrderId ? `Reply to customer for Order #${selectedChatOrderId}...` : 'Select an order to reply...'}
                  disabled={!selectedChatOrderId}
                  className="flex-1 px-4 py-2.5 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!ownerReplyText.trim() || !selectedChatOrderId}
                  className="py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] flex items-center gap-1.5 disabled:opacity-50 shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
