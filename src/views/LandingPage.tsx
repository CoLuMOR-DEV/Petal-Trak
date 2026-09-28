import React, { useRef, useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  ShieldCheck, 
  Clock, 
  Flower2, 
  CheckCircle2, 
  HelpCircle,
  Scissors,
  Layers,
  Award
} from 'lucide-react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import { ProductItem, StudioSettings, ShowcasePhotoItem } from '../types';

interface LandingPageProps {
  products: ProductItem[];
  studioSettings: StudioSettings | null;
  onNavigateToPremade: () => void;
  onNavigateToCustomize: () => void;
  onSelectProductForOrder: (productId: string) => void;
}

/**
 * Natural typewriter effect hook with smooth typing, pause, backspacing, and loop.
 */
function useTypewriter(
  phrases: string[], 
  typingSpeed: number = 75, 
  deletingSpeed: number = 38, 
  pauseDuration: number = 2000
) {
  const [index, setIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!phrases || phrases.length === 0) return;

    if (isPaused) {
      const timer = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, pauseDuration);
      return () => clearTimeout(timer);
    }

    if (isDeleting) {
      if (subIndex === 0) {
        setIsDeleting(false);
        setIndex((prev) => (prev + 1) % phrases.length);
        return;
      }
      const timer = setTimeout(() => {
        setSubIndex((prev) => prev - 1);
      }, deletingSpeed);
      return () => clearTimeout(timer);
    } else {
      if (subIndex === phrases[index].length) {
        setIsPaused(true);
        return;
      }
      const timer = setTimeout(() => {
        setSubIndex((prev) => prev + 1);
      }, typingSpeed);
      return () => clearTimeout(timer);
    }
  }, [subIndex, index, isDeleting, isPaused, phrases, typingSpeed, deletingSpeed, pauseDuration]);

  return {
    currentText: phrases[index]?.substring(0, subIndex) || '',
    fullText: phrases[index] || '',
    isDeleting,
    isPaused
  };
}

/**
 * Individual photo card inside the invisible container that slides into place with scroll.
 */
