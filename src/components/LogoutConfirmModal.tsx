import React from 'react';
import { LogOut, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userName?: string;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  userName,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#F0D9DD] relative z-10 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-[#7C7472] hover:bg-[#FAF6F0] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2A2E] cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>

            {/* Icon */}
            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-rose-50 border border-rose-100 text-[#C53030]">
              <LogOut className="w-5 h-5" />
            </div>

            <h3 className="font-serif-title text-xl font-bold text-[#2D2A2E]">
              Log Out?
            </h3>
            <p className="text-xs text-[#7C7472] mt-1.5 leading-relaxed px-2">
              {userName ? `${userName}, are` : 'Are'} you sure you want to log out of your LYPetal account? You will need to log back in to track orders or use your saved address.
            </p>

            {/* Action buttons */}
            <div className="flex items-center gap-2.5 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 min-h-[42px] rounded-xl border border-[#DCD3C7] text-xs font-bold text-[#5C5552] hover:bg-[#FAF6F0] active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="flex-1 py-2.5 min-h-[42px] rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:shadow active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Yes, Log Out</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
