import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { Order } from '../types';
import { getCachedOrders } from './realtimeSync';

const DEVICE_ID_KEY = 'lypetal_device_hwid_v1';
const ACTIVE_ORDER_ID_KEY = 'lypetal_active_order_id';

/**
 * Generates a persistent unique hardware/device ID.
 * Saved in localStorage; if unavailable, creates a session fallback.
 */
export function getDeviceId(): string {
  try {
    let existingId = localStorage.getItem(DEVICE_ID_KEY);
    if (!existingId) {
      // Create a deterministic yet unique device HWID token
      const randomPart = Math.random().toString(36).substring(2, 10);
      const timePart = Date.now().toString(36);
      existingId = `HWID-${timePart}-${randomPart}`;
      localStorage.setItem(DEVICE_ID_KEY, existingId);
    }
    return existingId;
  } catch {
    return 'HWID-session-fallback';
  }
}

/**
 * Computes a hardware fingerprint hash based on browser & screen attributes
 * (canvas rendering, screen resolution, color depth, concurrency, timezone).
 */
export function getDeviceFingerprint(): string {
  try {
    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const cpuCores = navigator.hardwareConcurrency || 4;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila';
    const lang = navigator.language || 'en';

    // Canvas 2D fingerprint hash
    let canvasHash = 'c0';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 30;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#F4A6B0';
        ctx.fillRect(0, 0, 100, 30);
        ctx.fillStyle = '#2D2A2E';
        ctx.fillText('LYPetal_HW', 2, 4);
        const dataUrl = canvas.toDataURL();
        let hash = 0;
        for (let i = 0; i < dataUrl.length; i++) {
          hash = (hash << 5) - hash + dataUrl.charCodeAt(i);
          hash |= 0;
        }
        canvasHash = Math.abs(hash).toString(36);
      }
    } catch {
      canvasHash = 'no-canvas';
    }

    return `FP-${screenInfo}-${cpuCores}-${timezone}-${lang}-${canvasHash}`;
  } catch {
    return 'FP-default';
  }
}

/**
 * Stores the last placed order ID to quickly cross-check on the same device.
 */
export function saveActiveOrderId(orderId: string): void {
  try {
    if (!orderId || typeof orderId !== 'string' || orderId === 'undefined' || orderId === 'null' || orderId.trim() === '') {
      return;
    }
    localStorage.setItem(ACTIVE_ORDER_ID_KEY, orderId.trim());
  } catch (e) {
    console.warn('Could not store active order id:', e);
  }
}

export function clearActiveOrderId(): void {
  try {
    localStorage.removeItem(ACTIVE_ORDER_ID_KEY);
  } catch (e) {
    console.warn('Could not clear active order id:', e);
  }
}

/**
 * Checks if this device, hardware signature, or user account already has an
 * active pending or in-progress order.
 *
 * An order is considered "active" if:
 * status is 'pending' OR 'in-progress'
 *
 * If completed, delivered, or cancelled, the user/device is free to order again.
 */
export async function getActivePendingOrder(
  userId?: string | null,
  userEmail?: string | null
): Promise<Order | null> {
  const currentDeviceId = getDeviceId();
  const currentFingerprint = getDeviceFingerprint();
  let storedActiveOrderId = localStorage.getItem(ACTIVE_ORDER_ID_KEY);
  if (storedActiveOrderId === 'undefined' || storedActiveOrderId === 'null' || storedActiveOrderId?.trim() === '') {
    clearActiveOrderId();
    storedActiveOrderId = null;
  }

  // 1. Check local cached orders first (ultra-fast check)
  const cachedOrders = getCachedOrders();
  for (const order of Object.values(cachedOrders)) {
    if (!order || !order.id || order.id === 'undefined' || order.id === 'null' || String(order.id).trim() === '') continue;
    const isPendingOrInProgress = order.status === 'pending' || order.status === 'in-progress';
    if (!isPendingOrInProgress) continue;

    // Check device ID match
    if (order.deviceId && order.deviceId === currentDeviceId) {
      return order;
    }
    // Check stored active order ID
    if (storedActiveOrderId && order.id === storedActiveOrderId) {
      return order;
    }
    // Check hardware fingerprint match
    if (order.deviceFingerprint && order.deviceFingerprint === currentFingerprint) {
      return order;
    }
    // Check authenticated user ID
    if (userId && order.customerId === userId) {
      return order;
    }
    // Check customer email match
    if (
      userEmail &&
      order.customerInfo?.email &&
      order.customerInfo.email.toLowerCase().trim() === userEmail.toLowerCase().trim()
    ) {
      return order;
    }
  }

  // 2. Query Firestore orders with safety timeout (checks live database across tabs/browsers)
  try {
    const ordersRef = collection(db, 'orders');
    // Fetch pending and in-progress orders
    const pendingQuery = query(ordersRef, where('status', 'in', ['pending', 'in-progress']));

    const queryTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    const querySnapshot = await Promise.race([getDocs(pendingQuery), queryTimeout]);

    if (querySnapshot && 'forEach' in querySnapshot) {
      let matchedOrder: Order | null = null;
      querySnapshot.forEach((docSnap) => {
        if (matchedOrder) return;
        if (!docSnap.id || docSnap.id === 'undefined' || docSnap.id === 'null') return;
        const data = { id: docSnap.id, ...docSnap.data() } as Order;
        if (!data.id || data.id === 'undefined' || data.id === 'null') return;
        const isPendingOrInProgress = data.status === 'pending' || data.status === 'in-progress';
        if (!isPendingOrInProgress) return;

        // Match against deviceId
        if (data.deviceId && data.deviceId === currentDeviceId) {
          matchedOrder = data;
          return;
        }
        // Match against device fingerprint
        if (data.deviceFingerprint && data.deviceFingerprint === currentFingerprint) {
          matchedOrder = data;
          return;
        }
        // Match against authenticated user
        if (userId && data.customerId === userId) {
          matchedOrder = data;
          return;
        }
        // Match against user email
        if (
          userEmail &&
          data.customerInfo?.email &&
          data.customerInfo.email.toLowerCase().trim() === userEmail.toLowerCase().trim()
        ) {
          matchedOrder = data;
          return;
        }
        // Match against localStorage stored active order
        if (storedActiveOrderId && data.id === storedActiveOrderId) {
          matchedOrder = data;
          return;
        }
      });

      if (matchedOrder) {
        return matchedOrder;
      }
    }
  } catch (err) {
    console.warn('Firestore active order check notice (fallback to local cache):', err);
  }

  return null;
}
