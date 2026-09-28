import React, { useState, useEffect } from 'react';
import { X, User, Phone, MapPin, CheckCircle, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose }) => {
  const { profile, updateCustomerProfile, role } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [age, setAge] = useState<number | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sync with current profile whenever modal opens or profile changes
  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setPhone(profile.phone || '');
      setAddress(profile.address || '');
      setAge(profile.age);
      setError(null);
      setSuccess(false);
    }
  }, [profile, isOpen]);

  const addressLength = address.trim().length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please provide your first and last name.');
      return;
    }

    if (!phone.trim()) {
      setError('Please provide your contact phone number.');
      return;
    }

    // Minimum 10 letters for delivery location
    if (address.trim().length < 10) {
      setError('Delivery address must be at least 10 letters long (e.g., Street, Barangay, City) so our courier can locate you.');
      return;
    }

    setSubmitting(true);
    try {
      await updateCustomerProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        age: age ? Number(age) : undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1400);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setError(err?.message || 'Failed to update profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
            onClick={onClose}
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
              onClick={onClose}
              className="absolute top-4 right-4 p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-[#7C7472] hover:bg-[#FAF6F0] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2A2E]"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>

            {/* Header */}
            <div className="text-center mb-5">
              <div className="w-11 h-11 rounded-2xl mx-auto mb-2 flex items-center justify-center bg-gradient-to-tr from-[#F0D9DD] to-[#F5EFC0] text-[#2D2A2E] shadow-2xs">
                <MapPin className="w-5 h-5 text-[#F4A6B0]" />
              </div>
              <h3 className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                Update Profile & Address
              </h3>
              <p className="text-xs text-[#7C7472] mt-1">
                Keep your contact number and home address updated for smooth deliveries
              </p>
            </div>

            {/* Success Banner */}
            {success && (
              <motion.div 
                initial={{ opacity: 0, y: -6 }} 
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">Profile and delivery location updated successfully!</span>
              </motion.div>
            )}

            {/* Error Banner */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="font-medium leading-relaxed">{error}</p>
              </div>
            )}

            {/* Profile Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Email (Read only) */}
              <div>
                <label className="block text-[11px] font-bold text-[#5C5552] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-gray-100 border border-gray-200 text-gray-500 cursor-not-allowed"
                />
                <span className="text-[10px] text-[#A89E9C] mt-0.5 block">
                  {role === 'owner' ? 'Studio Owner Account' : 'Registered Customer Account'}
                </span>
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
                    placeholder="24"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0]"
                  />
                </div>
              </div>

              {/* Delivery Address / Location */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-[#5C5552]">
                    Delivery Location / Address *
                  </label>
                  <span className={`text-[10px] font-bold ${
                    addressLength >= 10 ? 'text-emerald-600' : 'text-amber-700'
                  }`}>
                    {addressLength}/10 letters min
                  </span>
                </div>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-[#A89E9C] absolute left-3 top-2.5" />
                  <textarea
                    required
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House/Unit No., Street Name, Barangay, City, Postal Code"
                    className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#FAF6F0] border resize-none focus:outline-none focus:ring-2 ${
                      addressLength > 0 && addressLength < 10
                        ? 'border-amber-400 focus:ring-amber-300'
                        : addressLength >= 10
                        ? 'border-emerald-300 focus:ring-emerald-200'
                        : 'border-[#E8E2DA] focus:ring-[#F4A6B0]'
                    }`}
                  />
                </div>
                <p className="text-[10px] text-[#7C7472] mt-1">
                  Moving or ordering for a friend? Changing this will update where your flower deliveries are brought.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-[#DCD3C7] text-xs font-bold text-[#5C5552] hover:bg-[#FAF6F0] active:scale-95 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-[#F4A6B0] hover:bg-[#EE8E9B] text-xs font-bold uppercase tracking-wider text-[#2D2A2E] shadow-2xs hover:shadow active:scale-95 transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
