import React, { useState } from 'react';
import { 
  ShoppingBag, 
  Sparkles, 
  User, 
  LogOut, 
  ShieldCheck, 
  Flower2, 
  Menu, 
  X,
  Compass,
  MapPin,
  Edit3,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { LogoutConfirmModal } from './LogoutConfirmModal';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  onOpenCart: () => void;
  onOpenAuth: (initialMode?: 'login' | 'signup') => void;
  onOpenProfile?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  onOpenCart,
  onOpenAuth,
  onOpenProfile,
}) => {
  const { user, profile, role, logOut, loading } = useAuth();
  const { itemCount } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const handleNav = (view: string) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  const isUserAuthenticated = Boolean(user || profile);

  // Check if profile is missing delivery address (min 10 letters) or phone number
  const isProfileIncomplete = Boolean(
    !loading &&
    isUserAuthenticated &&
    role !== 'owner' &&
    (!profile?.address || 
     profile.address.trim().length < 10 || 
     !profile?.phone || 
     profile.phone.trim().length < 7)
  );

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#F0D9DD]/70 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20 gap-2">
            
            {/* Brand Logo - LYPetal */}
            <div 
              onClick={() => handleNav('home')} 
              className="flex items-center gap-2 sm:gap-3 cursor-pointer group select-none shrink-0"
            >
              <motion.div 
                whileHover={{ rotate: 10, scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-[#F0D9DD] via-[#F5EFC0] to-[#A8D5C0] p-0.5 shadow-2xs shrink-0 overflow-hidden"
              >
                <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center p-1">
                  <img
                    src="/logo.svg"
                    alt="LYPetal Logo"
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </motion.div>
              <div className="leading-none">
                <div className="flex items-center gap-1.5">
                  <span className="font-serif-title font-bold text-lg sm:text-2xl text-[#2D2A2E] tracking-tight group-hover:text-[#E28292] transition-colors">
                    LYPetal
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-[#F0D9DD] text-[#7A4B53]">
                    Studio
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-[#7C7472] font-sans tracking-wide mt-0.5">
                  Handmade Satin Ribbon Flowers
                </p>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
              <button
                onClick={() => handleNav('home')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  currentView === 'home'
                    ? 'bg-[#F0D9DD] text-[#2D2A2E] font-semibold shadow-2xs'
                    : 'text-[#5C5552] hover:text-[#2D2A2E] hover:bg-[#FAF6F0]'
                }`}
              >
                Home
              </button>
              <button
                onClick={() => handleNav('premade')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  currentView === 'premade'
                    ? 'bg-[#F0D9DD] text-[#2D2A2E] font-semibold shadow-2xs'
                    : 'text-[#5C5552] hover:text-[#2D2A2E] hover:bg-[#FAF6F0]'
                }`}
              >
                Premade Flowers
              </button>
              <button
                onClick={() => handleNav('customize')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  currentView === 'customize'
                    ? 'bg-[#F0D9DD] text-[#2D2A2E] font-semibold shadow-2xs'
                    : 'text-[#5C5552] hover:text-[#2D2A2E] hover:bg-[#FAF6F0]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#F4A6B0]" />
                <span>Customize Bouquet</span>
              </button>
              <button
                onClick={() => handleNav('tracker')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  currentView === 'tracker'
                    ? 'bg-[#F0D9DD] text-[#2D2A2E] font-semibold shadow-2xs'
                    : 'text-[#5C5552] hover:text-[#2D2A2E] hover:bg-[#FAF6F0]'
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-[#A9D8E8]" />
                <span>Order Tracker</span>
              </button>

              {/* Owner portal access */}
              {role === 'owner' && (
                <button
                  onClick={() => handleNav('owner-dashboard')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    currentView === 'owner-dashboard'
                      ? 'bg-[#2D2A2E] text-white shadow-2xs'
                      : 'text-[#2D2A2E] bg-[#F5EFC0] hover:bg-[#ebd99d]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#F4A6B0]" />
                  <span>Owner Dashboard</span>
                </button>
              )}
            </nav>

            {/* Right Action Icons */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              
              {/* Shopping Bag Button (Available across all devices) */}
              <motion.button
                id="nav-cart-btn"
                whileTap={{ scale: 0.95 }}
                onClick={onOpenCart}
                className="relative min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-2xl bg-[#FAF6F0] hover:bg-[#F0D9DD] text-[#2D2A2E] border border-[#E8E2DA] transition-all flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                aria-label="View Shopping Cart"
              >
                <ShoppingBag className="w-5 h-5 text-[#2D2A2E] shrink-0" />
                <AnimatePresence>
                  {itemCount > 0 && (
                    <motion.span 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className="absolute -top-1 -right-1 bg-[#F4A6B0] text-[#2D2A2E] text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-2xs"
                    >
                      {itemCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>

              {/* Desktop User Section (Hidden on mobile and tablet to prevent compression) */}
              <div className="hidden lg:flex items-center gap-1.5 pl-1.5 border-l border-[#E8E2DA] shrink-0">
                {isUserAuthenticated ? (
                  <div className="flex items-center gap-1.5">
                    {/* Profile Name & Location */}
                    <button 
                      onClick={() => onOpenProfile ? onOpenProfile() : (role === 'owner' ? handleNav('owner-dashboard') : handleNav('tracker'))}
                      title="Click to view & edit your profile or location"
                      className="cursor-pointer text-right flex flex-col items-end px-2 py-1 rounded-xl hover:bg-[#FAF6F0] transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-bold text-[#2D2A2E] leading-tight truncate max-w-[110px]">
                          {profile?.firstName || 'My Account'}
                        </p>
                        {isProfileIncomplete && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Profile incomplete" />
                        )}
                      </div>
                      <span className="text-[10px] text-[#7C7472] uppercase tracking-wider font-semibold flex items-center gap-0.5">
                        {role === 'owner' ? 'Studio Owner' : (
                          <span className="flex items-center text-[#E28292]">
                            <MapPin className="w-2.5 h-2.5 mr-0.5 inline" />
                            {profile?.address ? 'Location Saved' : 'Set Location'}
                          </span>
                        )}
                      </span>
                    </button>

                    {/* Edit Profile & Location Button */}
                    <button
                      onClick={onOpenProfile}
                      title="Edit profile & delivery location"
                      className="relative min-h-[40px] min-w-[40px] p-2 rounded-xl text-[#7C7472] hover:text-[#2D2A2E] hover:bg-[#FAF6F0] active:scale-95 transition-all flex items-center justify-center shrink-0 border border-transparent hover:border-[#E8E2DA] cursor-pointer"
                      aria-label="Edit Profile"
                    >
                      <MapPin className="w-4 h-4 text-[#F4A6B0] shrink-0" />
                      {isProfileIncomplete && (
                        <span className="absolute 1 top-1 right-1 w-2 h-2 bg-amber-500 rounded-full" />
                      )}
                    </button>

                    {/* Log Out Button */}
                    <button
                      id="nav-logout-btn"
                      onClick={() => setLogoutConfirmOpen(true)}
                      title="Log out"
                      className="min-h-[40px] min-w-[40px] p-2 rounded-xl text-[#7C7472] hover:text-[#C53030] hover:bg-red-50 active:scale-95 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 shrink-0 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
                ) : (
                  <button
                    id="nav-auth-btn"
                    onClick={() => onOpenAuth('login')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold bg-[#F0D9DD]/90 hover:bg-[#F0D9DD] text-[#2D2A2E] border border-[#E8D0D5] transition-all shadow-2xs active:scale-95 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5 text-[#7A4B53] shrink-0" />
                    <span>Log In / Sign Up</span>
                  </button>
                )}
              </div>

              {/* Mobile & Tablet Sidebar Menu Toggle Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="relative min-h-[40px] min-w-[40px] p-2 rounded-xl text-[#2D2A2E] lg:hidden hover:bg-[#FAF6F0] active:scale-95 transition-all flex items-center justify-center shrink-0 border border-transparent hover:border-[#E8E2DA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] cursor-pointer"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6 shrink-0 text-[#2D2A2E]" /> : <Menu className="w-6 h-6 shrink-0 text-[#2D2A2E]" />}

                {/* Exclamation mark on sidebar toggle when profile is not fully set */}
                {isProfileIncomplete && (
                  <span 
                    title="Profile incomplete: Please provide your delivery address & contact number"
                    className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-2xs animate-pulse"
                  >
                    !
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile & Tablet Sidebar panel */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden lg:hidden bg-white border-b border-[#F0D9DD] px-4 pt-3 pb-5 space-y-2.5 shadow-xl"
            >
              {/* Profile Card inside Sidebar */}
              {isUserAuthenticated ? (
                <div className="space-y-2 pb-1">
                  {/* Notice if profile is incomplete */}
                  {isProfileIncomplete && (
                    <div 
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (onOpenProfile) onOpenProfile();
                      }}
                      className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 cursor-pointer active:scale-[0.99] transition-all flex items-start gap-2.5 shadow-2xs"
                    >
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-black shrink-0 mt-0.5 shadow-xs">
                        !
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold leading-tight text-amber-900">
                            Complete Your Profile
                          </p>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">
                            Action Required
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800/90 mt-1 leading-snug">
                          Please set your complete delivery address (minimum 10 letters) and phone number so we can deliver your blooms.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Clean Account Banner */}
                  <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-2xl bg-[#F0D9DD] flex items-center justify-center text-[#7A4B53] font-bold text-sm shrink-0 shadow-2xs">
                        {profile?.firstName ? profile.firstName[0].toUpperCase() : <User className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#2D2A2E] truncate">
                          {profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}` : user?.email || 'My Account'}
                        </p>
                        <span className="text-[10px] text-[#7C7472] uppercase tracking-wider font-semibold block">
                          {role === 'owner' ? 'Studio Owner' : 'Valued Customer'}
                        </span>
                        <div className="text-[11px] text-[#7C7472] truncate flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-[#F4A6B0] shrink-0" />
                          <span className="truncate">
                            {profile?.address ? profile.address : 'No delivery address set'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenProfile && (
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            onOpenProfile();
                          }}
                          title="Edit profile & location"
                          className="p-2 rounded-xl text-[#2D2A2E] bg-white border border-[#E8E2DA] hover:bg-[#FAF6F0] active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                          aria-label="Edit Profile"
                        >
                          <Edit3 className="w-4 h-4 text-[#7C7472]" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setLogoutConfirmOpen(true);
                        }}
                        title="Log Out"
                        className="p-2 rounded-xl text-[#C53030] bg-white border border-[#E8E2DA] hover:bg-red-50 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                        aria-label="Log Out"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pb-1">
                  <button
                    id="mobile-nav-auth-btn"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenAuth('login');
                    }}
                    className="w-full text-left px-4 py-3 min-h-[44px] rounded-2xl text-xs font-bold uppercase tracking-wider text-[#2D2A2E] bg-[#F0D9DD] hover:bg-[#EE8E9B] flex items-center justify-center gap-2 active:scale-[0.99] transition-all shadow-xs cursor-pointer"
                  >
                    <User className="w-4 h-4 text-[#7A4B53] shrink-0" />
                    <span>Log In / Sign Up</span>
                  </button>
                </div>
              )}

              {/* Navigation Items */}
              <div className="space-y-1 pt-1 border-t border-[#F0D9DD]/50">
                <button
                  onClick={() => handleNav('home')}
                  className={`w-full text-left px-4 py-3 min-h-[44px] rounded-xl text-sm font-medium flex items-center active:scale-[0.99] transition-all ${
                    currentView === 'home' ? 'bg-[#F0D9DD] font-semibold text-[#2D2A2E]' : 'text-[#5C5552] hover:bg-[#FAF6F0]'
                  }`}
                >
                  Home
                </button>
                <button
                  onClick={() => handleNav('premade')}
                  className={`w-full text-left px-4 py-3 min-h-[44px] rounded-xl text-sm font-medium flex items-center active:scale-[0.99] transition-all ${
                    currentView === 'premade' ? 'bg-[#F0D9DD] font-semibold text-[#2D2A2E]' : 'text-[#5C5552] hover:bg-[#FAF6F0]'
                  }`}
                >
                  Premade Flowers
                </button>
                <button
                  onClick={() => handleNav('customize')}
                  className={`w-full text-left px-4 py-3 min-h-[44px] rounded-xl text-sm font-medium flex items-center gap-2 active:scale-[0.99] transition-all ${
                    currentView === 'customize' ? 'bg-[#F0D9DD] font-semibold text-[#2D2A2E]' : 'text-[#5C5552] hover:bg-[#FAF6F0]'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-[#F4A6B0] shrink-0" />
                  <span>Customize Bouquet</span>
                </button>
                <button
                  onClick={() => handleNav('tracker')}
                  className={`w-full text-left px-4 py-3 min-h-[44px] rounded-xl text-sm font-medium flex items-center gap-2 active:scale-[0.99] transition-all ${
                    currentView === 'tracker' ? 'bg-[#F0D9DD] font-semibold text-[#2D2A2E]' : 'text-[#5C5552] hover:bg-[#FAF6F0]'
                  }`}
                >
                  <Compass className="w-4 h-4 text-[#A9D8E8] shrink-0" />
                  <span>Order Tracker</span>
                </button>

                {role === 'owner' && (
                  <button
                    onClick={() => handleNav('owner-dashboard')}
                    className="w-full text-left px-4 py-3 min-h-[44px] rounded-xl text-sm font-bold bg-[#2D2A2E] text-white flex items-center gap-2 active:scale-[0.99] transition-all"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#F5EFC0] shrink-0" />
                    <span>Owner Dashboard</span>
                  </button>
                )}
              </div>

              {/* Order Call to Action */}
              <div className="pt-2 border-t border-[#F0D9DD]/50">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleNav('premade');
                  }}
                  className="w-full py-3.5 min-h-[44px] text-center text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] rounded-xl active:scale-[0.98] transition-all flex items-center justify-center shadow-xs cursor-pointer"
                >
                  Place Order Now
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        isOpen={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={async () => {
          await logOut();
        }}
        userName={profile?.firstName}
      />
    </>
  );
};
