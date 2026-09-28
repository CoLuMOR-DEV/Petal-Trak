import { ref, set, onValue, update, push, get } from 'firebase/database';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  onSnapshot, 
  updateDoc, 
  deleteDoc,
  deleteField,
  collection, 
  query, 
  orderBy, 
  addDoc 
} from 'firebase/firestore';
import { db, rtdb } from './firebase';
import { Order, OrderMessage, OrderStatus, PaymentStatus, ProductItem, StudioSettings, InventoryItem } from '../types';
import { INITIAL_PRODUCTS, INITIAL_STUDIO_SETTINGS, INITIAL_INVENTORY } from '../data/seedData';
import { sendStatusUpdateEmail } from './emailReceipt';

const ORDERS_CACHE_KEY = 'lypetal_orders_cache';
const MESSAGES_CACHE_KEY = 'lypetal_messages_cache';
const DELETED_ORDERS_KEY = 'lypetal_deleted_orders';
const PRODUCTS_CACHE_KEY = 'lypetal_products_cache';
const SETTINGS_CACHE_KEY = 'lypetal_studio_settings_cache';
const INVENTORY_CACHE_KEY = 'lypetal_inventory_cache';

/**
 * Deep sanitizes objects by stripping all undefined fields and values.
 * Required because Firestore strictly rejects any objects containing undefined values.
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return data;
  return JSON.parse(JSON.stringify(data));
}

// Helper to track permanently deleted orders across sessions
export function getDeletedOrderIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_ORDERS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markOrderDeleted(orderId: string): void {
  try {
    if (!orderId || orderId === 'undefined' || orderId === 'null') return;
    const set = getDeletedOrderIds();
    set.add(orderId);
    localStorage.setItem(DELETED_ORDERS_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Could not record deleted order tombstone:', err);
  }
}

export function unmarkOrderDeleted(orderId: string): void {
  try {
    if (!orderId) return;
    const set = getDeletedOrderIds();
    set.delete(orderId);
    localStorage.setItem(DELETED_ORDERS_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Could not unmark deleted order:', err);
  }
}

// Helper to prevent any hanging promises from blocking user flows
function withTimeout<T>(promise: Promise<T>, ms: number = 3000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// --- Local Storage Cache Helpers ---
export function getCachedOrders(): Record<string, Order> {
  try {
    const raw = localStorage.getItem(ORDERS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const cleaned: Record<string, Order> = {};
    let hadCorrupted = false;

    Object.keys(parsed).forEach(k => {
      const item = parsed[k];
      if (
        k && 
        k !== 'undefined' && 
        k !== 'null' && 
        k.trim() !== '' &&
        item && 
        typeof item === 'object' &&
        item.id && 
        item.id !== 'undefined' && 
        item.id !== 'null' &&
        String(item.id).trim() !== ''
      ) {
        cleaned[item.id] = { ...item, id: item.id };
      } else {
        hadCorrupted = true;
      }
    });

    if (hadCorrupted) {
      localStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(cleaned));
    }

    return cleaned;
  } catch {
    return {};
  }
}

export function cacheOrderLocally(order: Order) {
  try {
    if (!order || typeof order !== 'object') return;
    const orderId = order.id;
    if (!orderId || typeof orderId !== 'string' || orderId === 'undefined' || orderId === 'null' || orderId.trim() === '') {
      return;
    }
    const all = getCachedOrders();
    all[orderId] = { ...order, id: orderId };
    localStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(all));
  } catch (err) {
    console.warn('Could not cache order:', err);
  }
}

export function getCachedMessages(orderId: string): OrderMessage[] {
  try {
    if (!orderId || orderId === 'undefined' || orderId === 'null') return [];
    const raw = localStorage.getItem(`${MESSAGES_CACHE_KEY}_${orderId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function cacheMessageLocally(orderId: string, message: OrderMessage) {
  try {
    if (!orderId || orderId === 'undefined' || orderId === 'null') return;
    const existing = getCachedMessages(orderId);
    if (!existing.some(m => m.id === message.id)) {
      existing.push(message);
      localStorage.setItem(`${MESSAGES_CACHE_KEY}_${orderId}`, JSON.stringify(existing));
    }
  } catch (err) {
    console.warn('Could not cache message:', err);
  }
}

// --- Order Placement (Firestore Primary + Non-blocking RTDB + Local Cache) ---
export async function placeOrderRealtime(order: Order, initialMessage?: OrderMessage): Promise<void> {
  if (!order || !order.id || order.id === 'undefined' || order.id === 'null' || String(order.id).trim() === '') {
    throw new Error('Cannot place order: invalid or undefined order ID.');
  }

  // Deep sanitize to eliminate all undefined fields so Firestore/RTDB never reject it
  const sanitizedOrder: Order = cleanForFirestore(order);
  sanitizedOrder.id = order.id;

  // 1. Immediately cache locally so customer sees it instantly
  cacheOrderLocally(sanitizedOrder);
  if (initialMessage) {
    const cleanMsg = cleanForFirestore({
      ...initialMessage,
      orderId: sanitizedOrder.id,
    });
    cacheMessageLocally(sanitizedOrder.id, cleanMsg);
  }

  // 2. Write to Cloud Firestore (Primary database with safety timeout)
  try {
    await withTimeout(setDoc(doc(db, 'orders', sanitizedOrder.id), sanitizedOrder), 3500);

    if (initialMessage) {
      const msgId = initialMessage.id || `msg_${Date.now()}`;
      const cleanMsg = cleanForFirestore({
        ...initialMessage,
        id: msgId,
        orderId: sanitizedOrder.id,
        createdAt: initialMessage.createdAt || new Date().toISOString()
      });
      withTimeout(setDoc(doc(db, 'orders', sanitizedOrder.id, 'messages', msgId), cleanMsg), 2500).catch(err => {
        console.warn('Initial message firestore notice:', err);
      });
    }
  } catch (firestoreErr) {
    console.warn('Firestore order placement notice (will rely on cache & background sync):', firestoreErr);
  }

  // 3. Write to Realtime Database in background (Never block checkout if RTDB is unprovisioned)
  try {
    const rtdbOrderRef = ref(rtdb, `orders/${sanitizedOrder.id}`);
    withTimeout(set(rtdbOrderRef, sanitizedOrder), 2000).catch(err => {
      console.warn('RTDB write notice (RTDB may be unprovisioned, Firestore used):', err);
    });

    if (initialMessage) {
      const msgId = initialMessage.id || `msg_${Date.now()}`;
      const cleanMsg = cleanForFirestore({
        ...initialMessage,
        id: msgId,
        orderId: sanitizedOrder.id,
        createdAt: initialMessage.createdAt || new Date().toISOString()
      });
      withTimeout(set(ref(rtdb, `orders/${sanitizedOrder.id}/messages/${msgId}`), cleanMsg), 2000).catch(err => {
        console.warn('RTDB message write notice:', err);
      });
    }
  } catch (rtdbErr) {
    console.warn('RTDB connection notice:', rtdbErr);
  }
}

// --- Single Order Tracking Listener ---
export function subscribeToOrder(
  orderId: string, 
  onData: (order: Order) => void,
  onNotFound?: () => void
): () => void {
  if (!orderId || orderId === 'undefined' || orderId === 'null' || String(orderId).trim() === '') {
    if (onNotFound) onNotFound();
    return () => {};
  }

  let found = false;

  // Check local cache first for instant feedback
  const cached = getCachedOrders()[orderId];
  if (cached && cached.id && cached.id !== 'undefined') {
    found = true;
    onData(cached);
  }

  // A. Realtime Database Listener (Checks both 'orders' and 'cancelledorders' tables)
  let unsubRtdb: () => void = () => {};
  try {
    const rtdbOrderRef = ref(rtdb, `orders/${orderId}`);
    const rtdbCancelledRef = ref(rtdb, `cancelledorders/${orderId}`);
    
    let activeFoundInRtdb = false;

    const rtdbListener = onValue(rtdbOrderRef, (snapshot) => {
      const val = snapshot.val();
      if (val && typeof val === 'object') {
        const item = { ...val, id: val.id || orderId };
        if (item.id && item.id !== 'undefined') {
          found = true;
          activeFoundInRtdb = true;
          cacheOrderLocally(item);
          onData(item);
        }
      } else {
        activeFoundInRtdb = false;
      }
    }, (err) => {
      console.warn('RTDB order listener notice:', err);
    });

    const rtdbCancelledListener = onValue(rtdbCancelledRef, (snapshot) => {
      const val = snapshot.val();
      if (val && typeof val === 'object' && !activeFoundInRtdb) {
        const item = { ...val, id: val.id || orderId, status: 'cancelled' as OrderStatus };
        if (item.id && item.id !== 'undefined') {
          found = true;
          cacheOrderLocally(item);
          onData(item);
        }
      }
    }, (err) => {
      console.warn('RTDB cancelled order listener notice:', err);
    });

    unsubRtdb = () => {
      rtdbListener();
      rtdbCancelledListener();
    };
  } catch (err) {
    console.warn('Could not setup RTDB order listener:', err);
  }

  // B. Firestore Listener (Listens to 'orders' and seamlessly falls back to 'cancelledorders' table)
  let unsubFirestore: () => void = () => {};
  try {
    const orderDocRef = doc(db, 'orders', orderId);
    const cancelledDocRef = doc(db, 'cancelledorders', orderId);

    let activeOrderInFirestore = false;

    const unsubOrders = onSnapshot(orderDocRef, (snap) => {
      if (snap.exists()) {
        activeOrderInFirestore = true;
        const data = { id: snap.id, ...snap.data() } as Order;
        if (data.id && data.id !== 'undefined') {
          found = true;
          cacheOrderLocally(data);
          onData(data);
        }
      } else {
        activeOrderInFirestore = false;
        // If order document was removed from 'orders', check if it was moved to 'cancelledorders'
        getDoc(cancelledDocRef).then((cSnap) => {
          if (cSnap.exists()) {
            found = true;
            const data = { id: cSnap.id, ...cSnap.data(), status: 'cancelled' as OrderStatus } as Order;
            cacheOrderLocally(data);
            onData(data);
          } else if (!found && onNotFound) {
            onNotFound();
          }
        }).catch(() => {
          if (!found && onNotFound) onNotFound();
        });
      }
    }, (err) => {
      console.warn('Firestore order listener notice:', err);
      if (!found && onNotFound) onNotFound();
    });

    const unsubCancelled = onSnapshot(cancelledDocRef, (cSnap) => {
      if (cSnap.exists() && !activeOrderInFirestore) {
        found = true;
        const data = { id: cSnap.id, ...cSnap.data(), status: 'cancelled' as OrderStatus } as Order;
        cacheOrderLocally(data);
        onData(data);
      }
    }, (err) => {
      console.warn('Firestore cancelled order listener notice:', err);
    });

    unsubFirestore = () => {
      unsubOrders();
      unsubCancelled();
    };
  } catch (err) {
    console.warn('Could not setup Firestore order listener:', err);
  }

  return () => {
    unsubRtdb();
    unsubFirestore();
  };
}

// --- Order Chat Messages Sync ---
/**
 * Purges and deletes all chat history messages for a specific order
 * from Cloud Firestore, Realtime Database, and local cache to conserve storage.
 */
