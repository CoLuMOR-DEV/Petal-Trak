import React from 'react';
import { Flower2, Heart, Phone, Mail, MapPin } from 'lucide-react';
import { StudioSettings } from '../types';

interface FooterProps {
  setCurrentView: (view: string) => void;
  studioSettings?: StudioSettings | null;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentView, studioSettings }) => {
  const pickupAddress = studioSettings?.pickupAddress || 'San Pedro, Laguna, Philippines';
  const contactPhone = studioSettings?.contactPhone || '+63 912 345 6789';
  const contactEmail = studioSettings?.contactEmail || 'allyson@lypetal.com';
  const ownerName = studioSettings?.ownerName || 'Allyson';
  const businessName = studioSettings?.businessName || 'LYPetal';

  return (
    <footer className="bg-[#262327] text-[#EDE8E5] pt-12 pb-10 border-t border-[#383337]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-[#383337]/70">
          
          {/* Brand & Tagline */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#F0D9DD]/15 flex items-center justify-center text-[#F4A6B0]">
                <Flower2 className="w-4 h-4" />
              </div>
              <span className="font-serif-title text-lg font-bold tracking-tight text-white">
                {businessName}
              </span>
            </div>
            <p className="text-xs text-[#9E9593] leading-relaxed max-w-sm">
              Handmade satin ribbon flowers that stay bright for years. Folded petal by petal with care in Laguna, Philippines.
            </p>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-3">
            <p className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              Explore
            </p>
            <ul className="space-y-2 text-xs text-[#B5ABA8]">
              <li>
                <button 
                  onClick={() => setCurrentView('home')} 
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  About {ownerName}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setCurrentView('premade')} 
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Premade Flowers
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setCurrentView('customize')} 
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Customize a Bouquet
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setCurrentView('tracker')} 
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Track Order
                </button>
              </li>
            </ul>
          </div>

          {/* Contact & Studio Location */}
          <div className="md:col-span-4 space-y-2.5">
            <p className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              Contact
            </p>
            <ul className="space-y-2 text-xs text-[#B5ABA8]">
              <li className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#F4A6B0] shrink-0" />
                <span>{pickupAddress}</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#F4A6B0] shrink-0" />
                <span>{contactPhone}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#F4A6B0] shrink-0" />
                <span className="truncate">{contactEmail}</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Minimal Bottom Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#807876]">
          <p>© {new Date().getFullYear()} {businessName}. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Folded by hand with <Heart className="w-3 h-3 text-[#F4A6B0] fill-[#F4A6B0]" /> by {ownerName}.
          </p>
        </div>
      </div>
    </footer>
  );
};

