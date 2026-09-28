import React, { useState } from 'react';
import { 
  Sparkles, 
  ShoppingBag, 
  Check, 
  Plus, 
  Minus, 
  ArrowLeft,
  Layers,
  Palette,
  Package,
  Ribbon,
  AlertTriangle
} from 'lucide-react';
import { motion } from 'motion/react';
import { FlowerType, FlowerColor, WrapperColor, RibbonColor, InventoryItem, ProductItem } from '../types';
import { useCart } from '../context/CartContext';

interface CustomizeFlowerPageProps {
  products?: ProductItem[];
  inventory: InventoryItem[];
  preselectedType?: FlowerType;
  onBackToPremade: () => void;
  onOpenCart: () => void;
}

export const CustomizeFlowerPage: React.FC<CustomizeFlowerPageProps> = ({
  products,
  inventory,
  preselectedType = 'rose',
  onBackToPremade,
  onOpenCart,
}) => {
  const { addToCart } = useCart();

  // 1. Available flower options (derived dynamically from studio products)
  const availableFlowers = React.useMemo(() => {
    if (products && products.length > 0) {
      const active = products.filter(p => p.active !== false);
      if (active.length > 0) return active;
    }
    return [
      { id: 'rose', name: 'Satin Rose', flowerType: 'rose' as FlowerType, basePrice: 80, description: 'Classic spiral-folded satin ribbon petals with delicate bud center.' },
      { id: 'dahlia', name: 'Satin Dahlia', flowerType: 'dahlia' as FlowerType, basePrice: 70, description: 'Full 30+ layered pointed satin petals with rich bloom volume.' },
    ];
  }, [products]);

  // 1. Flower Type
  const [flowerType, setFlowerType] = useState<FlowerType>(preselectedType);

  // 2. Colors: up to 2 max
  const [selectedColors, setSelectedColors] = useState<FlowerColor[]>(['Pastel Pink']);

  // 3. Stems Quantity (default 1). Surcharge logic: basePrice + (stems - 1) * 80
  const [stemsCount, setStemsCount] = useState<number>(1);

  // 4. Wrapper Color
  const [wrapperColor, setWrapperColor] = useState<WrapperColor>('Transparent Rainbow');

  // 5. Ribbon Color (5cm)
  const [ribbonColor, setRibbonColor] = useState<RibbonColor>('Pink');

  // Submitting state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedProduct = availableFlowers.find(p => p.flowerType === flowerType) || availableFlowers[0];
  const basePrice = selectedProduct?.basePrice ?? (flowerType === 'dahlia' ? 70 : 80);
  // Surcharge: Each additional stem adds ₱80 (applied ONLY on customize page per rules)
  const stemSurcharge = (stemsCount - 1) * 80;
  const runningTotal = basePrice + stemSurcharge;

  // Options lists
  const allFlowerColors: FlowerColor[] = [
    'Pastel Pink',
    'Pink',
    'Violet',
    'White',
    'Yellow',
    'Sage Green',
    'Emerald',
    'Brown',
  ];

  const allWrapperColors: WrapperColor[] = [
    'Transparent Rainbow',
    'Green',
    'Yellow',
    'Brown',
    'Violet',
    'Pink',
    'White',
  ];

  const allRibbonColors: RibbonColor[] = [
    'Yellow',
    'Green',
    'Pink',
    'Violet',
    'Emerald',
    'Brown',
  ];

  // Stock helpers
  const getColorStock = (color: FlowerColor) => {
    const idMap: { [key: string]: string } = {
      'Pastel Pink': 'color_pastel_pink',
      'Pink': 'color_pink',
      'Violet': 'color_violet',
      'White': 'color_white',
      'Yellow': 'color_yellow',
      'Sage Green': 'color_sage_green',
      'Emerald': 'color_emerald',
      'Brown': 'color_brown',
    };
    const invId = idMap[color];
    const item = inventory.find(i => 
      (invId && i.id === invId) || 
      (i.category === 'color' && i.name.toLowerCase().includes(color.toLowerCase())) ||
      i.name.toLowerCase().includes(color.toLowerCase())
    );
    return item ? (typeof item.stock === 'number' ? Math.max(0, item.stock) : 0) : 15;
  };

  const getWrapperStock = (wrapper: WrapperColor) => {
    const idMap: { [key: string]: string } = {
      'Transparent Rainbow': 'wrapper_rainbow',
      'Green': 'wrapper_green',
      'Yellow': 'wrapper_yellow',
      'Brown': 'wrapper_brown',
      'Violet': 'wrapper_violet',
      'Pink': 'wrapper_pink',
      'White': 'wrapper_white',
    };
    const invId = idMap[wrapper];
    const item = inventory.find(i => 
      (invId && i.id === invId) || 
      (i.category === 'wrapper' && i.name.toLowerCase().includes(wrapper.toLowerCase())) ||
      i.name.toLowerCase().includes(wrapper.toLowerCase())
    );
    return item ? (typeof item.stock === 'number' ? Math.max(0, item.stock) : 0) : 15;
  };

  const getRibbonStock = (ribbon: RibbonColor) => {
    const idMap: { [key: string]: string } = {
      'Yellow': 'ribbon_yellow',
      'Green': 'ribbon_green',
      'Pink': 'ribbon_pink',
      'Violet': 'ribbon_violet',
      'Emerald': 'ribbon_emerald',
      'Brown': 'ribbon_brown',
    };
    const invId = idMap[ribbon];
    const item = inventory.find(i => 
      (invId && i.id === invId) || 
      (i.category === 'ribbon' && i.name.toLowerCase().includes(ribbon.toLowerCase())) ||
      i.name.toLowerCase().includes(ribbon.toLowerCase())
    );
    return item ? (typeof item.stock === 'number' ? Math.max(0, item.stock) : 0) : 15;
  };

  // Color selection logic (enforces 2 colors max)
  const toggleColor = (color: FlowerColor) => {
    setErrorMessage(null);
    if (selectedColors.includes(color)) {
      if (selectedColors.length === 1) {
        setErrorMessage('At least one color must be selected.');
        return;
      }
      setSelectedColors(selectedColors.filter(c => c !== color));
    } else {
      if (selectedColors.length >= 2) {
        setErrorMessage('Maximum of 2 colors can be combined per custom bouquet.');
        return;
      }
      setSelectedColors([...selectedColors, color]);
    }
  };

  // Visual color swatches
  const colorSwatchMap: { [key: string]: string } = {
    'Pastel Pink': '#F9D5DF',
    'Pink': '#F48FB1',
    'Violet': '#B388FF',
    'White': '#FFFFFF',
    'Yellow': '#FFF59D',
    'Sage Green': '#C8E6C9',
    'Emerald': '#2E7D32',
    'Brown': '#8D6E63',
    'Transparent Rainbow': 'linear-gradient(135deg, #FFD1DC 0%, #E0BBE4 50%, #BEE3DB 100%)',
    'Green': '#4CAF50',
  };

  const handleAddToCart = async () => {
    setErrorMessage(null);
    if (selectedColors.length === 0) {
      setErrorMessage('Please select at least 1 flower color.');
      return;
    }

    setSubmitting(true);
    try {
      const flowerDisplayName = selectedProduct ? `Custom ${selectedProduct.name}` : (flowerType === 'rose' ? 'Custom Satin Rose' : 'Custom Satin Dahlia');
      
      // Add customized item: generates unique ID and never merges with any other cart entry
      await addToCart({
        type: 'customized',
        flowerType,
        flowerName: `${flowerDisplayName} (${stemsCount} Stems)`,
        colors: selectedColors,
        stemsCount,
        wrapperColor,
        ribbonColor,
        unitPrice: runningTotal,
        quantity: 1, // Single bespoke arrangement
        totalPrice: runningTotal,
      });

      // Redirect back to Premade Flowers page per flow chart specification
      onBackToPremade();
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to add custom flower to cart. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      
      {/* Back to Premade Flowers */}
      <div>
        <button
          onClick={onBackToPremade}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5C5552] hover:text-[#2D2A2E] py-2 px-3.5 min-h-[40px] rounded-xl hover:bg-[#FAF6F0] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2A2E]"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>Back to Premade Flowers</span>
        </button>
      </div>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-2xl mx-auto space-y-2"
      >
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#F5EFC0] text-[#70640F] text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          LYPetal • Bouquet Builder
        </div>
        <h1 className="font-serif-title text-3xl sm:text-4xl lg:text-5xl font-bold text-[#2D2A2E]">
          Customize Your Own Bouquet
        </h1>
        <p className="text-xs sm:text-sm text-[#5C5552]">
          Build your bouquet just the way you like it. Pick your flower, blend up to 2 ribbon colors, add extra stems, and pick your favorite wrapper and bow.
        </p>
      </motion.div>

      {/* Builder Layout: Configurator (Left) + Live Order Summary (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left: 5-Step Customization Panel */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* STEP 1: Flower Type */}
          <div className="bg-white rounded-3xl p-6 border border-[#F0D9DD] shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#F0D9DD] text-[#7A4B53] font-bold text-xs flex items-center justify-center">
                1
              </span>
              <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E]">
                Choose Flower Type
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {availableFlowers.map((flower) => {
                const isSelected = flowerType === flower.flowerType;
                return (
                  <button
                    key={flower.id || flower.flowerType}
                    type="button"
                    onClick={() => setFlowerType(flower.flowerType)}
                    className={`p-4 min-h-[84px] rounded-2xl border text-left transition-all active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] ${
                      isSelected
                        ? 'border-[#2D2A2E] bg-[#FAF6F0] ring-2 ring-[#F4A6B0]'
                        : 'border-[#E8E2DA] hover:border-[#F4A6B0] bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[#2D2A2E]">{flower.name}</span>
                      <span className="text-xs font-bold text-[#C95567]">₱{flower.basePrice} base</span>
                    </div>
                    <p className="text-[11px] text-[#7C7472] mt-1 line-clamp-2">
                      {flower.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: Flower Colors (Up to 2 max) */}
          <div className="bg-white rounded-3xl p-6 border border-[#F0D9DD] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F0D9DD] text-[#7A4B53] font-bold text-xs flex items-center justify-center">
                  2
                </span>
                <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E]">
                  Flower Color(s)
                </h3>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#FAF6F0] text-[#7C7472]">
                {selectedColors.length} / 2 selected (max 2)
              </span>
            </div>

            <p className="text-xs text-[#7C7472]">
              Pick 1 or 2 satin ribbon colors to blend in your arrangement.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {allFlowerColors.map((color) => {
                const stock = getColorStock(color);
                const isOutOfStock = stock <= 0;
                const isSelected = selectedColors.includes(color);

                return (
                  <button
                    key={color}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => toggleColor(color)}
                    className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col items-center justify-center gap-1.5 relative min-h-[64px] active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] ${
                      isSelected
                        ? 'border-[#2D2A2E] bg-[#FAF6F0] ring-2 ring-[#F4A6B0]'
                        : isOutOfStock
                        ? 'opacity-40 border-gray-200 cursor-not-allowed bg-gray-50'
                        : 'border-[#E8E2DA] hover:border-[#F4A6B0] bg-white'
                    }`}
                  >
                    <span 
                      className="w-6 h-6 rounded-full border border-black/15 shadow-2xs shrink-0"
                      style={{ backgroundColor: colorSwatchMap[color] || '#FFF' }}
                    />
                    <span className="text-xs font-semibold text-[#2D2A2E] text-center truncate w-full">
                      {color}
                    </span>
                    <span className="text-[10px] text-[#7C7472]">
                      {isOutOfStock ? 'Out of stock' : `${stock} in stock`}
                    </span>
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 text-[#2D2A2E]">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 3: Flowers / Stem Quantity (Surcharge: +₱80 per additional stem) */}
          <div className="bg-white rounded-3xl p-6 border border-[#F0D9DD] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F0D9DD] text-[#7A4B53] font-bold text-xs flex items-center justify-center">
                  3
                </span>
                <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E]">
                  Number of Stems
                </h3>
              </div>
              <span className="text-xs font-bold text-[#70640F] bg-[#F5EFC0] px-2.5 py-1 rounded-full">
                +₱80 per extra stem
              </span>
            </div>

            <p className="text-xs text-[#5C5552]">
              Base price includes the 1st stem. Add more stems to create a fuller bouquet (+₱80 for each additional flower).
            </p>

            <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-[#2D2A2E] block">
                  Total Stems in Bouquet:
                </span>
                <span className="text-[11px] text-[#7C7472]">
                  {stemsCount === 1 ? 'Single stem (No extra cost)' : `${stemsCount - 1} extra stem(s) = +₱${stemSurcharge}`}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStemsCount(Math.max(1, stemsCount - 1))}
                  className="w-10 h-10 min-h-[40px] min-w-[40px] rounded-xl bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD]/40 active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                  aria-label="Decrease stem count"
                >
                  <Minus className="w-4 h-4 shrink-0" />
                </button>
                <span className="font-serif-title text-lg font-bold text-[#2D2A2E] w-8 text-center select-none">
                  {stemsCount}
                </span>
                <button
                  type="button"
                  onClick={() => setStemsCount(stemsCount + 1)}
                  className="w-10 h-10 min-h-[40px] min-w-[40px] rounded-xl bg-white border border-[#E8E2DA] flex items-center justify-center text-[#2D2A2E] hover:bg-[#F0D9DD]/40 active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                  aria-label="Increase stem count"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>

          {/* STEP 4: Wrapper Color */}
          <div className="bg-white rounded-3xl p-6 border border-[#F0D9DD] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F0D9DD] text-[#7A4B53] font-bold text-xs flex items-center justify-center">
                  4
                </span>
                <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E]">
                  Bouquet Wrapper Color
                </h3>
              </div>
              <span className="text-xs font-semibold text-[#F4A6B0]">
                {wrapperColor}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {allWrapperColors.map((wrap) => {
                const stock = getWrapperStock(wrap);
                const isOutOfStock = stock <= 0;
                const isSelected = wrapperColor === wrap;

                return (
                  <button
                    key={wrap}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => setWrapperColor(wrap)}
                    className={`p-3 min-h-[56px] rounded-2xl border text-center transition-all flex flex-col items-center justify-center active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] ${
                      isSelected
                        ? 'border-[#2D2A2E] bg-[#FAF6F0] ring-2 ring-[#F4A6B0]'
                        : isOutOfStock
                        ? 'opacity-40 border-gray-200 cursor-not-allowed bg-gray-50'
                        : 'border-[#E8E2DA] hover:border-[#F4A6B0] bg-white'
                    }`}
                  >
                    <span className="text-xs font-semibold text-[#2D2A2E] block truncate w-full">
                      {wrap}
                    </span>
                    <span className="text-[10px] text-[#7C7472] block mt-0.5">
                      {isOutOfStock ? 'Out' : `${stock} sheets`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 5: Ribbon Color (5cm) */}
          <div className="bg-white rounded-3xl p-6 border border-[#F0D9DD] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F0D9DD] text-[#7A4B53] font-bold text-xs flex items-center justify-center">
                  5
                </span>
                <h3 className="font-serif-title text-lg font-bold text-[#2D2A2E]">
                  Ribbon Color (5cm Bow)
                </h3>
              </div>
              <span className="text-xs font-semibold text-[#F4A6B0]">
                {ribbonColor}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {allRibbonColors.map((rib) => {
                const stock = getRibbonStock(rib);
                const isOutOfStock = stock <= 0;
                const isSelected = ribbonColor === rib;

                return (
                  <button
                    key={rib}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => setRibbonColor(rib)}
                    className={`p-3 min-h-[56px] rounded-2xl border text-center transition-all flex flex-col items-center justify-center active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0] ${
                      isSelected
                        ? 'border-[#2D2A2E] bg-[#FAF6F0] ring-2 ring-[#F4A6B0]'
                        : isOutOfStock
                        ? 'opacity-40 border-gray-200 cursor-not-allowed bg-gray-50'
                        : 'border-[#E8E2DA] hover:border-[#F4A6B0] bg-white'
                    }`}
                  >
                    <span className="text-xs font-semibold text-[#2D2A2E] block truncate w-full">
                      {rib}
                    </span>
                    <span className="text-[10px] text-[#7C7472] block mt-0.5">
                      {isOutOfStock ? 'Out' : `${stock}m`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right: Live Order Summary Card */}
        <div className="lg:col-span-5 sticky top-24 space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#F0D9DD] shadow-md space-y-5">
            <div className="flex items-center justify-between border-b border-[#F0D9DD]/70 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#F4A6B0]">
                  Live Calculation
                </span>
                <h3 className="font-serif-title text-xl font-bold text-[#2D2A2E]">
                  Your Custom Bouquet
                </h3>
              </div>
              <span className="px-3 py-1 rounded-full bg-[#F5EFC0] text-[#70640F] text-xs font-bold">
                Custom Made
              </span>
            </div>

            {/* Visual Spec Summary */}
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-[#FAF6F0]">
                <span className="text-[#5C5552]">Flower Type:</span>
                <span className="font-bold text-[#2D2A2E] capitalize">
                  Satin {flowerType}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-[#FAF6F0]">
                <span className="text-[#5C5552]">Ribbon Color(s):</span>
                <span className="font-bold text-[#2D2A2E]">
                  {selectedColors.join(' & ')}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-[#FAF6F0]">
                <span className="text-[#5C5552]">Stem Count:</span>
                <span className="font-bold text-[#2D2A2E]">
                  {stemsCount} {stemsCount === 1 ? 'stem' : 'stems'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-[#FAF6F0]">
                <span className="text-[#5C5552]">Wrapper Style:</span>
                <span className="font-bold text-[#2D2A2E]">
                  {wrapperColor}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-[#FAF6F0]">
                <span className="text-[#5C5552]">5cm Ribbon Bow:</span>
                <span className="font-bold text-[#2D2A2E]">
                  {ribbonColor}
                </span>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#E8E2DA] space-y-2 text-xs">
              <div className="flex justify-between text-[#5C5552]">
                <span>1st Stem (Base):</span>
                <span>₱{basePrice}</span>
              </div>
              {stemsCount > 1 && (
                <div className="flex justify-between text-[#70640F] font-semibold">
                  <span>Additional Stems ({stemsCount - 1} × ₱80):</span>
                  <span>+₱{stemSurcharge}</span>
                </div>
              )}
              <div className="pt-2 border-t border-[#E8E2DA] flex justify-between items-center">
                <span className="font-bold text-sm text-[#2D2A2E]">Total:</span>
                <span className="font-serif-title text-2xl font-bold text-[#2D2A2E]">
                  ₱{(runningTotal ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Error banner if any */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Add to Cart Button (Never stacks, generates unique ID, redirects to Premade Flowers) */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              id="custom-add-to-cart-btn"
              onClick={handleAddToCart}
              disabled={submitting}
              className="w-full py-4 min-h-[48px] rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>{submitting ? 'Adding to Cart...' : `Add Custom Bouquet to Cart (₱${runningTotal})`}</span>
            </motion.button>

            <p className="text-[11px] text-[#7C7472] text-center">
              * Note: Custom bouquets are made to order and won't get mixed up with other items in your cart.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};
