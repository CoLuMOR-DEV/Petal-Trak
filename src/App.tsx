/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { db, testConnection } from './lib/firebase';
import { seedDatabaseIfEmpty, INITIAL_PRODUCTS, INITIAL_INVENTORY, INITIAL_STUDIO_SETTINGS } from './data/seedData';
import { subscribeToProductsRealtime, getCachedProducts, subscribeToInventoryRealtime, getCachedInventory } from './lib/realtimeSync';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ProductItem, InventoryItem, StudioSettings, FlowerType } from './types';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { EditProfileModal } from './components/EditProfileModal';
import { CartDrawer } from './components/CartDrawer';
import { LandingPage } from './views/LandingPage';
import { PremadeFlowersPage } from './views/PremadeFlowersPage';
import { CustomizeFlowerPage } from './views/CustomizeFlowerPage';
import { CheckoutFlow } from './views/CheckoutFlow';
import { OrderTrackerPage } from './views/OrderTrackerPage';
import { OwnerDashboard } from './views/OwnerDashboard';

function ViewLoadingFallback() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center" aria-live="polite" aria-busy="true">
      <div className="w-10 h-10 border-3 border-[#F0D9DD] border-t-[#F4A6B0] rounded-full animate-spin mb-4" />
      <p className="text-xs font-semibold uppercase tracking-widest text-[#8A7E72]">Loading Studio...</p>
    </div>
  );
}

