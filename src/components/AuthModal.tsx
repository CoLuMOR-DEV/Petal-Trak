import React, { useState } from 'react';
import { X, Lock, Mail, User, Phone, MapPin, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  onSuccess,
}) => {
  const { logIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);

  // Form state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [age, setAge] = useState<number | undefined>(undefined);
  
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const res = await signInWithGoogle();
      if (res.isNewUser) {
        setMode('signup');
        setFirstName(res.firstName || '');
        setLastName(res.lastName || '');
        setEmail(res.email || '');
        if (res.email) {
          setUsername(res.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, ''));
        }
        setInfoMessage('Google account connected! Please enter a username, contact phone, and delivery address to finish creating your account.');
      } else {
        handleClose();
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      console.error('Google Sign-In notice:', err);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError('Google Sign-In was cancelled or unavailable. You can sign in using username/email & password below.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Reset or initialize state
  const resetForm = () => {
    setError(null);
    setInfoMessage(null);
    setUsername('');
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setPhone('');
    setAddress('');
    setAge(undefined);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (!username.trim()) {
        setError('Please enter a username.');
        return;
      }
      if (!firstName.trim() || !lastName.trim()) {
        setError('Please enter your first and last name.');
        return;
      }
      if (!email.trim()) {
        setError('Please enter your email address.');
        return;
      }
      if (!phone.trim()) {
        setError('Please enter your contact phone number.');
        return;
      }

      // Address validation: Minimum of 10 letters
      const cleanAddress = address.trim();
      if (cleanAddress.length < 10) {
        setError('Delivery address must be at least 10 letters long (e.g., Street, Barangay, City).');
        return;
      }

      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
    } else {
      if (!email.trim() || !password) {
        setError('Please enter your username or email and password.');
        return;
      }
    }

    setSubmitting(true);

    try {
      if (mode === 'signup') {
        await signUp({
          username: username.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          address: address.trim(),
          age: age ? Number(age) : undefined,
          password,
        });
      } else {
        await logIn(email.trim(), password);
      }

      handleClose();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes('NO_ACCOUNT_FOUND') || msg.includes('Account not found') || msg.includes('user-not-found') || msg.includes('No registered account')) {
          setMode('signup');
          if (email.includes('@')) {
            setEmail(email.trim());
          } else {
            setUsername(email.trim());
          }
          setInfoMessage('No account was found for this email or username. We have switched you to Sign Up so you can fill out the form and create your account!');
          setError(null);
          return;
        } else if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
          setError('Incorrect password. Please try again.');
        } else if (msg.includes('email-already-in-use') || msg.includes('already registered')) {
          setError('This email address is already registered. Please log in instead.');
        } else if (msg.includes('invalid-email')) {
          setError('Please enter a valid email address.');
        } else if (msg.includes('weak-password')) {
          setError('Password must be at least 6 characters.');
        } else {
          setError(msg);
        }
      } else {
        setError('Could not process request. Please check your details and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const addressLength = address.trim().length;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={handleClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-[#F0D9DD] relative max-h-[90vh] overflow-y-auto z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-[#7C7472] hover:bg-[#FAF6F0] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2A2E] cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>

            {/* Modal Header */}
            <div className="text-center mb-5">
              <div className="w-11 h-11 rounded-2xl mx-auto mb-2 flex items-center justify-center bg-gradient-to-tr from-[#F0D9DD] to-[#F5EFC0] text-[#2D2A2E] shadow-2xs">
                <Sparkles className="w-5 h-5 text-[#F4A6B0]" />
              </div>

              <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                {mode === 'login' ? 'Welcome Back' : 'Create Your Account'}
              </h3>
              <p className="text-xs text-[#7C7472] mt-1">
                {mode === 'login'
                  ? 'Sign in to check on your active orders and chat with Allyson'
                  : 'Set up your details and delivery address so we can send your flowers'}
              </p>
            </div>

            {/* Tab switcher (Login vs Signup) */}
            <div className="flex rounded-xl bg-[#FAF6F0] p-1 mb-4 border border-[#E8E2DA]">
              <button
                type="button"
                onClick={() => { 
                  setMode('login'); 
                  setError(null); 
                  setInfoMessage(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white text-[#2D2A2E] shadow-xs'
                    : 'text-[#7C7472] hover:text-[#2D2A2E]'
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => { 
                  setMode('signup'); 
                  setError(null); 
                  setInfoMessage(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-white text-[#2D2A2E] shadow-xs'
                    : 'text-[#7C7472] hover:text-[#2D2A2E]'
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Informative Guidance Message */}
            {infoMessage && (
              <div className="mb-4 p-3 rounded-xl bg-pink-50 border border-pink-200 text-xs text-[#7A4B53] flex items-start gap-2.5">
                <p className="font-medium leading-relaxed">{infoMessage}</p>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                <p className="font-medium leading-relaxed">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'signup' && (
                <>
                  {/* Username Field */}
                  <div>
                    <label className="block text-[11px] font-bold text-[#5C5552] mb-1">
                      Username *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[#A89E9C] absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Choose a username (e.g. hanz123)"
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                      />
                    </div>
                  </div>

                  {/* Name fields */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-[#5C5552] mb-1">
                        First Name *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-[#A89E9C] absolute left-3 top-2.5" />
                        <input
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="First name"
                          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#5C5552] mb-1">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        className="w-full px-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                      />
                    </div>
                  </div>

                  {/* Phone & Age */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-[#5C5552] mb-1">
                        Contact Phone *
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-[#A89E9C] absolute left-3 top-2.5" />
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="0912 345 6789"
                          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#5C5552] mb-1">
                        Age (Optional)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={age || ''}
                        onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder="22"
                        className="w-full px-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                      />
                    </div>
                  </div>

                  {/* Delivery Address (Minimum 10 letters) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-[#5C5552]">
                        Delivery Address / Location *
                      </label>
                      <span className={`text-[10px] font-bold ${
                        addressLength >= 10 ? 'text-emerald-600' : 'text-amber-700'
                      }`}>
                        {addressLength}/10 letters min
                      </span>
                    </div>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-[#A89E9C] absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Unit/House No., Street, Barangay, City"
                        className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border transition-colors focus:outline-none focus:ring-2 ${
                          addressLength > 0 && addressLength < 10
                            ? 'border-amber-400 focus:ring-amber-300'
                            : addressLength >= 10
                            ? 'border-emerald-300 focus:ring-emerald-200'
                            : 'border-[#E8E2DA] focus:ring-[#F4A6B0]'
                        }`}
                      />
                    </div>
                    <p className="text-[10px] text-[#7C7472] mt-1">
                      Enter complete address: street, barangay, and city for accurate flower delivery.
                    </p>
                  </div>
                </>
              )}

              {/* Username / Email Field */}
              <div>
                <label className="block text-[11px] font-bold text-[#5C5552] mb-1">
                  {mode === 'login' ? 'Username or Email *' : 'Email Address *'}
                </label>
                <div className="relative">
                  {mode === 'login' ? (
                    <User className="w-4 h-4 text-[#A89E9C] absolute left-3 top-2.5" />
                  ) : (
                    <Mail className="w-4 h-4 text-[#A89E9C] absolute left-3 top-2.5" />
                  )}
                  <input
                    type={mode === 'login' ? 'text' : 'email'}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={mode === 'login' ? 'Username or email address' : 'name@example.com'}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label className="block text-[11px] font-bold text-[#5C5552] mb-1">
                  Password * {mode === 'signup' && <span className="font-normal text-[#7C7472]">(at least 6 characters)</span>}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#A89E9C] absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                  />
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] shadow-xs hover:shadow transition-all active:scale-[0.98] disabled:opacity-70 mt-3 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#2D2A2E] shrink-0" />
                    <span>
                      {mode === 'signup' ? 'Creating Account...' : 'Logging In...'}
                    </span>
                  </>
                ) : (
                  mode === 'signup' ? 'Create Account' : 'Log In'
                )}
              </button>
            </form>

            {/* Divider and Google Sign-In Option */}
            <div className="relative my-4 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E8E2DA]" />
              </div>
              <span className="relative px-3 bg-white text-[10px] font-bold text-[#A89E9C] uppercase tracking-wider">
                or sign in with google
              </span>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl border border-[#E8E2DA] bg-white hover:bg-[#FAF6F0] text-[#2D2A2E] text-xs font-bold flex items-center justify-center gap-2.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Note */}
            <div className="mt-4 text-center text-xs text-[#7C7472]">
              <p className="text-[11px] text-[#A89E9C]">
                Need help? You can message Allyson anytime in the Order Tracker.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
