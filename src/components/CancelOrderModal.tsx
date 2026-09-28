import React, { useState } from 'react';
import { 
  X, 
  AlertTriangle, 
  HelpCircle, 
  Loader2, 
  CheckCircle2, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Order } from '../types';
import { cancelOrderRealtime } from '../lib/realtimeSync';

interface CancelOrderModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onCancelled?: (reason: string) => void;
}

const PREDEFINED_REASONS = [
  'Changed my mind',
  'Found or bought flowers elsewhere',
  'Delivery date no longer works for me',
  'Need to change ribbon colors or bouquet details (will re-order)',
  'Ordered by mistake / duplicate order',
  'Budget constraints',
  'Other: (specify below)',
];

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  isOpen,
  order,
  onClose,
  onCancelled,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [otherText, setOtherText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!order) return null;

  const isOther = selectedReason === 'Other: (specify below)';
  const finalReason = isOther ? `Other: ${otherText.trim()}` : selectedReason;
  const isSubmitDisabled = submitting || !selectedReason || (isOther && otherText.trim().length < 3);

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await cancelOrderRealtime(order.id, finalReason, 'customer');
      if (onCancelled) {
        onCancelled(finalReason);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to cancel order:', err);
      setErrorMessage(err?.message || 'Could not cancel order. Please try again or message Allyson.');
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!submitting ? onClose : undefined}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg bg-white rounded-3xl border border-[#F0D9DD] shadow-2xl overflow-hidden z-10 my-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#F5EBE6] bg-[#FCFAF8]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-100/70 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif-title text-base sm:text-lg font-bold text-[#2D2A2E]">
                    Cancel Order #{order.id}
                  </h3>
                  <p className="text-[11px] text-[#7C7472]">
                    Please provide a cancellation reason
                  </p>
                </div>
              </div>
              <button
                disabled={submitting}
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#7C7472] hover:bg-[#FAF6F0] hover:text-[#2D2A2E] transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleConfirmCancel} className="p-5 sm:p-6 space-y-5">
              <div className="p-3.5 rounded-2xl bg-[#FCFAF8] border border-[#E8E2DA] text-xs text-[#5C5552] leading-relaxed">
                We understand that plans change! Please let us know why you're cancelling so Allyson can release the reserved satin ribbon and wrapping materials back to the studio.
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600">
                  {errorMessage}
                </div>
              )}

              {/* Reason Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#2D2A2E] uppercase tracking-wider">
                  Select Reason for Cancellation <span className="text-red-500">*</span>
                </label>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {PREDEFINED_REASONS.map((reason) => {
                    const isSelected = selectedReason === reason;
                    return (
                      <label
                        key={reason}
                        onClick={() => setSelectedReason(reason)}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#F4A6B0]/15 border-[#F4A6B0] shadow-2xs font-semibold text-[#2D2A2E]'
                            : 'bg-white border-[#E8E2DA] hover:bg-[#FAF6F0] text-[#5C5552]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="cancellationReason"
                          value={reason}
                          checked={isSelected}
                          onChange={() => setSelectedReason(reason)}
                          className="mt-0.5 accent-[#F4A6B0] cursor-pointer"
                        />
                        <span className="flex-1 leading-snug">{reason}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Custom Text Area for "Other: ___" */}
              <AnimatePresence>
                {isOther && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1.5 overflow-hidden"
                  >
                    <label className="block text-xs font-bold text-[#2D2A2E]">
                      Please specify your custom reason: <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      autoFocus
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      placeholder="e.g., My anniversary was rescheduled to next month, so I will re-order closer to that date."
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#E8E2DA] focus:outline-none focus:ring-2 focus:ring-[#F4A6B0] text-[#2D2A2E] placeholder-[#A89E9C] resize-none"
                    />
                    <div className="flex justify-between text-[11px] text-[#7C7472]">
                      <span>Minimum 3 characters</span>
                      <span>{otherText.length} characters</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onClose}
                  className="w-full sm:w-1/2 py-3 rounded-xl border border-[#DCD3C7] text-xs font-bold text-[#5C5552] hover:bg-[#FAF6F0] transition-colors cursor-pointer"
                >
                  Keep My Order
                </button>

                <button
                  type="submit"
                  disabled={isSubmitDisabled}
                  className="w-full sm:w-1/2 py-3 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-500 hover:bg-red-600 text-white shadow-2xs hover:shadow transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Cancelling Order...</span>
                    </>
                  ) : (
                    <span>Confirm Cancellation</span>
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
