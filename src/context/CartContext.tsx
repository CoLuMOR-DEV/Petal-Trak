import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  writeBatch,
  getDocs
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { CartItem } from '../types';

interface CartContextType {
  items: CartItem[];
  loading: boolean;
  addToCart: (itemData: Omit<CartItem, 'id' | 'createdAt'>) => Promise<string>;
  updateQuantity: (itemId: string, newQuantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  subtotal: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('lypetal_cart_local');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState<boolean>(false);

  // Sync with Firestore when user is authenticated
  useEffect(() => {
    if (!user) {
      // Keep local storage synced for guest
      try {
        localStorage.setItem('lypetal_cart_local', JSON.stringify(items));
      } catch (err) {
        console.warn('LocalStorage error:', err);
      }
      return;
    }

    setLoading(true);
    const cartCollRef = collection(db, 'carts', user.uid, 'items');

    const unsubscribe = onSnapshot(
      cartCollRef,
      (snapshot) => {
        const fetched: CartItem[] = [];
        snapshot.forEach((d) => {
          fetched.push({ id: d.id, ...d.data() } as CartItem);
        });
        setItems(fetched);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `carts/${user.uid}/items`);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const addToCart = async (itemData: Omit<CartItem, 'id' | 'createdAt'>): Promise<string> => {
    const newItemId = `${itemData.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newItem: CartItem = {
      ...itemData,
      id: newItemId,
      createdAt: new Date().toISOString(),
    };

    if (!user) {
      // Guest cart logic
      if (itemData.type === 'premade') {
        // Can stack identical premade items
        const existingIdx = items.findIndex(
          i => i.type === 'premade' && i.flowerType === itemData.flowerType && i.color === itemData.color
        );
        if (existingIdx >= 0) {
          const updated = [...items];
          const exist = updated[existingIdx];
          const newQty = exist.quantity + itemData.quantity;
          updated[existingIdx] = {
            ...exist,
            quantity: newQty,
            totalPrice: newQty * exist.unitPrice,
          };
          setItems(updated);
          localStorage.setItem('lypetal_cart_local', JSON.stringify(updated));
          return exist.id;
        }
      }
      // Customized items or fresh premade
      const updated = [...items, newItem];
      setItems(updated);
      localStorage.setItem('lypetal_cart_local', JSON.stringify(updated));
      return newItemId;
    }

    // Authenticated user Firestore sync
    try {
      if (itemData.type === 'premade') {
        const existingItem = items.find(
          i => i.type === 'premade' && i.flowerType === itemData.flowerType && i.color === itemData.color
        );
        if (existingItem) {
          const newQty = existingItem.quantity + itemData.quantity;
          const updatedItem = {
            ...existingItem,
            quantity: newQty,
            totalPrice: newQty * existingItem.unitPrice,
          };
          await setDoc(doc(db, 'carts', user.uid, 'items', existingItem.id), updatedItem);
          return existingItem.id;
        }
      }

      // Customized items NEVER stack per requirement: generates unique ID
      await setDoc(doc(db, 'carts', user.uid, 'items', newItemId), newItem);
      return newItemId;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `carts/${user.uid}/items/${newItemId}`);
      throw error;
    }
  };

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      await removeItem(itemId);
      return;
    }

    if (!user) {
      const updated = items.map(i => {
        if (i.id === itemId) {
          return {
            ...i,
            quantity: newQuantity,
            totalPrice: newQuantity * i.unitPrice,
          };
        }
        return i;
      });
      setItems(updated);
      localStorage.setItem('lypetal_cart_local', JSON.stringify(updated));
      return;
    }

    try {
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      const updated = {
        ...item,
        quantity: newQuantity,
        totalPrice: newQuantity * item.unitPrice,
      };
      await setDoc(doc(db, 'carts', user.uid, 'items', itemId), updated);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `carts/${user.uid}/items/${itemId}`);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!user) {
      const updated = items.filter(i => i.id !== itemId);
      setItems(updated);
      localStorage.setItem('lypetal_cart_local', JSON.stringify(updated));
      return;
    }

    try {
      await deleteDoc(doc(db, 'carts', user.uid, 'items', itemId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `carts/${user.uid}/items/${itemId}`);
    }
  };

  const clearCart = async () => {
    if (!user) {
      setItems([]);
      localStorage.removeItem('lypetal_cart_local');
      return;
    }

    try {
      const cartCollRef = collection(db, 'carts', user.uid, 'items');
      const snap = await getDocs(cartCollRef);
      const batch = writeBatch(db);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setItems([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `carts/${user.uid}/items`);
    }
  };

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.totalPrice, 0), [items]);
  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const value = useMemo(() => ({
    items,
    loading,
    addToCart,
    updateQuantity,
    removeItem,
    clearCart,
    subtotal,
    itemCount,
  }), [items, loading, subtotal, itemCount]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