function AppContent() {
  const { role } = useAuth();

  // Navigation state
  const checkPrivateOwnerRoute = () => {
    if (typeof window === 'undefined') return false;
    try {
      const url = new URL(window.location.href);
      const search = url.searchParams;
      const hash = url.hash.toLowerCase();
      const path = url.pathname.toLowerCase();

      return (
        search.get('portal') === 'owner' ||
        search.has('portal') ||
        search.has('owner') ||
        search.has('admin') ||
        search.get('view') === 'owner' ||
        search.get('page') === 'owner' ||
        path.includes('/portal') ||
        path.endsWith('/owner') ||
        path.endsWith('/admin') ||
        hash === '#/owner' ||
        hash === '#owner' ||
        hash === '#/admin' ||
        hash === '#admin'
      );
    } catch {
      return false;
    }
  };

  const [currentView, setCurrentView] = useState<string>(() => 
    checkPrivateOwnerRoute() ? 'owner-dashboard' : 'home'
  );
  const [preselectedCustomizeType, setPreselectedCustomizeType] = useState<FlowerType>('rose');
  const [activeTrackerOrderId, setActiveTrackerOrderId] = useState<string | null>(null);

  // Modals & Drawers
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Shared studio data from Firestore (with realistic fallbacks and instant cache)
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
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return INITIAL_STUDIO_SETTINGS;
  });

  // Real-time synchronization events between Owner Dashboard and Storefront
  useEffect(() => {
    const handleProductsUpdate = (e: any) => {
      setTimeout(() => {
        if (e?.detail && Array.isArray(e.detail)) {
          setProducts(e.detail);
        } else {
          try {
            const cached = localStorage.getItem('lypetal_products_cache');
            if (cached) setProducts(JSON.parse(cached));
          } catch {}
        }
      }, 0);
    };

    const handleInventoryUpdate = (e: any) => {
      setTimeout(() => {
        if (e?.detail && Array.isArray(e.detail)) {
          setInventory(e.detail);
        } else {
          setInventory(getCachedInventory());
        }
      }, 0);
    };

    const handleSettingsUpdate = (e: any) => {
      setTimeout(() => {
        if (e?.detail) {
          setStudioSettings(e.detail);
        } else {
          try {
            const cached = localStorage.getItem('lypetal_studio_settings_cache');
            if (cached) setStudioSettings(JSON.parse(cached));
          } catch {}
        }
      }, 0);
    };

    window.addEventListener('lypetal_products_updated', handleProductsUpdate);
    window.addEventListener('lypetal_inventory_updated', handleInventoryUpdate);
    window.addEventListener('lypetal_settings_updated', handleSettingsUpdate);
    window.addEventListener('storage', handleProductsUpdate);

    return () => {
      window.removeEventListener('lypetal_products_updated', handleProductsUpdate);
      window.removeEventListener('lypetal_inventory_updated', handleInventoryUpdate);
      window.removeEventListener('lypetal_settings_updated', handleSettingsUpdate);
      window.removeEventListener('storage', handleProductsUpdate);
    };
  }, []);

  // Always reset window scroll to top when switching views
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [currentView]);

  useEffect(() => {
    // Check for track order or owner link in URL
    const handleUrlChange = () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const trackId = params.get('track') || params.get('order');
        if (trackId && trackId !== 'undefined' && trackId !== 'null' && trackId.trim() !== '') {
          setActiveTrackerOrderId(trackId.trim());
          setCurrentView('tracker');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        const approveAdmin = params.get('approve_admin');
        if (approveAdmin) {
          setCurrentView('owner-dashboard');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }

      if (checkPrivateOwnerRoute()) {
        setCurrentView(prev => prev === 'owner-dashboard' ? prev : 'owner-dashboard');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    handleUrlChange();

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  useEffect(() => {
    // 1. Check connection and seed database if empty
    testConnection();
    seedDatabaseIfEmpty(db);

    // 2. Real-time products listener (unified multi-tier sync)
    const unsubProducts = subscribeToProductsRealtime((updatedProducts) => {
      if (Array.isArray(updatedProducts) && updatedProducts.length > 0) {
        setProducts(updatedProducts);
      }
    });

    // 3. Real-time inventory listener (unified multi-tier sync)
    const unsubInv = subscribeToInventoryRealtime((updatedInventory) => {
      if (Array.isArray(updatedInventory) && updatedInventory.length > 0) {
        setInventory(updatedInventory);
      }
    });

    // 4. Real-time studio settings
    const unsubSettings = onSnapshot(doc(db, 'studioSettings', 'content'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as StudioSettings;
        setStudioSettings(data);
        try {
          localStorage.setItem('lypetal_studio_settings_cache', JSON.stringify(data));
        } catch {}
      }
    }, (err) => console.warn('Settings sync notice:', err));

    return () => {
      unsubProducts();
      unsubInv();
      unsubSettings();
    };
  }, []);

  const handleOpenAuth = (mode: 'login' | 'signup' = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleNavigateToCustomize = (flowerType: FlowerType = 'rose') => {
    setPreselectedCustomizeType(flowerType);
    setCurrentView('customize');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectProductForOrder = (productId: string) => {
    const found = products.find(p => p.id === productId);
    if (found) {
      setPreselectedCustomizeType(found.flowerType);
    }
    setCurrentView('premade');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderSuccess = (orderId: string) => {
    if (orderId && orderId !== 'undefined' && orderId !== 'null' && orderId.trim() !== '') {
      setActiveTrackerOrderId(orderId.trim());
    }
    setCurrentView('tracker');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FCFAF8] text-[#2D2A2E] selection:bg-[#F0D9DD] selection:text-[#2D2A2E]">
      
      {/* Universal Header */}
      {currentView !== 'owner-dashboard' && (
        <Navbar
          currentView={currentView}
          setCurrentView={(view) => {
            setCurrentView(view);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenCart={() => setCartDrawerOpen(true)}
          onOpenAuth={handleOpenAuth}
          onOpenProfile={() => setProfileModalOpen(true)}
        />
      )}

      {/* Main View Router based on Step Flow with smooth view transitions */}
      <main className="flex-1 overflow-x-clip">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <React.Suspense fallback={<ViewLoadingFallback />}>
              {currentView === 'home' && (
                <LandingPage
                  products={products}
                  studioSettings={studioSettings}
                  onNavigateToPremade={() => {
                    setCurrentView('premade');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onNavigateToCustomize={() => handleNavigateToCustomize('rose')}
                  onSelectProductForOrder={handleSelectProductForOrder}
                />
              )}

              {currentView === 'premade' && (
                <PremadeFlowersPage
                  products={products}
                  inventory={inventory}
                  onNavigateToCustomize={handleNavigateToCustomize}
                  onOpenCart={() => setCartDrawerOpen(true)}
                />
              )}

              {currentView === 'customize' && (
                <CustomizeFlowerPage
                  products={products}
                  inventory={inventory}
                  preselectedType={preselectedCustomizeType}
                  onBackToPremade={() => {
                    setCurrentView('premade');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onOpenCart={() => setCartDrawerOpen(true)}
                />
              )}

              {currentView === 'checkout' && (
                <CheckoutFlow
                  inventory={inventory}
                  studioSettings={studioSettings}
                  onOrderSuccess={handleOrderSuccess}
                  onCancel={() => {
                    setCurrentView('premade');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onOpenAuth={handleOpenAuth}
                />
              )}

              {currentView === 'tracker' && (
                <OrderTrackerPage
                  initialOrderId={activeTrackerOrderId}
                  onReturnHome={() => {
                    setCurrentView('home');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onNavigateToCatalog={() => {
                    setCurrentView('premade');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              )}

              {currentView === 'owner-dashboard' && (
                <OwnerDashboard
                  onReturnToStore={() => {
                    setTimeout(() => {
                      setCurrentView('home');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }, 0);
                  }}
                />
              )}
            </React.Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartDrawerOpen}
        onClose={() => setCartDrawerOpen(false)}
        onProceedToCheckout={() => {
          setCartDrawerOpen(false);
          setCurrentView('checkout');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onNavigateToCustomize={() => {
          setCartDrawerOpen(false);
          handleNavigateToCustomize('rose');
        }}
        onNavigateToPremade={() => {
          setCartDrawerOpen(false);
          setCurrentView('premade');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenAuth={handleOpenAuth}
        onTrackOrder={handleOrderSuccess}
      />

      {/* Auth Dialog */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
        onSuccess={() => {
          if (role === 'owner') {
            setCurrentView('owner-dashboard');
          }
        }}
      />

      {/* Edit Profile & Location Dialog */}
      <EditProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />

      {/* Universal Studio Footer */}
      {currentView !== 'owner-dashboard' && (
        <Footer
          setCurrentView={(view) => {
            setCurrentView(view);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          studioSettings={studioSettings}
        />
      )}

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <AppContent />
      </CartProvider>
    </AuthProvider>
  );
}