export async function clearOrderMessagesRealtime(orderId: string): Promise<void> {
  if (!orderId || orderId === 'undefined' || orderId === 'null') return;

  // 1. Clear local message cache
  try {
    localStorage.removeItem(`${MESSAGES_CACHE_KEY}_${orderId}`);
  } catch {}

  // 2. Delete Firestore message subcollection documents in 'orders' and 'cancelledorders'
  try {
    const activeMsgsSnap = await getDocs(collection(db, 'orders', orderId, 'messages'));
    const deletePromises = activeMsgsSnap.docs.map(d => deleteDoc(d.ref).catch(() => {}));
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Firestore active messages purge notice:', err);
  }

  try {
    const cancelledMsgsSnap = await getDocs(collection(db, 'cancelledorders', orderId, 'messages'));
    const deletePromises = cancelledMsgsSnap.docs.map(d => deleteDoc(d.ref).catch(() => {}));
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Firestore cancelled messages purge notice:', err);
  }

  // 3. Clear Realtime Database message nodes
  try {
    withTimeout(set(ref(rtdb, `orders/${orderId}/messages`), null), 2500).catch(() => {});
    withTimeout(set(ref(rtdb, `cancelledorders/${orderId}/messages`), null), 2500).catch(() => {});
  } catch (err) {
    console.warn('RTDB messages purge notice:', err);
  }
}

