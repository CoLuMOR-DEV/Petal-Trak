import React, { useState } from 'react';
import { 
  Sparkles, 
  ShoppingBag, 
  Check, 
  Plus, 
  Minus, 
  AlertCircle,
  Flower2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProductItem, InventoryItem, FlowerColor, FlowerType } from '../types';
import { useCart } from '../context/CartContext';

interface PremadeFlowersPageProps {
  products: ProductItem[];
  inventory: InventoryItem[];
  onNavigateToCustomize: (preselectedType?: FlowerType) => void;
  onOpenCart: () => void;
}

export const PremadeFlowersPage: React.FC<PremadeFlowersPageProps> = ({
  products,
  inventory,
  onNavigateToCustomize,
  onOpenCart,
}) => {
  const { addToCart } = useCart();
  
  // Selected colors per product
  const [selectedColors, setSelectedColors] = useState<{ [prodId: string]: FlowerColor }>({
    rose: 'Pastel Pink',
    dahlia: 'Pastel Pink',
  });

  // Quantities per product
  const [quantities, setQuantities] = useState<{ [prodId: string]: number }>({
    rose: 1,
    dahlia: 1,
  });

  // Feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Helper to map flower color name to inventory stock
  const getColorStock = (colorName: FlowerColor): number => {
    const colorIdMap: { [key: string]: string } = {
      'Pastel Pink': 'color_pastel_pink',
      'Pink': 'color_pink',
      'Violet': 'color_violet',
      'White': 'color_white',
      'Yellow': 'color_yellow',
      'Sage Green': 'color_sage_green',
      'Emerald': 'color_emerald',
      'Brown': 'color_brown',
    };
    const invId = colorIdMap[colorName];
    const found = inventory.find(i => 
      (invId && i.id === invId) || 
      (i.category === 'color' && i.name.toLowerCase().includes(colorName.toLowerCase())) ||
      i.name.toLowerCase().includes(colorName.toLowerCase())
    );
    return found ? (typeof found.stock === 'number' ? Math.max(0, found.stock) : 0) : 15;
  };

  const handleColorSelect = (prodId: string, color: FlowerColor) => {
    setSelectedColors(prev => ({ ...prev, [prodId]: color }));
  };

  const handleQuantityChange = (prodId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[prodId] || 1;
      const next = Math.max(1, current + delta);
      return { ...prev, [prodId]: next };
    });
  };

  const handleAddToOrder = async (prod: ProductItem) => {
    const color = selectedColors[prod.id] || prod.availableColors[0];
    const quantity = quantities[prod.id] || 1;
    const unitPrice = prod.basePrice;
    const totalPrice = unitPrice * quantity;

    setAddingId(prod.id);
    try {
      await addToCart({
        type: 'premade',
        flowerType: prod.flowerType,
        flowerName: prod.name,
        color: color,
        stemsCount: 1,
        unitPrice,
        quantity,
        totalPrice,
      });

      setToastMessage(`Added ${quantity} × ${color} ${prod.name} to basket!`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.error(err);
    } finally {
      setAddingId(null);
    }
  };

  // Visual color swatch hex approximations for satin luster
  const colorSwatchMap: { [key in FlowerColor]: string } = {
    'Pastel Pink': '#F9D5DF',
    'Pink': '#F48FB1',
    'Violet': '#B388FF',
    'White': '#FFFFFF',
    'Yellow': '#FFF59D',
    'Sage Green': '#C8E6C9',
    'Emerald': '#2E7D32',
    'Brown': '#8D6E63',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      
      {/* Page Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#F0D9DD] text-[#7A4B53] text-xs font-bold uppercase tracking-wider">
          <Flower2 className="w-3.5 h-3.5" />
          LYPetal • Single Stems
        </div>
        <h1 className="font-serif-title text-3xl sm:text-4xl lg:text-5xl font-bold text-[#2D2A2E]">
          Premade Satin Flowers
        </h1>
        <p className="text-xs sm:text-sm text-[#5C5552] leading-relaxed">
          Pick your favorite flower and ribbon color for a simple, ready-to-gift stem. Want multiple stems, mixed colors, or custom wrapping? Click <strong>Customize a Bouquet</strong>!
        </p>

        {/* View Switcher Bar */}
        <div className="pt-2 flex justify-center">
          <div className="inline-flex flex-wrap justify-center p-1 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] gap-1 max-w-full">
            <span className="px-3 sm:px-4 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-white text-[#2D2A2E] shadow-2xs flex items-center">
              Single Stems (Premade)
            </span>
            <button
              onClick={() => onNavigateToCustomize()}
              className="px-3 sm:px-4 py-2 min-h-[38px] rounded-xl text-xs font-semibold text-[#5C5552] hover:text-[#2D2A2E] hover:bg-white/60 flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F4A6B0] shrink-0" />
              <span>Customize a Bouquet</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-[#2D2A2E] text-white text-xs font-semibold shadow-2xl flex items-center gap-3 border border-white/10"
          >
            <div className="w-6 h-6 rounded-full bg-[#F5EFC0] text-[#2D2A2E] flex items-center justify-center font-bold">
              ✓
            </div>
            <span>{toastMessage}</span>
            <button
              onClick={onOpenCart}
              className="ml-2 px-2.5 py-1 rounded-lg bg-[#F4A6B0] text-[#2D2A2E] text-[11px] font-bold uppercase tracking-wider hover:bg-white transition-colors"
            >
              View Basket
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10 max-w-5xl mx-auto">
        {products.map((prod) => {
          const currentColor = selectedColors[prod.id] || prod.availableColors[0];
          const currentQty = quantities[prod.id] || 1;
          const liveTotal = prod.basePrice * currentQty;

          return (
            <motion.div
              key={prod.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="bg-white rounded-3xl p-5 sm:p-7 border border-[#F0D9DD] shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-5">
                {/* Product Image & Badges */}
                <div className="relative rounded-2xl overflow-hidden aspect-4/3 bg-[#FAF6F0] border border-[#F0D9DD]/40">
                  <img
                    src={prod.imageUrl}
                    alt={prod.name}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#F5EFC0] text-[#70640F] text-xs font-bold shadow-xs">
                    {prod.badge}
                  </div>
                  <div className="absolute bottom-3 right-3 px-3.5 py-1.5 rounded-xl bg-[#2D2A2E]/80 backdrop-blur-xs text-white text-xs font-semibold shadow-sm">
                    ₱{prod.basePrice} base / pc
                  </div>
                </div>

                {/* Name and Description */}
                <div>
                  <h2 className="font-serif-title text-xl sm:text-2xl font-bold text-[#2D2A2E]">
                    {prod.name}
                  </h2>
                  <p className="text-xs text-[#5C5552] mt-1.5 leading-relaxed">
                    {prod.description}
                  </p>
                </div>

                {/* Color Selector */}
                <div className="space-y-2.5 pt-2 border-t border-[#F0D9DD]/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#2D2A2E] uppercase tracking-wide">
                      Choose Ribbon Color:
                    </label>
                    <span className="text-xs font-semibold text-[#F4A6B0]">
                      {currentColor}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {prod.availableColors.map((color) => {
                      const stock = getColorStock(color);
                      const isOutOfStock = stock <= 0;
                      const isSelected = currentColor === color;

                      return (
                        <button
                          key={color}
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => handleColorSelect(prod.id, color)}
                          className={`relative p-2.5 rounded-xl border text-left transition-all flex flex-col items-center justify-center gap-1.5 min-h-[60px] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] cursor-pointer ${
                            isSelected
                              ? 'border-[#2D2A2E] bg-[#FAF6F0] ring-2 ring-[#F4A6B0]'
                              : isOutOfStock
                              ? 'opacity-40 border-gray-200 cursor-not-allowed bg-gray-50'
                              : 'border-[#E8E2DA] hover:border-[#F4A6B0] bg-white'
                          }`}
                        >
                          <span 
                            className="w-5 h-5 rounded-full border border-black/15 shadow-2xs shrink-0"
                            style={{ backgroundColor: colorSwatchMap[color] || '#FFF' }}
                          />
                          <span className="text-[10px] font-semibold text-[#2D2A2E] text-center leading-tight truncate w-full px-1">
                            {color}
                          </span>
                          {isOutOfStock ? (
                            <span className="text-[9px] text-red-500 font-bold">Out</span>
                          ) : (
                            <span className="text-[9px] text-[#7C7472]">{stock} in stock</span>
                          )}
                          {isSelected && (
                            <span className="absolute top-1 right-1 text-[#2D2A2E]">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quantity Selector & Live Total Price */}
                <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-[#5C5552] uppercase tracking-wide block">
                      Quantity:
                    </span>
                    <p className="text-[10px] text-[#7C7472]">₱{prod.basePrice} per stem</p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(prod.id, -1)}
                      className="w-10 h-10 min-h-[40px] min-w-[40px] rounded-xl bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD]/40 active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-4 h-4 shrink-0" />
                    </button>

                    <span className="w-8 text-center font-bold text-sm text-[#2D2A2E] select-none">
                      {currentQty}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleQuantityChange(prod.id, 1)}
                      className="w-10 h-10 min-h-[40px] min-w-[40px] rounded-xl bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD]/40 active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
                </div>

                {/* Live Total Price Banner */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-[#5C5552] font-semibold">
                    Total:
                  </span>
                  <span className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                    ₱{(liveTotal ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Actions: Add to Order & Customize */}
              <div className="pt-6 mt-6 border-t border-[#F0D9DD]/60 space-y-2.5">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  id={`btn-add-to-order-${prod.id}`}
                  onClick={() => handleAddToOrder(prod)}
                  disabled={addingId === prod.id}
                  className="w-full py-3.5 min-h-[46px] rounded-xl text-xs font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>{addingId === prod.id ? 'Adding to Basket...' : `Add to Basket (₱${liveTotal})`}</span>
                </motion.button>

                <button
                  id={`btn-customize-${prod.id}`}
                  onClick={() => onNavigateToCustomize(prod.flowerType)}
                  className="w-full py-3 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider bg-white hover:bg-[#FAF6F0] text-[#2D2A2E] border border-[#E8E2DA] transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2A2E]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C98A12] shrink-0" />
                  <span>Build Custom Bouquet</span>
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
};