const ShowcaseCard: React.FC<{
  photo: ShowcasePhotoItem;
  index: number;
  total: number;
  smoothProgress: any;
  onClick: () => void;
}> = ({ photo, index, total, smoothProgress, onClick }) => {
  // Stagger entrance progressively across the scroll range
  const start = 0.06 + index * 0.12;
  const end = Math.min(start + 0.28, 0.85);

  // Direction: left for first, right for second (or alternating offsets)
  const xOffset = total === 2 
    ? (index === 0 ? -40 : 40)
    : (index % 2 === 0 ? -35 : 35);

  const x = useTransform(smoothProgress, [start, end], [xOffset, 0]);
  const opacity = useTransform(smoothProgress, [start - 0.02, end - 0.06], [0.2, 1]);
  const scale = useTransform(smoothProgress, [start, end], [0.95, 1]);

  return (
    <motion.div
      style={{ x, opacity, scale }}
      whileHover={{ y: -6, transition: { duration: 0.25 } }}
      onClick={onClick}
      className="cursor-pointer group flex flex-col items-center w-full"
    >
      <div className="w-full relative rounded-3xl overflow-hidden aspect-4/5 bg-[#FAF6F0] shadow-sm group-hover:shadow-xl border border-[#F0D9DD]/70 transition-all duration-300">
        <img 
          src={photo.imageUrl} 
          alt={photo.alt || photo.name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        />
      </div>
      <div className="pt-3.5 text-center space-y-0.5">
        <h3 className="font-serif-title text-base sm:text-lg font-bold text-[#2D2A2E] group-hover:text-[#F4A6B0] transition-colors">
          {photo.name}
        </h3>
        <p className="text-xs sm:text-sm font-semibold text-[#7C7472] tabular-nums">
          {photo.price}
        </p>
      </div>
    </motion.div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({
  products,
  studioSettings,
  onNavigateToPremade,
  onNavigateToCustomize,
  onSelectProductForOrder,
}) => {
  // Global scroll progress indicator for top bar
  const { scrollYProgress: globalScrollYProgress } = useScroll();
  const scaleX = useSpring(globalScrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  // Typewriter phrases for the header
  const typewriterPhrases = [
    'made with love.',
    'for graduations.',
    'for birthdays.',
    'for anniversaries.',
    'that stay bright for years.',
    'folded petal by petal.'
  ];
  const { currentText } = useTypewriter(typewriterPhrases, 80, 40, 2200);

  // Dynamic live flower pricing from studio products
  const roseProduct = useMemo(() => (products || []).find((p: ProductItem) => p.flowerType === 'rose' || p.id === 'rose'), [products]);
  const dahliaProduct = useMemo(() => (products || []).find((p: ProductItem) => p.flowerType === 'dahlia' || p.id === 'dahlia'), [products]);
  const rosePrice = roseProduct?.basePrice ?? 80;
  const dahliaPrice = dahliaProduct?.basePrice ?? 70;

  // Default 2 authentic studio photos (expandable to 2-5 photos via studioSettings)
  const defaultShowcasePhotos: ShowcasePhotoItem[] = [
    {
      id: 'rose',
      name: roseProduct?.name || 'Satin Ribbon Rose',
      price: `₱${rosePrice} each`,
      imageUrl: roseProduct?.imageUrl || '/Rose.jpg',
      alt: 'Handmade Satin Ribbon Rose Bouquet by LYPetal',
      flowerType: 'rose',
    },
    {
      id: 'dahlia',
      name: dahliaProduct?.name || 'Satin Ribbon Dahlia',
      price: `₱${dahliaPrice} each`,
      imageUrl: dahliaProduct?.imageUrl || '/Dahlia.jpg',
      alt: 'Handmade Satin Ribbon Dahlia Bouquet by LYPetal',
      flowerType: 'dahlia',
    },
  ];

  // Dynamic photo array supporting 2-5 photos side-by-side that admin can configure in updates
  const showcasePhotos: ShowcasePhotoItem[] = (studioSettings?.showcasePhotos && studioSettings.showcasePhotos.length >= 2)
    ? studioSettings.showcasePhotos.slice(0, 5)
    : defaultShowcasePhotos;

  // Section refs for scroll-driven animations
  const heroRef = useRef<HTMLDivElement>(null);
  const showcaseRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  // 1. HERO PARALLAX (Reversible on scroll-up/down)
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start']
  });
  const heroProductY = useTransform(heroProgress, [0, 1], [0, 50]);
  const heroProductRotate = useTransform(heroProgress, [0, 1], [0, 2]);

  // 2. SLIDING PICTURES SHOWCASE (Reversible on scroll-up/down)
  const { scrollYProgress: showcaseProgress } = useScroll({
    target: showcaseRef,
    offset: ['start end', 'end start']
  });
  const smoothShowcase = useSpring(showcaseProgress, {
    stiffness: 90,
    damping: 26,
    restDelta: 0.001
  });

  // Showcase header subtle lift & fade
  const showcaseHeaderY = useTransform(smoothShowcase, [0.02, 0.25], [25, 0]);
  const showcaseHeaderOpacity = useTransform(smoothShowcase, [0.02, 0.22], [0.2, 1]);

  // 3. STEP CRAFTING PIPELINE (4 steps progressive activation & progress beam)
  const { scrollYProgress: stepsProgress } = useScroll({
    target: stepsRef,
    offset: ['start end', 'end start']
  });
  const smoothSteps = useSpring(stepsProgress, {
    stiffness: 90,
    damping: 26,
    restDelta: 0.001
  });

  // Ribbon progress line connecting the steps (fills going down, empties going up)
  const ribbonLineWidth = useTransform(smoothSteps, [0.12, 0.62], ['0%', '100%']);

  // Progressive 1-by-1 step card movements (reversible)
  const step1Y = useTransform(smoothSteps, [0.1, 0.28], [35, 0]);
  const step1Opacity = useTransform(smoothSteps, [0.08, 0.25], [0.2, 1]);
  const step1Scale = useTransform(smoothSteps, [0.1, 0.28], [0.94, 1]);

  const step2Y = useTransform(smoothSteps, [0.18, 0.38], [35, 0]);
  const step2Opacity = useTransform(smoothSteps, [0.16, 0.35], [0.2, 1]);
  const step2Scale = useTransform(smoothSteps, [0.18, 0.38], [0.94, 1]);

  const step3Y = useTransform(smoothSteps, [0.26, 0.48], [35, 0]);
  const step3Opacity = useTransform(smoothSteps, [0.24, 0.45], [0.2, 1]);
  const step3Scale = useTransform(smoothSteps, [0.26, 0.48], [0.94, 1]);

  const step4Y = useTransform(smoothSteps, [0.34, 0.58], [35, 0]);
  const step4Opacity = useTransform(smoothSteps, [0.32, 0.55], [0.2, 1]);
  const step4Scale = useTransform(smoothSteps, [0.34, 0.58], [0.94, 1]);

  // 4. ABOUT ALLYSON (Parallax photo & sliding quote, reversible)
  const { scrollYProgress: aboutProgress } = useScroll({
    target: aboutRef,
    offset: ['start end', 'end start']
  });
  const smoothAbout = useSpring(aboutProgress, {
    stiffness: 90,
    damping: 26,
    restDelta: 0.001
  });
  const allysonPhotoY = useTransform(smoothAbout, [0.15, 0.55], [30, -15]);
  const allysonPhotoScale = useTransform(smoothAbout, [0.15, 0.5], [0.93, 1]);
  const allysonTextX = useTransform(smoothAbout, [0.18, 0.55], [30, 0]);
  const allysonTextOpacity = useTransform(smoothAbout, [0.15, 0.48], [0.25, 1]);

  // 5. READY TO ORDER CTA (Scale & lift, reversible)
  const { scrollYProgress: ctaProgress } = useScroll({
    target: ctaRef,
    offset: ['start end', 'end start']
  });
  const smoothCta = useSpring(ctaProgress, {
    stiffness: 90,
    damping: 26,
    restDelta: 0.001
  });
  const ctaScale = useTransform(smoothCta, [0.1, 0.45], [0.95, 1]);
  const ctaY = useTransform(smoothCta, [0.1, 0.45], [30, 0]);
  const ctaOpacity = useTransform(smoothCta, [0.08, 0.4], [0.3, 1]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const steps = [
    {
      step: '01',
      title: 'Measuring & Cutting',
      desc: 'We measure and snip each strip of satin ribbon to get the exact petal length.',
      icon: Scissors,
      color: '#F0D9DD',
      textColor: '#7A4B53'
    },
    {
      step: '02',
      title: 'Sealing the Edges',
      desc: 'We gently heat-seal the edges so the satin ribbon never frays or pulls.',
      icon: Sparkles,
      color: '#F5EFC0',
      textColor: '#70640F'
    },
    {
      step: '03',
      title: 'Assembling the Bloom',
      desc: 'Each petal is folded and glued layer by layer around a stem wire for a full look.',
      icon: Layers,
      color: '#A9D8E8',
      textColor: '#1E5D70'
    },
    {
      step: '04',
      title: 'Wrapping with a Bow',
      desc: 'We wrap your stems in bouquet paper and finish it with a clean satin bow.',
      icon: Award,
      color: '#A8D5C0',
      textColor: '#1D5E43'
    }
  ];

  return (
    <div className="relative space-y-16 sm:space-y-24 pb-24 overflow-hidden">
      
      {/* Sleek Top Scroll Indicator */}
      <motion.div
        style={{ scaleX }}
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#F4A6B0] via-[#F5EFC0] to-[#A9D8E8] origin-left z-50 pointer-events-none"
      />

      {/* Floating Ambient Floral Background Accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <motion.div
          animate={{
            y: [0, -25, 0],
            rotate: [0, 6, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-24 left-6 sm:left-16 w-64 h-64 rounded-full bg-[#F0D9DD]/40 blur-3xl"
        />
        <motion.div
          animate={{
            y: [0, 30, 0],
            rotate: [0, -8, 0],
          }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-96 right-4 sm:right-20 w-80 h-80 rounded-full bg-[#F5EFC0]/35 blur-3xl"
        />
      </div>

      {/* 1. HERO / INTRODUCTION SECTION WITH TYPING ANIMATION */}
      <section 
        ref={heroRef}
        className="relative pt-10 pb-14 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-28 bg-gradient-to-b from-[#FAF6F0] via-[#FAF6F0]/80 to-transparent border-b border-[#F0D9DD]/30"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            
            {/* Hero Left Content */}
            <motion.div 
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-7 space-y-5 text-center lg:text-left"
            >
              {/* Dynamic Headline with Fixed Placer to Prevent Any Layout Shift */}
              <h1 className="font-serif-title text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#2D2A2E] leading-tight select-none">
                <span className="block">Flowers that never wilt,</span>
                <span className="block text-[#F4A6B0] h-[1.3em] min-h-[1.3em] relative overflow-hidden">
                  <span className="inline-block">{currentText}</span>
                  <span 
                    aria-hidden="true" 
                    className="inline-block w-[2.5px] sm:w-[3px] h-[0.85em] ml-1 bg-[#F4A6B0] rounded-full align-middle animate-pulse"
                  />
                </span>
              </h1>

              <p className="text-sm sm:text-base lg:text-lg text-[#5C5552] max-w-2xl leading-relaxed mx-auto lg:mx-0">
                Welcome to <strong className="text-[#2D2A2E]">LYPetal</strong>! We make handmade bouquets using smooth satin ribbon right here in Laguna. They keep their bright colors and soft shape for years—the perfect keepsake for graduations, birthdays, or just because.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 pt-2 w-full sm:w-auto">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  id="hero-order-now-btn"
                  onClick={onNavigateToPremade}
                  className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
                >
                  <span>Shop Premade Flowers</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  id="hero-customize-btn"
                  onClick={onNavigateToCustomize}
                  className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider bg-[#F5EFC0] hover:bg-[#EAE2A6] text-[#2D2A2E] border border-[#E8DF97] shadow-2xs hover:shadow-xs transition-all flex items-center justify-center gap-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C98A12]"
                >
                  <Sparkles className="w-4 h-4 text-[#C98A12] shrink-0" />
                  <span>Customize a Bouquet</span>
                </motion.button>
              </div>

              {/* Trust badges */}
              <div className="pt-4 grid grid-cols-3 gap-2 sm:gap-4 border-t border-[#F0D9DD]/70 max-w-lg mx-auto lg:mx-0 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#F0D9DD] flex items-center justify-center text-[#F4A6B0]">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-[#5C5552] leading-tight">Won't Fade</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#A8D5C0]/40 flex items-center justify-center text-[#1D5E43]">
                    <Scissors className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-[#5C5552] leading-tight">100% Hand-folded</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#A9D8E8]/40 flex items-center justify-center text-[#195262]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-[#5C5552] leading-tight">Pollen-Free</span>
                </div>
              </div>
            </motion.div>

            {/* Hero Right: Product Visual Showcase with Reversible Parallax */}
            <motion.div 
              style={{ y: heroProductY, rotate: heroProductRotate }}
              className="lg:col-span-5 relative"
            >
              <div className="relative mx-auto max-w-md">
                <div className="absolute inset-0 bg-gradient-to-tr from-[#F0D9DD] via-[#F5EFC0] to-[#A9D8E8] rounded-3xl transform rotate-2 scale-105 opacity-60 filter blur-xs" />

                <motion.div 
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="relative bg-white rounded-3xl p-4 shadow-xl border border-[#F0D9DD] overflow-hidden group cursor-pointer"
                  onClick={onNavigateToPremade}
                >
                  <div className="relative rounded-2xl overflow-hidden aspect-4/5 bg-[#FAF6F0]">
                    <img 
                      src="/Rose.jpg" 
                      alt="Handmade Satin Ribbon Bouquet by LYPetal" 
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/95 backdrop-blur-xs text-[11px] font-bold text-[#2D2A2E] shadow-sm flex items-center gap-1">
                      <Flower2 className="w-3.5 h-3.5 text-[#F4A6B0]" />
                      <span>Single Stem Rose</span>
                    </div>
                    <div className="absolute bottom-3 right-3 px-3.5 py-1.5 rounded-xl bg-[#2D2A2E]/85 backdrop-blur-xs text-white text-xs font-semibold shadow-md flex items-center gap-1.5">
                      <span>Price:</span>
                      <strong className="text-[#F5EFC0] text-sm tabular-nums">₱{rosePrice} each</strong>
                    </div>
                  </div>

                  <div className="pt-3 px-2 flex items-center justify-between text-xs text-[#5C5552]">
                    <p className="font-serif-title font-bold text-sm text-[#2D2A2E]">
                      Classic Satin Rose
                    </p>
                    <span className="text-[11px] text-[#F4A6B0] font-semibold flex items-center gap-1">
                      <span>View details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </motion.div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* 2. PROGRESSIVE SCROLL-LINKED SLIDING SHOWCASE (CLEAN INVISIBLE CONTAINER, 2-5 PHOTOS) */}
      <section 
        id="sliding-gallery" 
        ref={showcaseRef} 
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
      >
        {/* Section Header: Clean, quiet, and simple without clutter */}
        <motion.div 
          style={{ y: showcaseHeaderY, opacity: showcaseHeaderOpacity }}
          className="text-center max-w-xl mx-auto mb-8 sm:mb-12 space-y-1.5"
        >
          <h2 className="font-serif-title text-2xl sm:text-3xl lg:text-4xl font-bold text-[#2D2A2E]">
            Our Studio Blooms
          </h2>
          <p className="text-xs sm:text-sm text-[#5C5552] leading-relaxed">
            Hand-folded single stems in our most popular flower types and colors.
          </p>
        </motion.div>

        {/* Invisible Container: Side-by-side layout supporting 2 to 5 photos */}
        <div className={`grid gap-6 sm:gap-10 items-start justify-center mx-auto ${
          showcasePhotos.length === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-3xl' :
          showcasePhotos.length === 3 ? 'grid-cols-1 sm:grid-cols-3 max-w-5xl' :
          showcasePhotos.length === 4 ? 'grid-cols-2 lg:grid-cols-4 max-w-6xl' :
          'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 max-w-7xl'
        }`}>
          {showcasePhotos.map((photo, index) => (
            <ShowcaseCard
              key={photo.id || index}
              photo={photo}
              index={index}
              total={showcasePhotos.length}
              smoothProgress={smoothShowcase}
              onClick={() => {
                if (photo.flowerType) {
                  onSelectProductForOrder(photo.flowerType);
                } else {
                  onNavigateToPremade();
                }
              }}
            />
          ))}
        </div>
      </section>

      {/* 3. HOW WE MAKE OUR FLOWERS WITH PROGRESSIVE SCROLL TIMELINE */}
      <section ref={stepsRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, margin: '-50px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-10 sm:mb-12 space-y-2"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-[#F4A6B0]">
            Our Craft
          </span>
          <h2 className="font-serif-title text-2xl sm:text-3xl lg:text-4xl font-bold text-[#2D2A2E]">
            How We Make Each Flower
          </h2>
          <p className="text-xs sm:text-sm text-[#5C5552] leading-relaxed">
            Every flower is carefully cut and assembled by hand so it looks full, holds shape, and lasts forever.
          </p>

          {/* Progressive Ribbon Track indicator */}
          <div className="max-w-xs mx-auto h-1.5 bg-[#FAF6F0] rounded-full overflow-hidden border border-[#F0D9DD] mt-4">
            <motion.div 
              style={{ width: ribbonLineWidth }} 
              className="h-full bg-gradient-to-r from-[#F4A6B0] via-[#F5EFC0] to-[#A8D5C0] origin-left"
            />
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((step, idx) => {
            const IconComp = step.icon;
            // Map progressive transforms for each step
            const cardY = idx === 0 ? step1Y : idx === 1 ? step2Y : idx === 2 ? step3Y : step4Y;
            const cardOpacity = idx === 0 ? step1Opacity : idx === 1 ? step2Opacity : idx === 2 ? step3Opacity : step4Opacity;
            const cardScale = idx === 0 ? step1Scale : idx === 1 ? step2Scale : idx === 2 ? step3Scale : step4Scale;

            return (
              <motion.div
                key={step.step}
                style={{ y: cardY, opacity: cardOpacity, scale: cardScale }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-5 sm:p-6 rounded-3xl bg-white border border-[#F0D9DD] shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div 
                      className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-xs"
                      style={{ backgroundColor: step.color, color: step.textColor }}
                    >
                      <IconComp className="w-5 h-5" />
                    </div>
                    <span className="font-serif-title text-xl font-bold text-[#E8E2DA] select-none">
                      {step.step}
                    </span>
                  </div>

                  <h3 className="font-serif-title text-base sm:text-lg font-bold text-[#2D2A2E] leading-snug">
                    {step.title}
                  </h3>
                  <p className="text-xs text-[#5C5552] leading-relaxed">
                    {step.desc}
                  </p>
                </div>

                <div className="pt-3 mt-3 border-t border-[#FAF6F0] flex items-center gap-1 text-[11px] font-semibold text-[#7C7472]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#A8D5C0]" />
                  <span>Hand checked</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* 4. ABOUT ALLYSON (REVERSIBLE PARALLAX & DEPTH FLOAT) */}
      <section 
        id="about-allyson" 
        ref={aboutRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
      >
        <div className="bg-gradient-to-br from-white via-[#FAF6F0] to-[#F0D9DD]/30 rounded-3xl p-6 sm:p-10 lg:p-12 border border-[#F0D9DD] shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            
            {/* Owner Photo with scroll depth float */}
            <motion.div 
              style={{ y: allysonPhotoY, scale: allysonPhotoScale }}
              className="lg:col-span-5 text-center"
            >
              <div className="relative inline-block">
                <div className="w-44 h-44 sm:w-56 sm:h-56 rounded-3xl overflow-hidden border-4 border-white shadow-lg mx-auto bg-[#F0D9DD]">
                  <img 
                    src={studioSettings?.ownerPhotoUrl || "/Allyson.jpg"} 
                    alt="Allyson - LYPetal Owner" 
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <motion.div 
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="absolute -bottom-3 -right-2 bg-[#F5EFC0] text-[#70640F] border-2 border-white px-3 py-1 rounded-full text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  <Flower2 className="w-3.5 h-3.5 text-[#C98A12]" />
                  <span>{studioSettings?.ownerName || 'Allyson'}</span>
                </motion.div>
              </div>
            </motion.div>

            {/* Owner Bio with scroll slide */}
            <motion.div 
              style={{ x: allysonTextX, opacity: allysonTextOpacity }}
              className="lg:col-span-7 space-y-3.5 text-center lg:text-left"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-[#F4A6B0]">
                {studioSettings?.ownerTitle || 'About the Maker'}
              </span>
              <h2 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#2D2A2E]">
                {studioSettings?.headline || '"Every flower has a story, and these ones stay with you forever."'}
              </h2>
              <p className="text-xs sm:text-sm text-[#5C5552] leading-relaxed whitespace-pre-line">
                {studioSettings?.ownerIntro || "Hi! I'm Allyson, the maker behind LYPetal. Real flowers dry up after a few days, but satin ribbon flowers stay pretty for years. You can put them on your desk or bedroom shelf as a sweet memory of your special day."}
              </p>
              <p className="text-xs sm:text-sm text-[#7C7472] leading-relaxed whitespace-pre-line">
                {studioSettings?.story || "Everything is made by hand in San Pedro, Laguna. I fold each petal, glue the stems, and wrap every order myself so it is ready to give to someone you love."}
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs font-semibold text-[#2D2A2E]">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#A8D5C0]" /> Made to order
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#A8D5C0]" /> Live order tracking
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#A8D5C0]" /> Chat directly with me
                </span>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* 5. READY TO ORDER CTA (SCROLL-LINKED REVERSIBLE LIFT) */}
      <section ref={ctaRef} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <motion.div 
          style={{ scale: ctaScale, y: ctaY, opacity: ctaOpacity }}
          className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-[#F0D9DD] via-[#F5EFC0]/70 to-[#A8D5C0]/50 border border-[#F0D9DD] text-center space-y-4 shadow-sm"
        >
          <div className="w-12 h-12 rounded-2xl bg-white mx-auto flex items-center justify-center text-[#F4A6B0] shadow-xs">
            <HelpCircle className="w-6 h-6" />
          </div>

          <h3 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#2D2A2E]">
            Ready to pick your flowers?
          </h3>
          
          <p className="text-xs sm:text-sm text-[#5C5552] max-w-lg mx-auto leading-relaxed">
            Choose a single stem (Rose ₱{rosePrice}, Dahlia ₱{dahliaPrice}) or build a custom bouquet with your favorite satin ribbon colors and wrapping style.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2 max-w-md mx-auto sm:max-w-none">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              id="decision-ready-yes"
              onClick={onNavigateToPremade}
              className="w-full sm:w-auto min-h-[46px] px-7 py-3 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider bg-[#F4A6B0] hover:bg-[#EE8E9B] text-[#2D2A2E] shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A6B0]"
            >
              <span>Yes, start my order</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </motion.button>

            <button
              id="decision-ready-no"
              onClick={() => scrollToSection('about-allyson')}
              className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider bg-white hover:bg-[#FAF6F0] text-[#5C5552] hover:text-[#2D2A2E] border border-[#E8E2DA] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2A2E]"
            >
              Learn more about Allyson
            </button>
          </div>
        </motion.div>
      </section>

    </div>
  );
};