export async function sendOrderMessageRealtime(orderId: string, message: OrderMessage): Promise<void> {
  const msgId = message.id || `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const finalMsg: OrderMessage = { ...message, id: msgId };

  // Cache locally
  cacheMessageLocally(orderId, finalMsg);

  const cached = getCachedOrders()[orderId];
  const targetCol = cached?.status === 'cancelled' ? 'cancelledorders' : 'orders';

  // 1. Send to Firestore (Primary)
  try {
    await withTimeout(setDoc(doc(db, targetCol, orderId, 'messages', msgId), finalMsg), 3500);
  } catch (firestoreErr) {
    try {
      const altCol = targetCol === 'orders' ? 'cancelledorders' : 'orders';
      await withTimeout(setDoc(doc(db, altCol, orderId, 'messages', msgId), finalMsg), 2500);
    } catch {}
  }

  // 2. Send to RTDB (Non-blocking background)
  try {
    withTimeout(set(ref(rtdb, `${targetCol}/${orderId}/messages/${msgId}`), finalMsg), 2000).catch(() => {});
  } catch {}
}

export function subscribeToOrderMessages(
  orderId: string,
  onMessages: (messages: OrderMessage[]) => void
): () => void {
  const messagesMap = new Map<string, OrderMessage>();

  // Load cached messages first
  const localMsgs = getCachedMessages(orderId);
  localMsgs.forEach(m => messagesMap.set(m.id, m));
  if (messagesMap.size > 0) {
    onMessages(Array.from(messagesMap.values()).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1)));
  }

  const broadcast = () => {
    const sorted = Array.from(messagesMap.values()).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
    onMessages(sorted);
  };

  // A. RTDB Messages Listeners (Check both orders and cancelledorders)
  let unsubRtdb: () => void = () => {};
  try {
    const msgsRef = ref(rtdb, `orders/${orderId}/messages`);
    const cancelledMsgsRef = ref(rtdb, `cancelledorders/${orderId}/messages`);

    const rtdbSub1 = onValue(msgsRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        Object.keys(val).forEach(key => {
          const item = val[key];
          const m: OrderMessage = { id: key, ...item };
          messagesMap.set(m.id, m);
          cacheMessageLocally(orderId, m);
        });
        broadcast();
      }
    });

    const rtdbSub2 = onValue(cancelledMsgsRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        Object.keys(val).forEach(key => {
          const item = val[key];
          const m: OrderMessage = { id: key, ...item };
          messagesMap.set(m.id, m);
          cacheMessageLocally(orderId, m);
        });
        broadcast();
      }
    });

    unsubRtdb = () => {
      rtdbSub1();
      rtdbSub2();
    };
  } catch (err) {
    console.warn('RTDB messages error:', err);
  }

  // B. Firestore Messages Listener (Listen to active and cancelled order message subcollections)
  let unsubFirestore: () => void = () => {};
  try {
    const msgsRef = collection(db, 'orders', orderId, 'messages');
    const cancelledMsgsRef = collection(db, 'cancelledorders', orderId, 'messages');

    const q1 = query(msgsRef, orderBy('createdAt', 'asc'));
    const unsubF1 = onSnapshot(q1, (snap) => {
      snap.forEach(d => {
        const m = { id: d.id, ...d.data() } as OrderMessage;
        messagesMap.set(m.id, m);
        cacheMessageLocally(orderId, m);
      });
      broadcast();
    }, () => {});

    const q2 = query(cancelledMsgsRef, orderBy('createdAt', 'asc'));
    const unsubF2 = onSnapshot(q2, (snap) => {
      snap.forEach(d => {
        const m = { id: d.id, ...d.data() } as OrderMessage;
        messagesMap.set(m.id, m);
        cacheMessageLocally(orderId, m);
      });
      broadcast();
    }, () => {});

    unsubFirestore = () => {
      unsubF1();
      unsubF2();
    };
  } catch (err) {
    console.warn('Firestore messages error:', err);
  }

  return () => {
    unsubRtdb();
    unsubFirestore();
  };
}

// --- Owner Dashboard: Listen to All Orders ---
export function subscribeToAllOrdersRealtime(
  onOrders: (orders: Order[]) => void
): () => void {
  const ordersMap = new Map<string, Order>();

  // Read local cache initially, strictly excluding any deleted tombstones
  const initialDeleted = getDeletedOrderIds();
  const cached = getCachedOrders();
  Object.values(cached).forEach(o => {
    if (o && o.id && !initialDeleted.has(o.id)) {
      ordersMap.set(o.id, o);
    }
  });

  const broadcast = () => {
    const currentDeleted = getDeletedOrderIds();
    const list = Array.from(ordersMap.values())
      .filter(o => o && o.id && !currentDeleted.has(o.id))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    onOrders(list);
  };

  if (ordersMap.size > 0) {
    broadcast();
  }

  // A. RTDB Orders
  let unsubRtdb: () => void = () => {};
  try {
    const ordersRef = ref(rtdb, 'orders');
    const rtdbSub = onValue(ordersRef, (snapshot) => {
      const val = snapshot.val();
      const currentDeleted = getDeletedOrderIds();
      if (val) {
        Object.keys(val).forEach(id => {
          if (id && id !== 'undefined' && id !== 'null' && !currentDeleted.has(id)) {
            const raw = val[id];
            if (raw && typeof raw === 'object') {
              const orderItem = { ...raw, id: raw.id || id };
              if (orderItem.id && orderItem.id !== 'undefined' && orderItem.id !== 'null') {
                ordersMap.set(id, orderItem);
                cacheOrderLocally(orderItem);
              }
            }
          } else if (id && (id === 'undefined' || id === 'null' || currentDeleted.has(id))) {
            ordersMap.delete(id);
          }
        });
      } else {
        // RTDB has no orders, prune any RTDB-only entries if needed
      }
      broadcast();
    }, (err) => {
      console.warn('RTDB all orders notice:', err);
    });
    unsubRtdb = () => rtdbSub();
  } catch (err) {
    console.warn('RTDB all orders error:', err);
  }

  // B. Firestore Orders (Handle additions, modifications, and removals)
  let unsubFirestore: () => void = () => {};
  try {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    unsubFirestore = onSnapshot(q, (snap) => {
      const currentDeleted = getDeletedOrderIds();
      
      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        if (!id || id === 'undefined' || id === 'null' || change.type === 'removed' || currentDeleted.has(id)) {
          ordersMap.delete(id);
        } else {
          if (!currentDeleted.has(id)) {
            const item = { id, ...change.doc.data() } as Order;
            if (item.id && item.id !== 'undefined' && item.id !== 'null') {
              if (item.status === 'cancelled') {
                // If an order is cancelled, keep it out of active ordersMap
                ordersMap.delete(id);
              } else {
                ordersMap.set(id, item);
                cacheOrderLocally(item);
              }
            }
          }
        }
      });
      broadcast();
    }, (err) => {
      console.warn('Firestore all orders notice:', err);
    });
  } catch (err) {
    console.warn('Firestore all orders error:', err);
  }

  return () => {
    unsubRtdb();
    unsubFirestore();
  };
}

// --- Dedicated Cancelled Orders Listener (Reads from 'cancelledorders' table) ---
export function subscribeToCancelledOrdersRealtime(
  onCancelledOrders: (orders: Order[]) => void
): () => void {
  const cancelledMap = new Map<string, Order>();

  // 1. Initial cached cancelled orders
  const initialDeleted = getDeletedOrderIds();
  const cached = getCachedOrders();
  Object.values(cached).forEach(o => {
    if (o && o.id && o.status === 'cancelled' && !initialDeleted.has(o.id)) {
      cancelledMap.set(o.id, o);
    }
  });

  const broadcast = () => {
    const currentDeleted = getDeletedOrderIds();
    const list = Array.from(cancelledMap.values())
      .filter(o => o && o.id && !currentDeleted.has(o.id) && o.status === 'cancelled')
      .sort((a, b) => {
        const timeA = (b.cancelledAt || b.updatedAt || b.createdAt || '');
        const timeB = (a.cancelledAt || a.updatedAt || a.createdAt || '');
        return timeA > timeB ? 1 : -1;
      });
    onCancelledOrders(list);
  };

  if (cancelledMap.size > 0) {
    broadcast();
  }

  // A. RTDB Cancelled Orders Node
  let unsubRtdb: () => void = () => {};
  try {
    const cancelledRef = ref(rtdb, 'cancelledorders');
    const rtdbSub = onValue(cancelledRef, (snapshot) => {
      const val = snapshot.val();
      const currentDeleted = getDeletedOrderIds();
      if (val) {
        Object.keys(val).forEach(id => {
          if (id && id !== 'undefined' && id !== 'null' && !currentDeleted.has(id)) {
            const raw = val[id];
            if (raw && typeof raw === 'object') {
              const item = { ...raw, id: raw.id || id, status: 'cancelled' as OrderStatus };
              cancelledMap.set(id, item);
              cacheOrderLocally(item);
            }
          } else if (id && (id === 'undefined' || id === 'null' || currentDeleted.has(id))) {
            cancelledMap.delete(id);
          }
        });
      }
      broadcast();
    }, (err) => {
      console.warn('RTDB cancelledorders notice:', err);
    });
    unsubRtdb = () => rtdbSub();
  } catch (err) {
    console.warn('RTDB cancelledorders error:', err);
  }

  // B. Firestore 'cancelledorders' Collection
  let unsubFirestore: () => void = () => {};
  try {
    const q = collection(db, 'cancelledorders');
    unsubFirestore = onSnapshot(q, (snap) => {
      const currentDeleted = getDeletedOrderIds();
      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        if (!id || id === 'undefined' || id === 'null' || change.type === 'removed' || currentDeleted.has(id)) {
          cancelledMap.delete(id);
        } else {
          if (!currentDeleted.has(id)) {
            const item = { id, ...change.doc.data(), status: 'cancelled' as OrderStatus } as Order;
            cancelledMap.set(id, item);
            cacheOrderLocally(item);
          }
        }
      });
      broadcast();
    }, (err) => {
      console.warn('Firestore cancelledorders notice:', err);
    });
  } catch (err) {
    console.warn('Firestore cancelledorders error:', err);
  }

  return () => {
    unsubRtdb();
    unsubFirestore();
  };
}

// --- Order Status & Payment Updates ---
export async function updateOrderStatusRealtime(orderId: string, newStatus: OrderStatus): Promise<void> {
  const updates = {
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };

  // 1. Update cache
  const cached = getCachedOrders()[orderId];
  if (cached) {
    cacheOrderLocally({ ...cached, ...updates });
  }

  // 2. Automatically purge temporary chat messages if order is delivered or cancelled to conserve database storage
  if (newStatus === 'delivered' || newStatus === 'cancelled') {
    clearOrderMessagesRealtime(orderId).catch(() => {});
  }

  // 3. Update Firestore (Primary)
  try {
    await withTimeout(updateDoc(doc(db, 'orders', orderId), updates), 3500);
  } catch (err) {
    console.warn('Firestore status update notice:', err);
  }

  // 3. Update RTDB (Non-blocking)
  try {
    withTimeout(update(ref(rtdb, `orders/${orderId}`), updates), 2000).catch(err => {
      console.warn('RTDB status update notice:', err);
    });
  } catch (err) {
    console.warn('RTDB status update setup notice:', err);
  }

  // 4. Trigger automated status confirmation email via backend if customer email exists
  if (cached && cached.customerInfo?.email) {
    sendStatusUpdateEmail({ ...cached, ...updates }, newStatus).catch(err => {
      console.warn('Status update email dispatch notice:', err);
    });
  }
}

export async function updateOrderPaymentRealtime(
  orderId: string, 
  newStatus: PaymentStatus, 
  amountPaid: number, 
  total: number
): Promise<void> {
  const balance = Math.max(0, total - amountPaid);
  const updates = {
    paymentStatus: newStatus,
    amountPaid: Number(amountPaid),
    balance,
    updatedAt: new Date().toISOString(),
  };

  // 1. Update cache
  const cached = getCachedOrders()[orderId];
  if (cached) {
    cacheOrderLocally({ ...cached, ...updates });
  }

  // 2. Update Firestore (Primary)
  try {
    await withTimeout(updateDoc(doc(db, 'orders', orderId), updates), 3500);
  } catch (err) {
    console.warn('Firestore payment update notice:', err);
  }

  // 3. Update RTDB (Non-blocking)
  try {
    withTimeout(update(ref(rtdb, `orders/${orderId}`), updates), 2000).catch(err => {
      console.warn('RTDB payment update notice:', err);
    });
  } catch (err) {
    console.warn('RTDB payment update setup notice:', err);
  }
}

// --- Order Cancellation & Permanent Database Deletion ---
/**
 * Cancels an order and automatically MOVES it to the dedicated 'cancelledorders' table/collection,
 * completely deleting it from the active 'orders' table to eliminate clutter in Firebase.
 */
export async function cancelOrderRealtime(
  orderId: string, 
  reason: string, 
  cancelledBy: 'customer' | 'owner' = 'customer'
): Promise<void> {
  if (!orderId || orderId === 'undefined' || orderId === 'null') return;
  const now = new Date().toISOString();

  // 1. Fetch current order info to ensure full preservation in cancelledorders table
  let currentOrder = getCachedOrders()[orderId];
  if (!currentOrder) {
    try {
      const snap = await getDoc(doc(db, 'orders', orderId));
      if (snap.exists()) {
        currentOrder = { id: snap.id, ...snap.data() } as Order;
      }
    } catch (err) {
      console.warn('Could not fetch existing order prior to cancellation:', err);
    }
  }

  const cancelledOrder: Order = {
    ...(currentOrder || {
      id: orderId,
      customerId: 'unknown',
      customerInfo: { firstName: 'Customer', lastName: '', email: '', phone: '', address: '' },
      items: [],
      totalAmount: 0,
      paymentMode: 'GCash',
      paymentStatus: 'pending',
      amountPaid: 0,
      balance: 0,
      createdAt: now,
    }),
    id: orderId,
    status: 'cancelled',
    cancellationReason: reason,
    cancelledAt: now,
    cancelledBy,
    updatedAt: now,
  };

  const sanitizedCancelled = cleanForFirestore(cancelledOrder);

  // 2. Cache updated order locally
  cacheOrderLocally(sanitizedCancelled);

  // 3. Automated cancel message
  const cancelMsg: OrderMessage = {
    id: `msg_cancel_${Date.now()}`,
    orderId,
    senderId: cancelledBy === 'customer' ? 'customer' : 'owner',
    senderRole: cancelledBy === 'customer' ? 'customer' : 'owner',
    senderName: cancelledBy === 'customer' ? 'Customer' : 'Allyson (LYPetal)',
    text: `Order was cancelled by ${cancelledBy}. Reason: ${reason}`,
    createdAt: now,
  };
  cacheMessageLocally(orderId, cancelMsg);

  // 4. WRITE to dedicated table/collection 'cancelledorders'
  try {
    await withTimeout(setDoc(doc(db, 'cancelledorders', orderId), sanitizedCancelled), 3500);
    withTimeout(setDoc(doc(db, 'cancelledorders', orderId, 'messages', cancelMsg.id), cancelMsg), 2500).catch(() => {});
  } catch (err) {
    console.warn('Firestore write to cancelledorders table notice:', err);
  }

  // 5. RTDB: Set in dedicated 'cancelledorders' node
  try {
    withTimeout(set(ref(rtdb, `cancelledorders/${orderId}`), sanitizedCancelled), 2000).catch(() => {});
    withTimeout(set(ref(rtdb, `cancelledorders/${orderId}/messages/${cancelMsg.id}`), cancelMsg), 2000).catch(() => {});
  } catch (err) {
    console.warn('RTDB write to cancelledorders node notice:', err);
  }

  // 6. DELETE from primary 'orders' table to eliminate clutter in active database
  try {
    await withTimeout(deleteDoc(doc(db, 'orders', orderId)), 3500);
  } catch (err) {
    console.warn('Firestore delete from orders notice:', err);
  }

  try {
    withTimeout(set(ref(rtdb, `orders/${orderId}`), null), 2000).catch(() => {});
  } catch (err) {}
}

export async function markReceiptSentRealtime(orderId: string): Promise<void> {
  const now = new Date().toISOString();
  const updates = {
    receiptSent: true,
    receiptSentAt: now,
    updatedAt: now,
  };

  const cached = getCachedOrders()[orderId];
  if (cached) {
    cacheOrderLocally({ ...cached, ...updates });
  }

  try {
    await withTimeout(updateDoc(doc(db, 'orders', orderId), updates), 2500);
  } catch {}

  try {
    withTimeout(update(ref(rtdb, `orders/${orderId}`), updates), 2000).catch(() => {});
  } catch {}
}

export function removeOrderFromCache(orderId: string): void {
  try {
    markOrderDeleted(orderId);
    const all = getCachedOrders();
    delete all[orderId];
    localStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(all));
    localStorage.removeItem(`${MESSAGES_CACHE_KEY}_${orderId}`);
  } catch (err) {
    console.warn('Could not remove order from cache:', err);
  }
}

/**
 * Permanently deletes an order from both 'orders' and 'cancelledorders' tables,
 * and records a persistent tombstone so it never resurrects.
 */
export async function deleteOrderRealtime(orderId: string): Promise<void> {
  if (!orderId || orderId === 'undefined' || orderId === 'null') return;
  // 1. Permanently record tombstone
  markOrderDeleted(orderId);
  // 2. Instantly remove from local cache and purge chat history
  removeOrderFromCache(orderId);
  clearOrderMessagesRealtime(orderId).catch(() => {});

  // 3. Delete permanently from both Cloud Firestore tables
  try {
    await withTimeout(deleteDoc(doc(db, 'orders', orderId)), 3500);
  } catch (err) {
    console.warn('Firestore delete order notice:', err);
  }
  try {
    await withTimeout(deleteDoc(doc(db, 'cancelledorders', orderId)), 3500);
  } catch (err) {
    console.warn('Firestore delete cancelled order notice:', err);
  }

  // 4. Delete from Realtime Database (both nodes set to null)
  try {
    withTimeout(set(ref(rtdb, `orders/${orderId}`), null), 2000).catch(() => {});
    withTimeout(set(ref(rtdb, `cancelledorders/${orderId}`), null), 2000).catch(() => {});
  } catch (err) {
    console.warn('RTDB delete order notice:', err);
  }
}

/**
 * Restores/reinstates an order from the 'cancelledorders' table back into the active 'orders' table.
 */
export async function restoreOrderRealtime(orderId: string): Promise<void> {
  if (!orderId || orderId === 'undefined' || orderId === 'null') return;
  const now = new Date().toISOString();
  unmarkOrderDeleted(orderId);

  // 1. Fetch record from cancelledorders (or cache)
  let cancelledOrder = getCachedOrders()[orderId];
  if (!cancelledOrder) {
    try {
      const snap = await getDoc(doc(db, 'cancelledorders', orderId));
      if (snap.exists()) {
        cancelledOrder = { id: snap.id, ...snap.data() } as Order;
      }
    } catch (err) {
      console.warn('Could not fetch cancelled order for restore:', err);
    }
  }

  const restored: Order = {
    ...(cancelledOrder || {
      id: orderId,
      customerId: 'unknown',
      customerInfo: { firstName: 'Customer', lastName: '', email: '', phone: '', address: '' },
      items: [],
      totalAmount: 0,
      paymentMode: 'GCash',
      paymentStatus: 'pending',
      amountPaid: 0,
      balance: 0,
      createdAt: now,
    }),
    id: orderId,
    status: 'pending',
    updatedAt: now,
  };
  delete (restored as any).cancellationReason;
  delete (restored as any).cancelledAt;
  delete (restored as any).cancelledBy;

  const sanitizedRestored = cleanForFirestore(restored);
  cacheOrderLocally(sanitizedRestored);

  // 2. Put back into active 'orders' table in Firestore & RTDB
  try {
    await withTimeout(setDoc(doc(db, 'orders', orderId), sanitizedRestored), 3500);
  } catch (err) {
    console.warn('Firestore restore order notice:', err);
  }

  try {
    withTimeout(set(ref(rtdb, `orders/${orderId}`), sanitizedRestored), 2000).catch(() => {});
  } catch {}

  // 3. Remove from 'cancelledorders' table
  try {
    await withTimeout(deleteDoc(doc(db, 'cancelledorders', orderId)), 3500);
  } catch (err) {
    console.warn('Firestore remove from cancelledorders notice:', err);
  }

  try {
    withTimeout(set(ref(rtdb, `cancelledorders/${orderId}`), null), 2000).catch(() => {});
  } catch {}
}

// --- Product & Flower Catalog Realtime Sync & Price Management ---

export function getCachedProducts(): ProductItem[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate each product in cache
        const valid = parsed.filter(p => p && p.id && p.name && typeof p.basePrice === 'number' && p.basePrice > 0);
        if (valid.length > 0) return valid;
      }
    }
  } catch {}
  return INITIAL_PRODUCTS;
}

export function cacheProductsLocally(products: ProductItem[]) {
  try {
    if (Array.isArray(products) && products.length > 0) {
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products));
      queueMicrotask(() => {
        try {
          window.dispatchEvent(new CustomEvent('lypetal_products_updated', { detail: products }));
        } catch {}
      });
    }
  } catch (err) {
    console.warn('Could not cache products locally:', err);
  }
}

/**
 * Normalizes a list of products ensuring default flowers and all required fields exist.
 */
function normalizeProductList(incomingList: ProductItem[]): ProductItem[] {
  const map = new Map<string, ProductItem>();
  
  // 1. First add base initial products as foundation
  INITIAL_PRODUCTS.forEach(ip => {
    map.set(ip.id, { ...ip });
  });

  // 2. Overlay incoming items, preserving or merging all fields
  incomingList.forEach(item => {
    if (!item || !item.id) return;
    const existing = map.get(item.id);
    const merged: ProductItem = {
      id: item.id,
      name: item.name || existing?.name || 'Handmade Bloom',
      flowerType: item.flowerType || existing?.flowerType || 'rose',
      basePrice: typeof item.basePrice === 'number' && item.basePrice > 0 ? item.basePrice : (existing?.basePrice || 80),
      description: item.description || existing?.description || 'Artisan handcrafted satin ribbon flower.',
      badge: item.badge !== undefined ? item.badge : (existing?.badge || '1 pc stem'),
      imageUrl: item.imageUrl || existing?.imageUrl || (item.id === 'dahlia' ? '/Dahlia.jpg' : '/Rose.jpg'),
      availableColors: Array.isArray(item.availableColors) && item.availableColors.length > 0 
        ? item.availableColors 
        : (existing?.availableColors || [
            'Pastel Pink', 'Pink', 'Violet', 'White', 'Yellow', 'Sage Green', 'Emerald', 'Brown'
          ]),
      active: item.active ?? true,
      updatedAt: item.updatedAt || new Date().toISOString()
    };
    map.set(item.id, merged);
  });

  return Array.from(map.values());
}

/**
 * Subscribes to real-time product changes across Firestore, RTDB, and local cache.
 */
export function subscribeToProductsRealtime(onData: (products: ProductItem[]) => void): () => void {
  // 1. Immediately emit cached or initial products
  const cached = getCachedProducts();
  onData(cached);

  // 2. Listen to Firestore products collection
  let unsubFirestore = () => {};
  try {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      if (!snap.empty) {
        const fetched: ProductItem[] = [];
        snap.forEach(d => {
          fetched.push({ id: d.id, ...d.data() } as ProductItem);
        });
        const normalized = normalizeProductList(fetched);
        cacheProductsLocally(normalized);
        onData(normalized);
      }
    }, (err) => {
      console.warn('Firestore products listener notice (safe fallback active):', err);
    });
    unsubFirestore = () => unsub();
  } catch (err) {
    console.warn('Could not initialize Firestore products listener:', err);
  }

  // 3. Listen to RTDB products (as a fallback synchronization channel)
  let unsubRtdb = () => {};
  try {
    const rtdbUnsub = onValue(ref(rtdb, 'products'), (snap) => {
      const val = snap.val();
      if (val && typeof val === 'object') {
        const fetched: ProductItem[] = Object.keys(val).map(key => ({
          id: key,
          ...val[key]
        })).filter(p => p.id && (p.name || p.basePrice));
        if (fetched.length > 0) {
          const normalized = normalizeProductList(fetched);
          cacheProductsLocally(normalized);
          onData(normalized);
        }
      }
    }, (err) => {
      console.warn('RTDB products listener notice:', err);
    });
    unsubRtdb = () => rtdbUnsub();
  } catch {}

  return () => {
    unsubFirestore();
    unsubRtdb();
  };
}

/**
 * Updates a product price safely in Firestore, RTDB, and local state.
 * Guaranteed never to drop products or lose fields.
 */
export async function updateProductPriceRealtime(productId: string, newPrice: number): Promise<ProductItem[]> {
  const validPrice = Math.max(1, Math.round(Number(newPrice)));
  if (isNaN(validPrice) || validPrice <= 0) {
    throw new Error('Please enter a valid price greater than 0.');
  }

  const currentProducts = getCachedProducts();
  const existing = currentProducts.find(p => p.id === productId) || INITIAL_PRODUCTS.find(p => p.id === productId);
  
  const updatedProduct: ProductItem = {
    ...(existing || {
      id: productId,
      name: productId === 'dahlia' ? 'Satin Ribbon Dahlia' : 'Satin Ribbon Rose',
      flowerType: productId === 'dahlia' ? 'dahlia' : 'rose',
      description: 'Artisan handcrafted satin ribbon flower.',
      badge: '1 pc stem',
      imageUrl: productId === 'dahlia' ? '/Dahlia.jpg' : '/Rose.jpg',
      availableColors: ['Pastel Pink', 'Pink', 'Violet', 'White', 'Yellow', 'Sage Green', 'Emerald', 'Brown'],
      active: true,
    }),
    id: productId,
    basePrice: validPrice,
    updatedAt: new Date().toISOString()
  };

  // Update in-memory list
  const nextList = currentProducts.map(p => p.id === productId ? updatedProduct : p);
  if (!nextList.some(p => p.id === productId)) {
    nextList.push(updatedProduct);
  }
  const normalized = normalizeProductList(nextList);
  cacheProductsLocally(normalized);

  const cleanData = cleanForFirestore(updatedProduct);

  // Write full product to Firestore
  try {
    await withTimeout(setDoc(doc(db, 'products', productId), cleanData, { merge: true }), 3500);
  } catch (err) {
    console.warn('Firestore price update notice:', err);
  }

  // Write FULL product to RTDB (NOT partial object so RTDB never lacks name/colors/image)
  try {
    await withTimeout(set(ref(rtdb, `products/${productId}`), cleanData), 2000);
  } catch (err) {
    console.warn('RTDB price update notice:', err);
  }

  return normalized;
}

/**
 * Saves a full product (new or edited) safely across all persistent stores.
 */
export async function saveProductRealtime(product: ProductItem): Promise<ProductItem[]> {
  if (!product || !product.id) {
    throw new Error('Invalid product definition');
  }

  const cleanProduct = cleanForFirestore({
    ...product,
    basePrice: Math.max(1, Number(product.basePrice) || 80),
    updatedAt: new Date().toISOString()
  });

  const currentProducts = getCachedProducts();
  const nextList = currentProducts.map(p => p.id === cleanProduct.id ? cleanProduct : p);
  if (!nextList.some(p => p.id === cleanProduct.id)) {
    nextList.push(cleanProduct);
  }
  const normalized = normalizeProductList(nextList);
  cacheProductsLocally(normalized);

  try {
    await withTimeout(setDoc(doc(db, 'products', cleanProduct.id), cleanProduct, { merge: true }), 3500);
  } catch (err) {
    console.warn('Firestore product save notice:', err);
  }

  try {
    await withTimeout(set(ref(rtdb, `products/${cleanProduct.id}`), cleanProduct), 2000);
  } catch (err) {
    console.warn('RTDB product save notice:', err);
  }

  return normalized;
}

/**
 * Deletes a product safely from Firestore, RTDB, and local cache.
 */
export async function deleteProductRealtime(productId: string): Promise<ProductItem[]> {
  const currentProducts = getCachedProducts();
  const nextList = currentProducts.filter(p => p.id !== productId);
  const normalized = normalizeProductList(nextList);
  cacheProductsLocally(normalized);

  try {
    await withTimeout(deleteDoc(doc(db, 'products', productId)), 3500);
  } catch (err) {
    console.warn('Firestore delete product notice:', err);
  }

  try {
    await withTimeout(set(ref(rtdb, `products/${productId}`), null), 2000);
  } catch (err) {
    console.warn('RTDB delete product notice:', err);
  }

  return normalized;
}

/**
 * Studio Settings Sync Helpers
 */
export function getCachedStudioSettings(): StudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return INITIAL_STUDIO_SETTINGS;
}

export function cacheStudioSettingsLocally(settings: StudioSettings): void {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('lypetal_settings_updated', { detail: settings }));
  } catch (err) {
    console.warn('Could not cache studio settings locally:', err);
  }
}

export async function saveStudioSettingsRealtime(settings: StudioSettings): Promise<StudioSettings> {
  const cleanData: StudioSettings = cleanForFirestore({
    ...settings,
    updatedAt: new Date().toISOString()
  });

  cacheStudioSettingsLocally(cleanData);

  try {
    await withTimeout(setDoc(doc(db, 'studioSettings', 'content'), cleanData, { merge: true }), 3500);
  } catch (err) {
    console.warn('Firestore studio settings update notice:', err);
  }

  try {
    await withTimeout(set(ref(rtdb, 'studioSettings/content'), cleanData), 2000);
  } catch (err) {
    console.warn('RTDB studio settings update notice:', err);
  }

  return cleanData;
}

/**
 * ============================================================================
 * INVENTORY & STOCK REAL-TIME SYNC HELPERS (Firestore + RTDB + Local Storage)
 * ============================================================================
 */

/**
 * Normalizes an inventory list ensuring all baseline stock items (flower heads, colors, wrappers, ribbons, craft supplies)
 * are always preserved, while overlaying updated values and preserving custom owner items.
 */
export function normalizeInventoryList(incomingList: InventoryItem[]): InventoryItem[] {
  const map = new Map<string, InventoryItem>();

  // 1. Establish baseline inventory items
  INITIAL_INVENTORY.forEach(baseItem => {
    map.set(baseItem.id, { ...baseItem });
  });

  // 2. Overlay incoming items from Firestore / RTDB / Local cache
  if (Array.isArray(incomingList)) {
    incomingList.forEach(item => {
      if (!item || !item.id || item.id === 'undefined' || item.id === 'null') return;
      const existing = map.get(item.id);
      const merged: InventoryItem = {
        id: item.id,
        name: item.name || existing?.name || 'Supply Item',
        category: item.category || existing?.category || 'flower',
        stock: typeof item.stock === 'number' && !isNaN(item.stock) ? Math.max(0, Math.round(item.stock)) : (existing?.stock ?? 50),
        unit: item.unit || existing?.unit || 'pcs',
        lowStockThreshold: typeof item.lowStockThreshold === 'number' && !isNaN(item.lowStockThreshold) ? Math.max(0, Math.round(item.lowStockThreshold)) : (existing?.lowStockThreshold ?? 10),
        updatedAt: item.updatedAt || existing?.updatedAt || new Date().toISOString()
      };
      map.set(item.id, merged);
    });
  }

  return Array.from(map.values());
}

export function getCachedInventory(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(INVENTORY_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeInventoryList(parsed);
      }
    }
  } catch {}
  return INITIAL_INVENTORY;
}

export function cacheInventoryLocally(items: InventoryItem[]): void {
  try {
    const normalized = normalizeInventoryList(items);
    localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(normalized));
    queueMicrotask(() => {
      try {
        window.dispatchEvent(new CustomEvent('lypetal_inventory_updated', { detail: normalized }));
      } catch {}
    });
  } catch (err) {
    console.warn('Could not cache inventory locally:', err);
  }
}

/**
 * Subscribes to Real-Time Inventory changes from Firestore and Realtime Database.
 */
export function subscribeToInventoryRealtime(callback: (items: InventoryItem[]) => void): () => void {
  let isUnsubscribed = false;

  // Immediately broadcast normalized local cache so UI is instantaneous
  const cached = getCachedInventory();
  callback(cached);

  // 1. Listen on Firestore 'inventory' collection
  let unsubFirestore = () => {};
  try {
    unsubFirestore = onSnapshot(collection(db, 'inventory'), (snap) => {
      if (isUnsubscribed) return;
      if (!snap.empty) {
        const list: InventoryItem[] = [];
        snap.forEach(d => {
          const item = { id: d.id, ...d.data() } as InventoryItem;
          list.push(item);
        });
        const normalized = normalizeInventoryList(list);
        cacheInventoryLocally(normalized);
        callback(normalized);
      }
    }, (err) => {
      console.warn('Firestore inventory listener notice:', err);
    });
  } catch (err) {
    console.warn('Could not setup Firestore inventory listener:', err);
  }

  // 2. Listen on Realtime Database 'inventory'
  let unsubRtdb = () => {};
  try {
    const inventoryRtdbRef = ref(rtdb, 'inventory');
    unsubRtdb = onValue(inventoryRtdbRef, (snap) => {
      if (isUnsubscribed) return;
      const val = snap.val();
      if (val && typeof val === 'object') {
        const list: InventoryItem[] = Object.keys(val).map(k => ({
          id: k,
          ...val[k]
        }));
        if (list.length > 0) {
          const normalized = normalizeInventoryList(list);
          cacheInventoryLocally(normalized);
          callback(normalized);
        }
      }
    }, (err) => {
      console.warn('RTDB inventory listener notice:', err);
    });
  } catch (err) {
    console.warn('RTDB inventory listener setup notice:', err);
  }

  return () => {
    isUnsubscribed = true;
    unsubFirestore();
    unsubRtdb();
  };
}

// Debounce queue for inventory stock adjustments to prevent network lag on rapid clicks
const pendingStockUpdates = new Map<string, { stock: number; timer: ReturnType<typeof setTimeout> }>();

async function commitStockUpdateToDatabase(itemId: string, stock: number): Promise<void> {
  const cleanPayload = {
    stock,
    updatedAt: new Date().toISOString()
  };

  try {
    await withTimeout(setDoc(doc(db, 'inventory', itemId), cleanPayload, { merge: true }), 3500);
  } catch (err) {
    console.warn('Firestore stock update notice:', err);
  }

  try {
    await withTimeout(update(ref(rtdb, `inventory/${itemId}`), cleanPayload), 2000);
  } catch (err) {
    console.warn('RTDB stock update notice:', err);
  }
}

/**
 * Immediately flushes any pending debounced stock updates to the database.
 */
export async function flushPendingInventoryUpdates(): Promise<void> {
  const promises: Promise<void>[] = [];
  pendingStockUpdates.forEach(({ stock, timer }, itemId) => {
    clearTimeout(timer);
    promises.push(commitStockUpdateToDatabase(itemId, stock));
  });
  pendingStockUpdates.clear();
  await Promise.allSettled(promises);
}

/**
 * Updates stock quantity for a single inventory supply item in real-time.
 * Optimistically updates cache and local events immediately (0ms delay),
 * and debounces remote Firestore + RTDB writes by 350ms to eliminate spam lag.
 */
export async function updateInventoryStockRealtime(
  itemId: string, 
  newStock: number, 
  debounceMs: number = 350
): Promise<InventoryItem[]> {
  const validStock = Math.max(0, Math.round(Number(newStock) || 0));
  const current = getCachedInventory();
  const updatedList = current.map(item => item.id === itemId ? { ...item, stock: validStock, updatedAt: new Date().toISOString() } : item);
  const normalized = normalizeInventoryList(updatedList);
  
  // 1. Instantly update local cache and broadcast event for 0ms lag
  cacheInventoryLocally(normalized);

  // 2. Clear any active timer for this item
  if (pendingStockUpdates.has(itemId)) {
    clearTimeout(pendingStockUpdates.get(itemId)!.timer);
  }

  if (debounceMs <= 0) {
    pendingStockUpdates.delete(itemId);
    await commitStockUpdateToDatabase(itemId, validStock);
    return normalized;
  }

  // 3. Debounce database write
  const timer = setTimeout(async () => {
    pendingStockUpdates.delete(itemId);
    await commitStockUpdateToDatabase(itemId, validStock);
  }, debounceMs);

  pendingStockUpdates.set(itemId, { stock: validStock, timer });
  return normalized;
}

/**
 * Increments or decrements inventory stock by a delta amount with immediate optimistic update.
 */
export async function adjustInventoryStockRealtime(
  itemId: string, 
  delta: number, 
  debounceMs: number = 350
): Promise<InventoryItem[]> {
  const current = getCachedInventory();
  const target = current.find(i => i.id === itemId);
  const currentStock = target ? (target.stock ?? 0) : 50;
  const newStock = Math.max(0, currentStock + delta);
  return updateInventoryStockRealtime(itemId, newStock, debounceMs);
}

/**
 * Saves a new or edited inventory item across Firestore, RTDB, and local cache.
 */
export async function saveInventoryItemRealtime(item: InventoryItem): Promise<InventoryItem[]> {
  if (!item || !item.id) {
    throw new Error('Invalid inventory item');
  }

  const cleanItem: InventoryItem = cleanForFirestore({
    ...item,
    stock: Math.max(0, Number(item.stock) || 0),
    lowStockThreshold: Math.max(0, Number(item.lowStockThreshold) || 5),
    updatedAt: new Date().toISOString()
  });

  const current = getCachedInventory();
  const nextList = current.map(i => i.id === cleanItem.id ? cleanItem : i);
  if (!nextList.some(i => i.id === cleanItem.id)) {
    nextList.unshift(cleanItem);
  }
  const normalized = normalizeInventoryList(nextList);
  cacheInventoryLocally(normalized);

  // 1. Firestore
  try {
    await withTimeout(setDoc(doc(db, 'inventory', cleanItem.id), cleanItem, { merge: true }), 3500);
  } catch (err) {
    console.warn('Firestore inventory save notice:', err);
  }

  // 2. RTDB
  try {
    await withTimeout(set(ref(rtdb, `inventory/${cleanItem.id}`), cleanItem), 2000);
  } catch (err) {
    console.warn('RTDB inventory save notice:', err);
  }

  return normalized;
}

/**
 * Deletes an inventory item from Firestore, RTDB, and cache.
 */
export async function deleteInventoryItemRealtime(itemId: string): Promise<InventoryItem[]> {
  const current = getCachedInventory();
  const nextList = current.filter(i => i.id !== itemId);
  // Persist locally
  localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(nextList));
  try {
    window.dispatchEvent(new CustomEvent('lypetal_inventory_updated', { detail: nextList }));
  } catch {}

  try {
    await withTimeout(deleteDoc(doc(db, 'inventory', itemId)), 3500);
  } catch (err) {
    console.warn('Firestore inventory delete notice:', err);
  }

  try {
    await withTimeout(set(ref(rtdb, `inventory/${itemId}`), null), 2000);
  } catch (err) {
    console.warn('RTDB inventory delete notice:', err);
  }

  return nextList;
}

/**
 * Refreshes and fetches the latest inventory state directly from Firestore and Realtime Database.
 */
export async function fetchLatestInventoryRealtime(): Promise<InventoryItem[]> {
  await flushPendingInventoryUpdates();

  let fetchedList: InventoryItem[] = [];

  // 1. Fetch from Firestore
  try {
    const snap = await withTimeout(getDocs(collection(db, 'inventory')), 3500);
    if (!snap.empty) {
      snap.forEach(d => {
        fetchedList.push({ id: d.id, ...d.data() } as InventoryItem);
      });
    }
  } catch (err) {
    console.warn('Firestore inventory fetch notice:', err);
  }

  // 2. Fallback or merge with RTDB if Firestore yielded no documents
  if (fetchedList.length === 0) {
    try {
      const snap = await withTimeout(get(ref(rtdb, 'inventory')), 2500);
      const val = snap.val();
      if (val && typeof val === 'object') {
        fetchedList = Object.keys(val).map(k => ({ id: k, ...val[k] }));
      }
    } catch (err) {
      console.warn('RTDB inventory fetch notice:', err);
    }
  }

  // Normalize, cache, and dispatch
  const normalized = normalizeInventoryList(fetchedList.length > 0 ? fetchedList : getCachedInventory());
  cacheInventoryLocally(normalized);
  return normalized;
}

/**
 * Pushes or refreshes all official studio stock items into Firestore and RTDB.
 */
export async function syncOfficialInventoryRealtime(): Promise<InventoryItem[]> {
  cacheInventoryLocally(INITIAL_INVENTORY);

  // 1. Sync to RTDB
  const rtdbMap: Record<string, InventoryItem> = {};
  INITIAL_INVENTORY.forEach(item => {
    rtdbMap[item.id] = { ...item, updatedAt: new Date().toISOString() };
  });

  try {
    await withTimeout(set(ref(rtdb, 'inventory'), rtdbMap), 3000);
  } catch (err) {
    console.warn('RTDB official inventory sync notice:', err);
  }

  // 2. Sync to Firestore
  try {
    for (const item of INITIAL_INVENTORY) {
      await setDoc(doc(db, 'inventory', item.id), cleanForFirestore({
        ...item,
        updatedAt: new Date().toISOString()
      }), { merge: true });
    }
  } catch (err) {
    console.warn('Firestore official inventory sync notice:', err);
  }

  return INITIAL_INVENTORY;
}

